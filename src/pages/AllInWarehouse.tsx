import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  ChevronDown,
  ChevronUp,
  Edit3,
  Eye,
  Filter,
  ImagePlus,
  RefreshCw,
  Save,
  Search,
  X,
} from "lucide-react";

const page = "min-h-screen bg-[#4b5362] px-3 py-5 text-white font-normal sm:px-4 sm:py-7";
const shell = "mx-auto max-w-7xl space-y-4";
const panel = "rounded-2xl border border-white/14 bg-white/[0.07] shadow-lg";
const panelHead = "flex items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b] px-4 py-3";
const btn = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/20 bg-[#354153] px-3 text-xs text-white hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const btnSoft = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.08] px-3 text-xs text-white hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const dangerBtn = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-rose-300/35 bg-rose-600 px-3 text-xs text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const input = "h-10 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-sm text-white outline-none placeholder:text-white/45 focus:border-white/45";
const select = "h-10 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-sm text-white outline-none focus:border-white/45";
const label = "grid gap-1.5 text-xs text-white/70";
const chip = "rounded-full border border-white/12 bg-white/[0.08] px-2.5 py-1 text-xs text-white/70";
const modalWrap = "fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-3 py-4 backdrop-blur-sm sm:items-center";
const modal = "max-h-[92vh] w-full max-w-5xl overflow-auto rounded-2xl border border-white/16 bg-[#4b5362] shadow-2xl";

type InventoryItem = {
  variant_id: string;
  internal_sku?: string | null;
  barcode?: string | null;
  image_url?: string | null;
  brand_name?: string | null;
  brand_code?: string | null;
  supplier_names?: string | null;
  supplier_codes?: string | null;
  supplier_ids?: string | null;
  suppliers?: Array<{ id?: string; code?: string; name?: string }> | null;
  model_id?: string | null;
  model_code?: string | null;
  title_ro?: string | null;
  title_hu?: string | null;
  gender?: string | null;
  product_type?: string | null;
  season?: string | null;
  material?: string | null;
  model_status?: string | null;
  category_code?: string | null;
  category_name_ro?: string | null;
  category_name_hu?: string | null;
  color_code?: string | null;
  color_name?: string | null;
  color_hex?: string | null;
  size?: string | null;
  buy_price?: string | number | null;
  sell_price?: string | number | null;
  compare_at_price?: string | number | null;
  variant_status?: string | null;
  total_qty?: number | string | null;
  total_reserved_qty?: number | string | null;
  available_qty?: number | string | null;
  last_stock_movement_at?: string | null;
  last_incoming_at?: string | null;
};

type MetaItem = { id: string; code?: string; name?: string; name_ro?: string; name_hu?: string; shopify_collection_handle?: string | null; sort_order?: number | string | null; is_active?: boolean };
type GenderType = { code: string; name: string; sort_order?: number | string | null; is_active?: boolean };
type SupplierBrandLink = { id: string; supplier_id: string; brand_id: string; supplier_name?: string; brand_name?: string; is_preferred?: boolean; is_active?: boolean };
type StockItem = { variant_id: string; location_code?: string; location_name?: string; qty?: number | string; reserved_qty?: number | string; available_qty?: number | string };
type StockFilter = "all" | "available" | "out" | "reserved" | "missing" | "watch";
type ImageFilter = "all" | "with" | "missing";
type SortMode = "name" | "brand" | "stock_desc" | "stock_asc" | "value_desc" | "missing";

type DetailResponse = {
  item: any;
  stock: any[];
  supplierCodes: any[];
  movements: any[];
};

type EditForm = {
  titleRo: string;
  titleHu: string;
  descriptionRo: string;
  gender: string;
  productType: string;
  season: string;
  material: string;
  shopifyTitle: string;
  modelStatus: string;
  brandCode: string;
  categoryCode: string;
  barcode: string;
  colorCode: string;
  colorName: string;
  colorHex: string;
  size: string;
  buyPrice: string;
  sellPrice: string;
  compareAtPrice: string;
  weightGrams: string;
  imageUrl: string;
  variantStatus: string;
};

function goHome() {
  window.location.hash = "#allin";
}

function n(v: unknown) {
  const x = Number(v || 0);
  return Number.isFinite(x) ? x : 0;
}

function money(v: unknown) {
  if (v === null || v === undefined || v === "") return "-";
  const x = Number(v);
  if (!Number.isFinite(x)) return String(v);
  return x.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateShort(v: unknown) {
  if (!v) return "-";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("ro-RO");
}

function hasMissingData(it: InventoryItem) {
  return !it.image_url || !it.barcode || !it.sell_price || !it.buy_price || !it.title_ro || !it.size;
}

function missingLabels(it: InventoryItem) {
  const out = [];
  if (!it.image_url) out.push("kép");
  if (!it.barcode) out.push("vonalkód");
  if (!it.buy_price) out.push("vételár");
  if (!it.sell_price) out.push("eladási ár");
  if (!it.title_ro) out.push("név");
  if (!it.size) out.push("méret");
  return out;
}

function normalizeSearch(v: unknown) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function splitCsv(v: unknown) {
  return String(v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}


function categoryLabel(c: MetaItem) {
  return c.name_hu || c.name_ro || c.name || c.code || "-";
}

function genderLabel(code: unknown, items: GenderType[]) {
  const key = normalizeSearch(code);
  return items.find((g) => normalizeSearch(g.code) === key)?.name || String(code || "-");
}

function itemSupplierText(it: InventoryItem) {
  if (it.supplier_names) return it.supplier_names;
  const names = (it.suppliers || []).map((s) => s.name).filter(Boolean) as string[];
  return names.length ? names.join(", ") : "-";
}

function supplierMatches(it: InventoryItem, selected: string) {
  if (selected === "all") return true;
  const key = normalizeSearch(selected);
  const values = [
    ...splitCsv(it.supplier_ids),
    ...splitCsv(it.supplier_codes),
    ...splitCsv(it.supplier_names),
    ...(it.suppliers || []).flatMap((s) => [s.id, s.code, s.name]),
  ].map(normalizeSearch);
  return values.some((x) => x === key);
}

function itemMatchesSearch(it: InventoryItem, query: string) {
  const q = normalizeSearch(query);
  if (!q) return true;
  const haystack = [
    it.title_ro,
    it.title_hu,
    it.brand_name,
    it.brand_code,
    itemSupplierText(it),
    it.supplier_codes,
    it.internal_sku,
    it.barcode,
    it.model_code,
    it.category_name_ro,
    it.category_name_hu,
    it.color_name,
    it.color_code,
    it.size,
  ].map(normalizeSearch).join(" ");
  return haystack.includes(q);
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiInventory() {
  const qs = new URLSearchParams();
  qs.set("limit", "500");
  return fetchJSON<{ items: InventoryItem[] }>(`/api/aif/inventory?${qs.toString()}`);
}

async function apiMeta() {
  return fetchJSON<{ suppliers: MetaItem[]; brands: MetaItem[]; categories: MetaItem[]; genderTypes?: GenderType[]; locations: MetaItem[]; supplierBrands?: SupplierBrandLink[] }>("/api/aif/meta");
}

async function apiStock() {
  return fetchJSON<{ items: StockItem[] }>("/api/aif/stock");
}

async function apiVariantDetail(id: string) {
  return fetchJSON<DetailResponse>(`/api/aif/variants/${encodeURIComponent(id)}`);
}

async function apiVariantUpdate(id: string, payload: Record<string, unknown>) {
  return fetchJSON<{ ok: true }>(`/api/aif/variants/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}


async function apiSaveCategory(id: string, payload: Record<string, unknown>) {
  const url = id ? `/api/aif/categories/${encodeURIComponent(id)}` : "/api/aif/categories";
  return fetchJSON<{ item: MetaItem }>(url, {
    method: id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function apiDeleteCategory(id: string) {
  return fetchJSON<{ ok: true; mode?: string }>(`/api/aif/categories/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function apiSaveGenderType(code: string, payload: Record<string, unknown>) {
  const url = code ? `/api/aif/gender-types/${encodeURIComponent(code)}` : "/api/aif/gender-types";
  return fetchJSON<{ item: GenderType }>(url, {
    method: code ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function apiDeleteGenderType(code: string) {
  return fetchJSON<{ ok: true; mode?: string }>(`/api/aif/gender-types/${encodeURIComponent(code)}`, { method: "DELETE" });
}

async function uploadImage(file: File, variantId: string) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", `products/${variantId}`);
  fd.append("name", file.name);
  return fetchJSON<{ key: string; url: string }>("/api/uploads/r2", { method: "POST", body: fd });
}

function emptyForm(): EditForm {
  return {
    titleRo: "",
    titleHu: "",
    descriptionRo: "",
    gender: "unisex",
    productType: "",
    season: "",
    material: "",
    shopifyTitle: "",
    modelStatus: "draft",
    brandCode: "",
    categoryCode: "",
    barcode: "",
    colorCode: "",
    colorName: "",
    colorHex: "",
    size: "",
    buyPrice: "",
    sellPrice: "",
    compareAtPrice: "",
    weightGrams: "",
    imageUrl: "",
    variantStatus: "active",
  };
}

function formFromDetail(d: DetailResponse): EditForm {
  const x = d.item || {};
  return {
    titleRo: x.title_ro || "",
    titleHu: x.title_hu || "",
    descriptionRo: x.description_ro || "",
    gender: x.gender || "unisex",
    productType: x.product_type || "",
    season: x.season || "",
    material: x.material || "",
    shopifyTitle: x.shopify_title || "",
    modelStatus: x.model_status || "draft",
    brandCode: x.brand_code || "",
    categoryCode: x.category_code || "",
    barcode: x.barcode || "",
    colorCode: x.color_code || "",
    colorName: x.color_name || "",
    colorHex: x.color_hex || "",
    size: x.size || "",
    buyPrice: x.buy_price == null ? "" : String(x.buy_price),
    sellPrice: x.sell_price == null ? "" : String(x.sell_price),
    compareAtPrice: x.compare_at_price == null ? "" : String(x.compare_at_price),
    weightGrams: x.weight_grams == null ? "" : String(x.weight_grams),
    imageUrl: x.image_url || "",
    variantStatus: x.status || "active",
  };
}


function nextSortOrder(rows: Array<{ sort_order?: number | string | null }>) {
  const nums = rows
    .map((x) => Number(x.sort_order))
    .filter((x) => Number.isFinite(x) && x > 0);
  if (!nums.length) return "10";
  const max = Math.max(...nums);
  const useTens = nums.some((x) => x >= 10 && x % 10 === 0);
  return String(max + (useTens ? 10 : 1));
}

export default function AllInWarehouse() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [stockRows, setStockRows] = useState<StockItem[]>([]);
  const [suppliers, setSuppliers] = useState<MetaItem[]>([]);
  const [brands, setBrands] = useState<MetaItem[]>([]);
  const [supplierBrands, setSupplierBrands] = useState<SupplierBrandLink[]>([]);
  const [categories, setCategories] = useState<MetaItem[]>([]);
  const [genderTypes, setGenderTypes] = useState<GenderType[]>([]);
  const [locations, setLocations] = useState<MetaItem[]>([]);
  const [search, setSearch] = useState("");
  const [supplier, setSupplier] = useState("all");
  const [brand, setBrand] = useState("all");
  const [category, setCategory] = useState("all");
  const [gender, setGender] = useState("all");
  const [location, setLocation] = useState("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [listOpen, setListOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [edit, setEdit] = useState<EditForm>(emptyForm());
  const [detailBusy, setDetailBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [taxonomyOpen, setTaxonomyOpen] = useState(false);
  const [taxonomyTab, setTaxonomyTab] = useState<"categories" | "genders">("categories");
  const [taxonomyBusy, setTaxonomyBusy] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ id: "", nameRo: "", nameHu: "", sortOrder: "10" });
  const [genderForm, setGenderForm] = useState({ code: "", name: "", sortOrder: "10" });
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "category" | "gender"; id: string; name: string } | null>(null);

  const stockMap = useMemo(() => {
    const map = new Map<string, StockItem[]>();
    for (const s of stockRows) {
      const id = String(s.variant_id || "");
      if (!id) continue;
      const arr = map.get(id) || [];
      arr.push(s);
      map.set(id, arr);
    }
    return map;
  }, [stockRows]);

  const nextCategorySortOrder = useMemo(() => nextSortOrder(categories), [categories]);
  const nextGenderSortOrder = useMemo(() => nextSortOrder(genderTypes), [genderTypes]);

  useEffect(() => {
    if (!taxonomyOpen) return;
    if (taxonomyTab === "categories" && !categoryForm.id && !categoryForm.nameRo.trim() && !categoryForm.nameHu.trim()) {
      setCategoryForm((x) => x.sortOrder === nextCategorySortOrder ? x : { ...x, sortOrder: nextCategorySortOrder });
    }
    if (taxonomyTab === "genders" && !genderForm.code && !genderForm.name.trim()) {
      setGenderForm((x) => x.sortOrder === nextGenderSortOrder ? x : { ...x, sortOrder: nextGenderSortOrder });
    }
  }, [
    taxonomyOpen,
    taxonomyTab,
    nextCategorySortOrder,
    nextGenderSortOrder,
    categoryForm.id,
    categoryForm.nameRo,
    categoryForm.nameHu,
    genderForm.code,
    genderForm.name,
  ]);

  const selectedSupplier = useMemo(() => {
    if (supplier === "all") return null;
    const selected = normalizeSearch(supplier);
    return suppliers.find((s) => [s.id, s.code, s.name].map(normalizeSearch).some((x) => x === selected)) || null;
  }, [supplier, suppliers]);

  const brandOptions = useMemo(() => {
    if (!selectedSupplier) return brands;
    const linkedBrandIds = new Set(
      supplierBrands
        .filter((x) => x.is_active !== false && normalizeSearch(x.supplier_id) === normalizeSearch(selectedSupplier.id))
        .map((x) => String(x.brand_id))
    );
    return brands.filter((b) => linkedBrandIds.has(String(b.id)));
  }, [brands, supplierBrands, selectedSupplier]);

  useEffect(() => {
    if (brand === "all") return;
    const current = normalizeSearch(brand);
    const valid = brandOptions.some((b) => [b.id, b.code, b.name].map(normalizeSearch).some((x) => x === current));
    if (!valid) setBrand("all");
  }, [brand, brandOptions]);

  const filtered = useMemo(() => {
    let out = [...items];
    if (search.trim()) out = out.filter((x) => itemMatchesSearch(x, search));
    if (supplier !== "all") out = out.filter((x) => supplierMatches(x, supplier));
    if (brand !== "all") out = out.filter((x) => (x.brand_code || x.brand_name || "") === brand || x.brand_name === brand);
    if (category !== "all") out = out.filter((x) => (x.category_code || x.category_name_ro || "") === category || x.category_name_ro === category);
    if (gender !== "all") out = out.filter((x) => (x.gender || "") === gender);
    if (imageFilter === "with") out = out.filter((x) => Boolean(x.image_url));
    if (imageFilter === "missing") out = out.filter((x) => !x.image_url);
    if (location !== "all") {
      out = out.filter((x) => (stockMap.get(x.variant_id) || []).some((s) => (s.location_code === location || s.location_name === location) && n(s.qty) > 0));
    }
    if (stockFilter === "available") out = out.filter((x) => n(x.available_qty) > 0);
    if (stockFilter === "out") out = out.filter((x) => n(x.total_qty) <= 0);
    if (stockFilter === "reserved") out = out.filter((x) => n(x.total_reserved_qty) > 0);
    if (stockFilter === "missing") out = out.filter(hasMissingData);
    if (stockFilter === "watch") out = out.filter((x) => n(x.total_qty) > 0 && hasMissingData(x));
    out.sort((a, b) => {
      if (sortMode === "brand") return String(a.brand_name || "").localeCompare(String(b.brand_name || ""), "hu");
      if (sortMode === "stock_desc") return n(b.total_qty) - n(a.total_qty);
      if (sortMode === "stock_asc") return n(a.total_qty) - n(b.total_qty);
      if (sortMode === "value_desc") return n(b.total_qty) * n(b.buy_price) - n(a.total_qty) * n(a.buy_price);
      if (sortMode === "missing") return Number(hasMissingData(b)) - Number(hasMissingData(a));
      return String(a.title_ro || "").localeCompare(String(b.title_ro || ""), "hu");
    });
    return out;
  }, [items, search, supplier, brand, category, gender, location, stockFilter, imageFilter, sortMode, stockMap]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, x) => {
        acc.variants += 1;
        acc.qty += n(x.total_qty);
        acc.reserved += n(x.total_reserved_qty);
        acc.available += n(x.available_qty);
        acc.value += n(x.total_qty) * n(x.buy_price);
        if (hasMissingData(x)) acc.missing += 1;
        if (n(x.total_qty) > 0 && hasMissingData(x)) acc.watch += 1;
        return acc;
      },
      { variants: 0, qty: 0, reserved: 0, available: 0, value: 0, missing: 0, watch: 0 }
    );
  }, [filtered]);

  const brandChart = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; value: number }>();
    for (const x of filtered) {
      const key = x.brand_name || "Nincs márka";
      const row = map.get(key) || { name: key, qty: 0, value: 0 };
      row.qty += n(x.total_qty);
      row.value += n(x.total_qty) * n(x.buy_price);
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.value - a.value).slice(0, 8);
  }, [filtered]);

  const locationChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of stockRows) {
      const key = s.location_name || s.location_code || "Ismeretlen";
      map.set(key, (map.get(key) || 0) + n(s.qty));
    }
    return [...map.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 8);
  }, [stockRows]);

  function resetCategoryForm() {
    setCategoryForm({ id: "", nameRo: "", nameHu: "", sortOrder: nextCategorySortOrder });
  }

  function editCategoryRow(c: MetaItem) {
    setTaxonomyTab("categories");
    setCategoryForm({
      id: String(c.id || c.code || ""),
      nameRo: String(c.name_ro || c.name || ""),
      nameHu: String(c.name_hu || ""),
      sortOrder: c.sort_order == null ? "100" : String(c.sort_order),
    });
  }

  function resetGenderForm() {
    setGenderForm({ code: "", name: "", sortOrder: nextGenderSortOrder });
  }

  function editGenderRow(g: GenderType) {
    setTaxonomyTab("genders");
    setGenderForm({ code: String(g.code || ""), name: String(g.name || ""), sortOrder: g.sort_order == null ? "100" : String(g.sort_order) });
  }

  async function saveCategoryForm() {
    if (!categoryForm.nameRo.trim()) {
      setMessage("A kategória neve kötelező.");
      return;
    }
    setTaxonomyBusy(true);
    try {
      await apiSaveCategory(categoryForm.id, {
        nameRo: categoryForm.nameRo,
        nameHu: categoryForm.nameHu,
        sortOrder: categoryForm.sortOrder,
      });
      resetCategoryForm();
      await load();
      setMessage("Kategória mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a kategóriát.");
    } finally {
      setTaxonomyBusy(false);
    }
  }

  async function saveGenderForm() {
    if (!genderForm.name.trim()) {
      setMessage("A nem megnevezése kötelező.");
      return;
    }
    setTaxonomyBusy(true);
    try {
      await apiSaveGenderType(genderForm.code, {
        name: genderForm.name,
        sortOrder: genderForm.sortOrder,
      });
      resetGenderForm();
      await load();
      setMessage("Nem törzsadat mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a nem törzsadatot.");
    } finally {
      setTaxonomyBusy(false);
    }
  }

  async function confirmDeleteTaxonomy() {
    if (!deleteTarget) return;
    setTaxonomyBusy(true);
    try {
      if (deleteTarget.kind === "category") await apiDeleteCategory(deleteTarget.id);
      if (deleteTarget.kind === "gender") await apiDeleteGenderType(deleteTarget.id);
      setDeleteTarget(null);
      await load();
      setMessage("Törzsadat frissítve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült módosítani a törzsadatot.");
    } finally {
      setTaxonomyBusy(false);
    }
  }

  async function load() {
    setBusy(true);
    setMessage("");
    try {
      const [inv, meta, stock] = await Promise.all([apiInventory(), apiMeta(), apiStock()]);
      setItems(inv.items || []);
      setSuppliers(meta.suppliers || []);
      setBrands(meta.brands || []);
      setSupplierBrands(meta.supplierBrands || []);
      setCategories(meta.categories || []);
      setGenderTypes(meta.genderTypes || []);
      setLocations(meta.locations || []);
      setStockRows(stock.items || []);
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült betölteni a raktár adatait.");
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(id: string) {
    setDetailBusy(true);
    setMessage("");
    try {
      const d = await apiVariantDetail(id);
      setDetail(d);
      setEdit(formFromDetail(d));
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült betölteni a termékadatlapot.");
    } finally {
      setDetailBusy(false);
    }
  }

  async function saveDetail() {
    if (!detail?.item?.id) return;
    setSaving(true);
    setMessage("");
    try {
      await apiVariantUpdate(detail.item.id, {
        titleRo: edit.titleRo,
        titleHu: edit.titleHu,
        descriptionRo: edit.descriptionRo,
        gender: edit.gender,
        productType: edit.productType,
        season: edit.season,
        material: edit.material,
        shopifyTitle: edit.shopifyTitle,
        modelStatus: edit.modelStatus,
        brandCode: edit.brandCode || null,
        categoryCode: edit.categoryCode || null,
        barcode: edit.barcode,
        colorCode: edit.colorCode,
        colorName: edit.colorName,
        colorHex: edit.colorHex,
        size: edit.size,
        buyPrice: edit.buyPrice,
        sellPrice: edit.sellPrice,
        compareAtPrice: edit.compareAtPrice,
        weightGrams: edit.weightGrams,
        imageUrl: edit.imageUrl,
        status: edit.variantStatus,
      });
      const d = await apiVariantDetail(detail.item.id);
      setDetail(d);
      setEdit(formFromDetail(d));
      await load();
      setMessage("A termékadatok mentése megtörtént.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a termékadatokat.");
    } finally {
      setSaving(false);
    }
  }

  async function onImageSelected(file: File | null) {
    if (!file || !detail?.item?.id) return;
    setSaving(true);
    setMessage("");
    try {
      const up = await uploadImage(file, detail.item.id);
      setEdit((x) => ({ ...x, imageUrl: up.url }));
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült feltölteni a képet.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxBrandValue = Math.max(1, ...brandChart.map((x) => x.value));
  const maxLocationQty = Math.max(1, ...locationChart.map((x) => x.qty));

  return (
    <main className={page}>
      <div className={shell}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-white/60">AllInFashion</p>
            <h1 className="text-2xl tracking-tight">Raktár</h1>
            <p className="mt-1 max-w-3xl text-sm text-white/70">Termék- és készletközpont kereséssel, szűréssel, képekkel, készletértékkel és termékadat-szerkesztéssel.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={btnSoft} onClick={() => setTaxonomyOpen(true)}><Edit3 size={16} /> Törzsadatok</button>
            <button className={btnSoft} onClick={load} disabled={busy}><RefreshCw size={16} /> Frissítés</button>
            <button className={btn} onClick={goHome}><ArrowLeft size={16} /> Vissza</button>
          </div>
        </header>

        {message && <div className="rounded-xl border border-white/20 bg-[#404a5b] px-4 py-3 text-sm text-white/85">{message}</div>}

        <section className={panel}>
          <div className={panelHead}>
            <div className="flex items-center gap-2"><Filter size={17} /><span>Szűrés és keresés</span></div>
            <button className={btnSoft} onClick={() => setFiltersOpen((x) => !x)}>{filtersOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {filtersOpen ? "Bezárás" : "Megnyitás"}</button>
          </div>
          {filtersOpen && (
            <div className="grid gap-3 p-4 md:grid-cols-4">
              <label className={`${label} md:col-span-2`}>
                Keresés
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 text-white/40" size={18} />
                  <input className={`${input} w-full pl-10`} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Név, beszállító, márka, vonalkód, szín, méret" />
                </div>
              </label>
              <label className={label}>Beszállító
                <select className={select} value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                  <option value="all">Összes</option>
                  {suppliers.map((s) => <option key={s.id} value={s.code || s.name || s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className={label}>Márka
                <select className={select} value={brand} onChange={(e) => setBrand(e.target.value)}>
                  <option value="all">{selectedSupplier ? "Összes kapcsolt márka" : "Összes"}</option>
                  {brandOptions.map((b) => <option key={b.id} value={b.code || b.name || b.id}>{b.name}</option>)}
                  {selectedSupplier && !brandOptions.length && <option value="" disabled>Nincs kapcsolt márka</option>}
                </select>
              </label>
              <label className={label}>Kategória
                <select className={select} value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="all">Összes</option>
                  {categories.map((c) => <option key={c.id} value={c.code || c.name_ro || c.id}>{categoryLabel(c)}</option>)}
                </select>
              </label>
              <label className={label}>Nem
                <select className={select} value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="all">Összes</option>
                  {genderTypes.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
                </select>
              </label>
              <label className={label}>Cél hely
                <select className={select} value={location} onChange={(e) => setLocation(e.target.value)}>
                  <option value="all">Összes</option>
                  {locations.map((l) => <option key={l.id} value={l.code || l.name || l.id}>{l.name}</option>)}
                </select>
              </label>
              <label className={label}>Készlet állapot
                <select className={select} value={stockFilter} onChange={(e) => setStockFilter(e.target.value as StockFilter)}>
                  <option value="all">Összes</option>
                  <option value="available">Készleten</option>
                  <option value="out">Nincs készleten</option>
                  <option value="reserved">Van foglalás</option>
                  <option value="missing">Hiányzó adat</option>
                  <option value="watch">Figyelendő készlet</option>
                </select>
              </label>
              <label className={label}>Kép
                <select className={select} value={imageFilter} onChange={(e) => setImageFilter(e.target.value as ImageFilter)}>
                  <option value="all">Összes</option>
                  <option value="with">Van kép</option>
                  <option value="missing">Hiányzik kép</option>
                </select>
              </label>
              <label className={label}>Sorrend
                <select className={select} value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
                  <option value="name">Terméknév</option>
                  <option value="brand">Márka</option>
                  <option value="stock_desc">Készlet csökkenő</option>
                  <option value="stock_asc">Készlet növekvő</option>
                  <option value="value_desc">Készletérték</option>
                  <option value="missing">Hiányzó adatok</option>
                </select>
              </label>
              <div className="flex items-end gap-2">
                <button className={btn} onClick={load} disabled={busy}><Search size={16} /> Keresés</button>
                <button className={btnSoft} onClick={() => { setSupplier("all"); setBrand("all"); setCategory("all"); setGender("all"); setLocation("all"); setStockFilter("all"); setImageFilter("all"); setSortMode("name"); }}>Alaphelyzet</button>
              </div>
            </div>
          )}
        </section>

        <section className={panel}>
          <div className={panelHead}>
            <div className="flex items-center gap-2"><Boxes size={17} /><span>Áttekintés</span></div>
            <button className={btnSoft} onClick={() => setSummaryOpen((x) => !x)}>{summaryOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {summaryOpen ? "Bezárás" : "Megnyitás"}</button>
          </div>
          {summaryOpen && (
            <div className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <div className="rounded-xl bg-[#3f4959] p-3"><p className="text-xs text-white/55">Variáns</p><p className="mt-1 text-xl">{totals.variants}</p></div>
                <div className="rounded-xl bg-[#3f4959] p-3"><p className="text-xs text-white/55">Össz készlet</p><p className="mt-1 text-xl">{totals.qty}</p></div>
                <div className="rounded-xl bg-[#3f4959] p-3"><p className="text-xs text-white/55">Elérhető</p><p className="mt-1 text-xl">{totals.available}</p></div>
                <div className="rounded-xl bg-[#3f4959] p-3"><p className="text-xs text-white/55">Foglalt</p><p className="mt-1 text-xl">{totals.reserved}</p></div>
                <div className="rounded-xl bg-[#3f4959] p-3"><p className="text-xs text-white/55">Készletérték</p><p className="mt-1 text-xl">{money(totals.value)}</p></div>
                <div className="rounded-xl bg-[#3f4959] p-3"><p className="text-xs text-white/55">Figyelendő</p><p className="mt-1 text-xl">{totals.watch}</p></div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                  <p className="mb-3 text-sm text-white/80">Márkák készletérték szerint</p>
                  <div className="space-y-2">
                    {brandChart.map((x) => (
                      <div key={x.name} className="grid gap-1">
                        <div className="flex justify-between gap-3 text-xs text-white/65"><span>{x.name}</span><span>{money(x.value)}</span></div>
                        <div className="h-2 rounded-full bg-black/20"><div className="h-2 rounded-full bg-white/45" style={{ width: `${Math.max(4, (x.value / maxBrandValue) * 100)}%` }} /></div>
                      </div>
                    ))}
                    {!brandChart.length && <p className="text-sm text-white/55">Nincs megjeleníthető adat.</p>}
                  </div>
                </div>
                <div className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                  <p className="mb-3 text-sm text-white/80">Készlet célhelyenként</p>
                  <div className="space-y-2">
                    {locationChart.map((x) => (
                      <div key={x.name} className="grid gap-1">
                        <div className="flex justify-between gap-3 text-xs text-white/65"><span>{x.name}</span><span>{x.qty}</span></div>
                        <div className="h-2 rounded-full bg-black/20"><div className="h-2 rounded-full bg-white/45" style={{ width: `${Math.max(4, (x.qty / maxLocationQty) * 100)}%` }} /></div>
                      </div>
                    ))}
                    {!locationChart.length && <p className="text-sm text-white/55">Nincs megjeleníthető adat.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className={panel}>
          <div className={panelHead}>
            <div className="flex items-center gap-2"><Eye size={17} /><span>Terméklista</span><span className={chip}>{filtered.length} találat</span></div>
            <button className={btnSoft} onClick={() => setListOpen((x) => !x)}>{listOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {listOpen ? "Bezárás" : "Megnyitás"}</button>
          </div>
          {listOpen && (
            <div className="p-4">
              <div className="hidden overflow-auto rounded-xl border border-white/10 lg:block">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#394353] text-xs uppercase text-white/60">
                    <tr>
                      <th className="px-3 py-3">Kép</th>
                      <th className="px-3 py-3">Termék</th>
                      <th className="px-3 py-3">Beszállító</th>
                      <th className="px-3 py-3">Márka</th>
                      <th className="px-3 py-3">Kategória</th>
                      <th className="px-3 py-3">Szín</th>
                      <th className="px-3 py-3">Méret</th>
                      <th className="px-3 py-3 text-right">Készlet</th>
                      <th className="px-3 py-3 text-right">Elérhető</th>
                      <th className="px-3 py-3 text-right">Vételár</th>
                      <th className="px-3 py-3 text-right">Eladási ár</th>
                      <th className="px-3 py-3">Állapot</th>
                      <th className="px-3 py-3 text-right">Művelet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {filtered.map((it) => (
                      <tr key={it.variant_id} className="bg-white/[0.03] hover:bg-white/[0.06]">
                        <td className="px-3 py-3">{it.image_url ? <img src={it.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-black/20 text-white/35"><ImagePlus size={18} /></div>}</td>
                        <td className="px-3 py-3"><div>{it.title_ro || "-"}</div><div className="mt-1 text-xs text-white/45">{it.barcode ? `Vonalkód: ${it.barcode}` : "Nincs vonalkód"}</div></td>
                        <td className="px-3 py-3">{itemSupplierText(it)}</td>
                        <td className="px-3 py-3">{it.brand_name || "-"}</td>
                        <td className="px-3 py-3">{it.category_name_hu || it.category_name_ro || "-"}</td>
                        <td className="px-3 py-3">{it.color_name || it.color_code || "-"}</td>
                        <td className="px-3 py-3">{it.size || "-"}</td>
                        <td className="px-3 py-3 text-right">{n(it.total_qty)}</td>
                        <td className="px-3 py-3 text-right">{n(it.available_qty)}</td>
                        <td className="px-3 py-3 text-right">{money(it.buy_price)}</td>
                        <td className="px-3 py-3 text-right">{money(it.sell_price)}</td>
                        <td className="px-3 py-3">{hasMissingData(it) ? <span className="rounded-full border border-amber-200/25 bg-amber-500/10 px-2 py-1 text-xs text-amber-100">Hiányzó adat</span> : <span className="rounded-full border border-emerald-200/20 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-100">Rendben</span>}</td>
                        <td className="px-3 py-3 text-right"><button className={btnSoft} onClick={() => openDetail(it.variant_id)}><Edit3 size={15} /> Részletek</button></td>
                      </tr>
                    ))}
                    {!filtered.length && <tr><td className="px-3 py-10 text-center text-white/55" colSpan={13}>Nincs megjeleníthető termék az AIF készletben.</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 lg:hidden">
                {filtered.map((it) => (
                  <article key={it.variant_id} className="rounded-xl border border-white/12 bg-white/[0.05] p-3">
                    <div className="flex gap-3">
                      {it.image_url ? <img src={it.image_url} alt="" className="h-20 w-20 rounded-xl object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-black/20 text-white/35"><ImagePlus size={20} /></div>}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{it.title_ro || "-"}</p>
                        <p className="mt-1 text-xs text-white/55">{itemSupplierText(it)} • {it.brand_name || "-"} • {it.color_name || it.color_code || "-"} • {it.size || "-"}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className={chip}>Készlet: {n(it.total_qty)}</span>
                          <span className={chip}>Elérhető: {n(it.available_qty)}</span>
                          {hasMissingData(it) && <span className="rounded-full border border-amber-200/25 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-100">Hiányzó adat</span>}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end"><button className={btnSoft} onClick={() => openDetail(it.variant_id)}><Edit3 size={15} /> Részletek</button></div>
                  </article>
                ))}
                {!filtered.length && <div className="rounded-xl border border-white/12 bg-white/[0.05] p-6 text-center text-sm text-white/60">Nincs megjeleníthető termék az AIF készletben.</div>}
              </div>
            </div>
          )}
        </section>
      </div>

      {taxonomyOpen && (
        <div className={modalWrap}>
          <div className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-2xl border border-white/16 bg-[#4b5362] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b] px-4 py-3">
              <div>
                <p className="text-sm text-white/65">Raktár törzsadatok</p>
                <h2 className="text-xl">Kategóriák és nemek kezelése</h2>
              </div>
              <button className={btnSoft} onClick={() => setTaxonomyOpen(false)}><X size={16} /> Bezárás</button>
            </div>
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap gap-2">
                <button className={taxonomyTab === "categories" ? btn : btnSoft} onClick={() => setTaxonomyTab("categories")}>Kategóriák</button>
                <button className={taxonomyTab === "genders" ? btn : btnSoft} onClick={() => setTaxonomyTab("genders")}>Nemek</button>
              </div>

              {taxonomyTab === "categories" && (
                <div className="grid gap-4 lg:grid-cols-[1fr,1.25fr]">
                  <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm text-white/85">{categoryForm.id ? "Kategória módosítása" : "Új kategória"}</p>
                      {categoryForm.id && <button className={btnSoft} onClick={resetCategoryForm}>Új kategória</button>}
                    </div>
                    <div className="grid gap-3">
                      <label className={label}>Megnevezés románul<input className={input} value={categoryForm.nameRo} onChange={(e) => setCategoryForm((x) => ({ ...x, nameRo: e.target.value }))} /></label>
                      <label className={label}>Megnevezés magyarul<input className={input} value={categoryForm.nameHu} onChange={(e) => setCategoryForm((x) => ({ ...x, nameHu: e.target.value }))} /></label>
                      <label className={label}>Sorrend
                        <input className={input} value={categoryForm.sortOrder} onChange={(e) => setCategoryForm((x) => ({ ...x, sortOrder: e.target.value }))} />
                        {!categoryForm.id && <span className="text-[11px] text-white/50">Következő javasolt sorrend: {nextCategorySortOrder}</span>}
                      </label>
                      <button className={btn} onClick={saveCategoryForm} disabled={taxonomyBusy}><Save size={16} /> Mentés</button>
                    </div>
                  </section>
                  <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                    <p className="mb-3 text-sm text-white/85">Kategória lista</p>
                    <div className="space-y-2">
                      {categories.map((c) => (
                        <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                          <div><p className="text-sm text-white">{categoryLabel(c)}</p>{c.name_ro && c.name_hu && <p className="text-xs text-white/55">{c.name_ro}</p>}</div>
                          <div className="flex gap-2">
                            <button className={btnSoft} onClick={() => editCategoryRow(c)}><Edit3 size={14} /> Módosítás</button>
                            <button className={dangerBtn} onClick={() => setDeleteTarget({ kind: "category", id: String(c.id), name: categoryLabel(c) })}>Törlés</button>
                          </div>
                        </div>
                      ))}
                      {!categories.length && <p className="text-sm text-white/55">Nincs aktív kategória.</p>}
                    </div>
                  </section>
                </div>
              )}

              {taxonomyTab === "genders" && (
                <div className="grid gap-4 lg:grid-cols-[1fr,1.25fr]">
                  <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm text-white/85">{genderForm.code ? "Nem módosítása" : "Új nem"}</p>
                      {genderForm.code && <button className={btnSoft} onClick={resetGenderForm}>Új nem</button>}
                    </div>
                    <div className="grid gap-3">
                      <label className={label}>Megnevezés<input className={input} value={genderForm.name} onChange={(e) => setGenderForm((x) => ({ ...x, name: e.target.value }))} /></label>
                      <label className={label}>Sorrend
                        <input className={input} value={genderForm.sortOrder} onChange={(e) => setGenderForm((x) => ({ ...x, sortOrder: e.target.value }))} />
                        {!genderForm.code && <span className="text-[11px] text-white/50">Következő javasolt sorrend: {nextGenderSortOrder}</span>}
                      </label>
                      <button className={btn} onClick={saveGenderForm} disabled={taxonomyBusy}><Save size={16} /> Mentés</button>
                    </div>
                  </section>
                  <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                    <p className="mb-3 text-sm text-white/85">Nemek listája</p>
                    <div className="space-y-2">
                      {genderTypes.map((g) => (
                        <div key={g.code} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                          <p className="text-sm text-white">{g.name}</p>
                          <div className="flex gap-2">
                            <button className={btnSoft} onClick={() => editGenderRow(g)}><Edit3 size={14} /> Módosítás</button>
                            <button className={dangerBtn} onClick={() => setDeleteTarget({ kind: "gender", id: String(g.code), name: g.name })}>Törlés</button>
                          </div>
                        </div>
                      ))}
                      {!genderTypes.length && <p className="text-sm text-white/55">Nincs aktív elem.</p>}
                    </div>
                  </section>
                </div>
              )}

              {deleteTarget && (
                <div className="rounded-xl border border-rose-200/25 bg-rose-500/10 p-4">
                  <p className="text-sm text-white">Törlés vagy inaktiválás megerősítése</p>
                  <p className="mt-1 text-sm text-white/70">{deleteTarget.name}</p>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button className={btnSoft} onClick={() => setDeleteTarget(null)}>Mégse</button>
                    <button className={dangerBtn} onClick={confirmDeleteTaxonomy} disabled={taxonomyBusy}>Megerősítés</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className={modalWrap}>
          <div className={modal}>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b] px-4 py-3">
              <div>
                <p className="text-sm text-white/65">Termékadatlap</p>
                <h2 className="text-xl">{detail.item?.title_ro || "Termék"}</h2>
              </div>
              <button className={btnSoft} onClick={() => setDetail(null)}><X size={16} /> Bezárás</button>
            </div>
            <div className="space-y-4 p-4">
              {detailBusy && <div className="rounded-xl border border-white/12 bg-white/[0.05] p-4 text-sm text-white/65">Betöltés...</div>}

              <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
                <div className="space-y-3 rounded-xl border border-white/12 bg-white/[0.05] p-3">
                  {edit.imageUrl ? <img src={edit.imageUrl} alt="" className="aspect-square w-full rounded-xl object-cover" /> : <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-black/20 text-white/35"><ImagePlus size={32} /></div>}
                  <label className={label}>Kép feltöltése
                    <input type="file" accept="image/*" className="text-xs text-white/70" onChange={(e) => onImageSelected(e.target.files?.[0] || null)} />
                  </label>
                  <label className={label}>Kép URL
                    <input className={input} value={edit.imageUrl} onChange={(e) => setEdit((x) => ({ ...x, imageUrl: e.target.value }))} placeholder="https://..." />
                  </label>
                  <div className="rounded-xl border border-white/12 bg-black/10 p-3 text-xs text-white/60">
                    <p>Belső azonosító: {detail.item?.internal_sku || "-"}</p>
                    <p className="mt-1">Utolsó módosítás: {dateShort(detail.item?.updated_at)}</p>
                  </div>
                </div>

                <div className="grid gap-4">
                  <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm"><Edit3 size={16} /> Alapadatok</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={label}>Terméknév románul<input className={input} value={edit.titleRo} onChange={(e) => setEdit((x) => ({ ...x, titleRo: e.target.value }))} /></label>
                      <label className={label}>Terméknév magyarul<input className={input} value={edit.titleHu} onChange={(e) => setEdit((x) => ({ ...x, titleHu: e.target.value }))} /></label>
                      <label className={`${label} md:col-span-2`}>Leírás<textarea className="min-h-[90px] rounded-xl border border-white/18 bg-[#3f4959] px-3 py-2 text-sm text-white outline-none placeholder:text-white/45 focus:border-white/45" value={edit.descriptionRo} onChange={(e) => setEdit((x) => ({ ...x, descriptionRo: e.target.value }))} /></label>
                      <label className={label}>Márka<select className={select} value={edit.brandCode} onChange={(e) => setEdit((x) => ({ ...x, brandCode: e.target.value }))}><option value="">Nincs beállítva</option>{brands.map((b) => <option key={b.id} value={b.code || b.id}>{b.name}</option>)}</select></label>
                      <label className={label}>Kategória<select className={select} value={edit.categoryCode} onChange={(e) => setEdit((x) => ({ ...x, categoryCode: e.target.value }))}><option value="">Nincs beállítva</option>{categories.map((c) => <option key={c.id} value={c.code || c.id}>{categoryLabel(c)}</option>)}</select></label>
                      <label className={label}>Nem<select className={select} value={edit.gender} onChange={(e) => setEdit((x) => ({ ...x, gender: e.target.value }))}>{genderTypes.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}</select></label>
                      <label className={label}>Terméktípus<input className={input} value={edit.productType} onChange={(e) => setEdit((x) => ({ ...x, productType: e.target.value }))} /></label>
                      <label className={label}>Szezon<input className={input} value={edit.season} onChange={(e) => setEdit((x) => ({ ...x, season: e.target.value }))} /></label>
                      <label className={label}>Anyag / összetétel<input className={input} value={edit.material} onChange={(e) => setEdit((x) => ({ ...x, material: e.target.value }))} /></label>
                    </div>
                  </section>

                  <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm"><Boxes size={16} /> Variáns és árak</div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className={label}>Vonalkód<input className={input} value={edit.barcode} onChange={(e) => setEdit((x) => ({ ...x, barcode: e.target.value }))} /></label>
                      <label className={label}>Szín<input className={input} value={edit.colorName} onChange={(e) => setEdit((x) => ({ ...x, colorName: e.target.value }))} /></label>
                      <label className={label}>Színkód<input className={input} value={edit.colorCode} onChange={(e) => setEdit((x) => ({ ...x, colorCode: e.target.value }))} /></label>
                      <label className={label}>Szín HEX<input className={input} value={edit.colorHex} onChange={(e) => setEdit((x) => ({ ...x, colorHex: e.target.value }))} placeholder="#000000" /></label>
                      <label className={label}>Méret<input className={input} value={edit.size} onChange={(e) => setEdit((x) => ({ ...x, size: e.target.value }))} /></label>
                      <label className={label}>Súly grammban<input className={input} value={edit.weightGrams} onChange={(e) => setEdit((x) => ({ ...x, weightGrams: e.target.value }))} /></label>
                      <label className={label}>Vételár<input className={input} value={edit.buyPrice} onChange={(e) => setEdit((x) => ({ ...x, buyPrice: e.target.value }))} /></label>
                      <label className={label}>Eladási ár<input className={input} value={edit.sellPrice} onChange={(e) => setEdit((x) => ({ ...x, sellPrice: e.target.value }))} /></label>
                      <label className={label}>Összehasonlító ár<input className={input} value={edit.compareAtPrice} onChange={(e) => setEdit((x) => ({ ...x, compareAtPrice: e.target.value }))} /></label>
                      <label className={label}>Variáns állapot<select className={select} value={edit.variantStatus} onChange={(e) => setEdit((x) => ({ ...x, variantStatus: e.target.value }))}><option value="active">Aktív</option><option value="inactive">Inaktív</option><option value="archived">Archivált</option></select></label>
                      <label className={label}>Modell állapot<select className={select} value={edit.modelStatus} onChange={(e) => setEdit((x) => ({ ...x, modelStatus: e.target.value }))}><option value="draft">Előkészítés</option><option value="active">Aktív</option><option value="archived">Archivált</option></select></label>
                      <label className={label}>Shopify cím<input className={input} value={edit.shopifyTitle} onChange={(e) => setEdit((x) => ({ ...x, shopifyTitle: e.target.value }))} /></label>
                    </div>
                  </section>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                  <p className="mb-3 text-sm text-white/80">Készlet célhelyenként</p>
                  <div className="space-y-2 text-sm">
                    {(detail.stock || []).map((s) => <div key={s.location_id} className="flex justify-between gap-3 rounded-lg bg-black/10 px-3 py-2"><span>{s.location_name}</span><span>{n(s.qty)} / elérhető {n(s.available_qty)}</span></div>)}
                    {!detail.stock?.length && <p className="text-white/55">Nincs készletadat.</p>}
                  </div>
                </section>
                <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                  <p className="mb-3 text-sm text-white/80">Beszállítói kapcsolatok</p>
                  <div className="space-y-2 text-sm">
                    {(detail.supplierCodes || []).slice(0, 5).map((s) => <div key={s.id} className="rounded-lg bg-black/10 px-3 py-2"><p>{s.supplier_name || "-"}</p><p className="text-xs text-white/55">Termékkód: {s.supplier_product_code || "-"} • Méret: {s.supplier_size || "-"}</p></div>)}
                    {!detail.supplierCodes?.length && <p className="text-white/55">Nincs beszállítói kapcsolat.</p>}
                  </div>
                </section>
                <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                  <p className="mb-3 text-sm text-white/80">Hiányzó adatok</p>
                  <div className="flex flex-wrap gap-2">
                    {missingLabels({ ...detail.item, image_url: edit.imageUrl, barcode: edit.barcode, buy_price: edit.buyPrice, sell_price: edit.sellPrice, title_ro: edit.titleRo, size: edit.size }).map((x) => <span key={x} className="rounded-full border border-amber-200/25 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-100">{x}</span>)}
                    {!missingLabels({ ...detail.item, image_url: edit.imageUrl, barcode: edit.barcode, buy_price: edit.buyPrice, sell_price: edit.sellPrice, title_ro: edit.titleRo, size: edit.size }).length && <span className="rounded-full border border-emerald-200/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-100">Nincs jelölt hiány</span>}
                  </div>
                </section>
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-white/12 pt-4">
                <button className={btnSoft} onClick={() => setDetail(null)}><X size={16} /> Mégse</button>
                <button className={btn} onClick={saveDetail} disabled={saving}><Save size={16} /> Mentés</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {busy && <div className="fixed bottom-4 right-4 rounded-xl border border-white/15 bg-[#404a5b] px-4 py-3 text-sm text-white/80 shadow-xl"><RefreshCw className="mr-2 inline" size={15} /> Betöltés...</div>}
      {totals.watch > 0 && <div className="fixed bottom-4 left-4 hidden rounded-xl border border-amber-200/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-50 shadow-xl lg:block"><AlertTriangle className="mr-2 inline" size={15} /> {totals.watch} figyelendő készleten lévő variáns</div>}
    </main>
  );
}
