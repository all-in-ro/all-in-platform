import { useEffect, useState } from "react";

/** Az egyetlen, Törzsadatokban szerkeszthető alkategória–méret kapcsolat fogyasztói. */
export type AifCategorySizeRules = {
  categories: Array<{
    id: string; code?: string | null; name_ro?: string | null; name_hu?: string | null;
    parent_id?: string | null; parentId?: string | null;
    aliases?: string[] | null; is_active?: boolean;
  }>;
  sizeTypes: Array<{
    id: string; code?: string | null; name?: string | null; name_hu?: string | null;
    aliases?: string[] | null; is_active?: boolean;
  }>;
  subcategorySizes: Array<{ subcategory_id: string; size_type_id: string }>;
};
type AifCategory = AifCategorySizeRules["categories"][number];
type AifSizeType = AifCategorySizeRules["sizeTypes"][number];
let ruleCache: { value: AifCategorySizeRules; at: number } | null = null;
let pendingRules: Promise<AifCategorySizeRules> | null = null;

async function requestRules(): Promise<AifCategorySizeRules> {
  const response = await fetch("/api/aif/meta?scope=warehouse", { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error(`Méretek törzsadatai: HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload?.categories) || !Array.isArray(payload?.sizeTypes) || !Array.isArray(payload?.subcategorySizes)) {
    throw new Error("A központi méretkapcsolatok nem érhetők el. Előbb telepítsd a Törzsadatok méretkapcsolat-javítását.");
  }
  return { categories: payload.categories, sizeTypes: payload.sizeTypes, subcategorySizes: payload.subcategorySizes };
}

export async function loadAifCategorySizeRules(force = false): Promise<AifCategorySizeRules> {
  if (!force && ruleCache && Date.now() - ruleCache.at < 10_000) return ruleCache.value;
  if (!pendingRules) {
    pendingRules = requestRules().then((value) => {
      ruleCache = { value, at: Date.now() };
      return value;
    }).finally(() => { pendingRules = null; });
  }
  return pendingRules;
}

export function useAifCategorySizeRules(): AifCategorySizeRules | null {
  const [rules, setRules] = useState<AifCategorySizeRules | null>(() => ruleCache?.value || null);
  useEffect(() => {
    let alive = true;
    void loadAifCategorySizeRules().then((value) => { if (alive) setRules(value); }).catch((error) => {
      // Egy átmeneti API-hiba nem akadályozhatja az eladást, leltárt és a kimutatásokat.
      console.warn("AllInFashion alkategória–méret kapcsolat nem tölthető be:", error);
    });
    return () => { alive = false; };
  }, []);
  return rules;
}

export function aifSizeKey(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase().replace(/^eu[\s._-]*(?=\d)/i, "")
    .replace(/[\s._-]+/g, "").replace(/[^a-z0-9/]+/g, "");
}

function categoryKeys(item: AifCategory): string[] {
  return [item.id, item.code, item.name_ro, item.name_hu, ...(item.aliases || [])].map(aifSizeKey).filter(Boolean);
}

export function aifFindCategory(rules: AifCategorySizeRules | null, value: string): AifCategory | null {
  const key = aifSizeKey(value);
  if (!key || key === "all") return null;
  return (rules?.categories || []).find((row) => row.is_active !== false && categoryKeys(row).includes(key)) || null;
}

export function aifCategoryIsChildOf(rules: AifCategorySizeRules | null, subcategoryName: string, categoryName: string): boolean {
  if (!categoryName || categoryName === "all") return true;
  const main = aifFindCategory(rules, categoryName);
  const sub = aifFindCategory(rules, subcategoryName);
  if (!main || !sub) return true; // Ismeretlen legacy értéket nem rejthetünk el véletlenül.
  return String(sub.parent_id || sub.parentId || "") === String(main.id);
}

export function aifMatchesCategory(rules: AifCategorySizeRules | null, itemValue: string | null | undefined, selection: string): boolean {
  if (!selection || selection === "all") return true;
  const selected = aifFindCategory(rules, selection);
  const item = aifFindCategory(rules, String(itemValue || ""));
  if (selected && item) return String(selected.id) === String(item.id);
  return aifSizeKey(itemValue) === aifSizeKey(selection);
}

export function aifSizeMatchesType(size: unknown, candidate: AifSizeType): boolean {
  const key = aifSizeKey(size);
  if (!key) return false;
  return [candidate.id, candidate.name, candidate.code, candidate.name_hu, ...(candidate.aliases || [])]
    .some((value) => aifSizeKey(value) === key);
}

/**
 * Cipő / lábbeli csoport felismerése a Törzsadatok kategóriáiból.
 * A valós al- és főkategória kapcsolatot használjuk, nem csupán a termékcímben
 * előforduló véletlen „cipő” szót. Csak a NEM konfigurált méretlistáknál
 * használjuk biztonságos megjelenítési fallbackként.
 */
export function aifIsFootwearSelection(
  rules: AifCategorySizeRules | null,
  category: string,
  subcategory = "",
): boolean {
  const looksFootwear = (value: unknown) => {
    const key = aifSizeKey(value);
    return /labbel|incalt|footwear|cipo|cipok|pantof|sneaker|shoes?|sandale|csizma|ghete|cizme|papuci|slapi|tenisi/.test(key);
  };
  const labelValues = (row: AifCategory | null) => row
    ? [row.code, row.name_ro, row.name_hu, ...(row.aliases || [])]
    : [];
  const main = aifFindCategory(rules, category);
  const sub = aifFindCategory(rules, subcategory);
  const byId = (id: unknown) => (rules?.categories || []).find((row) => String(row.id) === String(id)) || null;
  const parent = sub?.parent_id || sub?.parentId
    ? byId(sub.parent_id || sub.parentId)
    : main?.parent_id || main?.parentId
      ? byId(main.parent_id || main.parentId)
      : main;
  // Ha a főkategória ismert, annak besorolása dönt: pl. a Cipőfűző nem cipő.
  if (parent) return labelValues(parent).some(looksFootwear);
  return [category, subcategory, ...labelValues(main), ...labelValues(sub)].some(looksFootwear);
}

/**
 * Csak cipőméret alakú címke. Nem fogadja el: XXS, XS, S, M, L, M/42,
 * gyermekruhánál szokásos 116/128/152. EU/UK/US, félméret és numerikus
 * mérettartomány viszont használható (pl. 39, 40.5, 40 2/3, 38-39).
 * Ez CSAK szűrő/javaslat, nem a már tárolt termékek méretének validálása.
 */
export function aifIsFootwearSizeLabel(value: unknown): boolean {
  let source = String(value ?? "").trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/\u00bd/g, ".5").replace(/\u2153/g, " 1/3").replace(/\u2154/g, " 2/3")
    .replace(/,/g, ".").replace(/\s+/g, " ").trim();
  source = source.replace(/^(EU|UK|US)\s*[-:]?\s*/i, "").trim();
  const numeric = (raw: string) => {
    if (!/^\d{1,2}(?:\.\d{1,2})?$/.test(raw)) return false;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 1 && n <= 60;
  };
  if (numeric(source)) return true;
  const fraction = source.match(/^(\d{1,2})\s+(1\/2|1\/3|2\/3)$/);
  if (fraction) return numeric(fraction[1]) && Number(fraction[1]) <= 59;
  const range = source.match(/^(\d{1,2}(?:\.\d{1,2})?)\s*[-/]\s*(\d{1,2}(?:\.\d{1,2})?)$/);
  return Boolean(range && numeric(range[1]) && numeric(range[2]));
}

/** A fallbackban (nem a Törzsadatban konfigurált kapcsolatoknál) tisztít. */
export function aifFallbackSizeLabels(
  rules: AifCategorySizeRules | null,
  category: string,
  subcategory: string,
  values: ReadonlyArray<string>,
): string[] {
  const list = Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean)));
  if (aifHasConfiguredSizeLink(rules, category, subcategory) || !aifIsFootwearSelection(rules, category, subcategory)) return list;
  return list.filter(aifIsFootwearSizeLabel);
}

export function aifIsFootwearSizeType(row: AifSizeType): boolean {
  // Az aliasok közt egy ruhaméretnek is lehet szám. Az ALAPMÉRET dönt.
  return aifIsFootwearSizeLabel(row.name || row.name_hu || row.code || "");
}

/** 
 * Aktív alkategóriához tárolt kapcsolatok elsőbbséget élveznek.
 * Még nem konfigurált alkategóriánál csak az adott termékcsoportban ténylegesen
 * előforduló (observedSizes) méretek javasolhatók, ha azok ismertek.
 * Hiányos törzsadat esetén soha nem tiltunk le valódi, meglévő terméket.
 */
function aifLinkedSizeIds(
  rules: AifCategorySizeRules | null,
  category: string,
  subcategory: string,
): Set<string> {
  const selectedSub = aifFindCategory(rules, subcategory);
  const selectedMain = aifFindCategory(rules, category);
  const candidates = selectedSub && (selectedSub.parent_id || selectedSub.parentId)
    ? [selectedSub]
    : selectedMain && (selectedMain.parent_id || selectedMain.parentId)
      ? [selectedMain]
      : selectedMain
        ? (rules?.categories || []).filter((item) => item.is_active !== false && String(item.parent_id || item.parentId || "") === String(selectedMain.id))
        : [];
  const selectedIds = new Set(candidates.map((item) => String(item.id)));
  return new Set((rules?.subcategorySizes || [])
    .filter((link) => selectedIds.has(String(link.subcategory_id)))
    .map((link) => String(link.size_type_id)));
}

export function aifHasConfiguredSizeLink(
  rules: AifCategorySizeRules | null,
  category: string,
  subcategory = "",
): boolean {
  return aifLinkedSizeIds(rules, category, subcategory).size > 0;
}

export function aifSizeTypesForCategory(
  rules: AifCategorySizeRules | null,
  category: string,
  subcategory = "",
  observedSizes: ReadonlyArray<string> = [],
): AifSizeType[] {
  const types = (rules?.sizeTypes || []).filter((row) => row.is_active !== false);
  if (!types.length) return [];
  const links = aifLinkedSizeIds(rules, category, subcategory);
  if (links.size) return types.filter((row) => links.has(String(row.id)));
  const suggestedTypes = aifIsFootwearSelection(rules, category, subcategory)
    ? types.filter(aifIsFootwearSizeType)
    : types;
  if ((category && category !== "all" || subcategory && subcategory !== "all") && observedSizes.length) {
    const observed = aifFallbackSizeLabels(rules, category, subcategory, observedSizes);
    return suggestedTypes.filter((row) => observed.some((size) => aifSizeMatchesType(size, row)));
  }
  return suggestedTypes;
}

/** A vezetői eladási listában csak az eladási adatokban tényleg előforduló méretek. */
export function aifNarrowAvailableSizeLabels(
  rules: AifCategorySizeRules | null,
  category: string,
  subcategory: string,
  values: ReadonlyArray<string>,
): string[] {
  const all = Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean)));
  if (!category && !subcategory) return all;
  const allowedIds = aifLinkedSizeIds(rules, category, subcategory);
  if (!allowedIds.size) return aifFallbackSizeLabels(rules, category, subcategory, all);
  const selected = (rules?.sizeTypes || []).filter((size) => allowedIds.has(String(size.id)));
  return all.filter((value) => selected.some((size) => aifSizeMatchesType(value, size)));
}
