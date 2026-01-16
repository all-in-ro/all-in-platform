/*
  ALL IN – Incoming import mapper (professional)

  Requirements:
  - Import from CSV/XLS/XLSX with HU/RO/EN headers (plus vendor headers like ForIT Forms)
  - Internally we keep ONE canonical draft shape used by Incoming UI (sku/brand/name/...)
  - No positional mapping. Header aliases only.
  - Optional parsing of missing colorCode/size from vendor code.

  This file is meant to be the *only* place that knows how to map vendor spreadsheets.
*/

export type IncomingGenderCode = "F" | "N" | "U" | "K" | ""; // Férfi / Női / Unisex / Gyerek / unknown

export type ImportMappedRow = {
  // Canonical UI shape (used by IncomingImport / IncomingTransfer / etc.)
  sku: string; // Kód
  brand: string; // Márka
  name: string; // Terméknév
  gender: IncomingGenderCode; // Nem
  colorCode: string; // Színkód
  colorName: string; // Szín
  size: string; // Méret
  category: string; // Kategória
  buyPrice: number | null; // Beszerzési ár
  qty: number; // Db

  // diagnostics
  issues: string[];
  raw: Record<string, unknown>;
};

export type ImportTable = {
  headers: string[];
  rows: string[][];
};

export type ImportOptions = {
  // If provided, forces vendor profile handling.
  source?: "auto" | "forit";
  // If false, won't try to parse size/colorCode from sku.
  parseCode?: boolean;
};

// ------------------------- helpers -------------------------

export function normalizeHeader(input: string): string {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const raw = String(v).trim();
  if (!raw) return null;

  // common: "1.234,56", "1234,56", "RON 12,5"
  let cleaned = raw
    .replace(/\s+/g, "")
    .replace(/(ron|lei|eur|usd)/gi, "")
    .replace(/[^0-9,.-]/g, "");

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  if (hasComma && hasDot) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && !hasDot) {
    cleaned = cleaned.replace(",", ".");
  }

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toInt(v: unknown): number {
  const n = toNumber(v);
  if (n === null) return 0;
  const i = Math.round(n);
  return Number.isFinite(i) ? i : 0;
}

function normalizeGender(v: unknown): IncomingGenderCode {
  const raw = s(v);
  if (!raw) return "";
  const key = raw.trim().toUpperCase();

  // RO
  if (["BARBAT", "B\u0102RBAT", "MEN", "MALE", "M"].includes(key)) return "F";
  if (["FEMEIE", "FEMEIEI", "WOMEN", "FEMALE", "F"].includes(key)) return "N";
  if (["UNISEX", "U"].includes(key)) return "U";
  if (["COPII", "COPIL", "KIDS", "CHILD", "CHILDREN"].includes(key)) return "K";

  // HU
  if (["FERFI", "F\u00c9RFI"].includes(key)) return "F";
  if (["NOI", "N\u0150I"].includes(key)) return "N";
  if (["GYEREK"].includes(key)) return "K";

  return "";
}

function isLikelyForIt(headers: string[]): boolean {
  const set = new Set(headers.map(normalizeHeader));
  return ["denumire", "cod", "cant", "categorie", "pretachiz"].every((k) => set.has(k));
}

// Parse vendor code pattern like: 1125--3027382-001-001--7
function parseFromSku(code: string): { colorCode?: string; size?: string } {
  const c = s(code);
  if (!c) return {};

  const sizeMatch = c.match(/--([A-Za-z0-9]{1,6})$/);
  const colorMatch = c.match(/-([0-9]{3})-([0-9]{3})--/);
  return {
    colorCode: colorMatch?.[1],
    size: sizeMatch?.[1],
  };
}

// Canonical field -> aliases (normalized)
const ALIASES: Record<
  keyof Pick<ImportMappedRow, "sku" | "brand" | "name" | "gender" | "colorCode" | "colorName" | "size" | "category" | "buyPrice" | "qty">,
  string[]
