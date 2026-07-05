import React, { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Barcode,
  Boxes,
  CalendarDays,
  Clock3,
  Filter,
  ImageIcon,
  MapPin,
  PackageSearch,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

const page = "min-h-screen bg-[#4b5362] px-3 py-5 text-white font-normal sm:px-4 sm:py-7";
const shell = "mx-auto max-w-7xl space-y-4";
const panel = "overflow-hidden rounded-2xl border border-white/14 bg-white/[0.07] shadow-lg";
const panelHead = "flex flex-col gap-3 border-b border-white/12 bg-[#404a5b] px-4 py-3 sm:flex-row sm:items-center sm:justify-between";
const btn = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/20 bg-[#354153] px-3 text-xs text-white hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const btnSoft = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.08] px-3 text-xs text-white hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const primaryBtn = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-3 text-xs text-white hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const input = "h-10 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-sm text-white outline-none placeholder:text-white/45 focus:border-white/45";
const select = "h-10 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-sm text-white outline-none focus:border-white/45";
const label = "grid gap-1.5 text-xs text-white/70";
const chipBase = "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs transition-colors";
const chipActive = `${chipBase} border-[#2a8d8b]/60 bg-[#2a8d8b] text-white shadow-[0_0_0_1px_rgba(42,141,139,0.18)]`;
const chipIdle = `${chipBase} border-white/14 bg-white/[0.06] text-white/72 hover:bg-white/[0.10]`;

const AIF_BASE = "/api/aif";

type AifLocation = {
  id: string;
  code: string;
  name: string;
  location_type?: string;
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
  barcode?: string | null;
  display_barcode?: string | null;
  size?: string | null;
  color_code?: string | null;
  color_name?: string | null;
  color_hex?: string | null;
  image_url?: string | null;
  images?: unknown;
  title_ro: string;
  shopify_title?: string | null;
  brand_name?: string | null;
  category_name_ro?: string | null;
  qty: number | string;
  reserved_qty: number | string;
  available_qty: number | string;
  updated_at?: string | null;
};

type AifStockMoveItem = {
  id: string;
  created_at: string;
  movement_type?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  qty_delta: number | string;
  qty_before?: number | string | null;
  qty_after?: number | string | null;
  actor?: string | null;
  direction: "in" | "out" | "adjust";
  location_id?: string | null;
  location_code?: string | null;
  location_name?: string | null;
  variant_id: string;
  barcode?: string | null;
  display_barcode?: string | null;
  size?: string | null;
  color_code?: string | null;
  color_name?: string | null;
  color_hex?: string | null;
  image_url?: string | null;
  images?: unknown;
  title_ro: string;
  shopify_title?: string | null;
  brand_name?: string | null;
  category_name_ro?: string | null;
};

type AifStockMoveTotals = {
  movement_count?: number;
  distinct_variants?: number;
  incoming_qty?: number | string;
  outgoing_qty?: number | string;
  net_qty?: number | string;
};

type RangePreset = "today" | "yesterday" | "last7" | "month" | "year" | "all" | "custom";
type DirectionFilter = "all" | "in" | "out" | "adjust";
type TabKey = "moves" | "stock";

async function fetchAifJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${AIF_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `${res.status} ${res.statusText}`;
    throw new Error(String(msg));
  }

  return data as T;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function dateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function rangeForPreset(preset: RangePreset): { from: string; to: string } {
  const today = startOfToday();
  const end = new Date(today);
  switch (preset) {
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: dateInputValue(y), to: dateInputValue(y) };
    }
    case "last7": {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from: dateInputValue(from), to: dateInputValue(end) };
    }
    case "month": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: dateInputValue(from), to: dateInputValue(end) };
    }
    case "year": {
      const from = new Date(today.getFullYear(), 0, 1);
      return { from: dateInputValue(from), to: dateInputValue(end) };
    }
    case "all":
      return { from: "", to: "" };
    case "today":
    case "custom":
    default:
      return { from: dateInputValue(today), to: dateInputValue(end) };
  }
}

