import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Edit3,
  FileCheck2,
  Filter,
  Home,
  ImagePlus,
  Loader2,
  Mail,
  MapPin,
  Medal,
  Phone,
  Printer,
  ReceiptText,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  Trash2,
  TrendingUp,
  Trophy,
  UserCheck,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  apiAifAdminCustomersOverview,
  type AifAdminCustomerActivityFilter,
  type AifAdminCustomerEmployeeSummary,
  type AifAdminCustomerOverviewItem,
  type AifAdminCustomerSellerBreakdown,
  type AifAdminCustomerSort,
  type AifAdminCustomerStoreSummary,
  type AifAdminCustomersOverviewResponse,
} from "../lib/aif/api";

type Props = {
  actor?: string;
  role?: "admin" | "shop";
};

type LocationScope = "all" | "main_warehouse" | "magazin_targu_secuiesc";

const card = "rounded-[24px] border border-white/16 bg-[#344154] shadow-[0_16px_38px_rgba(15,23,42,0.20)]";
const control = "h-11 min-w-0 rounded-xl border border-white/16 bg-[#293548] px-3 text-sm font-normal text-white outline-none transition focus:border-[#7bd7d4]/65 focus:ring-2 focus:ring-[#7bd7d4]/15 [color-scheme:dark]";
const button = "inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-normal text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
const neutralButton = `${button} border-white/16 bg-[#3b485b] hover:border-white/30 hover:bg-[#45546a]`;
const primaryButton = `${button} border-[#9be9e5]/45 bg-[#2a8d8b] hover:bg-[#319c99]`;

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return `${numberValue(value).toLocaleString("ro-RO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} RON`;
}

function integer(value: unknown) {
  return Math.round(numberValue(value)).toLocaleString("ro-RO");
}

function percent(value: unknown) {
  return `${numberValue(value).toLocaleString("ro-RO", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

type AdminShopCustomerRecord = {
  id: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  countryCode?: string | null;
  countyCode?: string | null;
  countyName?: string | null;
  localityCode?: string | null;
  localityName?: string | null;
  postalCode?: string | null;
  formattedAddress?: string | null;
  notes?: string | null;
  creditLimit?: number | null;
  openBalance?: number | null;
  openSales?: number | null;
  saleCount?: number | null;
  locationId?: string | null;
  locationCode?: string | null;
  locationName?: string | null;
};

type AdminCustomerSaleLine = {
  id: string;
  lineNo?: number | null;
  variantId?: string | null;
  productTitle?: string | null;
  productCode?: string | null;
  barcode?: string | null;
  brandName?: string | null;
  categoryName?: string | null;
  subcategoryName?: string | null;
  colorName?: string | null;
  colorHex?: string | null;
  size?: string | null;
  imageUrl?: string | null;
  quantity: number;
  listPrice: number;
  unitPrice: number;
  discountAmount: number;
  discountPercent: number;
  lineTotal: number;
  buyPriceSnapshot?: number | null;
  snCod?: string | null;
};

type AdminCustomerSalePayment = {
  method?: string | null;
  amount?: number | null;
  paidAt?: string | null;
};

type AdminCustomerSale = {
  id: string;
  saleNumber: string;
  locationId?: string | null;
  locationCode?: string | null;
  locationName?: string | null;
  actor?: string | null;
  soldAt?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  saleType?: string | null;
  subtotal: number;
  discountTotal: number;
  total: number;
  paidTotal: number;
  balanceDue: number;
  lineCount: number;
  itemCount: number;
  payments?: AdminCustomerSalePayment[];
  lines: AdminCustomerSaleLine[];
};

type BonConsumDocumentSummary = {
  id: string;
  documentNumber: string;
  series?: string | null;
  sequenceNumber?: number | null;
  sequenceYear?: number | null;
  documentDate?: string | null;
  locationId?: string | null;
  locationCode?: string | null;
  locationName?: string | null;
  customerId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  recipientName?: string | null;
  purpose: string;
  note?: string | null;
  actor?: string | null;
  status?: string | null;
  totalQty: number;
  purchaseTotal: number;
  retailTotal: number;
  actualSaleTotal: number;
  discountTotal: number;
  currencyCode?: string | null;
  lineCount: number;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type BonConsumDocumentLine = {
  id: string;
  lineNo: number;
  sourceSaleId?: string | null;
  sourceSaleLineId?: string | null;
  sourceSaleNumber?: string | null;
  sourceSoldAt?: string | null;
  variantId?: string | null;
  productTitle?: string | null;
  productCode?: string | null;
  snCod?: string | null;
  barcode?: string | null;
  brandName?: string | null;
  categoryName?: string | null;
  subcategoryName?: string | null;
  colorName?: string | null;
  size?: string | null;
  imageUrl?: string | null;
  quantity: number;
  purchaseUnitPrice: number;
  listUnitPrice: number;
  actualUnitPrice: number;
  salesTvaRate?: number | null;
  purchaseValue: number;
  retailValue: number;
  actualSaleValue: number;
  discountValue: number;
};

type BonConsumDocumentDetail = {
  document: BonConsumDocumentSummary;
  lines: BonConsumDocumentLine[];
};

type BonConsumNumberSettings = {
  series: string;
  nextNumber: number;
  digits: number;
  includeYear: boolean;
  yearlyReset: boolean;
  sequenceYear: number;
  previewNumber?: string | null;
};

type AdminCustomerPurchasesResponse = {
  ok: true;
  item: AdminShopCustomerRecord;
  location?: { id: string; code: string; name: string };
  summary?: {
    year?: number;
    yearPurchaseTotal?: number;
    lifetimePurchaseTotal?: number;
    lifetimePaidTotal?: number;
    openBalance?: number;
    openSales?: number;
    saleCount?: number;
    lastSaleAt?: string | null;
  };
  sales: AdminCustomerSale[];
  consumptionDocuments?: BonConsumDocumentSummary[];
};

type RomaniaCountyOption = { code: string; name: string };
type RomaniaLocalityOption = { sirutaCode: string; name: string; postalCode?: string | null };

type CustomerEditorForm = {
  fullName: string;
  phone: string;
  email: string;
  countyCode: string;
  localityCode: string;
  city: string;
  address: string;
  postalCode: string;
  notes: string;
  creditLimit: string;
};

function customerEditorFromRecord(record?: AdminShopCustomerRecord | null): CustomerEditorForm {
  return {
    fullName: String(record?.fullName || ""),
    phone: String(record?.phone || ""),
    email: String(record?.email || ""),
    countyCode: String(record?.countyCode || ""),
    localityCode: String(record?.localityCode || ""),
    city: String(record?.city || record?.localityName || ""),
    address: String(record?.address || ""),
    postalCode: String(record?.postalCode || ""),
    notes: String(record?.notes || ""),
    creditLimit: String(numberValue(record?.creditLimit || 0)),
  };
}

async function adminClientJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`) as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = body?.code || undefined;
    throw error;
  }
  return body as T;
}

async function apiAdminCustomerRecord(customerId: string, location: string, year: number) {
  const query = new URLSearchParams({ location, year: String(year), salesLimit: "1", paymentsLimit: "1" });
  return adminClientJson<{ ok: true; item: AdminShopCustomerRecord }>(`/api/aif/shop-customers/${encodeURIComponent(customerId)}?${query.toString()}`);
}

async function apiAdminCustomerPurchases(customerId: string, location: string, year: number) {
  const query = new URLSearchParams({
    location,
    year: String(year),
    salesLimit: "500",
    paymentsLimit: "1",
  });
  return adminClientJson<AdminCustomerPurchasesResponse>(
    `/api/aif/shop-customers/${encodeURIComponent(customerId)}?${query.toString()}`,
  );
}


async function apiAdminCreateBonConsum(
  customerId: string,
  location: string,
  payload: {
    documentDate: string;
    purpose: string;
    recipientName?: string | null;
    note?: string | null;
    lineIds: string[];
  },
) {
  return adminClientJson<{ ok: true } & BonConsumDocumentDetail>(
    `/api/aif/shop-customers/${encodeURIComponent(customerId)}/bon-consum`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, location }),
    },
  );
}

async function apiAdminGetBonConsum(documentId: string) {
  return adminClientJson<{ ok: true } & BonConsumDocumentDetail>(
    `/api/aif/bon-consum/${encodeURIComponent(documentId)}`,
  );
}

async function apiAdminGetBonConsumSettings() {
  return adminClientJson<{ ok: true; settings: BonConsumNumberSettings }>(
    "/api/aif/bon-consum/settings",
  );
}

async function apiAdminSaveBonConsumSettings(payload: { series: string; nextNumber: number }) {
  return adminClientJson<{ ok: true; settings: BonConsumNumberSettings }>(
    "/api/aif/bon-consum/settings",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

async function apiAdminUpdateCustomerRecord(customerId: string, location: string, payload: Record<string, unknown>) {
  return adminClientJson<{ ok: true; item: AdminShopCustomerRecord }>(`/api/aif/shop-customers/${encodeURIComponent(customerId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, location }),
  });
}

async function apiAdminDeleteCustomerRecord(customerId: string, location: string) {
  const query = new URLSearchParams({ location });
  return adminClientJson<{ ok: true; mode: "deleted" | "archived"; usage?: { sales?: number; payments?: number; openBalance?: number } }>(
    `/api/aif/shop-customers/${encodeURIComponent(customerId)}?${query.toString()}`,
    { method: "DELETE" },
  );
}

async function apiAdminRomaniaCounties() {
  return adminClientJson<{ ok: true; items: RomaniaCountyOption[] }>("/api/aif/romania/counties");
}

async function apiAdminRomaniaLocalities(countyCode: string) {
  const query = new URLSearchParams({ county: countyCode, limit: "1000" });
  return adminClientJson<{ ok: true; items: RomaniaLocalityOption[] }>(`/api/aif/romania/localities?${query.toString()}`);
}

function formatDate(value?: string | null) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleDateString("hu-HU", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}


function formatDateTime(value?: string | null) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleString("hu-HU", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function saleStatusLabel(value?: string | null) {
  const status = String(value || "").toLowerCase();
  if (status === "completed") return "Lezárva";
  if (status === "draft") return "Vázlat";
  if (status === "cancelled") return "Törölve";
  if (status === "refunded") return "Visszatérítve";
  return value || "–";
}

function paymentStatusLabel(value?: string | null) {
  const status = String(value || "").toLowerCase();
  if (status === "paid") return "Fizetve";
  if (status === "partial") return "Részben fizetve";
  if (status === "unpaid") return "Nincs fizetve";
  if (status === "credit") return "Hitel / tartozás";
  return value || "–";
}

function paymentMethodLabel(value?: string | null) {
  const method = String(value || "").trim().toLowerCase();
  if (method === "cash") return "Készpénz";
  if (method === "card") return "Bankkártya";
  if (method === "bank_transfer") return "Átutalás";
  if (method === "credit") return "Hitel / tartozás";
  if (method === "voucher") return "Utalvány";
  if (method === "other") return "Egyéb";
  return value ? String(value) : "–";
}

function saleSettledAt(sale: AdminCustomerSale) {
  if (String(sale.paymentStatus || "").toLowerCase() !== "paid") return null;
  if (numberValue(sale.balanceDue) > 0.005) return null;

  let latestPaidAt: string | null = null;
  let latestTime = -Infinity;

  for (const payment of sale.payments || []) {
    const method = String(payment?.method || "").trim().toLowerCase();
    if (method === "credit" || numberValue(payment?.amount) <= 0.005 || !payment?.paidAt) continue;

    const time = new Date(payment.paidAt).getTime();
    if (!Number.isFinite(time) || time <= latestTime) continue;

    latestTime = time;
    latestPaidAt = payment.paidAt;
  }

  return latestPaidAt;
}

function safeColorHex(value?: string | null) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-f]{3}$/i.test(raw) || /^#[0-9a-f]{6}$/i.test(raw) || /^#[0-9a-f]{8}$/i.test(raw)) return raw;
  return "";
}

function activityText(item: AifAdminCustomerOverviewItem, year: number) {
  if (item.periodTransactions > 0) {
    return `${formatDate(item.periodLastSaleAt)} • ${integer(item.periodTransactions)} vásárlás`;
  }
  if (item.lastSaleAt) return `${year}-ban nem vásárolt • utoljára ${formatDate(item.lastSaleAt)}`;
  return "Még nincs vásárlása";
}

function storeTone(code?: string | null) {
  return code === "main_warehouse"
    ? "border-[#78ded9]/35 bg-[#2a8d8b]/18 text-[#d7fffd]"
    : "border-sky-200/28 bg-sky-400/12 text-sky-50";
}

function StoreBadge({ code, name }: { code?: string | null; name?: string | null }) {
  const label = code === "main_warehouse"
    ? "Csíkszereda"
    : code === "magazin_targu_secuiesc"
      ? "Kézdivásárhely"
      : (name || "Üzlet");
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] ${storeTone(code)}`}>
      <Store size={11} />
      {label}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "normal",
  active = false,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  tone?: "normal" | "green" | "blue" | "red" | "gold";
  active?: boolean;
  onClick?: () => void;
}) {
  const toneClass = tone === "green"
    ? "border-emerald-200/28 bg-gradient-to-br from-[#1f7666] via-[#28665f] to-[#344154]"
    : tone === "blue"
      ? "border-sky-200/25 bg-gradient-to-br from-[#315c76] to-[#344154]"
      : tone === "red"
        ? "border-rose-200/28 bg-gradient-to-br from-[#66404c] to-[#344154]"
        : tone === "gold"
          ? "border-amber-200/26 bg-gradient-to-br from-[#65593d] to-[#344154]"
          : "border-white/16 bg-gradient-to-br from-[#3d4b5f] to-[#344154]";
  const interactiveClass = onClick
    ? "cursor-pointer text-left transition hover:-translate-y-0.5 hover:border-[#9be9e5]/55 hover:shadow-[0_16px_34px_rgba(15,23,42,0.28)] focus:outline-none focus:ring-2 focus:ring-[#9be9e5]/45 active:translate-y-0"
    : "";
  const activeClass = active
    ? "ring-2 ring-[#9be9e5]/65 border-[#b9fffb]/70 shadow-[0_0_0_1px_rgba(155,233,229,0.16),0_18px_38px_rgba(15,23,42,0.30)]"
    : "";
  const className = `min-w-0 rounded-[21px] border p-3.5 shadow-[0_12px_28px_rgba(15,23,42,0.16)] ${toneClass} ${interactiveClass} ${activeClass}`;
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[9px] uppercase tracking-[0.14em] text-white/55">{label}</p>
            {active ? <span className="rounded-full border border-[#cffffd]/30 bg-[#2a8d8b]/36 px-2 py-0.5 text-[8px] uppercase tracking-[0.08em] text-[#e8ffff]">Aktív szűrő</span> : null}
          </div>
          <p className="mt-2 truncate text-[clamp(1.05rem,1.6vw,1.55rem)] leading-none text-white" title={value}>{value}</p>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/18 bg-white/[0.07] text-[#d7fffd]">
          <Icon size={17} />
        </span>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[10px] text-white/50" title={hint}>{hint}</p>
        {onClick ? <span className="shrink-0 text-[9px] text-[#bff8f5]/72">{active ? "Törlés" : "Szűrés"}</span> : null}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={className}>
        {content}
      </button>
    );
  }
  return <article className={className}>{content}</article>;
}

