import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Barcode,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Download,
  FileText,
  Filter,
  ImageIcon,
  MapPin,
  PackageCheck,
  Printer,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";

const page = "min-h-screen bg-[#4b5362] px-3 py-5 text-white font-normal sm:px-4 sm:py-7";
const shell = "mx-auto max-w-7xl space-y-4";
const panel = "overflow-hidden rounded-2xl border border-white/14 bg-white/[0.07] shadow-lg";
const panelHead = "flex flex-col gap-3 border-b border-white/12 bg-[#404a5b] px-4 py-3 sm:flex-row sm:items-center sm:justify-between";
const btn = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/20 bg-[#354153] px-3 text-xs text-white hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const btnSoft = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.08] px-3 text-xs text-white hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const primaryBtn = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-3 text-xs text-white hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const redBtn = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-500 bg-red-600 px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(220,38,38,0.22)] hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50";
const input = "h-10 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-sm text-white outline-none placeholder:text-white/45 focus:border-white/45";
const select = "h-10 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-sm text-white outline-none focus:border-white/45";
const label = "grid gap-1.5 text-xs text-white/70";
const chipBase = "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs transition-colors";
const chipActive = `${chipBase} border-[#2a8d8b]/60 bg-[#2a8d8b] text-white shadow-[0_0_0_1px_rgba(42,141,139,0.18)]`;
const chipIdle = `${chipBase} border-white/14 bg-white/[0.06] text-white/72 hover:bg-white/[0.10]`;
const qtyInput = "h-10 w-24 rounded-xl border border-white/18 bg-[#303a4c] px-3 text-center text-sm text-white outline-none focus:border-[#2a8d8b]/70";

const AIF_BASE = "/api/aif";
const stockMovesChangedStorageKey = "allinfashion:stockMoves:changed:v1";
const stockMovesChangedEventName = "aif:stock-moves-changed";

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

async function fetchAifJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${AIF_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });

  const responseText = await res.text();
  let data: any = null;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    data = responseText;
  }

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `${res.status} ${res.statusText}`;
    throw new Error(String(msg));
  }

  return data as T;
}

function n(value: unknown) {
  const num = Number(value ?? 0);
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
  if (!location) return "Válassz üzletet";
  return location.location_type === "shop" ? "Üzlet" : location.location_type === "warehouse" ? "Raktár" : "Helyszín";
}

function lineDraftFrom(line: InventoryCountLine): DraftLine {
  const qty = line.counted_qty === null || line.counted_qty === undefined ? "" : String(Math.trunc(n(line.counted_qty)));
  return { countedQty: qty, note: line.note || "" };
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

function StatCard({ label, value, hint, icon, tone = "neutral" }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "neutral" | "green" | "red" | "blue" }) {
  const toneClass = tone === "green" ? "border-[#2a8d8b]/45 bg-[#2a8d8b]/12" : tone === "red" ? "border-red-300/35 bg-red-500/10" : tone === "blue" ? "border-sky-300/30 bg-sky-500/10" : "border-white/18 bg-white/[0.06]";
  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-white/62">{label}</div>
          <div className="mt-2 text-2xl font-semibold leading-none text-white">{value}</div>
        </div>
        {icon ? <div className="rounded-xl border border-white/16 bg-white/[0.08] p-2 text-white/78">{icon}</div> : null}
      </div>
      {hint ? <div className="mt-2 text-xs text-white/58">{hint}</div> : null}
    </div>
  );
}