> = {
  sku: ["kod", "productcode", "sku", "itemcode", "cod", "codprodus", "codarticol", "code"],
  brand: ["marka", "brand", "marca", "info1"],
  name: ["termeknev", "productname", "name", "denumire", "nume", "descriere"],
  gender: ["nem", "gender", "gen", "sex", "dept", "department"],
  colorCode: ["szinkod", "colorcode", "codculoare", "colourcode"],
  colorName: ["szin", "color", "culoare", "colour", "colorname"],
  size: ["meret", "size", "marime", "m\u0103rime"],
  category: ["kategoria", "category", "categorie", "grupa", "tip"],
  buyPrice: [
    "beszeresiar",
    "beszerzesi_ar",
    "buyprice",
    "purchaseprice",
    "cost",
    "pretachiz",
    "pretachizitie",
  ],
  qty: ["db", "qty", "quantity", "cant", "cantitate", "buc", "pieces"],
};

function pick(row: Record<string, unknown>, aliases: string[]): unknown {
  const idx: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) idx[normalizeHeader(k)] = v;
  for (const a of aliases) {
    const nk = normalizeHeader(a);
    if (nk in idx) return idx[nk];
  }
  return undefined;
}

function tableToObjects(table: ImportTable): Array<Record<string, unknown>> {
  const headers = table.headers || [];
  return (table.rows || []).map((r) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = r?.[i] ?? "";
    }
    return obj;
  });
}

// ------------------------- public API -------------------------

export function mapTableToIncomingRows(table: ImportTable, options: ImportOptions = {}): ImportMappedRow[] {
  const objects = tableToObjects(table);
  const forceForIt = options.source === "forit";
  const autoForIt = options.source !== "forit" && options.source !== "auto" ? false : isLikelyForIt(table.headers || []);
  const useForIt = forceForIt || autoForIt;

  return objects.map((row) => {
    const issues: string[] = [];

    // ForIT overrides (exact headers)
    const sku = s(useForIt ? row["Cod"] ?? row["COD"] ?? pick(row, ALIASES.sku) : pick(row, ALIASES.sku));
    const name = s(useForIt ? row["Denumire"] ?? row["DENUMIRE"] ?? pick(row, ALIASES.name) : pick(row, ALIASES.name));
    const qty = useForIt ? toInt(row["Cant"] ?? row["CANT"] ?? pick(row, ALIASES.qty)) : toInt(pick(row, ALIASES.qty));
    const category = s(useForIt ? row["Categorie"] ?? row["CATEGORIE"] ?? pick(row, ALIASES.category) : pick(row, ALIASES.category));
    // ForIT: some exports use PretAchiz, others pretachiz (lowercase) or mixed casing.
    // We still fall back to alias-based pick() so vendor variants keep working.
    const buyPrice = useForIt
      ? toNumber(
          (row as any)["PretAchiz"] ??
            (row as any)["PRETACHIZ"] ??
            (row as any)["pretachiz"] ??
            (row as any)["Pretachiz"] ??
            pick(row, ALIASES.buyPrice)
        )
      : toNumber(pick(row, ALIASES.buyPrice));
    const brand = s(useForIt ? row["INFO1"] ?? row["Info1"] ?? pick(row, ALIASES.brand) : pick(row, ALIASES.brand));
    const genderRaw = useForIt ? (row["DEPT"] ?? row["Dept"] ?? pick(row, ALIASES.gender)) : pick(row, ALIASES.gender);
    const gender = normalizeGender(genderRaw);

    let colorCode = s(pick(row, ALIASES.colorCode));
    const colorName = s(pick(row, ALIASES.colorName));
    let size = s(pick(row, ALIASES.size));

    if (!sku) issues.push("Hiányzó Kód.");
    if (!name) issues.push("Hiányzó Terméknév.");
    if (!qty || qty <= 0) issues.push("Hiányzó / hibás Db.");
    if (buyPrice === null) issues.push("Hiányzó / hibás Beszerzési ár.");

    const parseCode = options.parseCode !== false;
    if (parseCode && sku && (!colorCode || !size)) {
      const parsed = parseFromSku(sku);
      if (!colorCode && parsed.colorCode) colorCode = parsed.colorCode;
      if (!size && parsed.size) size = parsed.size;
    }

    return {
      sku,
      brand,
      name,
      gender,
      colorCode,
      colorName,
      size,
      category,
      buyPrice,
      qty,
      issues,
      raw: row,
    };
  });
}