function n(value: unknown) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function formatQty(value: unknown) {
  const num = n(value);
  return new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 }).format(num);
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

function formatDateOnly(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function firstImage(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstImage(item);
      if (found) return found;
    }
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["url", "src", "image", "imageUrl", "image_url", "originalSrc", "transformedSrc"]) {
      const raw = obj[key];
      if (typeof raw === "string" && raw.trim()) return raw.trim();
    }
  }
  return null;
}

function imageFor(item: Pick<AifStockItem, "image_url" | "images"> | Pick<AifStockMoveItem, "image_url" | "images">) {
  return item.image_url || firstImage(item.images) || null;
}

function displayName(item: Pick<AifStockItem, "title_ro" | "shopify_title"> | Pick<AifStockMoveItem, "title_ro" | "shopify_title">) {
  return item.title_ro || item.shopify_title || "Névtelen termék";
}

function displayBarcode(item: Pick<AifStockItem, "display_barcode" | "barcode"> | Pick<AifStockMoveItem, "display_barcode" | "barcode">) {
  return item.display_barcode || item.barcode || "";
}

function sourceLabel(item: Pick<AifStockMoveItem, "source_type" | "movement_type">) {
  const source = String(item.source_type || "");
  const movement = String(item.movement_type || "");
  if (source.includes("import_batch") || movement === "incoming") return "Bevételezés";
  if (source.includes("manual_stock_edit") || movement === "adjustment") return "Kézi korrekció";
  if (source.includes("sale") || movement === "sale") return "Eladás";
  if (source.includes("transfer") || movement === "transfer") return "Áthelyezés";
  return movement || source || "Mozgás";
}

function directionMeta(item: AifStockMoveItem) {
  const delta = n(item.qty_delta);
  if (item.direction === "in" || delta > 0) {
    return {
      label: "Bejött",
      sign: "+",
      icon: ArrowDownLeft,
      cls: "border-emerald-300/30 bg-emerald-500/16 text-emerald-50",
      dot: "bg-emerald-300",
    };
  }
  if (item.direction === "out" || delta < 0) {
    return {
      label: "Kiment",
      sign: "−",
      icon: ArrowUpRight,
      cls: "border-rose-300/30 bg-rose-500/16 text-rose-50",
      dot: "bg-rose-300",
    };
  }
  return {
    label: "Korrekció",
    sign: "",
    icon: ArrowRightLeft,
    cls: "border-amber-300/30 bg-amber-500/16 text-amber-50",
    dot: "bg-amber-300",
  };
}

function ProductThumb({ item }: { item: Pick<AifStockItem, "image_url" | "images" | "title_ro"> | Pick<AifStockMoveItem, "image_url" | "images" | "title_ro"> }) {
  const src = imageFor(item);
  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/12 bg-white/[0.08]">
      {src ? (
        <img src={src} alt={item.title_ro || "Termékkép"} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-white/35">
          <ImageIcon size={20} />
        </div>
      )}
    </div>
  );
}