export default function AllInInventory() {
  const [locations, setLocations] = useState<AifLocation[]>([]);
  const [location, setLocation] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [lineFilter, setLineFilter] = useState<LineFilter>("all");
  const [stockRows, setStockRows] = useState<AifStockItem[]>([]);
  const [counts, setCounts] = useState<InventoryCountSummary[]>([]);
  const [active, setActive] = useState<InventoryCountDetail | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftLine>>({});
  const [title, setTitle] = useState(todayTitle());
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: MessageTone; text: string } | null>(null);

  const currentLocation = useMemo(() => locations.find((x) => x.id === location || x.code === location) || null, [locations, location]);

  const loadMeta = useCallback(async () => {
    const meta = await fetchAifJSON<AifMeta>("/meta");
    const activeLocations = (meta.locations || []).filter((x) => x.is_active !== false);
    setLocations(activeLocations);
    setLocation((prev) => prev || activeLocations[0]?.id || "");
  }, []);

  const loadStockAndCounts = useCallback(async (locationValue: string, searchValue: string) => {
    if (!locationValue) return;
    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set("location", locationValue);
      if (searchValue.trim()) q.set("search", searchValue.trim());
      const [stock, countList] = await Promise.all([
        fetchAifJSON<{ items: AifStockItem[] }>(`/stock?${q.toString()}`),
        fetchAifJSON<{ items: InventoryCountSummary[] }>(`/inventory-counts?location=${encodeURIComponent(locationValue)}&limit=30`),
      ]);
      setStockRows(stock.items || []);
      setCounts(countList.items || []);
      setMessage(null);

      setActive((prev) => {
        if (prev && String(prev.item.location_id) === String(locationValue)) return prev;
        const open = (countList.items || []).find((x) => !["committed", "cancelled"].includes(x.status));
        if (open) {
          void loadCount(open.id);
        }
        return prev && String(prev.item.location_id) !== String(locationValue) ? null : prev;
      });
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "A leltár adatok betöltése nem sikerült." });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCount = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const detail = await fetchAifJSON<InventoryCountDetail>(`/inventory-counts/${encodeURIComponent(id)}`);
      setActive(detail);
      const nextDrafts: Record<string, DraftLine> = {};
      for (const line of detail.lines || []) nextDrafts[line.id] = lineDraftFrom(line);
      setDrafts(nextDrafts);
      setMessage(null);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "A leltár betöltése nem sikerült." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!location) return;
    const handle = window.setTimeout(() => void loadStockAndCounts(location, search), 180);
    return () => window.clearTimeout(handle);
  }, [location, search, loadStockAndCounts]);

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
    return stockRows.filter((row) => categoryFilter === "all" || row.category_code === categoryFilter || row.category_name_ro === categoryFilter);
  }, [stockRows, categoryFilter]);

  const filteredLines = useMemo(() => {
    const lines = active?.lines || [];
    return lines.filter((line) => {
      if (categoryFilter !== "all" && line.category_code !== categoryFilter && line.category_name_ro !== categoryFilter) return false;
      const diff = lineDiff(line, drafts);
      if (lineFilter === "uncounted") return diff === null;
      if (lineFilter === "ok") return diff === 0;
      if (lineFilter === "missing") return diff !== null && diff < 0;
      if (lineFilter === "extra") return diff !== null && diff > 0;
      return true;
    });
  }, [active, categoryFilter, lineFilter, drafts]);

  const activeStats = useMemo(() => {
    const lines = active?.lines || [];
    let expected = 0;
    let counted = 0;
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
      if (countedValue !== null) {
        countedLines++;
        counted += countedValue;
        const diff = countedValue - expectedQty;
        const sell = n(line.sell_price);
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
      complete: lines.length > 0 && countedLines === lines.length,
    };
  }, [active, drafts]);

  const stockStats = useMemo(() => {
    return filteredStockRows.reduce((acc, row) => {
      acc.lines += 1;
      acc.qty += n(row.qty);
      acc.available += n(row.available_qty);
      acc.sellValue += n(row.qty) * n(row.sell_price);
      return acc;
    }, { lines: 0, qty: 0, available: 0, sellValue: 0 });
  }, [filteredStockRows]);

  const canEditActive = active && !["committed", "cancelled"].includes(active.item.status);

  async function createCount() {
    if (!location) {
      setMessage({ tone: "error", text: "Előbb válassz üzletet / helyszínt." });
      return;
    }
    setSaving(true);
    try {
      const detail = await fetchAifJSON<InventoryCountDetail>("/inventory-counts", {
        method: "POST",
        body: JSON.stringify({ location, title: title.trim() || todayTitle(), note: note.trim() || null, search: search.trim() || null }),
      });
      setActive(detail);
      const nextDrafts: Record<string, DraftLine> = {};
      for (const line of detail.lines || []) nextDrafts[line.id] = lineDraftFrom(line);
      setDrafts(nextDrafts);
      setMessage({ tone: "success", text: "Leltár elindítva. A sorok menthetők és nyomtathatók." });
      await loadStockAndCounts(location, search);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "A leltár indítása nem sikerült." });
    } finally {
      setSaving(false);
    }
  }

  async function saveLines() {
    if (!active) return;
    setSaving(true);
    try {
      const lines = (Object.entries(drafts) as [string, DraftLine][]).map(([lineId, draft]) => ({ lineId, countedQty: draft.countedQty.trim() === "" ? null : draft.countedQty, note: draft.note.trim() || null }));
      const detail = await fetchAifJSON<InventoryCountDetail & { saved?: number }>(`/inventory-counts/${encodeURIComponent(active.item.id)}/lines`, {
        method: "PATCH",
        body: JSON.stringify({ lines }),
      });
      setActive({ item: detail.item, lines: detail.lines });
      const nextDrafts: Record<string, DraftLine> = {};
      for (const line of detail.lines || []) nextDrafts[line.id] = lineDraftFrom(line);
      setDrafts(nextDrafts);
      setMessage({ tone: "success", text: "Leltár mentve." });
      await loadStockAndCounts(location, search);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "A leltár mentése nem sikerült." });
    } finally {
      setSaving(false);
    }
  }

  async function commitCount() {
    if (!active) return;
    if (!activeStats.complete) {
      setMessage({ tone: "error", text: "Bevezetés előtt minden sorhoz írj talált darabszámot." });
      return;
    }
    const ok = window.confirm("Biztosan bevezeted ezt a leltárt? Ez módosítja a készletet és készletmozgást ír a naplóba.");
    if (!ok) return;
    setSaving(true);
    try {
      await saveLines();
      const detail = await fetchAifJSON<InventoryCountDetail & { changed?: number }>(`/inventory-counts/${encodeURIComponent(active.item.id)}/commit`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setActive({ item: detail.item, lines: detail.lines });
      const nextDrafts: Record<string, DraftLine> = {};
      for (const line of detail.lines || []) nextDrafts[line.id] = lineDraftFrom(line);
      setDrafts(nextDrafts);
      notifyStockMovesChanged({ source: "inventory_count", inventoryCountId: detail.item.id });
      setMessage({ tone: "success", text: "Leltár bevezetve. A készlet és a mozgásnapló frissült." });
      await loadStockAndCounts(location, search);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "A leltár bevezetése nem sikerült." });
    } finally {
      setSaving(false);
    }
  }

  async function deleteCount() {
    if (!active) return;
    const ok = window.confirm("Törlöd ezt a megkezdett leltárt? Bevezetett leltár nem törölhető innen.");
    if (!ok) return;
    setSaving(true);
    try {
      await fetchAifJSON(`/inventory-counts/${encodeURIComponent(active.item.id)}`, { method: "DELETE" });
      setActive(null);
      setDrafts({});
      setMessage({ tone: "success", text: "Leltár törölve." });
      await loadStockAndCounts(location, search);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "A leltár törlése nem sikerült." });
    } finally {
      setSaving(false);
    }
  }

  function updateDraft(lineId: string, patch: Partial<DraftLine>) {
    setDrafts((prev) => ({ ...prev, [lineId]: { ...(prev[lineId] || { countedQty: "", note: "" }), ...patch } }));
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
      img { width:34px; height:42px; object-fit:contain; border:1px solid #d1d5db; border-radius:6px; }
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

  const messageClass = message?.tone === "error" ? "border-red-300/35 bg-red-500/12 text-red-50" : message?.tone === "success" ? "border-[#2a8d8b]/45 bg-[#2a8d8b]/14 text-white" : "border-white/14 bg-white/[0.06] text-white/78";

  return (
    <div className={page}>
      <div className={shell}>
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm text-white/70">AllInFashion</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Leltár</h1>
            <p className="mt-2 max-w-3xl text-sm text-white/76">Üzletenkénti leltárív, számolás, eltérés kimutatás és készletbevezetés értékekkel.</p>
          </div>
          <button className={btn} type="button" onClick={() => window.history.back()}><ArrowLeft size={16} /> Vissza</button>
        </header>

        {message ? <div className={`rounded-2xl border px-4 py-3 text-sm ${messageClass}`}>{message.text}</div> : null}

        <section className={panel}>
          <div className={panelHead}>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold"><Filter size={16} /> Leltár előkészítés</div>
              <div className="mt-1 text-xs text-white/58">Válaszd ki az üzletet, szűrd a készletet, majd indíts vagy folytass leltárt.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={btnSoft} type="button" onClick={() => location && loadStockAndCounts(location, search)} disabled={loading}><RefreshCw size={15} /> Frissítés</button>
              <button className={primaryBtn} type="button" onClick={createCount} disabled={saving || !location}><ClipboardList size={15} /> Új leltár indítása</button>
            </div>
          </div>
          <div className="grid gap-3 p-4 lg:grid-cols-[1.2fr_1.4fr_1fr]">
            <label className={label}>Üzlet / helyszín
              <select className={select} value={location} onChange={(e) => { setLocation(e.target.value); setActive(null); setDrafts({}); }}>
                {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </select>
            </label>
            <label className={label}>Termék / vonalkód keresés
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/45" size={16} />
                <input className={`${input} w-full pl-9`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Terméknév, márka, vonalkód..." />
              </div>
            </label>
            <label className={label}>Kategória
              <select className={select} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">Minden kategória</option>
                {categories.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            </label>
            <label className={`${label} lg:col-span-2`}>Leltár címe
              <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pl. Júliusi üzlet leltár" />
            </label>
            <label className={label}>Megjegyzés
              <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pl. ellenőrző leltár" />
            </label>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label={sourceLabel(currentLocation)} value={currentLocation?.name || "-"} hint="Kiválasztott helyszín" icon={<MapPin size={18} />} tone="blue" />
          <StatCard label="Készletsor" value={formatQty(stockStats.lines)} hint={`${formatQty(stockStats.qty)} db rendszer szerint`} icon={<PackageCheck size={18} />} />
          <StatCard label="Elérhető" value={formatQty(stockStats.available)} hint="Készlet mínusz foglalt" icon={<ShieldCheck size={18} />} tone="green" />
          <StatCard label="Becsült eladási érték" value={`${formatMoney(stockStats.sellValue)} RON`} hint="A kiválasztott készleten" icon={<FileText size={18} />} />
        </section>

        <section className={panel}>
          <div className={panelHead}>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold"><ClipboardCheck size={16} /> Folyamatban lévő / korábbi leltárak</div>
              <div className="mt-1 text-xs text-white/58">Az üzlethez tartozó leltárak. A nyitott leltár folytatható, a bevezetett ellenőrizhető.</div>
            </div>
            <div className="text-xs text-white/60">{counts.length} leltár</div>
          </div>
          <div className="grid gap-2 p-4 md:grid-cols-2 xl:grid-cols-3">
            {counts.length ? counts.map((count) => (
              <button key={count.id} type="button" onClick={() => loadCount(count.id)} className={`rounded-2xl border p-3 text-left transition ${active?.item.id === count.id ? "border-[#2a8d8b]/70 bg-[#2a8d8b]/14" : "border-white/14 bg-white/[0.06] hover:bg-white/[0.09]"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{count.title}</div>
                    <div className="mt-1 text-xs text-white/55">{count.code} · {formatDateTime(count.created_at)}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] ${count.status === "committed" ? "bg-[#2a8d8b] text-white" : "bg-white/[0.10] text-white/75"}`}>{statusLabel(count.status)}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-white/72">
                  <div><b className="text-white">{formatQty(count.line_count)}</b><br />sor</div>
                  <div><b className="text-white">{formatQty(count.counted_lines)}</b><br />számolt</div>
                  <div><b className={n(count.diff_qty) < 0 ? "text-red-200" : n(count.diff_qty) > 0 ? "text-emerald-200" : "text-white"}>{n(count.diff_qty) > 0 ? "+" : ""}{formatQty(count.diff_qty)}</b><br />eltérés</div>
                </div>
              </button>
            )) : <div className="rounded-2xl border border-white/14 bg-white/[0.04] p-4 text-sm text-white/62 md:col-span-2 xl:col-span-3">Ehhez a helyszínhez még nincs leltár.</div>}
          </div>
        </section>

        {active ? (
          <section className={panel}>
            <div className={panelHead}>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-white/42">{active.item.code}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold">
                  {active.item.title}
                  <span className={`rounded-full px-2.5 py-1 text-[11px] ${active.item.status === "committed" ? "bg-[#2a8d8b] text-white" : "bg-white/[0.10] text-white/72"}`}>{statusLabel(active.item.status)}</span>
                </div>
                <div className="mt-1 text-xs text-white/58">{active.item.location_name} · indítva: {formatDateTime(active.item.started_at || active.item.created_at)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={btnSoft} type="button" onClick={() => printPdf("sheet")}><Printer size={15} /> Leltárív PDF</button>
                <button className={btnSoft} type="button" onClick={() => printPdf("result")}><Download size={15} /> Eredmény PDF</button>
                <button className={btnSoft} type="button" onClick={saveLines} disabled={saving || !canEditActive}><Save size={15} /> Mentés</button>
                <button className={primaryBtn} type="button" onClick={commitCount} disabled={saving || !canEditActive || !activeStats.complete}><CheckCircle2 size={15} /> Bevezetés</button>
                {canEditActive ? <button className={redBtn} type="button" onClick={deleteCount} disabled={saving}><Trash2 size={15} /> Törlés</button> : null}
              </div>
            </div>

            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Rendszer szerint" value={formatQty(activeStats.expected)} hint={`${formatQty(activeStats.lines)} sor`} icon={<ClipboardList size={18} />} />
              <StatCard label="Megszámolva" value={formatQty(activeStats.counted)} hint={`${formatQty(activeStats.countedLines)} / ${formatQty(activeStats.lines)} sor`} icon={<CheckCircle2 size={18} />} tone="green" />
              <StatCard label="Hiány" value={formatQty(activeStats.missing)} hint={`${formatMoney(activeStats.missingSell)} RON eladási értéken`} icon={<AlertTriangle size={18} />} tone="red" />
              <StatCard label="Többlet" value={formatQty(activeStats.extra)} hint={`${formatMoney(activeStats.extraSell)} RON eladási értéken`} icon={<PackageCheck size={18} />} tone="green" />
              <StatCard label="Nettó eltérés" value={`${activeStats.net > 0 ? "+" : ""}${formatQty(activeStats.net)}`} hint={`${formatMoney(activeStats.diffSell)} RON eladási értéken`} icon={<SlidersHorizontal size={18} />} tone={activeStats.net < 0 ? "red" : activeStats.net > 0 ? "green" : "neutral"} />
            </div>

            <div className="flex flex-col gap-3 border-y border-white/10 bg-[#404a5b]/55 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {([
                  ["all", "Minden sor"],
                  ["uncounted", "Nincs számolva"],
                  ["ok", "Egyezik"],
                  ["missing", "Hiány"],
                  ["extra", "Többlet"],
                ] as [LineFilter, string][]).map(([key, text]) => (
                  <button key={key} type="button" className={lineFilter === key ? chipActive : chipIdle} onClick={() => setLineFilter(key)}>{text}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={btnSoft} type="button" onClick={setVisibleToExpected} disabled={!canEditActive}>Látható sorok = rendszer</button>
                <button className={btnSoft} type="button" onClick={clearVisible} disabled={!canEditActive}>Látható ürítés</button>
              </div>
            </div>

            <div className="hidden overflow-auto lg:block">
              <table className="w-full min-w-[1120px] border-collapse text-sm">
                <thead className="bg-[#263247] text-xs uppercase tracking-wide text-white">
                  <tr>
                    <th className="px-4 py-3 text-left">Termék</th>
                    <th className="px-4 py-3 text-left">Szín</th>
                    <th className="px-4 py-3 text-left">Méret</th>
                    <th className="px-4 py-3 text-right">Rendszer</th>
                    <th className="px-4 py-3 text-right">Talált</th>
                    <th className="px-4 py-3 text-right">Eltérés</th>
                    <th className="px-4 py-3 text-right">Érték</th>
                    <th className="px-4 py-3 text-left">Megjegyzés</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLines.map((line) => {
                    const diff = lineDiff(line, drafts);
                    const img = getImageSrc(line);
                    return (
                      <tr key={line.id} className="border-t border-white/10 hover:bg-white/[0.04]">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl border border-white/14 bg-white/90">
                              {img ? <img src={img} alt="" className="h-full w-full object-contain" /> : <ImageIcon size={18} className="text-slate-400" />}
                            </div>
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#9ee4e2]">{line.brand_name || "-"} <span className="text-white/50 normal-case">{line.category_name_ro || ""}</span></div>
                              <div className="font-semibold text-white">{productTitle(line)}</div>
                              <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] text-white/74"><Barcode size={12} /> {line.display_barcode || line.barcode || "-"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-white/85">{line.color_name || line.color_code || "-"}</td>
                        <td className="px-4 py-3 text-white/85">{line.size || "-"}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatQty(line.expected_qty)}</td>
                        <td className="px-4 py-3 text-right"><input className={qtyInput} disabled={!canEditActive} inputMode="numeric" value={drafts[line.id]?.countedQty || ""} onChange={(e) => updateDraft(line.id, { countedQty: e.target.value.replace(/[^0-9]/g, "") })} /></td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${diff === null ? "text-white/45" : diff < 0 ? "text-red-200" : diff > 0 ? "text-emerald-200" : "text-white"}`}>{diff === null ? "-" : `${diff > 0 ? "+" : ""}${formatQty(diff)}`}</td>
                        <td className={`px-4 py-3 text-right tabular-nums ${diff === null ? "text-white/45" : diff < 0 ? "text-red-200" : diff > 0 ? "text-emerald-200" : "text-white/72"}`}>{diff === null ? "-" : `${formatMoney(diff * n(line.sell_price))} RON`}</td>
                        <td className="px-4 py-3"><input className={`${input} w-full`} disabled={!canEditActive} value={drafts[line.id]?.note || ""} onChange={(e) => updateDraft(line.id, { note: e.target.value })} placeholder="Megjegyzés" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 p-4 lg:hidden">
              {filteredLines.map((line) => {
                const diff = lineDiff(line, drafts);
                const img = getImageSrc(line);
                return (
                  <div key={line.id} className="rounded-2xl border border-white/14 bg-white/[0.05] p-3">
                    <div className="flex gap-3">
                      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/14 bg-white/90">
                        {img ? <img src={img} alt="" className="h-full w-full object-contain" /> : <ImageIcon size={18} className="text-slate-400" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-[#9ee4e2]">{line.brand_name || "-"}</div>
                        <div className="font-semibold text-white">{productTitle(line)}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-white/70"><span className="rounded-full bg-white/[0.08] px-2 py-0.5">{line.color_name || "-"}</span><span className="rounded-full bg-white/[0.08] px-2 py-0.5">{line.size || "-"}</span><span className="rounded-full bg-white/[0.08] px-2 py-0.5">{line.display_barcode || line.barcode || "-"}</span></div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-xl bg-white/[0.06] p-2"><div className="text-white/50">Rendszer</div><div className="text-base font-semibold">{formatQty(line.expected_qty)}</div></div>
                      <div className="rounded-xl bg-white/[0.06] p-2"><div className="text-white/50">Talált</div><input className={`${qtyInput} mt-1 w-full`} disabled={!canEditActive} inputMode="numeric" value={drafts[line.id]?.countedQty || ""} onChange={(e) => updateDraft(line.id, { countedQty: e.target.value.replace(/[^0-9]/g, "") })} /></div>
                      <div className="rounded-xl bg-white/[0.06] p-2"><div className="text-white/50">Eltérés</div><div className={`text-base font-semibold ${diff === null ? "text-white/45" : diff < 0 ? "text-red-200" : diff > 0 ? "text-emerald-200" : "text-white"}`}>{diff === null ? "-" : `${diff > 0 ? "+" : ""}${formatQty(diff)}`}</div></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <section className={panel}>
            <div className={panelHead}>
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold"><PackageCheck size={16} /> Aktuális készlet előnézet</div>
                <div className="mt-1 text-xs text-white/58">Ebből készül az új leltár nyitó listája.</div>
              </div>
              <div className="text-xs text-white/60">{filteredStockRows.length} sor</div>
            </div>
            <div className="hidden overflow-auto lg:block">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead className="bg-[#263247] text-xs uppercase tracking-wide text-white">
                  <tr><th className="px-4 py-3 text-left">Termék</th><th className="px-4 py-3 text-left">Szín</th><th className="px-4 py-3 text-left">Méret</th><th className="px-4 py-3 text-right">Készlet</th><th className="px-4 py-3 text-right">Foglalt</th><th className="px-4 py-3 text-right">Elérhető</th></tr>
                </thead>
                <tbody>{filteredStockRows.map((row) => <tr key={`${row.location_id}-${row.variant_id}`} className="border-t border-white/10 hover:bg-white/[0.04]"><td className="px-4 py-3"><div className="font-semibold">{productTitle(row)}</div><div className="mt-1 text-xs text-white/55">{row.brand_name || "-"} · Vonalkód: {row.display_barcode || row.barcode || "-"}</div></td><td className="px-4 py-3">{row.color_name || row.color_code || "-"}</td><td className="px-4 py-3">{row.size || "-"}</td><td className="px-4 py-3 text-right font-semibold">{formatQty(row.qty)}</td><td className="px-4 py-3 text-right">{formatQty(row.reserved_qty)}</td><td className="px-4 py-3 text-right">{formatQty(row.available_qty)}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="grid gap-3 p-4 lg:hidden">{filteredStockRows.map((row) => <div key={`${row.location_id}-${row.variant_id}`} className="rounded-2xl border border-white/14 bg-white/[0.05] p-3"><div className="font-semibold">{productTitle(row)}</div><div className="mt-1 text-xs text-white/60">{row.brand_name || "-"} · {row.color_name || "-"} · {row.size || "-"}</div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-white/[0.06] p-2"><div className="text-white/50">Készlet</div><b>{formatQty(row.qty)}</b></div><div className="rounded-xl bg-white/[0.06] p-2"><div className="text-white/50">Foglalt</div><b>{formatQty(row.reserved_qty)}</b></div><div className="rounded-xl bg-white/[0.06] p-2"><div className="text-white/50">Elérhető</div><b>{formatQty(row.available_qty)}</b></div></div></div>)}</div>
          </section>
        )}

        {loading ? <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border border-white/14 bg-[#263247] px-4 py-2 text-xs text-white shadow-lg">Betöltés...</div> : null}
      </div>
    </div>
  );
}