function StorePerformanceCard({ store }: { store: AifAdminCustomerStoreSummary }) {
  return (
    <article className={`${card} min-w-0 p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Üzleti teljesítmény</p>
          <h3 className="mt-1 truncate text-lg text-white">{store.code === "main_warehouse" ? "Csíkszereda" : "Kézdivásárhely"}</h3>
          <p className="mt-1 truncate text-xs text-white/42">{store.name}</p>
        </div>
        <StoreBadge code={store.code} name={store.name} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-white/10 bg-[#293548] p-3">
          <p className="text-[9px] uppercase tracking-[0.1em] text-white/40">Forgalom</p>
          <p className="mt-2 truncate text-lg text-white" title={money(store.revenue)}>{money(store.revenue)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#293548] p-3">
          <p className="text-[9px] uppercase tracking-[0.1em] text-white/40">Vásárló kliens</p>
          <p className="mt-2 text-lg text-[#d7fffd]">{integer(store.activeCustomers)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#293548] p-3">
          <p className="text-[9px] uppercase tracking-[0.1em] text-white/40">Vásárlások</p>
          <p className="mt-2 text-lg text-white">{integer(store.transactions)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#293548] p-3">
          <p className="text-[9px] uppercase tracking-[0.1em] text-white/40">Átlag / kliens</p>
          <p className="mt-2 truncate text-lg text-white" title={money(store.averageCustomerValue)}>{money(store.averageCustomerValue)}</p>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-[10px] text-white/48">
          <span>Részesedés a kiválasztott forgalomból</span>
          <span>{percent(store.share)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#263144]">
          <div className="h-full rounded-full bg-gradient-to-r from-[#2a8d8b] to-[#68ddd8]" style={{ width: `${Math.max(0, Math.min(100, store.share))}%` }} />
        </div>
      </div>
    </article>
  );
}

function EmployeePerformance({
  items,
  selected,
  onSelect,
}: {
  items: AifAdminCustomerEmployeeSummary[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const maxRevenue = Math.max(1, ...items.map((item) => item.revenue));
  return (
    <section className={`${card} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5">
        <div>
          <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Eladói kapcsolat</p>
          <h2 className="mt-1 text-base text-white">Ki mennyit adott el a klienseknek?</h2>
        </div>
        {selected ? (
          <button type="button" onClick={() => onSelect("")} className="h-9 rounded-xl border border-[#9be9e5]/30 bg-[#2a8d8b]/16 px-3 text-xs text-[#d7fffd] hover:bg-[#2a8d8b]/26">
            Szűrés törlése
          </button>
        ) : (
          <span className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[10px] text-white/50">Kattints egy eladóra a szűréshez</span>
        )}
      </div>

      <div className="grid gap-2 p-4 md:grid-cols-2 xl:grid-cols-3">
        {items.slice(0, 9).map((item, index) => {
          const active = item.actor === selected;
          return (
            <button
              key={item.actor}
              type="button"
              onClick={() => onSelect(active ? "" : item.actor)}
              className={`rounded-2xl border p-3 text-left transition active:scale-[0.99] ${active
                ? "border-[#9be9e5]/60 bg-[#2a8d8b]/22 shadow-[0_0_0_1px_rgba(155,233,229,0.12)]"
                : "border-white/10 bg-[#2b3749] hover:border-[#7bd7d4]/32 hover:bg-[#334156]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-black/10 text-[#9be9e5]">
                    {index < 3 ? <Medal size={15} /> : <UserRound size={15} />}
                  </span>
                  <span className="truncate text-sm text-white">{item.actor}</span>
                </span>
                <span className="shrink-0 text-sm text-white">{money(item.revenue)}</span>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#202b3c]">
                <div className="h-full rounded-full bg-gradient-to-r from-[#2a8d8b] to-[#69ddd8]" style={{ width: `${Math.max(3, item.revenue / maxRevenue * 100)}%` }} />
              </div>
              <div className="mt-2 text-[10px] text-white/45">
                <span>{integer(item.customers)} kliens • {integer(item.transactions)} vásárlás</span>
              </div>
            </button>
          );
        })}
        {!items.length ? (
          <div className="col-span-full rounded-2xl border border-dashed border-white/12 bg-black/5 px-4 py-9 text-center text-sm text-white/42">
            Ebben a szűrésben nincs eladói teljesítményadat.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SellerChips({ sellers }: { sellers: AifAdminCustomerSellerBreakdown[] }) {
  if (!sellers.length) return <span className="text-[10px] text-white/35">Nincs idei eladás</span>;
  return (
    <div className="flex max-w-[310px] flex-wrap gap-1.5">
      {sellers.slice(0, 2).map((seller) => (
        <span key={seller.actor} className="inline-flex max-w-full items-center gap-1 rounded-lg border border-white/10 bg-black/10 px-2 py-1 text-[10px] text-white/66" title={`${seller.actor}: ${money(seller.revenue)}`}>
          <UserRound size={10} className="shrink-0 text-[#8ee6e2]" />
          <span className="truncate">{seller.actor}</span>
          <span className="shrink-0 text-white/88">{money(seller.revenue)}</span>
        </span>
      ))}
      {sellers.length > 2 ? (
        <span className="inline-flex items-center rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-white/45">+{sellers.length - 2}</span>
      ) : null}
    </div>
  );
}

function WarehouseProductImage({
  src,
  alt = "",
  thumbClassName = "h-11 w-11 rounded-lg",
  iconSize = 17,
}: {
  src?: string | null;
  alt?: string;
  thumbClassName?: string;
  iconSize?: number;
}) {
  const thumbRef = useRef<HTMLSpanElement | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewStyle, setPreviewStyle] = useState<Record<string, string | number>>({});
  const cleanSrc = String(src || "").trim();

  function updatePreviewPosition() {
    if (!cleanSrc || typeof window === "undefined") return;
    const thumb = thumbRef.current;
    if (!thumb) return;
    const rect = thumb.getBoundingClientRect();
    const previewWidth = 248;
    const previewHeight = 300;
    const gap = 12;
    const padding = 10;
    let left = rect.right + gap;
    if (left + previewWidth > window.innerWidth - padding) left = rect.left - previewWidth - gap;
    if (left < padding) left = Math.min(Math.max(padding, rect.left + rect.width / 2 - previewWidth / 2), Math.max(padding, window.innerWidth - previewWidth - padding));
    const maxTop = Math.max(padding, window.innerHeight - previewHeight - padding);
    const top = Math.min(Math.max(padding, rect.top + rect.height / 2 - previewHeight / 2), maxTop);
    setPreviewStyle({ position: "fixed", left, top, width: previewWidth });
  }

  function openPreview() {
    if (!cleanSrc) return;
    updatePreviewPosition();
    setPreviewOpen(true);
  }

  useEffect(() => {
    if (!previewOpen || !cleanSrc) return;
    updatePreviewPosition();
    const onMove = () => updatePreviewPosition();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [previewOpen, cleanSrc]);

  const thumb = (
    <span
      ref={thumbRef}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-white/18 bg-white text-slate-400 shadow-sm ${thumbClassName}`}
      onMouseEnter={openPreview}
      onMouseLeave={() => setPreviewOpen(false)}
      onFocus={openPreview}
      onBlur={() => setPreviewOpen(false)}
      tabIndex={cleanSrc ? 0 : undefined}
      aria-label={cleanSrc ? "Termékkép nagyítása" : "Nincs termékkép"}
    >
      {cleanSrc ? (
        <img src={cleanSrc} alt={alt} className="h-full w-full object-contain p-0.5" loading="lazy" decoding="async" />
      ) : (
        <ImagePlus size={iconSize} />
      )}
    </span>
  );

  const preview = cleanSrc && previewOpen && typeof document !== "undefined"
    ? createPortal(
        <div
          className="pointer-events-none z-[9999] rounded-2xl border border-white/80 bg-white p-2 shadow-2xl shadow-black/45"
          style={previewStyle}
          role="tooltip"
        >
          <img src={cleanSrc} alt="" className="max-h-[280px] w-full rounded-xl bg-white object-contain" />
        </div>,
        document.body,
      )
    : null;

  return <>{thumb}{preview}</>;
}


function officialHtmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function officialNumber(value: unknown, digits = 2) {
  return numberValue(value).toLocaleString("ro-RO", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function officialFileSafe(value: unknown) {
  return String(value || "bon_de_consum")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "bon_de_consum";
}

function bucharestIsoToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function bonConsumNumberPreview(
  series: string,
  sequenceNumber: string | number,
  documentDate: string,
  settings?: BonConsumNumberSettings | null,
) {
  const cleanSeries = String(series || "BC").trim().toUpperCase() || "BC";
  const parsedNumber = Number(sequenceNumber);
  const safeNumber = Number.isInteger(parsedNumber) && parsedNumber > 0 ? parsedNumber : 1;
  const digits = Math.min(10, Math.max(3, Number(settings?.digits || 6)));
  const year = Number(String(documentDate || bucharestIsoToday()).slice(0, 4)) || new Date().getFullYear();
  const sequence = String(safeNumber).padStart(digits, "0");
  return settings?.includeYear === false
    ? `${cleanSeries}/${sequence}`
    : `${cleanSeries}/${year}/${sequence}`;
}

function bonConsumLineEligibility(sale: AdminCustomerSale, line: AdminCustomerSaleLine) {
  if (String(sale.status || "").toLowerCase() !== "completed") {
    return { eligible: false, reason: "Csak lezárt, aktív vásárlás vezethető át." };
  }
  const hasPayment = numberValue(sale.paidTotal) > 0.005
    || (sale.payments || []).some((payment) => numberValue(payment.amount) > 0.005);
  if (hasPayment || !["credit", "unpaid"].includes(String(sale.paymentStatus || "").toLowerCase())) {
    return { eligible: false, reason: "Ehhez a vásárláshoz már fizetés kapcsolódik." };
  }
  if (line.buyPriceSnapshot === null || line.buyPriceSnapshot === undefined || !Number.isFinite(Number(line.buyPriceSnapshot))) {
    return { eligible: false, reason: "Hiányzik az eladáskor rögzített vételár." };
  }
  if (numberValue(line.listPrice) <= 0) {
    return { eligible: false, reason: "Hiányzik a teljes eladási listaár." };
  }
  return { eligible: true, reason: "" };
}

function buildOfficialBonConsumHtml(detail: BonConsumDocumentDetail) {
  const doc = detail.document;
  const lines = detail.lines || [];
  const generated = new Date().toLocaleDateString("ro-RO", { timeZone: "Europe/Bucharest" });

  const lineMarkup = (line: BonConsumDocumentLine) => {
    const purchaseUnit = numberValue(line.purchaseUnitPrice);
    const retailGrossUnit = numberValue(line.listUnitPrice);
    const rate = Number(line.salesTvaRate);
    const hasValidTva = Number.isFinite(rate) && rate >= 0;
    if (!hasValidTva) return { unit: null as number | null, value: null as number | null };
    const retailNetUnit = retailGrossUnit / (1 + rate / 100);
    const rawUnit = retailNetUnit - purchaseUnit;
    const unit = Math.round((rawUnit + Number.EPSILON) * 100) / 100;
    const value = Math.round((unit * numberValue(line.quantity) + Number.EPSILON) * 100) / 100;
    return { unit, value };
  };

  const markupValues = lines.map((line) => lineMarkup(line));
  const hasUnknownMarkup = markupValues.some((row) => row.value === null);
  const markupTotal = markupValues.reduce((sum, row) => sum + numberValue(row.value), 0);
  const vatRates = Array.from(new Set(lines
    .map((line) => Number(line.salesTvaRate))
    .filter((rate) => Number.isFinite(rate) && rate >= 0)
    .map((rate) => Number(rate))))
    .sort((a, b) => a - b);
  const vatSummary = vatRates.length
    ? vatRates.map((rate) => `${officialNumber(rate, Number.isInteger(rate) ? 0 : 2)}%`).join(" / ")
    : "-";

  const adminRows = lines.map((line, index) => {
    const variant = [line.brandName, line.colorName, line.size].filter(Boolean).join(" • ");
    const markup = lineMarkup(line);
    return `<tr>
      <td class="center">${index + 1}</td>
      <td>
        <strong>${officialHtmlEscape(line.productTitle || "Produs")}</strong>
        <div class="muted">${officialHtmlEscape(variant || "-")}</div>
      </td>
      <td class="code">${officialHtmlEscape(line.productCode || "-")}</td>
      <td class="code">${officialHtmlEscape(line.snCod || "-")}</td>
      <td class="code">${officialHtmlEscape(line.barcode || "-")}</td>
      <td class="center">buc.</td>
      <td class="qty">${officialNumber(line.quantity, 0)}</td>
      <td class="money">${officialNumber(line.purchaseUnitPrice)}</td>
      <td class="money">${officialNumber(line.purchaseValue)}</td>
      <td class="money">${markup.unit === null ? "-" : officialNumber(markup.unit)}</td>
      <td class="money">${markup.value === null ? "-" : officialNumber(markup.value)}</td>
      <td class="money">${officialNumber(line.listUnitPrice)}</td>
      <td class="money strongValue">${officialNumber(line.retailValue)}</td>
    </tr>`;
  }).join("");

  const signingRows = adminRows;

  const renderTop = () => `
    <div class="top">
      <div>
        <div class="company">TITAN EURO-COM SRL</div>
        <div class="companyMeta">
          <div><strong>CUI:</strong> RO17495362</div>
          <div><strong>Nr. Reg. Com.:</strong> J19/420/2005</div>
          <div><strong>Sediu:</strong> Str. Mihail Sadoveanu nr. 33, sc. C, et. 4, ap. 17, Miercurea-Ciuc, jud. Harghita, România</div>
        </div>
      </div>
      <div class="docBox">
        <h3>Datele documentului</h3>
        <div class="docBoxBody">
          <div class="docLine"><span>Nr. document</span><strong>${officialHtmlEscape(doc.documentNumber)}</strong></div>
          <div class="docLine"><span>Data documentului</span><strong>${officialHtmlEscape(doc.documentDate || "-")}</strong></div>
          <div class="docLine"><span>Cod formular</span><strong>14-3-4A</strong></div>
          <div class="docLine"><span>Întocmit de</span><strong>${officialHtmlEscape(doc.actor || "-")}</strong></div>
        </div>
      </div>
    </div>

    <div class="title">
      <div class="eyebrow">Document intern de gestiune</div>
      <h1>BON DE CONSUM</h1>
      <div class="subtitle">Scoatere din gestiune / consum pe baza unor ieșiri de stoc documentate</div>
    </div>

    <div class="meta">
      <div class="metaBox"><span>Gestiune</span><strong>${officialHtmlEscape(doc.locationName || "-")}</strong></div>
      <div class="metaBox"><span>Referință client</span><strong>${officialHtmlEscape(doc.customerName || "-")}${doc.customerPhone ? `<br>${officialHtmlEscape(doc.customerPhone)}` : ""}</strong></div>
      <div class="metaBox"><span>Primitor</span><strong>${officialHtmlEscape(doc.recipientName || doc.customerName || "-")}</strong></div>
      <div class="metaBox"><span>Scop / destinație</span><strong>${officialHtmlEscape(doc.purpose || "-")}</strong></div>
    </div>`;

  const renderSignatures = () => `
    <div class="signatures">
      <div class="signature"><div class="signatureTitle">Întocmit de / Administrator</div><div class="signatureLine">Nume, prenume și semnătură</div><div class="signatureDate">Data: __________________</div></div>
      <div class="signature"><div class="signatureTitle">Gestionar</div><div class="signatureLine">Nume, prenume și semnătură</div><div class="signatureDate">Data: __________________</div></div>
      <div class="signature"><div class="signatureTitle">Predat către / Primitor</div><div class="signatureLine">Nume, prenume și semnătură</div><div class="signatureDate">Data: __________________</div></div>
      <div class="signature"><div class="signatureTitle">Verificat / Contabilitate</div><div class="signatureLine">Nume, prenume și semnătură</div><div class="signatureDate">Data: __________________</div></div>
    </div>

    <div class="footer">
      <span>Document generat din sistemul AllInFashion.</span>
      <span>${officialHtmlEscape(doc.documentNumber)} • Generat: ${officialHtmlEscape(generated)}</span>
    </div>`;

  return `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8" />
<title>${officialHtmlEscape(`Bon de consum ${doc.documentNumber}`)}</title>
<style>
  @page { size:A4 landscape; margin:10mm; }
  * { box-sizing:border-box; }
  html,body { margin:0; padding:0; background:#fff; color:#172033; }
  body { font-family:Arial,Helvetica,sans-serif; font-size:9px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .doc { width:100%; }
  .pageBreak { break-before:page; page-break-before:always; }
  .top { display:grid; grid-template-columns:minmax(0,1fr) minmax(74mm,.86fr); gap:9mm; align-items:start; padding-bottom:4mm; border-bottom:2px solid #255f54; }
  .company { color:#183d36; font-size:16px; font-weight:700; letter-spacing:.03em; }
  .companyMeta { margin-top:2mm; color:#465467; font-size:8.5px; line-height:1.45; }
  .docBox { border:1px solid #b9c7c4; border-radius:3mm; overflow:hidden; }
  .docBox h3 { margin:0; padding:2mm 3mm; background:#255f54; color:#fff; font-size:8px; letter-spacing:.09em; text-transform:uppercase; }
  .docBoxBody { padding:2mm 3mm; background:#f5f8f7; }
  .docLine { display:flex; justify-content:space-between; gap:5mm; padding:1mm 0; border-bottom:1px solid #d8e0de; }
  .docLine:last-child { border-bottom:0; }
  .docLine span { color:#667382; }
  .docLine strong { text-align:right; color:#172033; }
  .title { padding:4mm 0 3mm; text-align:center; }
  .eyebrow { color:#255f54; font-size:8px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; }
  h1 { margin:1.2mm 0 0; font-size:20px; letter-spacing:.04em; }
  .subtitle { margin-top:1mm; color:#526070; font-size:9px; }
  .meta { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:2.5mm; margin-bottom:3mm; }
  .metaBox { border:1px solid #ccd7d4; border-radius:2.4mm; padding:2.2mm 2.6mm; background:#f7faf9; min-height:13mm; }
  .metaBox span { display:block; color:#6a7683; font-size:7px; letter-spacing:.08em; text-transform:uppercase; }
  .metaBox strong { display:block; margin-top:1mm; font-size:9.5px; color:#172033; font-weight:600; overflow-wrap:anywhere; }
  .declaration { margin-bottom:3mm; border-left:3px solid #255f54; background:#f5f8f7; padding:2.2mm 3mm; color:#354353; line-height:1.45; }
  .trace { margin:0 0 3mm; border:1px solid #d7b65a; border-radius:2.2mm; background:#fff9e8; padding:2mm 2.7mm; color:#75580f; line-height:1.4; }
  table { width:100%; border-collapse:collapse; table-layout:fixed; }
  thead { display:table-header-group; }
  tr { break-inside:avoid; page-break-inside:avoid; }
  th { background:#26384b; color:#fff; border:1px solid #26384b; padding:1.7mm 1mm; font-size:6.5px; line-height:1.15; text-transform:uppercase; text-align:center; font-weight:500; }
  td { border:1px solid #d4dcdf; padding:1.25mm 1mm; font-size:7.4px; line-height:1.18; vertical-align:middle; overflow-wrap:anywhere; }
  tbody tr:nth-child(even) td { background:#f8fafb; }
  td strong { display:block; font-size:7.8px; color:#172033; }
  .muted { margin-top:.7mm; color:#64748b; font-size:6.6px; }
  .center { text-align:center; }
  .qty { text-align:center; font-size:8.5px; font-weight:700; color:#255f54; }
  .money { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
  .strongValue { font-weight:700; color:#183d36; }
  .code { font-family:"Courier New",monospace; text-align:center; font-size:6.6px; }
  .source { font-size:6.5px; color:#435164; }

  .adminTable th:nth-child(1),.adminTable td:nth-child(1),
  .signingTable th:nth-child(1),.signingTable td:nth-child(1){width:5mm}
  .adminTable th:nth-child(2),.adminTable td:nth-child(2),
  .signingTable th:nth-child(2),.signingTable td:nth-child(2){width:42mm}
  .adminTable th:nth-child(3),.adminTable td:nth-child(3),
  .signingTable th:nth-child(3),.signingTable td:nth-child(3){width:20mm}
  .adminTable th:nth-child(4),.adminTable td:nth-child(4),
  .signingTable th:nth-child(4),.signingTable td:nth-child(4){width:16mm}
  .adminTable th:nth-child(5),.adminTable td:nth-child(5),
  .signingTable th:nth-child(5),.signingTable td:nth-child(5){width:25mm}
  .adminTable th:nth-child(6),.adminTable td:nth-child(6),
  .signingTable th:nth-child(6),.signingTable td:nth-child(6){width:8mm}
  .adminTable th:nth-child(7),.adminTable td:nth-child(7),
  .signingTable th:nth-child(7),.signingTable td:nth-child(7){width:9mm}
  .adminTable th:nth-child(8),.adminTable td:nth-child(8),
  .signingTable th:nth-child(8),.signingTable td:nth-child(8){width:19mm}
  .adminTable th:nth-child(9),.adminTable td:nth-child(9),
  .signingTable th:nth-child(9),.signingTable td:nth-child(9){width:19mm}
  .adminTable th:nth-child(10),.adminTable td:nth-child(10),
  .signingTable th:nth-child(10),.signingTable td:nth-child(10){width:18mm}
  .adminTable th:nth-child(11),.adminTable td:nth-child(11),
  .signingTable th:nth-child(11),.signingTable td:nth-child(11){width:19mm}
  .adminTable th:nth-child(12),.adminTable td:nth-child(12),
  .signingTable th:nth-child(12),.signingTable td:nth-child(12){width:19mm}
  .adminTable th:nth-child(13),.adminTable td:nth-child(13),
  .signingTable th:nth-child(13),.signingTable td:nth-child(13){width:20mm}

  tfoot td { background:#eef4f2; border-top:2px solid #255f54; font-weight:700; }
  .totalLabel { text-align:right; color:#183d36; letter-spacing:.07em; }
  .retailTotal { background:#255f54 !important; color:#fff; font-size:8.5px; }
  .summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:2.5mm; margin-top:3mm; }
  .summary.signingSummary { grid-template-columns:repeat(3,minmax(0,1fr)); }
  .summaryBox { border:1px solid #ccd7d4; border-radius:2.4mm; padding:2.3mm 2.7mm; background:#f7faf9; }
  .summaryBox span { display:block; color:#6a7683; font-size:7px; text-transform:uppercase; letter-spacing:.07em; }
  .summaryBox strong { display:block; margin-top:1mm; font-size:11px; color:#172033; }
  .summaryBox.retail { border-color:#255f54; background:#eef7f4; }
  .summaryBox.retail strong { color:#183d36; }
  .signatures { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:4mm; margin-top:10mm; break-inside:avoid; }
  .signature { min-height:24mm; border:1px solid #ccd7d4; border-radius:2.5mm; padding:2.5mm; }
  .signatureTitle { color:#255f54; font-size:7.5px; font-weight:700; letter-spacing:.07em; text-transform:uppercase; }
  .signatureLine { margin-top:8mm; border-top:1px solid #667382; padding-top:1.2mm; color:#667382; font-size:7px; text-align:center; }
  .signatureDate { margin-top:2mm; color:#7b8793; font-size:7px; text-align:center; }
  .footer { display:flex; justify-content:space-between; gap:8mm; margin-top:4mm; padding-top:2mm; border-top:1px solid #d7dfdd; color:#7b8793; font-size:7px; }
</style>
</head>
<body>

<section class="doc adminCopy">
  ${renderTop()}

  <div class="declaration">Prin prezentul document se consemnează consumul și scoaterea din gestiune a produselor enumerate mai jos. Valorile de achiziție și de vânzare sunt cele înregistrate la momentul ieșirii inițiale din stoc, fără recalculare după prețurile curente.</div>
  <div class="trace"><strong>Trasabilitate:</strong> documentul leagă de acest Bon de consum ieșirile de stoc deja înregistrate în sistem și nu dublează diminuarea cantitativă. Prețul de achiziție este cel înregistrat la momentul vânzării, iar prețul de vânzare este prețul de listă înregistrat la acel moment, înainte de reducerea acordată clientului.${doc.note ? ` Observații: ${officialHtmlEscape(doc.note)}` : ""}</div>

  <table class="adminTable">
    <thead>
      <tr>
        <th>Nr.</th><th>Denumire produs / variantă</th><th>Cod produs</th><th>S/N/COD</th><th>Cod de bare</th>
        <th>U.M.</th><th>Cant.</th><th>P.U. achiz. fără TVA RON</th><th>Val. achiz. RON</th>
        <th>Adaos / U.M. RON</th><th>Val. adaos RON</th><th>Preț amănunt RON</th><th>Val. amănunt RON</th>
      </tr>
    </thead>
    <tbody>${adminRows || `<tr><td colspan="13" style="padding:8mm;text-align:center;">Nu există poziții.</td></tr>`}</tbody>
    <tfoot>
      <tr>
        <td colspan="6" class="totalLabel">TOTAL</td>
        <td class="qty">${officialNumber(doc.totalQty, 0)}</td>
        <td></td>
        <td class="money">${officialNumber(doc.purchaseTotal)}</td>
        <td></td>
        <td class="money">${hasUnknownMarkup ? "-" : officialNumber(markupTotal)}</td>
        <td></td>
        <td class="money retailTotal">${officialNumber(doc.retailTotal)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="summary">
    <div class="summaryBox"><span>Valoare de achiziție</span><strong>${officialNumber(doc.purchaseTotal)} RON</strong></div>
    <div class="summaryBox"><span>Valoare adaos</span><strong>${hasUnknownMarkup ? "-" : `${officialNumber(markupTotal)} RON`}</strong></div>
    <div class="summaryBox retail"><span>Valoare amănunt</span><strong>${officialNumber(doc.retailTotal)} RON</strong></div>
    <div class="summaryBox"><span>Cota TVA</span><strong>${officialHtmlEscape(vatSummary)}</strong></div>
  </div>

  ${renderSignatures()}
</section>

<section class="doc pageBreak signingCopy">
  ${renderTop()}

  <div class="declaration">Prin prezentul document se consemnează consumul și scoaterea din gestiune a produselor enumerate mai jos. Valorile de vânzare sunt cele înregistrate la momentul ieșirii inițiale din stoc, fără recalculare după prețurile curente.</div>
  <div class="trace"><strong>Trasabilitate:</strong> documentul leagă de acest Bon de consum ieșirile de stoc deja înregistrate în sistem și nu dublează diminuarea cantitativă. Prețul de vânzare este prețul de listă înregistrat la acel moment, înainte de reducerea acordată clientului.${doc.note ? ` Observații: ${officialHtmlEscape(doc.note)}` : ""}</div>

  <table class="signingTable">
    <thead>
      <tr>
        <th>Nr.</th><th>Denumire produs / variantă</th><th>Cod produs</th><th>S/N/COD</th><th>Cod de bare</th>
        <th>U.M.</th><th>Cant.</th><th>P.U. achiz. fără TVA RON</th><th>Val. achiz. RON</th>
        <th>Adaos / U.M. RON</th><th>Val. adaos RON</th><th>Preț amănunt RON</th><th>Val. amănunt RON</th>
      </tr>
    </thead>
    <tbody>${signingRows || `<tr><td colspan="13" style="padding:8mm;text-align:center;">Nu există poziții.</td></tr>`}</tbody>
    <tfoot>
      <tr>
        <td colspan="6" class="totalLabel">TOTAL</td>
        <td class="qty">${officialNumber(doc.totalQty, 0)}</td>
        <td></td>
        <td class="money">${officialNumber(doc.purchaseTotal)}</td>
        <td></td>
        <td class="money">${hasUnknownMarkup ? "-" : officialNumber(markupTotal)}</td>
        <td></td>
        <td class="money retailTotal">${officialNumber(doc.retailTotal)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="summary">
    <div class="summaryBox"><span>Valoare de achiziție</span><strong>${officialNumber(doc.purchaseTotal)} RON</strong></div>
    <div class="summaryBox"><span>Valoare adaos</span><strong>${hasUnknownMarkup ? "-" : `${officialNumber(markupTotal)} RON`}</strong></div>
    <div class="summaryBox retail"><span>Valoare amănunt</span><strong>${officialNumber(doc.retailTotal)} RON</strong></div>
    <div class="summaryBox"><span>Cota TVA</span><strong>${officialHtmlEscape(vatSummary)}</strong></div>
  </div>

  ${renderSignatures()}
</section>

</body>
</html>`;
}

function printOfficialBonConsum(detail: BonConsumDocumentDetail) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "297mm";
  iframe.style.height = "210mm";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const iframeDoc = win?.document;
  if (!win || !iframeDoc) {
    iframe.remove();
    throw new Error("A böngésző nem engedte megnyitni a Bon de consum nyomtatási keretét.");
  }
  let cleaned = false;
  let timer: number | undefined;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (timer) window.clearTimeout(timer);
    iframe.remove();
  };
  win.addEventListener("afterprint", cleanup, { once: true });
  iframeDoc.open();
  iframeDoc.write(buildOfficialBonConsumHtml(detail));
  iframeDoc.title = `bon_de_consum_${officialFileSafe(detail.document.documentNumber)}.pdf`;
  iframeDoc.close();
  win.requestAnimationFrame(() => win.requestAnimationFrame(() => {
    win.focus();
    win.print();
    timer = window.setTimeout(cleanup, 60000);
  }));
}

function CustomerPurchasesModal({
  customerId,
  customerName,
  storeName,
  storeCode,
  location,
  year,
  sales,
  consumptionDocuments,
  loading,
  error,
  canManage,
  onReload,
  onClose,
}: {
  customerId: string;
  customerName: string;
  storeName: string;
  storeCode?: string | null;
  location: string;
  year: number;
  sales: AdminCustomerSale[];
  consumptionDocuments: BonConsumDocumentSummary[];
  loading: boolean;
  error: string;
  canManage: boolean;
  onReload: () => Promise<void>;
  onClose: () => void;
}) {
  const [bonMode, setBonMode] = useState(false);
  const [selectedBonLineIds, setSelectedBonLineIds] = useState<Set<string>>(new Set());
  const [bonFormOpen, setBonFormOpen] = useState(false);
  const [bonConfirmOpen, setBonConfirmOpen] = useState(false);
  const [bonBusy, setBonBusy] = useState(false);
  const [bonError, setBonError] = useState("");
  const [bonDocumentDate, setBonDocumentDate] = useState(bucharestIsoToday());
  const [bonPurpose, setBonPurpose] = useState("");
  const [bonRecipient, setBonRecipient] = useState(customerName);
  const [bonNote, setBonNote] = useState("");
  const [bonNumberSettings, setBonNumberSettings] = useState<BonConsumNumberSettings | null>(null);
  const [bonNumberingBusy, setBonNumberingBusy] = useState(false);
  const [bonSettingsOpen, setBonSettingsOpen] = useState(false);
  const [bonSettingsSeries, setBonSettingsSeries] = useState("BC");
  const [bonSettingsNextNumber, setBonSettingsNextNumber] = useState("1");
  const [bonSettingsSaving, setBonSettingsSaving] = useState(false);
  const [bonSettingsError, setBonSettingsError] = useState("");
  const [bonPrintBusyId, setBonPrintBusyId] = useState("");

  const orderedSales = useMemo(
    () => [...sales].sort((a, b) => new Date(String(b.soldAt || 0)).getTime() - new Date(String(a.soldAt || 0)).getTime()),
    [sales],
  );

  const totals = useMemo(() => orderedSales.reduce((acc, sale) => {
    acc.transactions += 1;
    acc.items += numberValue(sale.itemCount);
    acc.discount += numberValue(sale.discountTotal);
    acc.total += numberValue(sale.total);
    acc.balance += numberValue(sale.balanceDue);
    return acc;
  }, {
    transactions: 0,
    items: 0,
    discount: 0,
    total: 0,
    balance: 0,
  }), [orderedSales]);

  const bonCandidates = useMemo(() => orderedSales.flatMap((sale) =>
    (sale.lines || []).map((line) => ({
      sale,
      line,
      eligibility: bonConsumLineEligibility(sale, line),
    }))
  ), [orderedSales]);

  const eligibleBonCandidates = useMemo(
    () => bonCandidates.filter((row) => row.eligibility.eligible),
    [bonCandidates],
  );

  const selectedBonRows = useMemo(
    () => bonCandidates.filter((row) => selectedBonLineIds.has(row.line.id)),
    [bonCandidates, selectedBonLineIds],
  );

  const selectedBonTotals = useMemo(() => selectedBonRows.reduce((acc, row) => {
    const qty = numberValue(row.line.quantity);
    acc.lines += 1;
    acc.qty += qty;
    acc.purchase += qty * numberValue(row.line.buyPriceSnapshot);
    acc.retail += qty * numberValue(row.line.listPrice);
    acc.actual += numberValue(row.line.lineTotal);
    acc.discount += numberValue(row.line.discountAmount);
    return acc;
  }, { lines: 0, qty: 0, purchase: 0, retail: 0, actual: 0, discount: 0 }), [selectedBonRows]);

  useEffect(() => {
    setBonRecipient(customerName);
  }, [customerName]);

  useEffect(() => {
    const validIds = new Set(bonCandidates.filter((row) => row.eligibility.eligible).map((row) => row.line.id));
    setSelectedBonLineIds((current) => new Set(Array.from(current).filter((id) => validIds.has(id))));
  }, [bonCandidates]);

  function toggleBonMode() {
    setBonMode((current) => {
      const next = !current;
      if (!next) {
        setSelectedBonLineIds(new Set());
        setBonFormOpen(false);
        setBonConfirmOpen(false);
        setBonSettingsOpen(false);
        setBonError("");
      }
      return next;
    });
  }

  function toggleBonLine(lineId: string) {
    setSelectedBonLineIds((current) => {
      const next = new Set(current);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }

  function selectAllBonLines() {
    const all = eligibleBonCandidates.map((row) => row.line.id);
    const allSelected = all.length > 0 && all.every((id) => selectedBonLineIds.has(id));
    setSelectedBonLineIds(allSelected ? new Set() : new Set(all));
  }

  async function loadBonNumberSettings() {
    setBonNumberingBusy(true);
    try {
      const response = await apiAdminGetBonConsumSettings();
      const settings = response.settings;
      setBonNumberSettings(settings);
      return settings;
    } finally {
      setBonNumberingBusy(false);
    }
  }

  async function openBonConsumForm() {
    if (!selectedBonRows.length || bonBusy) return;
    setBonError("");
    setBonFormOpen(true);
    try {
      await loadBonNumberSettings();
    } catch (caught) {
      setBonNumberSettings(null);
      setBonError(caught instanceof Error ? caught.message : "A Bon de consum számozási beállításai nem tölthetők be.");
    }
  }

  async function openBonNumberSettings() {
    if (bonBusy || bonSettingsSaving) return;
    setBonSettingsError("");
    setBonSettingsOpen(true);
    try {
      const settings = await loadBonNumberSettings();
      setBonSettingsSeries(String(settings?.series || "BC"));
      setBonSettingsNextNumber(String(Math.max(1, Number(settings?.nextNumber || 1))));
    } catch (caught) {
      setBonSettingsError(caught instanceof Error ? caught.message : "A számozási beállítások nem tölthetők be.");
    }
  }

  async function saveBonNumberSettings() {
    const series = bonSettingsSeries.trim().toUpperCase();
    const nextNumber = Number(bonSettingsNextNumber);
    setBonSettingsError("");
    if (!series) {
      setBonSettingsError("A sorozat megadása kötelező.");
      return;
    }
    if (!Number.isInteger(nextNumber) || nextNumber <= 0) {
      setBonSettingsError("A következő bizonylatszám pozitív egész szám legyen.");
      return;
    }
    setBonSettingsSaving(true);
    try {
      const response = await apiAdminSaveBonConsumSettings({ series, nextNumber });
      setBonNumberSettings(response.settings);
      setBonSettingsSeries(response.settings.series);
      setBonSettingsNextNumber(String(response.settings.nextNumber));
      setBonSettingsOpen(false);
    } catch (caught) {
      setBonSettingsError(caught instanceof Error ? caught.message : "A számozási beállítások mentése nem sikerült.");
    } finally {
      setBonSettingsSaving(false);
    }
  }

  async function printArchivedBonConsum(documentId: string) {
    if (!documentId || bonPrintBusyId) return;
    setBonPrintBusyId(documentId);
    setBonError("");
    try {
      const response = await apiAdminGetBonConsum(documentId);
      printOfficialBonConsum({ document: response.document, lines: response.lines || [] });
    } catch (caught) {
      setBonError(caught instanceof Error ? caught.message : "A Bon de consum PDF nem tölthető be.");
    } finally {
      setBonPrintBusyId("");
    }
  }

  function openBonFinalConfirmation() {
    setBonError("");
    if (!selectedBonRows.length) {
      setBonError("Legalább egy terméksort válassz ki.");
      return;
    }
    if (!bonDocumentDate) {
      setBonError("A dokumentum dátuma kötelező.");
      return;
    }
    if (!bonPurpose.trim()) {
      setBonError("A felhasználási cél / indok kötelező.");
      return;
    }
    if (!bonNumberSettings) {
      setBonError("A Bon de consum számozási beállításai nem tölthetők be. Nyisd meg a fogaskerék ikonnal a számozás beállítását.");
      return;
    }
    setBonConfirmOpen(true);
  }

  async function createBonConsum() {
    if (bonBusy) return;
    if (!selectedBonRows.length) {
      setBonError("Legalább egy terméksort válassz ki.");
      return;
    }
    if (!bonDocumentDate) {
      setBonError("A dokumentum dátuma kötelező.");
      return;
    }
    if (!bonPurpose.trim()) {
      setBonError("A felhasználási cél / indok kötelező.");
      return;
    }
    if (!bonNumberSettings) {
      setBonError("A Bon de consum számozási beállításai nem érhetők el.");
      return;
    }

    setBonBusy(true);
    setBonError("");
    try {
      const response = await apiAdminCreateBonConsum(customerId, location, {
        documentDate: bonDocumentDate,
        purpose: bonPurpose.trim(),
        recipientName: bonRecipient.trim() || customerName,
        note: bonNote.trim() || null,
        lineIds: selectedBonRows.map((row) => row.line.id),
      });

      printOfficialBonConsum({ document: response.document, lines: response.lines || [] });
      setBonConfirmOpen(false);
      setBonFormOpen(false);
      setBonMode(false);
      setSelectedBonLineIds(new Set());
      setBonPurpose("");
      setBonNote("");
      setBonDocumentDate(bucharestIsoToday());
      setBonNumberSettings(null);
      await onReload();
    } catch (caught) {
      setBonError(caught instanceof Error ? caught.message : "A Bon de consum létrehozása nem sikerült.");
    } finally {
      setBonBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[485] grid place-items-center bg-slate-950/88 px-3 py-4 backdrop-blur-md"
      onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
        if (event.currentTarget === event.target && !bonBusy) onClose();
      }}
    >
      <section className="flex max-h-[94vh] w-full max-w-[1320px] flex-col overflow-hidden rounded-[28px] border border-[#9be9e5]/32 bg-[#303a4c] text-white shadow-[0_38px_120px_rgba(0,0,0,0.68)]">
        <header className="flex items-start justify-between gap-3 border-b border-white/12 bg-[#285d60] px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/[0.07] text-[#d7fffd]">
              <ReceiptText size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-[0.16em] text-white/48">Vásárlási történet</p>
              <h3 className="mt-1 truncate text-xl text-white sm:text-2xl">{customerName}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StoreBadge code={storeCode} name={storeName} />
                <span className="rounded-full border border-white/12 bg-black/10 px-2.5 py-1 text-[10px] text-white/62">{year}. év</span>
                <span className="rounded-full border border-white/12 bg-black/10 px-2.5 py-1 text-[10px] text-white/62">{integer(totals.transactions)} vásárlás</span>
                <span className="rounded-full border border-white/12 bg-black/10 px-2.5 py-1 text-[10px] text-white/62">{integer(totals.items)} db</span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {canManage ? (
              <>
              <button
                type="button"
                onClick={toggleBonMode}
                disabled={loading || bonBusy}
                className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs text-white transition disabled:opacity-45 ${
                  bonMode
                    ? "border-[#bff8f5]/55 bg-[#2a8d8b] shadow-[0_8px_20px_rgba(42,141,139,0.24)]"
                    : "border-white/18 bg-black/10 hover:border-[#9be9e5]/38 hover:bg-white/[0.08]"
                }`}
              >
                <FileCheck2 size={15} /> {bonMode ? "Kijelölés befejezése" : "Bon de consum"}
              </button>
              <button
                type="button"
                onClick={() => void openBonNumberSettings()}
                disabled={loading || bonBusy || bonSettingsSaving}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/18 bg-black/10 text-white/78 transition hover:border-[#9be9e5]/38 hover:bg-white/[0.08] hover:text-white disabled:opacity-45"
                title="Bon de consum számozás"
                aria-label="Bon de consum számozás"
              >
                <Settings size={16} />
              </button>
              </>
            ) : null}
            <button type="button" onClick={onClose} disabled={bonBusy} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/18 bg-black/10 text-white transition hover:bg-white/[0.1] disabled:opacity-45" aria-label="Vásárlások bezárása">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl border border-white/10 bg-[#293548] px-4 py-3">
              <p className="text-[8px] uppercase tracking-[0.12em] text-white/38">Vásárlások</p>
              <p className="mt-1.5 text-xl text-white">{integer(totals.transactions)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#293548] px-4 py-3">
              <p className="text-[8px] uppercase tracking-[0.12em] text-white/38">Megvett darab</p>
              <p className="mt-1.5 text-xl text-white">{integer(totals.items)} db</p>
            </div>
            <div className="rounded-2xl border border-[#9be9e5]/22 bg-[#2a8d8b]/14 px-4 py-3">
              <p className="text-[8px] uppercase tracking-[0.12em] text-[#d7fffd]/60">Összes vásárlás</p>
              <p className="mt-1.5 text-xl text-[#efffff]">{money(totals.total)}</p>
            </div>
            <div className={`rounded-2xl border px-4 py-3 ${totals.discount > 0.005 ? "border-[#9be9e5]/34 bg-[#2a8d8b]/20" : "border-white/10 bg-[#293548]"}`}>
              <p className={`text-[8px] uppercase tracking-[0.12em] ${totals.discount > 0.005 ? "text-[#cffffd]/72" : "text-white/38"}`}>Kapott kedvezmény</p>
              <p className={`mt-1.5 text-xl ${totals.discount > 0.005 ? "text-[#efffff]" : "text-white/60"}`}>{money(totals.discount)}</p>
            </div>
            <div className={`rounded-2xl border px-4 py-3 ${totals.balance > 0.005 ? "border-rose-200/30 bg-rose-500/12" : "border-white/10 bg-[#293548]"}`}>
              <p className="text-[8px] uppercase tracking-[0.12em] text-white/38">Tartozás</p>
              <p className={`mt-1.5 text-xl ${totals.balance > 0.005 ? "text-rose-50" : "text-white/60"}`}>{money(totals.balance)}</p>
            </div>
          </div>

          {bonMode ? (
            <section className="mt-3 overflow-hidden rounded-[22px] border border-[#9be9e5]/35 bg-gradient-to-r from-[#214c52] to-[#293548] shadow-[0_12px_28px_rgba(15,23,42,0.18)]">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.15em] text-[#cffffd]/60">Admin • Bon de consum</p>
                  <p className="mt-1 text-sm text-white">Jelöld ki azokat a még ki nem fizetett terméksorokat, amelyeket hivatalos fogyasztási bizonylatra vezetsz át.</p>
                </div>
                <button type="button" onClick={selectAllBonLines} disabled={!eligibleBonCandidates.length} className="h-9 rounded-xl border border-[#9be9e5]/30 bg-[#2a8d8b]/18 px-3 text-xs text-[#d7fffd] disabled:opacity-40">
                  {eligibleBonCandidates.length > 0 && eligibleBonCandidates.every((row) => selectedBonLineIds.has(row.line.id)) ? "Kijelölés törlése" : `Mind kijelöl (${eligibleBonCandidates.length})`}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-white/10 px-4 py-3 sm:grid-cols-4">
                <div><p className="text-[8px] uppercase text-white/38">Kijelölve</p><p className="mt-1 text-base text-white">{integer(selectedBonTotals.lines)} sor • {integer(selectedBonTotals.qty)} db</p></div>
                <div><p className="text-[8px] uppercase text-white/38">Beszerzési érték</p><p className="mt-1 text-base text-white">{money(selectedBonTotals.purchase)}</p></div>
                <div><p className="text-[8px] uppercase text-white/38">Teljes eladási érték</p><p className="mt-1 text-base text-[#d7fffd]">{money(selectedBonTotals.retail)}</p></div>
                <div><p className="text-[8px] uppercase text-white/38">Eladáskori kedvezmény</p><p className="mt-1 text-base text-white">{money(selectedBonTotals.discount)}</p></div>
              </div>
            </section>
          ) : null}

          {consumptionDocuments.length ? (
            <section className="mt-3 overflow-hidden rounded-[22px] border border-[#9be9e5]/55 bg-gradient-to-br from-[#26374b] via-[#2d3f51] to-[#244f55] shadow-[0_14px_34px_rgba(15,23,42,0.28),0_0_0_1px_rgba(155,233,229,0.08)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#9be9e5]/22 bg-[#214c52]/52 px-4 py-3">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Hivatalos akták</p>
                  <h4 className="mt-0.5 text-sm text-white">Bon de consum archívum • {year}</h4>
                </div>
                <span className="rounded-full border border-[#9be9e5]/22 bg-[#2a8d8b]/12 px-2.5 py-1 text-[10px] text-[#d7fffd]">{consumptionDocuments.length} bizonylat</span>
              </div>
              <div className="grid gap-2 p-3 lg:grid-cols-2">
                {consumptionDocuments.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 rounded-2xl border border-[#bff8f5]/38 bg-gradient-to-r from-[#344154] to-[#2c4952] p-3 shadow-[0_10px_24px_rgba(15,23,42,0.22),inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#9be9e5]/50 bg-[#2a8d8b]/30 text-white shadow-[0_6px_16px_rgba(42,141,139,0.20)]"><FileCheck2 size={17} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-white">{doc.documentNumber}</span>
                        <span className="rounded-full border border-white/10 bg-black/10 px-2 py-0.5 text-[9px] text-white/48">{doc.documentDate || "-"}</span>
                      </div>
                      <p className="mt-1 truncate text-[10px] text-white/50" title={doc.purpose}>{doc.purpose}</p>
                      <p className="mt-1 text-[10px] text-white/42">{integer(doc.totalQty)} db • beszerzési érték: {money(doc.purchaseTotal)} • teljes eladási érték: {money(doc.retailTotal)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void printArchivedBonConsum(doc.id)}
                      disabled={Boolean(bonPrintBusyId)}
                      className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#ff9aa4]/78 bg-[#E21C2A] px-3 text-[11px] text-white shadow-[0_8px_20px_rgba(226,28,42,0.32)] transition hover:bg-[#C91522] hover:shadow-[0_10px_24px_rgba(226,28,42,0.42)] active:scale-[0.97] disabled:opacity-45"
                    >
                      {bonPrintBusyId === doc.id ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} PDF
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {bonError ? (
            <div className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-200/30 bg-rose-500/12 px-3 py-2.5 text-sm text-rose-50">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{bonError}</span>
            </div>
          ) : null}

          {error ? (
            <div className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-200/30 bg-rose-500/12 px-3 py-2.5 text-sm text-rose-50">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <div className="flex items-center gap-3 rounded-2xl border border-white/14 bg-[#293548] px-5 py-4 text-sm text-white/78">
                <Loader2 size={20} className="animate-spin text-[#8ee6e2]" /> Vásárlások és termékek betöltése…
              </div>
            </div>
          ) : orderedSales.length ? (
            <div className="mt-4 space-y-4">
              {orderedSales.map((sale, saleIndex) => {
                const saleDiscountPercent = numberValue(sale.subtotal) > 0
                  ? numberValue(sale.discountTotal) / numberValue(sale.subtotal) * 100
                  : 0;
                const saleStoreName = sale.locationCode === "main_warehouse"
                  ? "Csíkszereda"
                  : sale.locationCode === "magazin_targu_secuiesc"
                    ? "Kézdivásárhely"
                    : (sale.locationName || storeName);
                const paymentMethods: string[] = Array.from(
                  new Set<string>(
                    (sale.payments || [])
                      .map((payment) => String(payment?.method || "").trim())
                      .filter((method) => Boolean(method) && method.toLowerCase() !== "credit"),
                  ),
                );
                const settledAt = saleSettledAt(sale);

                return (
                  <article key={sale.id} className="overflow-hidden rounded-[24px] border border-white/12 bg-[#344154] shadow-[0_16px_34px_rgba(15,23,42,0.16)]">
                    <div className="grid gap-3 border-b border-white/10 bg-[#293548] px-4 py-3.5 lg:grid-cols-[180px_minmax(0,1fr)_auto] lg:items-center">
                      <div className="rounded-2xl border border-[#9be9e5]/24 bg-[#2a8d8b]/12 px-3 py-2.5">
                        <p className="text-[8px] uppercase tracking-[0.14em] text-[#cffffd]/58">Vásárlás ideje</p>
                        <p className="mt-1 text-[15px] text-white">{formatDate(sale.soldAt)}</p>
                        <p className="mt-0.5 font-mono text-[13px] text-[#bff8f5]">{formatDateTime(sale.soldAt).split(" ").slice(-1)[0]}</p>
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[15px] text-white">{sale.saleNumber || `Vásárlás ${saleIndex + 1}`}</span>
                          <span className="rounded-full border border-[#9be9e5]/28 bg-[#2a8d8b]/16 px-2.5 py-1 text-[10px] text-[#eaffff]">{saleStatusLabel(sale.status)}</span>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] ${
                              String(sale.paymentStatus || "").toLowerCase() === "credit" && numberValue(sale.balanceDue) > 0.005
                                ? "border-[#ff9aa4] bg-[#E21C2A] text-white shadow-[0_6px_16px_rgba(226,28,42,0.34)]"
                                : numberValue(sale.balanceDue) > 0.005
                                  ? "border-rose-200/30 bg-rose-500/16 text-rose-50"
                                  : "border-[#9be9e5]/28 bg-[#2a8d8b]/16 text-[#eaffff]"
                            }`}
                          >
                            {paymentStatusLabel(sale.paymentStatus)}
                          </span>
                          {paymentMethods.map((method) => (
                            <span key={method} className="rounded-full border border-[#9be9e5]/35 bg-[#237c7a] px-2.5 py-1 text-[10px] text-white">
                              {paymentMethodLabel(method)}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/52">
                          <span>Eladó: <strong className="font-normal text-white/82">{sale.actor || "–"}</strong></span>
                          <span>Üzlet: <strong className="font-normal text-white/82">{saleStoreName}</strong></span>
                          <span>{integer(sale.itemCount)} db • {integer(sale.lineCount)} termék</span>
                        </div>
                        {numberValue(sale.discountTotal) > 0.005 ? (
                          <div className="mt-2 inline-flex rounded-lg border border-[#9be9e5]/30 bg-[#2a8d8b]/18 px-3 py-1.5 text-[12px] text-[#efffff]">
                            Kedvezmény: {money(sale.discountTotal)}{saleDiscountPercent > 0.005 ? ` • ${percent(saleDiscountPercent)}` : ""}
                          </div>
                        ) : null}
                      </div>

                      <div className="min-w-[150px] text-left lg:text-right">
                        <p className="text-[8px] uppercase tracking-[0.12em] text-white/38">Fizetett végösszeg</p>
                        <p className="mt-1 text-2xl text-white">{money(sale.total)}</p>
                        {numberValue(sale.balanceDue) > 0.005 ? <p className="mt-1 text-[11px] text-rose-100">Tartozás: {money(sale.balanceDue)}</p> : null}
                      </div>
                    </div>

                    <div className="divide-y divide-white/[0.07]">
                      {(sale.lines || []).map((line) => {
                        const hasDiscount = numberValue(line.discountAmount) > 0.005 || numberValue(line.discountPercent) > 0.005;
                        const eligibility = bonConsumLineEligibility(sale, line);
                        const bonSelected = selectedBonLineIds.has(line.id);
                        return (
                          <div
                            key={line.id}
                            className={`grid gap-3 px-4 py-3.5 transition hover:bg-white/[0.025] ${
                              bonMode
                                ? "sm:grid-cols-[42px_78px_minmax(0,1fr)] lg:grid-cols-[42px_78px_minmax(0,1fr)_310px]"
                                : "sm:grid-cols-[78px_minmax(0,1fr)] lg:grid-cols-[78px_minmax(0,1fr)_310px]"
                            } ${bonSelected ? "bg-[#2a8d8b]/12 ring-1 ring-inset ring-[#9be9e5]/32" : ""}`}
                          >
                            {bonMode ? (
                              <label
                                className={`flex min-h-[78px] items-center justify-center rounded-xl border ${
                                  eligibility.eligible
                                    ? bonSelected
                                      ? "border-[#bff8f5]/55 bg-[#2a8d8b]"
                                      : "border-[#9be9e5]/24 bg-[#2a8d8b]/10"
                                    : "border-white/8 bg-black/10 opacity-50"
                                }`}
                                title={eligibility.eligible ? "Kijelölés Bon de consumhoz" : eligibility.reason}
                              >
                                <input
                                  type="checkbox"
                                  checked={bonSelected}
                                  disabled={!eligibility.eligible}
                                  onChange={() => toggleBonLine(line.id)}
                                  className="h-5 w-5 accent-[#2a8d8b]"
                                  aria-label={eligibility.eligible ? `${line.productTitle || "Termék"} kijelölése` : eligibility.reason}
                                />
                              </label>
                            ) : null}

                            <WarehouseProductImage
                              src={line.imageUrl}
                              alt={line.productTitle || "Termékkép"}
                              thumbClassName="h-[78px] w-[78px] rounded-2xl"
                              iconSize={22}
                            />

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="min-w-0 text-[15px] leading-snug text-white" title={line.productTitle || ""}>{line.productTitle || "Névtelen termék"}</p>
                                {line.brandName ? <span className="rounded-full border border-white/10 bg-black/10 px-2 py-0.5 text-[9px] text-white/56">{line.brandName}</span> : null}
                                {bonMode && !eligibility.eligible ? (
                                  <span
                                    className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] leading-none ${
                                      eligibility.reason.includes("fizetés kapcsolódik")
                                        ? "border-[#ff9aa4] bg-[#E21C2A] text-white shadow-[0_6px_16px_rgba(226,28,42,0.34)]"
                                        : "border-rose-200/32 bg-rose-500/16 text-rose-50"
                                    }`}
                                  >
                                    {eligibility.reason}
                                  </span>
                                ) : null}
                              </div>

                              <div className="mt-2 flex flex-wrap gap-2">
                                {line.size ? <span className="rounded-lg border border-white/12 bg-[#293548] px-2.5 py-1.5 text-[11px] text-white/82">Méret: <strong className="font-normal text-white">{line.size}</strong></span> : null}
                                {line.colorName ? (
                                  <span className="inline-flex items-center gap-2 rounded-lg border border-white/12 bg-[#293548] px-2.5 py-1.5 text-[11px] text-white/82">
                                    <span
                                      className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/35 shadow-[0_0_0_1px_rgba(0,0,0,0.18)]"
                                      style={{ backgroundColor: safeColorHex(line.colorHex) || "transparent" }}
                                      aria-hidden="true"
                                    />
                                    Szín: <strong className="font-normal text-white">{line.colorName}</strong>
                                  </span>
                                ) : null}
                                <span className="rounded-lg border border-white/12 bg-[#293548] px-2.5 py-1.5 text-[11px] text-white/82">Darab: <strong className="font-normal text-white">{integer(line.quantity)}</strong></span>
                              </div>

                              <div className="mt-2.5 grid max-w-[760px] gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {line.productCode ? (
                                  <div className="rounded-xl border border-white/10 bg-[#293548] px-3 py-2">
                                    <span className="block text-[9px] uppercase tracking-[0.1em] text-white/46">Termékkód</span>
                                    <strong className="mt-1 block break-all font-mono text-[12px] font-normal leading-snug text-white/92">{line.productCode}</strong>
                                  </div>
                                ) : null}
                                {line.snCod ? (
                                  <div className="rounded-xl border border-white/10 bg-[#293548] px-3 py-2">
                                    <span className="block text-[9px] uppercase tracking-[0.1em] text-white/46">S/N/COD</span>
                                    <strong className="mt-1 block break-all font-mono text-[12px] font-normal leading-snug text-white/92">{line.snCod}</strong>
                                  </div>
                                ) : null}
                                {line.barcode ? (
                                  <div className="rounded-xl border border-white/10 bg-[#293548] px-3 py-2">
                                    <span className="block text-[9px] uppercase tracking-[0.1em] text-white/46">Vonalkód</span>
                                    <strong className="mt-1 block break-all font-mono text-[12px] font-normal leading-snug text-white/92">{line.barcode}</strong>
                                  </div>
                                ) : null}
                              </div>

                              <div className="mt-2.5 flex flex-wrap gap-2">
                                <span className="inline-flex items-center gap-2.5 rounded-xl border border-[#9be9e5]/30 bg-[#2a8d8b]/20 px-3 py-2 text-[12px] text-[#d7fffd]">
                                  <span className="font-medium text-[#bff8f5]">Vásárolva</span>
                                  <strong className="font-mono text-[12px] font-normal text-white">{formatDateTime(sale.soldAt)}</strong>
                                </span>
                                {settledAt ? (
                                  <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-200/32 bg-emerald-500/14 px-3 py-2 text-[12px] text-emerald-50">
                                    <CheckCircle2 size={14} className="shrink-0 text-emerald-200" />
                                    <span className="font-medium text-emerald-100">Kifizetve</span>
                                    <strong className="font-mono text-[12px] font-normal text-white">{formatDateTime(settledAt)}</strong>
                                  </span>
                                ) : null}
                                {line.buyPriceSnapshot !== null && line.buyPriceSnapshot !== undefined ? (
                                  <span className="inline-flex items-center rounded-xl border border-white/12 bg-[#293548] px-3 py-2 text-[11px] text-white/72">
                                    Eladáskori vételár: <strong className="ml-1 font-normal text-white">{money(line.buyPriceSnapshot)}</strong>
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                              <div className="rounded-2xl border border-[#a9f3ef]/38 bg-[#2a8d8b] px-4 py-3">
                                <p className="text-[9px] uppercase tracking-[0.12em] text-[#dffffd]/72">{numberValue(line.quantity) > 1 ? "Eladási ár / db" : "Eladási ár"}</p>
                                <p className="mt-1 text-[21px] text-white">{money(line.unitPrice)}</p>
                              </div>

                              <div className="rounded-2xl border border-[#7bd7d4]/30 bg-[#244f55] px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-[10px] uppercase tracking-[0.1em] text-[#cffffd]/62">Listaár</span>
                                  <span className="text-[13px] text-white/88">{money(line.listPrice)}</span>
                                </div>
                                <div className="mt-2 flex items-center justify-between gap-3 border-t border-[#9be9e5]/18 pt-2">
                                  <span className="text-[10px] uppercase tracking-[0.1em] text-[#bff8f5]/78">Kedvezmény</span>
                                  <span className={`text-[13px] ${hasDiscount ? "text-[#efffff]" : "text-white/58"}`}>
                                    {hasDiscount ? `${money(line.discountAmount)}${numberValue(line.discountPercent) > 0.005 ? ` • ${percent(line.discountPercent)}` : ""}` : "Nincs"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {!sale.lines?.length ? (
                        <div className="px-4 py-7 text-center text-xs text-white/38">Ehhez a vásárláshoz nincs terméksor elmentve.</div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : !error ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center px-5 text-center">
              <ReceiptText size={36} className="text-white/22" />
              <p className="mt-3 text-base text-white/68">Ebben az évben nincs klienshez kötött vásárlás.</p>
              <p className="mt-1 text-xs text-white/38">A lista a kiválasztott üzlet és a {year}. év vásárlásait mutatja.</p>
            </div>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/12 bg-[#293548] px-4 py-3.5 sm:px-5">
          {bonMode ? (
            <>
              <div className="min-w-0">
                <p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Bon de consum kijelölés</p>
                <p className="mt-1 text-sm text-white">
                  {integer(selectedBonTotals.lines)} sor • {integer(selectedBonTotals.qty)} db •
                  <span className="ml-1 text-[#d7fffd]">teljes eladási érték {money(selectedBonTotals.retail)}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={toggleBonMode} disabled={bonBusy} className={neutralButton}><X size={16} /> Mégse</button>
                <button type="button" onClick={() => void openBonConsumForm()} disabled={!selectedBonRows.length || bonBusy} className={primaryButton}><FileCheck2 size={16} /> Bon de consum készítése</button>
              </div>
            </>
          ) : (
            <div className="ml-auto">
              <button type="button" onClick={onClose} className={neutralButton}><X size={16} /> Bezárás</button>
            </div>
          )}
        </footer>
      </section>

      {bonFormOpen ? (
        <div
          className="fixed inset-0 z-[530] grid place-items-center bg-slate-950/82 px-3 py-4 backdrop-blur-md"
          onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
            if (event.currentTarget === event.target && !bonBusy) setBonFormOpen(false);
          }}
        >
          <section className="flex max-h-[calc(100vh-32px)] w-full max-w-[780px] flex-col overflow-hidden rounded-[26px] border border-[#9be9e5]/34 bg-[#303a4c] text-white shadow-[0_34px_100px_rgba(0,0,0,0.64)]">
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#233044] via-[#28545b] to-[#2a8d8b] px-4 py-4">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/[0.08] text-[#d7fffd]"><FileCheck2 size={20} /></span>
                <div>
                  <p className="text-[9px] uppercase tracking-[0.16em] text-white/50">Hivatalos készletbizonylat</p>
                  <h3 className="mt-1 text-xl text-white">Bon de consum • 14-3-4A</h3>
                  <p className="mt-1 text-xs text-white/55">{customerName} • {storeName}</p>
                </div>
              </div>
              <button type="button" onClick={() => setBonFormOpen(false)} disabled={bonBusy} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/18 bg-black/10 text-white disabled:opacity-45"><X size={17} /></button>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {bonError ? <div className="flex items-start gap-2 rounded-2xl border border-rose-200/28 bg-rose-500/12 px-3 py-2.5 text-sm text-rose-50"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>{bonError}</span></div> : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs text-white/62">
                  Dokumentum dátuma
                  <input type="date" value={bonDocumentDate} onChange={(event) => setBonDocumentDate(event.target.value)} className={`${control} w-full`} />
                </label>
                <label className="grid gap-1.5 text-xs text-white/62">
                  Átvevő (Primitor)
                  <input value={bonRecipient} onChange={(event) => setBonRecipient(event.target.value)} className={`${control} w-full`} placeholder="Név" />
                </label>
                <label className="grid gap-1.5 text-xs text-white/62 sm:col-span-2">
                  Felhasználási cél (Scop)
                  <input value={bonPurpose} onChange={(event) => setBonPurpose(event.target.value)} className={`${control} w-full`} placeholder="pl. protocol, reprezentare, consum intern..." autoFocus />
                </label>
                <label className="grid gap-1.5 text-xs text-white/62 sm:col-span-2">
                  Megjegyzés
                  <textarea value={bonNote} onChange={(event) => setBonNote(event.target.value)} className="min-h-[82px] rounded-xl border border-white/16 bg-[#293548] px-3 py-2 text-sm text-white outline-none focus:border-[#7bd7d4]/65 focus:ring-2 focus:ring-[#7bd7d4]/15" placeholder="Opcionális, csak a dokumentumhoz tartozó megjegyzés" />
                </label>
              </div>

              <div className="grid gap-2 sm:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-[#293548] p-3"><p className="text-[8px] uppercase text-white/38">Kijelölve</p><p className="mt-1.5 text-lg text-white">{integer(selectedBonTotals.qty)} db</p></div>
                <div className="rounded-2xl border border-white/10 bg-[#293548] p-3"><p className="text-[8px] uppercase text-white/38">Beszerzési érték</p><p className="mt-1.5 text-lg text-white">{money(selectedBonTotals.purchase)}</p></div>
                <div className="rounded-2xl border border-[#9be9e5]/28 bg-[#2a8d8b]/15 p-3"><p className="text-[8px] uppercase text-[#cffffd]/60">Teljes eladási érték</p><p className="mt-1.5 text-lg text-[#efffff]">{money(selectedBonTotals.retail)}</p></div>
                <div className="rounded-2xl border border-white/10 bg-[#293548] p-3"><p className="text-[8px] uppercase text-white/38">Eladáskor elszámolt érték</p><p className="mt-1.5 text-lg text-white">{money(selectedBonTotals.actual)}</p></div>
              </div>

            </div>

            <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-white/12 bg-[#293548] px-4 py-3.5">
              <div className="flex gap-2">
                <button type="button" onClick={() => setBonFormOpen(false)} disabled={bonBusy} className={neutralButton}>Mégse</button>
                <button type="button" onClick={openBonFinalConfirmation} disabled={bonBusy || bonNumberingBusy || !bonNumberSettings || !selectedBonRows.length || !bonPurpose.trim()} className={primaryButton}>
                  <FileCheck2 size={16} />
                  Tovább a véglegesítéshez
                </button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}

      {bonSettingsOpen ? (
        <div
          className="fixed inset-0 z-[555] grid place-items-center bg-slate-950/86 px-3 py-4 backdrop-blur-md"
          onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
            if (event.currentTarget === event.target && !bonSettingsSaving) setBonSettingsOpen(false);
          }}
        >
          <section className="w-full max-w-[540px] overflow-hidden rounded-[26px] border border-[#9be9e5]/34 bg-[#303a4c] text-white shadow-[0_34px_100px_rgba(0,0,0,0.68)]">
            <header className="flex items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#233044] via-[#28545b] to-[#2a8d8b] px-4 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/[0.08] text-[#d7fffd]"><Settings size={20} /></span>
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-[0.16em] text-white/50">Bon de consum</p>
                  <h3 className="mt-1 text-xl text-white">Számozás beállítása</h3>
                </div>
              </div>
              <button type="button" onClick={() => setBonSettingsOpen(false)} disabled={bonSettingsSaving} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/18 bg-black/10 text-white disabled:opacity-45" aria-label="Beállítás bezárása"><X size={17} /></button>
            </header>

            <div className="space-y-3 p-4">
              {bonSettingsError ? <div className="flex items-start gap-2 rounded-2xl border border-rose-200/28 bg-rose-500/12 px-3 py-2.5 text-sm text-rose-50"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>{bonSettingsError}</span></div> : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs text-white/62">
                  Sorozat
                  <input
                    value={bonSettingsSeries}
                    disabled={bonNumberingBusy || bonSettingsSaving}
                    onChange={(event) => setBonSettingsSeries(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 20))}
                    className={`${control} w-full font-mono`}
                    placeholder="BC"
                    autoFocus
                  />
                </label>
                <label className="grid gap-1.5 text-xs text-white/62">
                  Következő bizonylatszám
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={bonSettingsNextNumber}
                    disabled={bonNumberingBusy || bonSettingsSaving}
                    onChange={(event) => setBonSettingsNextNumber(event.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                    className={`${control} w-full font-mono`}
                    placeholder="1"
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-[#9be9e5]/24 bg-[#214c52]/55 px-3.5 py-3">
                <p className="text-[9px] uppercase tracking-[0.12em] text-[#cffffd]/58">Következő sorszám</p>
                <p className="mt-1 font-mono text-lg text-white">{bonNumberingBusy ? "Betöltés…" : bonConsumNumberPreview(bonSettingsSeries, bonSettingsNextNumber, bonDocumentDate, bonNumberSettings)}</p>
              </div>
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-white/12 bg-[#293548] px-4 py-3.5">
              <button type="button" onClick={() => setBonSettingsOpen(false)} disabled={bonSettingsSaving} className={neutralButton}>Mégse</button>
              <button type="button" onClick={() => void saveBonNumberSettings()} disabled={bonNumberingBusy || bonSettingsSaving || !bonSettingsSeries.trim() || Number(bonSettingsNextNumber) <= 0} className={primaryButton}>
                {bonSettingsSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {bonSettingsSaving ? "Mentés..." : "Mentés"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {bonConfirmOpen ? (
        <div
          className="fixed inset-0 z-[560] grid place-items-center bg-slate-950/90 px-3 py-4 backdrop-blur-md"
          onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
            if (event.currentTarget === event.target && !bonBusy) setBonConfirmOpen(false);
          }}
        >
          <section className="w-full max-w-[650px] overflow-hidden rounded-[26px] border border-[#ff8792]/65 bg-[#303a4c] text-white shadow-[0_36px_110px_rgba(0,0,0,0.72),0_0_34px_rgba(226,28,42,0.16)]">
            <header className="relative overflow-hidden border-b border-white/14 bg-gradient-to-r from-[#5b2430] via-[#8f2634] to-[#E21C2A] px-4 py-4">
              <span className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/34 bg-black/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                    <AlertTriangle size={21} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[9px] uppercase tracking-[0.17em] text-white/68">Utolsó megerősítés</p>
                    <h3 className="mt-1 text-xl text-white">Bon de consum véglegesítése</h3>
                    <p className="mt-1 text-xs leading-relaxed text-white/72">
                      Ez már hivatalos Bon de consum sorszámot hoz létre és módosítja a kapcsolódó kliens- és eladási nyilvántartást.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setBonConfirmOpen(false)}
                  disabled={bonBusy}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/24 bg-black/10 text-white transition hover:bg-white/[0.10] disabled:opacity-45"
                  aria-label="Megerősítés bezárása"
                >
                  <X size={17} />
                </button>
              </div>
            </header>

            <div className="space-y-3 p-4">
              <div className="rounded-2xl border border-[#ff9aa4]/35 bg-[#E21C2A]/10 px-3.5 py-3 text-sm leading-relaxed text-rose-50">
                <strong className="font-medium text-white">Biztosan véglegesíted?</strong>
                <p className="mt-1 text-xs leading-5 text-rose-50/82">
                  A kijelölt hiteles terméksorok kikerülnek a kliens tartozásából. A rendszer az eredeti készletkivezetést Bon de consumhoz kapcsolja, de a készletet nem vonja le másodszor.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                  <p className="text-[8px] uppercase tracking-[0.11em] text-white/38">Kliens</p>
                  <p className="mt-1.5 truncate text-sm text-white" title={customerName}>{customerName}</p>
                  <p className="mt-1 text-[10px] text-white/44">{storeName}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                  <p className="text-[8px] uppercase tracking-[0.11em] text-white/38">Dokumentum</p>
                  <p className="mt-1.5 text-sm text-white">Bon de consum • 14-3-4A</p>
                  <p className="mt-1 font-mono text-[13px] text-[#d7fffd]">{bonNumberSettings ? bonConsumNumberPreview(bonNumberSettings.series, bonNumberSettings.nextNumber, bonDocumentDate, bonNumberSettings) : "–"}</p>
                  <p className="mt-1 text-[10px] text-white/44">Dátum: {bonDocumentDate}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                  <p className="text-[8px] uppercase tracking-[0.11em] text-white/38">Kijelölt mennyiség</p>
                  <p className="mt-1.5 text-lg text-white">{integer(selectedBonTotals.lines)} sor • {integer(selectedBonTotals.qty)} db</p>
                  <p className="mt-1 text-[10px] text-white/44">Átvevő: {bonRecipient.trim() || customerName}</p>
                </div>
                <div className="rounded-2xl border border-[#ff9aa4]/28 bg-[#4a303a] p-3">
                  <p className="text-[8px] uppercase tracking-[0.11em] text-rose-100/55">Teljes eladási érték</p>
                  <p className="mt-1.5 text-lg text-white">{money(selectedBonTotals.retail)}</p>
                  <p className="mt-1 text-[10px] text-rose-100/58">Beszerzési érték: {money(selectedBonTotals.purchase)}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#293548] px-3.5 py-3">
                <p className="text-[8px] uppercase tracking-[0.11em] text-white/38">Felhasználási cél (Scop)</p>
                <p className="mt-1.5 text-sm leading-relaxed text-white/86">{bonPurpose.trim()}</p>
                {bonNote.trim() ? (
                  <>
                    <div className="my-2 border-t border-white/8" />
                    <p className="text-[8px] uppercase tracking-[0.11em] text-white/38">Megjegyzés</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-white/62">{bonNote.trim()}</p>
                  </>
                ) : null}
              </div>

              <div className="flex items-start gap-2 rounded-xl border border-amber-200/22 bg-amber-400/[0.07] px-3 py-2.5 text-[11px] leading-relaxed text-amber-50/78">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>A következő piros gomb az egyetlen pont, ahol a rendszer ténylegesen létrehozza a Bon de consum bizonylatot és elvégzi a szükséges nyilvántartási módosításokat.</span>
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/12 bg-[#293548] px-4 py-3.5">
              <button
                type="button"
                onClick={() => setBonConfirmOpen(false)}
                disabled={bonBusy}
                className={neutralButton}
              >
                <X size={16} /> Mégse, vissza
              </button>
              <button
                type="button"
                onClick={() => void createBonConsum()}
                disabled={bonBusy}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#ff9aa4]/70 bg-[#E21C2A] px-4 text-sm text-white shadow-[0_10px_24px_rgba(226,28,42,0.30)] transition hover:bg-[#C91522] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bonBusy ? <Loader2 size={16} className="animate-spin" /> : <FileCheck2 size={16} />}
                {bonBusy ? "Véglegesítés folyamatban..." : "Igen, véglegesítés + PDF"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function CustomerDetailModal({
  item,
  year,
  canManage,
  onClose,
  onChanged,
}: {
  item: AifAdminCustomerOverviewItem;
  year: number;
  canManage: boolean;
  onClose: () => void;
  onChanged: (message: string, deleted?: boolean) => Promise<void> | void;
}) {
  const editableStores = useMemo(
    () => item.stores.filter((store) => String(store.customerId || "").trim() && String(store.locationCode || store.locationId || "").trim()),
    [item.stores],
  );
  const firstStoreKey = editableStores[0]
    ? `${editableStores[0].locationId || editableStores[0].locationCode}:${editableStores[0].customerId}`
    : "";
  const [activeStoreKey, setActiveStoreKey] = useState(firstStoreKey);
  const [liveCustomer, setLiveCustomer] = useState<AdminShopCustomerRecord | null>(null);
  const [recordBusy, setRecordBusy] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editor, setEditor] = useState<CustomerEditorForm>(() => customerEditorFromRecord(null));
  const [counties, setCounties] = useState<RomaniaCountyOption[]>([]);
  const [localities, setLocalities] = useState<RomaniaLocalityOption[]>([]);
  const [geoBusy, setGeoBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const [purchasesOpen, setPurchasesOpen] = useState(false);
  const [purchasesBusy, setPurchasesBusy] = useState(false);
  const [purchasesError, setPurchasesError] = useState("");
  const [purchaseSales, setPurchaseSales] = useState<AdminCustomerSale[]>([]);
  const [purchaseConsumptionDocuments, setPurchaseConsumptionDocuments] = useState<BonConsumDocumentSummary[]>([]);

  const activeStore = useMemo(() => {
    return editableStores.find((store) => `${store.locationId || store.locationCode}:${store.customerId}` === activeStoreKey)
      || editableStores[0]
      || null;
  }, [activeStoreKey, editableStores]);
  const activeCustomerId = String(activeStore?.customerId || "").trim();
  const activeLocation = String(activeStore?.locationCode || activeStore?.locationId || "").trim();
  const activeStoreName = activeStore?.locationCode === "main_warehouse"
    ? "Csíkszereda"
    : activeStore?.locationCode === "magazin_targu_secuiesc"
      ? "Kézdivásárhely"
      : String(activeStore?.locationName || "Üzlet");

  const loadLiveCustomer = useCallback(async () => {
    if (!activeCustomerId || !activeLocation) {
      setLiveCustomer(null);
      return null;
    }
    setRecordBusy(true);
    setActionError("");
    try {
      const response = await apiAdminCustomerRecord(activeCustomerId, activeLocation, year);
      setLiveCustomer(response.item);
      if (!editMode) setEditor(customerEditorFromRecord(response.item));
      return response.item;
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "A kliens aktuális adatai nem tölthetők be.");
      return null;
    } finally {
      setRecordBusy(false);
    }
  }, [activeCustomerId, activeLocation, editMode, year]);

  useEffect(() => {
    setActiveStoreKey(firstStoreKey);
    setEditMode(false);
    setDeleteConfirmOpen(false);
    setActionError("");
  }, [firstStoreKey, item.key]);

  useEffect(() => {
    setEditMode(false);
    setDeleteConfirmOpen(false);
    setPurchasesOpen(false);
    setPurchasesError("");
    setPurchaseSales([]);
    setPurchaseConsumptionDocuments([]);
    void loadLiveCustomer();
  }, [activeStoreKey]);

  useEffect(() => {
    if (!editMode || counties.length) return;
    let cancelled = false;
    void apiAdminRomaniaCounties()
      .then((response) => { if (!cancelled) setCounties(response.items || []); })
      .catch((caught) => { if (!cancelled) setActionError(caught instanceof Error ? caught.message : "A megyék nem tölthetők be."); });
    return () => { cancelled = true; };
  }, [counties.length, editMode]);

  useEffect(() => {
    if (!editMode || !editor.countyCode) {
      setLocalities([]);
      return;
    }
    let cancelled = false;
    setGeoBusy(true);
    void apiAdminRomaniaLocalities(editor.countyCode)
      .then((response) => {
        if (cancelled) return;
        setLocalities(response.items || []);
      })
      .catch((caught) => { if (!cancelled) setActionError(caught instanceof Error ? caught.message : "A helységek nem tölthetők be."); })
      .finally(() => { if (!cancelled) setGeoBusy(false); });
    return () => { cancelled = true; };
  }, [editMode, editor.countyCode]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (purchasesOpen) {
        setPurchasesOpen(false);
        return;
      }
      if (deleteConfirmOpen) {
        setDeleteConfirmOpen(false);
        return;
      }
      if (editMode && !saveBusy) {
        setEditMode(false);
        setEditor(customerEditorFromRecord(liveCustomer));
        setActionError("");
        return;
      }
      if (!saveBusy && !deleteBusy) onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [deleteBusy, deleteConfirmOpen, editMode, liveCustomer, onClose, purchasesOpen, saveBusy]);

  const maxSeller = Math.max(1, ...item.employees.map((seller) => seller.revenue));
  const yearMetrics: Array<{
    label: string;
    value: string;
    icon: ComponentType<{ size?: number; className?: string }>;
  }> = [
    { label: "Forgalom", value: money(item.periodRevenue), icon: CircleDollarSign },
    { label: "Vásárlás", value: integer(item.periodTransactions), icon: ReceiptText },
    { label: "Darab", value: `${integer(item.periodItemsSold)} db`, icon: ShoppingBag },
    { label: "Kedvezmény", value: money(item.periodDiscountTotal), icon: TrendingUp },
  ];

  const displayName = liveCustomer?.fullName || item.fullName;
  const displayPhone = liveCustomer?.phone ?? item.phone;
  const displayEmail = liveCustomer?.email ?? item.email;
  const displayAddress = liveCustomer?.formattedAddress || liveCustomer?.address || item.address;
  const displayNotes = liveCustomer?.notes ?? item.note;
  const selectedOpenBalance = liveCustomer ? numberValue(liveCustomer.openBalance) : numberValue(item.currentOpenBalance);
  const selectedOpenSales = liveCustomer ? numberValue(liveCustomer.openSales) : numberValue(item.currentOpenSales);
  const deleteBlocked = selectedOpenBalance > 0.005;

  async function reloadPurchases() {
    if (!activeCustomerId || !activeLocation) return null;
    const response = await apiAdminCustomerPurchases(activeCustomerId, activeLocation, year);
    setPurchaseSales(Array.isArray(response.sales) ? response.sales : []);
    setPurchaseConsumptionDocuments(Array.isArray(response.consumptionDocuments) ? response.consumptionDocuments : []);
    return response;
  }

  async function openPurchases() {
    if (!activeCustomerId || !activeLocation) return;
    setPurchasesOpen(true);
    setPurchasesBusy(true);
    setPurchasesError("");
    setPurchaseSales([]);
    setPurchaseConsumptionDocuments([]);
    try {
      await reloadPurchases();
    } catch (caught) {
      setPurchaseSales([]);
      setPurchaseConsumptionDocuments([]);
      setPurchasesError(caught instanceof Error ? caught.message : "A vásárlási előzmények nem tölthetők be.");
    } finally {
      setPurchasesBusy(false);
    }
  }

  function startEditing() {
    if (!canManage || recordBusy || !activeCustomerId) return;
    if (!liveCustomer) {
      void loadLiveCustomer().then((record) => {
        if (!record) return;
        setEditor(customerEditorFromRecord(record));
        setEditMode(true);
      });
      return;
    }
    setEditor(customerEditorFromRecord(liveCustomer));
    setActionError("");
    setEditMode(true);
  }

  async function saveCustomer() {
    if (!activeCustomerId || !activeLocation) return;
    if (!editor.fullName.trim()) {
      setActionError("A kliens neve kötelező.");
      return;
    }
    if (editor.countyCode && !editor.localityCode) {
      setActionError("A kiválasztott megyéhez helységet is válassz.");
      return;
    }
    const creditLimit = Number(String(editor.creditLimit || "0").replace(",", "."));
    if (!Number.isFinite(creditLimit) || creditLimit < 0) {
      setActionError("A hitelkeret 0 vagy pozitív szám lehet.");
      return;
    }

    setSaveBusy(true);
    setActionError("");
    try {
      const payload: Record<string, unknown> = {
        fullName: editor.fullName.trim(),
        phone: editor.phone.trim(),
        email: editor.email.trim() || null,
        address: editor.address.trim() || null,
        city: editor.city.trim() || null,
        postalCode: editor.postalCode.trim() || null,
        notes: editor.notes.trim() || null,
        creditLimit,
      };
      if (editor.countyCode || editor.localityCode) {
        payload.countryCode = "RO";
        payload.countyCode = editor.countyCode;
        payload.localityCode = editor.localityCode;
      }
      const response = await apiAdminUpdateCustomerRecord(activeCustomerId, activeLocation, payload);
      setLiveCustomer(response.item);
      setEditor(customerEditorFromRecord(response.item));
      setEditMode(false);
      await onChanged(`Kliens módosítva: ${response.item.fullName} • ${activeStoreName}.`);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "A kliens mentése nem sikerült.");
    } finally {
      setSaveBusy(false);
    }
  }

  async function deleteCustomer() {
    if (!activeCustomerId || !activeLocation || deleteBlocked) return;
    setDeleteBusy(true);
    setActionError("");
    try {
      const response = await apiAdminDeleteCustomerRecord(activeCustomerId, activeLocation);
      const message = response.mode === "archived"
        ? `A kliens archiválva lett ${activeStoreName} üzletben. A vásárlási előzmények megmaradtak.`
        : `A kliens végleg törölve lett ${activeStoreName} üzletből.`;
      setDeleteConfirmOpen(false);
      await onChanged(message, true);
    } catch (caught) {
      setDeleteConfirmOpen(false);
      setActionError(caught instanceof Error ? caught.message : "A kliens törlése nem sikerült.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[420] grid place-items-center bg-slate-950/82 px-3 py-5 backdrop-blur-sm"
      onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
        if (event.currentTarget === event.target && !editMode && !saveBusy && !deleteBusy) onClose();
      }}
    >
      <section className="flex max-h-[92vh] w-full max-w-[1040px] flex-col overflow-hidden rounded-[28px] border border-[#9be9e5]/30 bg-[#303a4c] text-white shadow-[0_34px_110px_rgba(0,0,0,0.62)]">
        <header className="flex items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#25354a] via-[#28545b] to-[#2a6f70] px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/22 bg-white/[0.08] text-[#d7fffd]">
              <UserRound size={23} />
            </span>
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-[0.16em] text-white/48">Kliens adatlap és kezelés</p>
              <h2 className="mt-1 truncate text-xl text-white sm:text-2xl">{displayName}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {item.stores.map((store) => <StoreBadge key={`${store.locationId}-${store.customerId}`} code={store.locationCode} name={store.locationName} />)}
                {item.combined ? <span className="rounded-full border border-amber-200/28 bg-amber-400/10 px-2.5 py-1 text-[10px] text-amber-50">Két üzletből összevonva</span> : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => void openPurchases()} disabled={!activeCustomerId || !activeLocation || saveBusy || deleteBusy} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/18 bg-black/10 px-3 text-xs text-white transition hover:border-[#9be9e5]/35 hover:bg-white/[0.08] disabled:opacity-45">
              <ReceiptText size={15} /> Vásárlások
              <span className="rounded-full border border-white/10 bg-white/[0.07] px-1.5 py-0.5 text-[9px] text-white/70">{integer(activeStore?.transactions || 0)}</span>
            </button>
            {canManage ? (
              <button type="button" onClick={startEditing} disabled={recordBusy || saveBusy || deleteBusy} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#9be9e5]/35 bg-[#2a8d8b]/22 px-3 text-xs text-[#d7fffd] transition hover:bg-[#2a8d8b]/34 disabled:opacity-45">
                <Edit3 size={15} /> Szerkesztés
              </button>
            ) : null}
            <button type="button" onClick={onClose} disabled={saveBusy || deleteBusy} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/18 bg-black/10 text-white transition hover:bg-white/[0.1] disabled:opacity-45" aria-label="Bezárás">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {editableStores.length > 1 ? (
            <div className="mb-3 rounded-2xl border border-amber-200/20 bg-amber-400/7 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.12em] text-amber-50/50">Melyik üzleti kliensrekordot kezeled?</p>
                  <p className="mt-1 text-xs text-amber-50/72">A két üzlet kliensállománya külön él. A módosítás és törlés csak a kiválasztott üzlet rekordját érinti.</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {editableStores.map((store) => {
                    const key = `${store.locationId || store.locationCode}:${store.customerId}`;
                    const active = key === activeStoreKey;
                    return (
                      <button key={key} type="button" disabled={saveBusy || deleteBusy} onClick={() => setActiveStoreKey(key)} className={`h-9 rounded-xl border px-3 text-xs transition ${active ? "border-[#9be9e5]/50 bg-[#2a8d8b] text-white" : "border-white/14 bg-[#293548] text-white/62 hover:bg-[#37445a]"}`}>
                        {store.locationCode === "main_warehouse" ? "Csíkszereda" : store.locationCode === "magazin_targu_secuiesc" ? "Kézdivásárhely" : (store.locationName || "Üzlet")}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {actionError ? (
            <div className="mb-3 flex items-start gap-2 rounded-2xl border border-rose-200/30 bg-rose-500/12 px-3 py-2.5 text-sm text-rose-50">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{actionError}</span>
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="rounded-2xl border border-white/10 bg-[#293548] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.12em] text-white/40">Kapcsolati adatok</p>
                  <p className="mt-1 text-xs text-white/45">{activeStoreName} • {recordBusy ? "frissítés…" : "élő kliensadat"}</p>
                </div>
                {recordBusy ? <Loader2 size={17} className="animate-spin text-[#8ee6e2]" /> : null}
              </div>

              {editMode ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-[10px] text-white/58">Név
                    <input className={`${control} w-full`} value={editor.fullName} onChange={(event) => setEditor((current) => ({ ...current, fullName: event.target.value }))} />
                  </label>
                  <label className="grid gap-1 text-[10px] text-white/58">Telefonszám
                    <input className={`${control} w-full`} value={editor.phone} onChange={(event) => setEditor((current) => ({ ...current, phone: event.target.value }))} placeholder="pl. 0740 000 000" />
                  </label>
                  <label className="grid gap-1 text-[10px] text-white/58">E-mail
                    <input className={`${control} w-full`} type="email" value={editor.email} onChange={(event) => setEditor((current) => ({ ...current, email: event.target.value }))} placeholder="nev@email.ro" />
                  </label>
                  <label className="grid gap-1 text-[10px] text-white/58">Hitelkeret
                    <input className={`${control} w-full`} inputMode="decimal" value={editor.creditLimit} onChange={(event) => setEditor((current) => ({ ...current, creditLimit: event.target.value }))} placeholder="0,00" />
                  </label>
                  <label className="grid gap-1 text-[10px] text-white/58">Megye
                    <select className={`${control} w-full`} value={editor.countyCode} onChange={(event) => setEditor((current) => ({ ...current, countyCode: event.target.value, localityCode: "" }))}>
                      <option value="">Nincs megadva / régi adat marad</option>
                      {counties.map((county) => <option key={county.code} value={county.code}>{county.name}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-[10px] text-white/58">Helység
                    <select className={`${control} w-full`} disabled={!editor.countyCode || geoBusy} value={editor.localityCode} onChange={(event) => {
                      const locality = localities.find((row) => row.sirutaCode === event.target.value);
                      setEditor((current) => ({
                        ...current,
                        localityCode: event.target.value,
                        city: locality?.name || current.city,
                        postalCode: current.postalCode || locality?.postalCode || "",
                      }));
                    }}>
                      <option value="">{geoBusy ? "Betöltés…" : "Válassz helységet"}</option>
                      {localities.map((locality) => <option key={locality.sirutaCode} value={locality.sirutaCode}>{locality.name}</option>)}
                    </select>
                  </label>
                  {!editor.countyCode ? (
                    <label className="grid gap-1 text-[10px] text-white/58">Város / helység (régi szöveges adat)
                      <input className={`${control} w-full`} value={editor.city} onChange={(event) => setEditor((current) => ({ ...current, city: event.target.value }))} />
                    </label>
                  ) : null}
                  <label className="grid gap-1 text-[10px] text-white/58">Irányítószám
                    <input className={`${control} w-full`} value={editor.postalCode} onChange={(event) => setEditor((current) => ({ ...current, postalCode: event.target.value }))} />
                  </label>
                  <label className="grid gap-1 text-[10px] text-white/58 sm:col-span-2">Cím
                    <input className={`${control} w-full`} value={editor.address} onChange={(event) => setEditor((current) => ({ ...current, address: event.target.value }))} placeholder="Utca, házszám, tömb, lakrész…" />
                  </label>
                  <label className="grid gap-1 text-[10px] text-white/58 sm:col-span-2">Megjegyzés
                    <textarea className="min-h-[92px] rounded-xl border border-white/16 bg-[#293548] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#7bd7d4]/65 focus:ring-2 focus:ring-[#7bd7d4]/15" value={editor.notes} onChange={(event) => setEditor((current) => ({ ...current, notes: event.target.value }))} placeholder="Belső megjegyzés a klienshez" />
                  </label>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/70">
                  {displayPhone ? <span className="inline-flex items-center gap-2"><Phone size={14} className="text-[#8ee6e2]" />{displayPhone}</span> : null}
                  {displayEmail ? <span className="inline-flex items-center gap-2"><Mail size={14} className="text-[#8ee6e2]" />{displayEmail}</span> : null}
                  {displayAddress ? <span className="inline-flex min-w-0 items-center gap-2"><MapPin size={14} className="shrink-0 text-[#8ee6e2]" /><span>{displayAddress}</span></span> : null}
                  {!displayPhone && !displayEmail && !displayAddress ? <span className="text-white/38">Nincs további kapcsolati adat.</span> : null}
                  {liveCustomer ? (
                    <span className="w-full pt-1 text-[10px] text-white/38">Hitelkeret: {money(liveCustomer.creditLimit || 0)} • Kliensrekord: {activeStoreName}</span>
                  ) : null}
                  {displayNotes ? <span className="w-full rounded-xl border border-white/8 bg-black/10 px-3 py-2 text-xs leading-relaxed text-white/58">{displayNotes}</span> : null}
                </div>
              )}
            </div>
            <div className={`min-w-[230px] rounded-2xl border p-4 ${selectedOpenBalance > 0.005 ? "border-rose-200/30 bg-rose-500/14" : "border-emerald-200/22 bg-emerald-500/8"}`}>
              <p className="text-[9px] uppercase tracking-[0.12em] text-white/48">Jelenlegi tartozás</p>
              <p className="mt-2 text-2xl text-white">{money(selectedOpenBalance)}</p>
              <p className="mt-1 text-xs text-white/48">{integer(selectedOpenSales)} nyitott vásárlás • {activeStoreName}</p>
            </div>
          </div>

          <section className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] uppercase tracking-[0.12em] text-white/40">Kiválasztott év</p>
                <h3 className="mt-1 text-base text-white">{year}. évi teljesítmény</h3>
              </div>
              <span className="rounded-full border border-[#9be9e5]/25 bg-[#2a8d8b]/12 px-3 py-1 text-xs text-[#d7fffd]">{activityText(item, year)}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {yearMetrics.map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[9px] uppercase tracking-[0.1em] text-white/40">{label}</p>
                    <Icon size={13} className="text-[#8ee6e2]" />
                  </div>
                  <p className="mt-2 truncate text-base text-white" title={value}>{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-4 rounded-[22px] border border-white/11 bg-[#344154] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] uppercase tracking-[0.12em] text-white/40">Üzleti bontás</p>
                <h3 className="mt-1 text-base text-white">Hol vásárolt?</h3>
              </div>
              <span className="rounded-full border border-white/12 bg-black/10 px-3 py-1 text-[10px] text-white/50">{item.storeCount} üzlet</span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {item.stores.map((store) => (
                <div key={`${store.locationId}-${store.customerId}`} className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <StoreBadge code={store.locationCode} name={store.locationName} />
                    <span className="text-sm text-white">{money(store.revenue)}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <span className="rounded-xl border border-white/8 bg-black/10 px-2 py-2"><span className="block text-[8px] uppercase text-white/35">Vásárlás</span><strong className="mt-1 block text-sm font-normal">{integer(store.transactions)}</strong></span>
                    <span className="rounded-xl border border-white/8 bg-black/10 px-2 py-2"><span className="block text-[8px] uppercase text-white/35">Darab</span><strong className="mt-1 block text-sm font-normal">{integer(store.itemsSold)}</strong></span>
                    <span className="rounded-xl border border-white/8 bg-black/10 px-2 py-2"><span className="block text-[8px] uppercase text-white/35">Utolsó</span><strong className="mt-1 block text-[11px] font-normal">{formatDate(store.lastSaleAt)}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-4 rounded-[22px] border border-white/11 bg-[#344154] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] uppercase tracking-[0.12em] text-white/40">Eladói bontás</p>
                <h3 className="mt-1 text-base text-white">Ki szolgálta ki a klienst?</h3>
              </div>
              <span className="rounded-full border border-white/12 bg-black/10 px-3 py-1 text-[10px] text-white/50">{item.employees.length} eladó</span>
            </div>
            <div className="mt-3 space-y-2">
              {item.employees.map((seller) => (
                <div key={seller.actor} className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm text-white"><UserRound size={14} className="text-[#8ee6e2]" />{seller.actor}</span>
                    <span className="text-sm text-white">{money(seller.revenue)}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#202b3c]">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#2a8d8b] to-[#69ddd8]" style={{ width: `${Math.max(3, seller.revenue / maxSeller * 100)}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-white/45">
                    <span>{integer(seller.transactions)} vásárlás • {integer(seller.itemsSold)} db</span>
                    <span>{percent(seller.share)} részesedés • utolsó: {formatDate(seller.lastSaleAt)}</span>
                  </div>
                </div>
              ))}
              {!item.employees.length ? (
                <div className="rounded-2xl border border-dashed border-white/12 px-4 py-8 text-center text-sm text-white/40">Ebben az évben nincs eladói adat ehhez a klienshez.</div>
              ) : null}
            </div>
          </section>

          <section className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Első vásárlás", formatDate(item.firstSaleAt)],
              ["Utolsó vásárlás", formatDate(item.lastSaleAt)],
              ["Összes vásárlás", integer(item.lifetimeTransactions)],
              ["Összes érték valaha", money(item.lifetimePurchaseTotal)],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                <p className="text-[9px] uppercase tracking-[0.1em] text-white/38">{String(label)}</p>
                <p className="mt-2 truncate text-sm text-white/80" title={String(value)}>{String(value)}</p>
              </div>
            ))}
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/12 bg-[#293548] px-4 py-3.5 sm:px-5">
          <div>
            {canManage ? (
              <button type="button" disabled={recordBusy || saveBusy || deleteBusy || !activeCustomerId} onClick={() => setDeleteConfirmOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-200/30 bg-rose-600/90 px-3 text-sm text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-45">
                <Trash2 size={16} /> Kliens törlése
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <button type="button" disabled={saveBusy} onClick={() => { setEditMode(false); setEditor(customerEditorFromRecord(liveCustomer)); setActionError(""); }} className={neutralButton}><X size={16} /> Mégse</button>
                <button type="button" disabled={saveBusy || recordBusy} onClick={() => void saveCustomer()} className={primaryButton}>{saveBusy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Mentés</button>
              </>
            ) : (
              <button type="button" onClick={onClose} className={neutralButton}><X size={16} /> Bezárás</button>
            )}
          </div>
        </footer>
      </section>

      {purchasesOpen ? (
        <CustomerPurchasesModal
          customerId={activeCustomerId}
          customerName={displayName}
          storeName={activeStoreName}
          storeCode={activeStore?.locationCode}
          location={activeLocation}
          year={year}
          sales={purchaseSales}
          consumptionDocuments={purchaseConsumptionDocuments}
          loading={purchasesBusy}
          error={purchasesError}
          canManage={canManage}
          onReload={async () => {
            setPurchasesBusy(true);
            setPurchasesError("");
            try {
              await reloadPurchases();
              await loadLiveCustomer();
              await onChanged(`Bon de consum rögzítve • ${displayName} • ${activeStoreName}.`);
            } catch (caught) {
              setPurchasesError(caught instanceof Error ? caught.message : "A Bon de consum utáni frissítés nem sikerült.");
            } finally {
              setPurchasesBusy(false);
            }
          }}
          onClose={() => setPurchasesOpen(false)}
        />
      ) : null}

      {deleteConfirmOpen ? (
        <div className="fixed inset-0 z-[470] grid place-items-center bg-slate-950/80 px-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target && !deleteBusy) setDeleteConfirmOpen(false); }}>
          <div className="w-full max-w-[520px] rounded-[24px] border border-rose-200/30 bg-[#303a4c] p-4 text-white shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-200/25 bg-rose-500/15 text-rose-100"><Trash2 size={20} /></span>
              <div>
                <p className="text-lg">Kliens törlése</p>
                <p className="mt-1 text-sm leading-relaxed text-white/58"><strong className="font-normal text-white">{displayName}</strong> • {activeStoreName}</p>
              </div>
            </div>
            {deleteBlocked ? (
              <div className="mt-4 rounded-2xl border border-rose-200/25 bg-rose-500/12 px-3 py-2.5 text-sm text-rose-50">A kliensnek még {money(selectedOpenBalance)} tartozása van. Ezt előbb rendezni kell, utána törölhető.</div>
            ) : (
              <div className="mt-4 rounded-2xl border border-white/10 bg-[#293548] px-3 py-3 text-sm leading-relaxed text-white/62">Ha van vásárlási vagy befizetési előzménye, a rendszer <strong className="font-normal text-white">archiválja</strong> a klienst és eltünteti az aktív klienslistából, de a bizonylati történetet nem törli. Ha nincs előzménye, a kliensrekord végleg törlődik.</div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={deleteBusy} onClick={() => setDeleteConfirmOpen(false)} className={neutralButton}>Mégse</button>
              <button type="button" disabled={deleteBusy || deleteBlocked} onClick={() => void deleteCustomer()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-200/30 bg-rose-600 px-4 text-sm text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-45">{deleteBusy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Törlés</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

type SummaryQuickFilter = "" | "revenue" | "buyers" | "transactions" | "repeat" | "debt";

export default function AllInAdminClients({ actor = "ADMIN", role = "admin" }: Props) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [location, setLocation] = useState<LocationScope>("all");
  const [employee, setEmployee] = useState("");
  const [activity, setActivity] = useState<AifAdminCustomerActivityFilter>("all");
  const [sort, setSort] = useState<AifAdminCustomerSort>("revenue");
  const [topTen, setTopTen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [data, setData] = useState<AifAdminCustomersOverviewResponse | null>(null);
  const [selected, setSelected] = useState<AifAdminCustomerOverviewItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [summaryQuickFilter, setSummaryQuickFilter] = useState<SummaryQuickFilter>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiAifAdminCustomersOverview({
        year,
        location,
        employee,
        search,
        activity,
        sort,
        topTen,
        combineStores: topTen && location === "all",
        limit: 3000,
      });
      setData(response);
      if (!response.filterOptions.years.includes(year) && response.filterOptions.years.length) {
        setYear(response.filterOptions.years[0]);
      }
      return response;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A klienskimutatás nem tölthető be.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [activity, employee, location, search, sort, topTen, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const years = useMemo(() => {
    const source = data?.filterOptions.years?.length ? data.filterOptions.years : [currentYear];
    return Array.from(new Set([currentYear, ...source])).sort((a, b) => b - a);
  }, [currentYear, data?.filterOptions.years]);

  const summary = data?.summary;
  const customerRows = data?.customers || [];
  const topRevenue = Math.max(1, ...customerRows.map((item) => item.periodRevenue));

  function selectEmployee(value: string) {
    setEmployee(value);
    if (value && activity === "inactive") setActivity("buyers");
  }

  function applySearch() {
    setSearch(searchDraft.trim());
  }

  function clearFilters() {
    setYear(currentYear);
    setLocation("all");
    setEmployee("");
    setActivity("all");
    setSort("revenue");
    setTopTen(false);
    setSearchDraft("");
    setSearch("");
    setSummaryQuickFilter("");
  }

  function applySummaryQuickFilter(next: Exclude<SummaryQuickFilter, "">) {
    if (summaryQuickFilter === next) {
      setSummaryQuickFilter("");
      setActivity("all");
      setSort("revenue");
      setTopTen(false);
      return;
    }

    setSummaryQuickFilter(next);
    setTopTen(false);
    if (next === "revenue") {
      setActivity("buyers");
      setSort("revenue");
      return;
    }
    if (next === "buyers") {
      setActivity("buyers");
      setSort("name");
      return;
    }
    if (next === "transactions") {
      setActivity("buyers");
      setSort("transactions");
      return;
    }
    if (next === "repeat") {
      setActivity("repeat");
      setSort("revenue");
      return;
    }
    setActivity("debt");
    setSort("debt");
  }

  async function handleCustomerChanged(message: string, deleted = false) {
    setActionMessage(message);
    const previousIds = new Set((selected?.stores || []).map((store) => String(store.customerId || "")).filter(Boolean));
    const response = await load();
    if (deleted) {
      setSelected(null);
      return;
    }
    if (!response || !previousIds.size) return;
    const refreshed = (response.customers || []).find((customer) => customer.stores.some((store) => previousIds.has(String(store.customerId || ""))));
    if (refreshed) setSelected(refreshed);
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#5f6b7b] via-[#566171] to-[#485361] p-3 text-white sm:p-4 lg:p-6">
      <div className="mx-auto max-w-[1580px] space-y-3.5">
        <header className="rounded-[27px] border border-white/20 bg-[#2f3b4f] px-4 py-4 shadow-[0_20px_58px_rgba(15,23,42,0.30)] sm:px-5">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#7bd7d4]/38 bg-[#2a8d8b]/22 text-[#cffffd]">
              <Users size={28} />
            </span>
            <div className="min-w-[260px] flex-1 border-l-4 border-[#2a8d8b] pl-3">
              <p className="text-[10px] uppercase tracking-[0.19em] text-[#cffffd]/62">AllInFashion • kliens intelligencia</p>
              <h1 className="mt-1 text-2xl tracking-tight sm:text-3xl">Üzleti kliensek</h1>
              <p className="mt-1 text-sm text-white/52">Éves vásárlási érték, üzleti bontás és eladói teljesítmény egy helyen.</p>
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <span className="hidden rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs text-white/55 lg:inline-flex lg:items-center lg:gap-2">
                <UserRound size={14} className="text-[#8ee6e2]" /> {actor}
              </span>
              <button type="button" className={neutralButton} onClick={() => void load()} disabled={loading}>
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Frissítés
              </button>
              <button type="button" className={neutralButton} onClick={() => { window.location.hash = "#home"; }}>
                <Home size={16} /> Kezdőlap
              </button>
            </div>
          </div>
        </header>

        <section className={`${card} overflow-visible p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 text-[#bff8f5]"><Filter size={17} /></span>
              <div>
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Kimutatás beállítása</p>
                <h2 className="mt-0.5 text-base text-white">Melyik évet és üzletet nézzük?</h2>
              </div>
            </div>
            <button type="button" onClick={() => setAdvancedOpen((value) => !value)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/14 bg-white/[0.05] px-3 text-xs text-white/65 lg:hidden">
              <SlidersHorizontal size={14} /> További szűrők
            </button>
          </div>

          <div className="mt-4 grid gap-2.5 lg:grid-cols-[150px_minmax(430px,1.6fr)_auto]">
            <label className="grid gap-1 text-[9px] uppercase tracking-[0.1em] text-white/45">
              Év
              <select value={year} onChange={(event: ChangeEvent<HTMLSelectElement>) => setYear(Number(event.target.value))} className={`${control} w-full`}>
                {years.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>

            <div className="grid gap-1">
              <p className="text-[9px] uppercase tracking-[0.1em] text-white/45">Üzlet</p>
              <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-white/12 bg-[#293548] p-1">
                {[
                  ["all", "Mindkettő"],
                  ["main_warehouse", "Csíkszereda"],
                  ["magazin_targu_secuiesc", "Kézdivásárhely"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLocation(value as LocationScope)}
                    className={`h-9 rounded-lg border px-2 text-[11px] transition ${location === value
                      ? "border-[#9be9e5]/45 bg-[#2a8d8b] text-white"
                      : "border-transparent bg-transparent text-white/55 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setSummaryQuickFilter("");
                setTopTen((value) => {
                  const next = !value;
                  if (next) {
                    setLocation("all");
                    setActivity("buyers");
                    setSort("revenue");
                  }
                  return next;
                });
              }}
              className={`inline-flex h-11 lg:mt-[17px] min-w-[150px] items-center justify-center gap-2 rounded-xl border px-4 text-sm transition ${topTen
                ? "border-amber-200/48 bg-gradient-to-r from-[#8b6b25] to-[#6f5724] text-white shadow-[0_10px_24px_rgba(245,158,11,0.16)]"
                : "border-white/16 bg-[#3b485b] text-white/72 hover:border-amber-200/28 hover:text-white"
              }`}
            >
              <Trophy size={17} /> Top 10
              {topTen ? <CheckCircle2 size={14} /> : null}
            </button>
          </div>

          <div className={`${advancedOpen ? "grid" : "hidden"} mt-3 gap-2.5 md:grid-cols-2 lg:grid lg:grid-cols-[minmax(180px,0.8fr)_minmax(180px,0.8fr)_minmax(180px,0.8fr)_minmax(280px,1.5fr)_auto]`}>
            <label className="grid gap-1 text-[9px] uppercase tracking-[0.1em] text-white/45">
              Eladó
              <select value={employee} onChange={(event: ChangeEvent<HTMLSelectElement>) => selectEmployee(event.target.value)} className={`${control} w-full`}>
                <option value="">Minden eladó</option>
                {employee && !(data?.filterOptions.employees || []).includes(employee) ? <option value={employee}>{employee}</option> : null}
                {(data?.filterOptions.employees || []).map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-[9px] uppercase tracking-[0.1em] text-white/45">
              Aktivitás
              <select value={activity} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setSummaryQuickFilter(""); setActivity(event.target.value as AifAdminCustomerActivityFilter); }} className={`${control} w-full`}>
                <option value="all">Minden kliens</option>
                <option value="buyers">Vásárolt ebben az évben</option>
                <option value="repeat">Visszatérő kliens</option>
                <option value="inactive">Nem vásárolt ebben az évben</option>
                <option value="debt">Jelenleg tartozik</option>
              </select>
            </label>
            <label className="grid gap-1 text-[9px] uppercase tracking-[0.1em] text-white/45">
              Rendezés
              <select value={sort} disabled={topTen} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setSummaryQuickFilter(""); setSort(event.target.value as AifAdminCustomerSort); }} className={`${control} w-full disabled:cursor-not-allowed disabled:opacity-45`}>
                <option value="revenue">Forgalom szerint</option>
                <option value="transactions">Vásárlások szerint</option>
                <option value="items">Darabszám szerint</option>
                <option value="last_sale">Utolsó vásárlás szerint</option>
                <option value="debt">Tartozás szerint</option>
                <option value="name">Név szerint</option>
              </select>
            </label>
            <label className="grid gap-1 text-[9px] uppercase tracking-[0.1em] text-white/45">
              Keresés
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3.5 text-white/36" size={15} />
                <input
                  value={searchDraft}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchDraft(event.target.value)}
                  onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") applySearch(); }}
                  placeholder="Kliens neve, telefon, e-mail…"
                  className={`${control} w-full pl-9 placeholder:text-white/32`}
                />
              </div>
            </label>
            <div className="flex items-end gap-2 md:col-span-2 lg:col-span-1">
              <button type="button" onClick={applySearch} className={`${primaryButton} flex-1 lg:min-w-[105px]`}><Search size={15} /> Keresés</button>
              <button type="button" onClick={clearFilters} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/14 bg-white/[0.04] text-white/55 hover:bg-white/[0.09] hover:text-white" title="Minden szűrő törlése"><X size={16} /></button>
            </div>
          </div>

          {topTen && location === "all" ? (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200/22 bg-amber-400/8 px-3 py-2.5 text-xs text-amber-50/78">
              <Trophy size={15} className="mt-0.5 shrink-0" />
              A Top 10 nézet ugyanazt a klienst a két üzletből telefonszám alapján összevonja, majd a {year}. évi összesített vásárlási érték szerint rangsorolja.
            </div>
          ) : null}
        </section>

        {error ? (
          <div className="rounded-2xl border border-rose-200/30 bg-rose-500/14 px-4 py-3 text-sm text-rose-50">{error}</div>
        ) : null}
        {actionMessage ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-50">
            <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} /> {actionMessage}</span>
            <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/12 bg-black/10 text-white/55 hover:text-white" onClick={() => setActionMessage("")} aria-label="Üzenet bezárása"><X size={13} /></button>
          </div>
        ) : null}

        {employee ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#9be9e5]/28 bg-[#244f55] px-4 py-3">
            <div className="flex items-center gap-3">
              <UserCheck size={19} className="text-[#9be9e5]" />
              <div>
                <p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Aktív eladói szűrés</p>
                <p className="mt-1 text-sm text-white"><strong className="font-normal text-[#d7fffd]">{employee}</strong> {year}. évi kliensforgalma</p>
              </div>
            </div>
            <button type="button" onClick={() => setEmployee("")} className="h-9 rounded-xl border border-white/14 bg-black/10 px-3 text-xs text-white/65 hover:bg-white/[0.08]">Szűrés törlése</button>
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <SummaryCard
            label="Forgalom"
            value={money(summary?.revenue)}
            hint={`${year} • ${data?.scope.locationName || "Mindkét üzlet"} • forgalom szerint`}
            icon={CircleDollarSign}
            tone="green"
            active={summaryQuickFilter === "revenue"}
            onClick={() => applySummaryQuickFilter("revenue")}
          />
          <SummaryCard
            label="Vásárló kliensek"
            value={integer(summary?.buyingCustomers)}
            hint={`${integer(summary?.newCustomers)} új • kattints a vásárlókhoz`}
            icon={UserCheck}
            tone="blue"
            active={summaryQuickFilter === "buyers"}
            onClick={() => applySummaryQuickFilter("buyers")}
          />
          <SummaryCard
            label="Vásárlások"
            value={integer(summary?.transactions)}
            hint={`${integer(summary?.itemsSold)} eladott darab • vásárlásszám szerint`}
            icon={ReceiptText}
            active={summaryQuickFilter === "transactions"}
            onClick={() => applySummaryQuickFilter("transactions")}
          />
          <SummaryCard label="Átlag / kliens" value={money(summary?.averageCustomerValue)} hint="Az adott évben vásárló kliensek átlagos értéke" icon={TrendingUp} tone="green" />
          <SummaryCard
            label="Visszatérők"
            value={integer(summary?.repeatCustomers)}
            hint="Legalább 2 vásárlás a kiválasztott évben"
            icon={Users}
            tone="gold"
            active={summaryQuickFilter === "repeat"}
            onClick={() => applySummaryQuickFilter("repeat")}
          />
          <SummaryCard
            label="Jelenlegi tartozás"
            value={money(summary?.currentOpenBalance)}
            hint={`${money(summary?.periodBalanceDue)} a kiválasztott év eladásaiból`}
            icon={WalletCards}
            tone={numberValue(summary?.currentOpenBalance) > 0 ? "red" : "normal"}
            active={summaryQuickFilter === "debt"}
            onClick={() => applySummaryQuickFilter("debt")}
          />
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          {(data?.stores || []).map((store) => <StorePerformanceCard key={store.id} store={store} />)}
        </section>

        <EmployeePerformance items={data?.employees || []} selected={employee} onSelect={selectEmployee} />

        <section className={`${card} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5">
            <div>
              <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Klienslista</p>
              <h2 className="mt-1 text-base text-white">{topTen ? `Top 10 kliens • ${year}` : `Üzleti kliensek • ${year}`}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[10px] text-white/50">{integer(data?.totalFilteredCustomers || 0)} üzleti kliensrekord</span>
              {topTen ? <span className="rounded-full border border-amber-200/25 bg-amber-400/10 px-3 py-1 text-[10px] text-amber-50">Rangsor</span> : null}
            </div>
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[1120px] border-collapse text-xs">
              <thead className="bg-[#293548] text-[9px] uppercase tracking-[0.08em] text-white/43">
                <tr>
                  {topTen ? <th className="w-[54px] px-3 py-3 text-center">#</th> : null}
                  <th className="min-w-[270px] px-3 py-3 text-left">Kliens</th>
                  <th className="min-w-[150px] px-3 py-3 text-left">Üzlet</th>
                  <th className="px-3 py-3 text-right">{year}. évi forgalom</th>
                  <th className="px-3 py-3 text-center">Vásárlás / db</th>
                  <th className="min-w-[260px] px-3 py-3 text-left">Eladó(k)</th>
                  <th className="min-w-[180px] px-3 py-3 text-left">Aktivitás</th>
                  <th className="px-3 py-3 text-right">Tartozás</th>
                  <th className="w-[48px] px-2 py-3"><span className="sr-only">Részletek</span></th>
                </tr>
              </thead>
              <tbody>
                {customerRows.map((item, index) => (
                  <tr key={item.key} className="group cursor-pointer border-t border-white/8 align-middle transition hover:bg-white/[0.035]" onClick={() => setSelected(item)}>
                    {topTen ? (
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border text-sm ${index < 3 ? "border-amber-200/35 bg-amber-400/12 text-amber-50" : "border-white/10 bg-black/10 text-white/55"}`}>{index + 1}</span>
                      </td>
                    ) : null}
                    <td className="px-3 py-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/20 bg-[#2a8d8b]/12 text-[#bff8f5]"><UserRound size={18} /></span>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate text-sm text-white" title={item.fullName}>{item.fullName}</p>
                            {item.periodTransactions >= 2 ? <span className="shrink-0 rounded-full border border-amber-200/22 bg-amber-400/8 px-2 py-0.5 text-[9px] text-amber-50">Visszatérő</span> : null}
                            {item.combined ? <span className="shrink-0 rounded-full border border-[#9be9e5]/22 bg-[#2a8d8b]/10 px-2 py-0.5 text-[9px] text-[#d7fffd]">Összevonva</span> : null}
                          </div>
                          <p className="mt-1 truncate text-[10px] text-white/43">{[item.phone, item.email].filter(Boolean).join(" • ") || "Nincs elérhetőség"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">{item.stores.map((store) => <StoreBadge key={`${store.locationId}-${store.customerId}`} code={store.locationCode} name={store.locationName} />)}</div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <p className="text-sm text-white">{money(item.periodRevenue)}</p>
                      {topTen ? (
                        <div className="ml-auto mt-2 h-1.5 w-28 overflow-hidden rounded-full bg-[#233043]"><div className="h-full rounded-full bg-gradient-to-r from-[#2a8d8b] to-[#69ddd8]" style={{ width: `${Math.max(3, item.periodRevenue / topRevenue * 100)}%` }} /></div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-center"><p className="text-white">{integer(item.periodTransactions)} / {integer(item.periodItemsSold)} db</p></td>
                    <td className="px-3 py-3"><SellerChips sellers={item.employees} /></td>
                    <td className="px-3 py-3"><p className={item.periodTransactions > 0 ? "text-white/70" : "text-amber-50/72"}>{activityText(item, year)}</p></td>
                    <td className={`whitespace-nowrap px-3 py-3 text-right ${item.currentOpenBalance > 0.005 ? "text-rose-50" : "text-white/45"}`}>{money(item.currentOpenBalance)}</td>
                    <td className="px-2 py-3 text-center"><ChevronRight size={17} className="text-white/30 transition group-hover:translate-x-0.5 group-hover:text-[#9be9e5]" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-2 p-3 lg:hidden">
            {customerRows.map((item, index) => (
              <button key={item.key} type="button" onClick={() => setSelected(item)} className="rounded-[20px] border border-white/11 bg-[#2b3749] p-3 text-left transition active:scale-[0.99]">
                <div className="flex items-start gap-3">
                  {topTen ? <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm ${index < 3 ? "border-amber-200/35 bg-amber-400/12 text-amber-50" : "border-white/10 bg-black/10 text-white/55"}`}>{index + 1}</span> : <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/20 bg-[#2a8d8b]/12 text-[#bff8f5]"><UserRound size={17} /></span>}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="truncate text-sm text-white">{item.fullName}</p><p className="mt-1 truncate text-[10px] text-white/42">{item.phone || item.email || "Nincs elérhetőség"}</p></div>
                      <p className="shrink-0 text-sm text-white">{money(item.periodRevenue)}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">{item.stores.map((store) => <StoreBadge key={`${store.locationId}-${store.customerId}`} code={store.locationCode} name={store.locationName} />)}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <span className="rounded-xl border border-white/8 bg-black/10 px-2 py-2 text-center"><span className="block text-[8px] uppercase text-white/35">Vásárlás</span><strong className="mt-1 block text-sm font-normal text-white">{integer(item.periodTransactions)}</strong></span>
                  <span className="rounded-xl border border-white/8 bg-black/10 px-2 py-2 text-center"><span className="block text-[8px] uppercase text-white/35">Darab</span><strong className="mt-1 block text-sm font-normal text-white">{integer(item.periodItemsSold)}</strong></span>
                  <span className={`rounded-xl border px-2 py-2 text-center ${item.currentOpenBalance > 0.005 ? "border-rose-200/20 bg-rose-500/10" : "border-white/8 bg-black/10"}`}><span className="block text-[8px] uppercase text-white/35">Tartozás</span><strong className="mt-1 block truncate text-sm font-normal text-white">{money(item.currentOpenBalance)}</strong></span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/8 pt-2.5 text-[10px] text-white/45"><span className="truncate">{activityText(item, year)}</span><ChevronRight size={15} className="shrink-0 text-[#8ee6e2]" /></div>
              </button>
            ))}
          </div>

          {!customerRows.length && !loading ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center px-5 text-center">
              <Users size={38} className="text-white/25" />
              <p className="mt-3 text-base text-white/68">Nincs kliens ebben a szűrésben.</p>
              <p className="mt-1 text-xs text-white/40">Módosítsd az évet, az üzletet vagy az aktivitási feltételt.</p>
            </div>
          ) : null}
        </section>
      </div>

      {selected ? <CustomerDetailModal item={selected} year={year} canManage={role !== "shop"} onClose={() => setSelected(null)} onChanged={handleCustomerChanged} /> : null}

      {loading ? (
        <div className="fixed inset-0 z-[390] grid place-items-center bg-slate-950/24 backdrop-blur-[2px]">
          <div className="flex items-center gap-3 rounded-2xl border border-white/18 bg-[#263348] px-5 py-4 shadow-2xl">
            <Loader2 className="animate-spin text-[#8ee6e2]" size={22} />
            <span className="text-sm text-white">Klienskimutatás betöltése…</span>
          </div>
        </div>
      ) : null}
    </main>
  );
}