function ProductText({ item }: { item: AifStockItem | AifStockMoveItem }) {
  const barcode = displayBarcode(item);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        {item.brand_name && <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9fd7d5]">{item.brand_name}</span>}
        {item.category_name_ro && <span className="text-[11px] text-white/42">{item.category_name_ro}</span>}
      </div>
      <p className="mt-0.5 truncate text-sm font-semibold text-white sm:text-[15px]">{displayName(item)}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/58">
        {barcode && (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5">
            <Barcode size={12} />
            Vonalkód: {barcode}
          </span>
        )}
        {(item.color_name || item.size) && (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5">
            {item.color_name || "-"} · {item.size || "-"}
          </span>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint }: { icon: ComponentType<{ size?: number; className?: string }>; label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-white/55">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-white">{value}</p>
          {hint && <p className="mt-1 text-xs text-white/45">{hint}</p>}
        </div>
        <div className="rounded-xl border border-[#2a8d8b]/28 bg-[#2a8d8b]/18 p-2 text-[#a7e7e5]">
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

export default function AllInStockMoves() {
  const initialRange = useMemo(() => rangeForPreset("today"), []);
  const [locations, setLocations] = useState<AifLocation[]>([]);
  const [locationId, setLocationId] = useState("");
  const [stockRows, setStockRows] = useState<AifStockItem[]>([]);
  const [moveRows, setMoveRows] = useState<AifStockMoveItem[]>([]);
  const [totals, setTotals] = useState<AifStockMoveTotals>({});
  const [activeTab, setActiveTab] = useState<TabKey>("moves");
  const [preset, setPreset] = useState<RangePreset>("today");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchAifJSON<AifMeta>("/meta")
      .then((data) => {
        if (!alive) return;
        const activeLocations = (data.locations || []).filter((loc) => loc.is_active !== false);
        setLocations(activeLocations);
        setLocationId((current) => current || activeLocations[0]?.id || activeLocations[0]?.code || "");
      })
      .catch((e) => setMessage(e.message || "A helyszínek betöltése nem sikerült."));
    return () => {
      alive = false;
    };
  }, []);

  const selectedLocation = useMemo(
    () => locations.find((loc) => loc.id === locationId || loc.code === locationId) || null,
    [locations, locationId]
  );

  async function refresh() {
    setLoading(true);
    setMessage(null);
    try {
      const stockQ = new URLSearchParams();
      if (locationId) stockQ.set("location", locationId);
      if (search.trim()) stockQ.set("search", search.trim());

      const movesQ = new URLSearchParams();
      if (locationId) movesQ.set("location", locationId);
      if (search.trim()) movesQ.set("search", search.trim());
      if (direction !== "all") movesQ.set("direction", direction);
      if (from) movesQ.set("from", from);
      if (to) movesQ.set("to", to);
      movesQ.set("limit", "350");

      const [stockData, moveData] = await Promise.all([
        fetchAifJSON<{ items: AifStockItem[] }>(`/stock?${stockQ.toString()}`),
        fetchAifJSON<{ items: AifStockMoveItem[]; totals: AifStockMoveTotals }>(`/stock-movements?${movesQ.toString()}`),
      ]);
      setStockRows(stockData.items || []);
      setMoveRows(moveData.items || []);
      setTotals(moveData.totals || {});
    } catch (e: any) {
      setMessage(e.message || "A készletmozgások betöltése nem sikerült.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!locationId && locations.length) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, direction, from, to]);

  const stockTotals = useMemo(() => {
    return stockRows.reduce(
      (acc, row) => {
        acc.qty += n(row.qty);
        acc.reserved += n(row.reserved_qty);
        acc.available += n(row.available_qty);
        return acc;
      },
      { qty: 0, reserved: 0, available: 0 }
    );
  }, [stockRows]);

  const presetOptions: { key: RangePreset; label: string }[] = [
    { key: "today", label: "Ma" },
    { key: "yesterday", label: "Tegnap" },
    { key: "last7", label: "7 nap" },
    { key: "month", label: "Hónap" },
    { key: "year", label: "Év" },
    { key: "all", label: "Mind" },
  ];

  const rangeLabel = useMemo(() => {
    if (!from && !to) return "Minden dátum";
    if (from && to && from === to) return formatDateOnly(from);
    return `${from ? formatDateOnly(from) : "kezdettől"} - ${to ? formatDateOnly(to) : "mostanáig"}`;
  }, [from, to]);

  const handlePreset = (next: RangePreset) => {
    setPreset(next);
    const range = rangeForPreset(next);
    setFrom(range.from);
    setTo(range.to);
  };

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
    else if (typeof window !== "undefined") window.location.hash = "#allinwarehouse";
  };

  return (
    <div className={page}>
      <div className={shell}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-white/58">AllInFashion</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Raktármozgás / készlet</h1>
            <p className="mt-1 max-w-3xl text-sm text-white/70">
              Termékes készletnézet képekkel, vonalkóddal, dátummal és bejövő / kimenő mozgásnaplóval.
            </p>
          </div>
          <button type="button" onClick={handleBack} className={btn}>
            <ArrowLeft size={16} /> Vissza
          </button>
        </div>

        <div className={panel}>
          <div className={panelHead}>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-white/40">Szűrés</p>
              <h2 className="mt-1 flex items-center gap-2 text-base font-semibold"><SlidersHorizontal size={17} /> Mit nézzünk?</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("moves")}
                className={activeTab === "moves" ? primaryBtn : btnSoft}
              >
                <Activity size={15} /> Mozgásnapló ({formatQty(totals.movement_count || 0)})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("stock")}
                className={activeTab === "stock" ? primaryBtn : btnSoft}
              >
                <Boxes size={15} /> Jelenlegi készlet ({formatQty(stockRows.length)})
              </button>
            </div>
          </div>

          <div className="space-y-4 p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,0.9fr)_minmax(220px,1.1fr)_minmax(260px,1.3fr)_minmax(160px,0.7fr)_auto] lg:items-end">
              <label className={label}>
                Helyszín
                <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={select}>
                  <option value="">Minden helyszín</option>
                  {locations.map((loc) => (
                    <option key={loc.id || loc.code} value={loc.id || loc.code}>{loc.name}</option>
                  ))}
                </select>
              </label>

              <label className={label}>
                Termék / vonalkód keresés
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={15} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") refresh(); }}
                    placeholder="Terméknév, márka, vonalkód..."
                    className={`${input} w-full pl-9 pr-9`}
                  />
                  {search && (
                    <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-white/45 hover:bg-white/10 hover:text-white">
                      <X size={15} />
                    </button>
                  )}
                </div>
              </label>

              <div className="grid gap-1.5 text-xs text-white/70">
                Gyors dátum
                <div className="flex flex-wrap gap-2">
                  {presetOptions.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handlePreset(item.key)}
                      className={preset === item.key ? chipActive : chipIdle}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className={label}>
                Irány
                <select value={direction} onChange={(e) => setDirection(e.target.value as DirectionFilter)} className={select}>
                  <option value="all">Minden mozgás</option>
                  <option value="in">Csak bejött</option>
                  <option value="out">Csak kiment</option>
                  <option value="adjust">Korrekció</option>
                </select>
              </label>

              <button type="button" onClick={refresh} disabled={loading} className={primaryBtn}>
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Frissítés
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <label className={label}>
                Ettől
                <input
                  type="date"
                  value={from}
                  onChange={(e) => { setPreset("custom"); setFrom(e.target.value); }}
                  className={input}
                />
              </label>
              <label className={label}>
                Eddig
                <input
                  type="date"
                  value={to}
                  onChange={(e) => { setPreset("custom"); setTo(e.target.value); }}
                  className={input}
                />
              </label>
              <div className="rounded-xl border border-white/12 bg-[#354153] px-3 py-2 text-xs text-white/65">
                <div className="flex items-center gap-2"><CalendarDays size={14} /> Aktív időszak</div>
                <p className="mt-1 text-white">{rangeLabel}</p>
              </div>
            </div>

            {message && (
              <div className="rounded-xl border border-rose-200/20 bg-rose-500/12 px-3 py-2 text-sm text-rose-50">{message}</div>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard icon={MapPin} label="Helyszín" value={selectedLocation?.name || "Minden"} hint="A kiválasztott üzlet / raktár" />
          <StatCard icon={ArrowDownLeft} label="Bejött" value={formatQty(totals.incoming_qty || 0)} hint="A szűrt időszakban" />
          <StatCard icon={ArrowUpRight} label="Kiment" value={formatQty(totals.outgoing_qty || 0)} hint="A szűrt időszakban" />
          <StatCard icon={ArrowRightLeft} label="Nettó mozgás" value={formatQty(totals.net_qty || 0)} hint="Bejött mínusz kiment" />
          <StatCard icon={Boxes} label="Elérhető most" value={formatQty(stockTotals.available)} hint={`${formatQty(stockTotals.qty)} készlet · ${formatQty(stockTotals.reserved)} foglalt`} />
        </div>

        {activeTab === "moves" ? (
          <div className={panel}>
            <div className={panelHead}>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-white/40">Mozgásnapló</p>
                <h2 className="mt-1 flex items-center gap-2 text-base font-semibold"><Clock3 size={17} /> Dátum, óra, termék és irány</h2>
              </div>
              <div className="text-sm text-white/62">{formatQty(moveRows.length)} sor megjelenítve</div>
            </div>

            <div className="hidden overflow-auto lg:block">
              <table className="w-full min-w-[980px] border-collapse text-sm">
                <thead className="bg-[#293448] text-xs uppercase tracking-[0.08em] text-white/72">
                  <tr>
                    <th className="px-4 py-3 text-left">Termék</th>
                    <th className="px-4 py-3 text-left">Dátum / óra</th>
                    <th className="px-4 py-3 text-left">Helyszín</th>
                    <th className="px-4 py-3 text-center">Mozgás</th>
                    <th className="px-4 py-3 text-center">Előtte</th>
                    <th className="px-4 py-3 text-center">Utána</th>
                    <th className="px-4 py-3 text-left">Forrás</th>
                  </tr>
                </thead>
                <tbody>
                  {moveRows.map((row) => {
                    const meta = directionMeta(row);
                    const Icon = meta.icon;
                    const delta = Math.abs(n(row.qty_delta));
                    return (
                      <tr key={row.id} className="border-t border-white/10 hover:bg-white/[0.04]">
                        <td className="px-4 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <ProductThumb item={row} />
                            <ProductText item={row} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-white/78">{formatDateTime(row.created_at)}</td>
                        <td className="px-4 py-3 text-white/78">{row.location_name || "-"}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${meta.cls}`}>
                            <Icon size={14} /> {meta.label} {meta.sign}{formatQty(delta)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-white/78">{formatQty(row.qty_before ?? 0)}</td>
                        <td className="px-4 py-3 text-center tabular-nums text-white/78">{formatQty(row.qty_after ?? 0)}</td>
                        <td className="px-4 py-3 text-white/70">{sourceLabel(row)}</td>
                      </tr>
                    );
                  })}
                  {!moveRows.length && (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-white/55">Nincs mozgás ebben az időszakban.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 p-3 lg:hidden">
              {moveRows.map((row) => {
                const meta = directionMeta(row);
                const Icon = meta.icon;
                const delta = Math.abs(n(row.qty_delta));
                return (
                  <div key={row.id} className="rounded-2xl border border-white/12 bg-white/[0.05] p-3">
                    <div className="flex gap-3">
                      <ProductThumb item={row} />
                      <div className="min-w-0 flex-1"><ProductText item={row} /></div>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-white/68 sm:grid-cols-2">
                      <div className="rounded-xl bg-[#354153] px-3 py-2"><Clock3 className="mr-1 inline" size={13} /> {formatDateTime(row.created_at)}</div>
                      <div className="rounded-xl bg-[#354153] px-3 py-2"><MapPin className="mr-1 inline" size={13} /> {row.location_name || "-"}</div>
                      <div className={`rounded-xl border px-3 py-2 ${meta.cls}`}><Icon className="mr-1 inline" size={13} /> {meta.label}: {meta.sign}{formatQty(delta)}</div>
                      <div className="rounded-xl bg-[#354153] px-3 py-2">{formatQty(row.qty_before ?? 0)} → {formatQty(row.qty_after ?? 0)}</div>
                    </div>
                  </div>
                );
              })}
              {!moveRows.length && <div className="rounded-xl border border-white/12 bg-white/[0.05] p-6 text-center text-sm text-white/55">Nincs mozgás ebben az időszakban.</div>}
            </div>
          </div>
        ) : (
          <div className={panel}>
            <div className={panelHead}>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-white/40">Jelenlegi készlet</p>
                <h2 className="mt-1 flex items-center gap-2 text-base font-semibold"><PackageSearch size={17} /> Termékek a kiválasztott helyszínen</h2>
              </div>
              <div className="text-sm text-white/62">{formatQty(stockRows.length)} terméksor</div>
            </div>

            <div className="hidden overflow-auto lg:block">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead className="bg-[#293448] text-xs uppercase tracking-[0.08em] text-white/72">
                  <tr>
                    <th className="px-4 py-3 text-left">Termék</th>
                    <th className="px-4 py-3 text-left">Helyszín</th>
                    <th className="px-4 py-3 text-center">Méret</th>
                    <th className="px-4 py-3 text-center">Készlet</th>
                    <th className="px-4 py-3 text-center">Foglalt</th>
                    <th className="px-4 py-3 text-center">Elérhető</th>
                    <th className="px-4 py-3 text-left">Frissítve</th>
                  </tr>
                </thead>
                <tbody>
                  {stockRows.map((row) => (
                    <tr key={`${row.location_id || row.location_code}-${row.variant_id}`} className="border-t border-white/10 hover:bg-white/[0.04]">
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <ProductThumb item={row} />
                          <ProductText item={row} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white/78">{row.location_name || "-"}</td>
                      <td className="px-4 py-3 text-center text-white/78">{row.size || "-"}</td>
                      <td className="px-4 py-3 text-center tabular-nums text-white">{formatQty(row.qty)}</td>
                      <td className="px-4 py-3 text-center tabular-nums text-white/70">{formatQty(row.reserved_qty)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex min-w-12 justify-center rounded-full border border-[#2a8d8b]/35 bg-[#2a8d8b]/18 px-3 py-1 text-white">{formatQty(row.available_qty)}</span>
                      </td>
                      <td className="px-4 py-3 text-white/60">{formatDateTime(row.updated_at)}</td>
                    </tr>
                  ))}
                  {!stockRows.length && (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-white/55">Nincs készlet a szűrés alapján.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 p-3 lg:hidden">
              {stockRows.map((row) => (
                <div key={`${row.location_id || row.location_code}-${row.variant_id}`} className="rounded-2xl border border-white/12 bg-white/[0.05] p-3">
                  <div className="flex gap-3">
                    <ProductThumb item={row} />
                    <div className="min-w-0 flex-1"><ProductText item={row} /></div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-xl bg-[#354153] px-2 py-2"><span className="block text-white/48">Készlet</span><span className="mt-1 block text-base text-white">{formatQty(row.qty)}</span></div>
                    <div className="rounded-xl bg-[#354153] px-2 py-2"><span className="block text-white/48">Foglalt</span><span className="mt-1 block text-base text-white">{formatQty(row.reserved_qty)}</span></div>
                    <div className="rounded-xl border border-[#2a8d8b]/35 bg-[#2a8d8b]/16 px-2 py-2"><span className="block text-white/60">Elérhető</span><span className="mt-1 block text-base text-white">{formatQty(row.available_qty)}</span></div>
                  </div>
                </div>
              ))}
              {!stockRows.length && <div className="rounded-xl border border-white/12 bg-white/[0.05] p-6 text-center text-sm text-white/55">Nincs készlet a szűrés alapján.</div>}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-[#2a8d8b]/25 bg-[#174c55]/60 px-4 py-3 text-sm text-cyan-50/90">
          <Filter className="mr-2 inline" size={15} />
          Alapértelmezésben a mai napot mutatja. A „Hónap” az aktuális hónap első napjától számol.
        </div>
      </div>
    </div>
  );
}
