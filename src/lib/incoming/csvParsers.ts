export type SupplierProfile = {
  key: string;
  label: string;
  // expected column names (case-insensitive) for each field
  columns: {
    sku: string[];
    brand?: string[];
    name: string[];
    gender?: string[];
    colorCode: string[];
    colorName: string[];
    size: string[];
    buyPrice?: string[];
    qty: string[];
    category: string[];
  };
};

export const SUPPLIER_PROFILES: SupplierProfile[] = [
  {
    key: "generic",
    label: "Generic",
    columns: {
      sku: ["sku", "code", "cod", "kód", "product_code", "product code", "cod produs"],
      brand: ["brand", "márka", "marka", "marca"],
      name: ["name", "product", "product_name", "denumire", "megnevezés", "terméknév"],
      gender: ["gender", "nem", "sex", "gen"],
      colorCode: ["colorcode", "color_code", "színkód", "cod culoare", "cod color"],
      colorName: ["color", "color_name", "szín", "culoare", "megnevezés szín"],
      size: ["size", "méret", "marime"],
      buyPrice: [
        "buy_price",
        "buy price",
        "beszerzési ár",
        "beszerzesi ar",
        "beszerzesi ár",
        "pret achizitie",
        "preț achiziție",
        "pret de achizitie",
        "purchase price",
      ],
      qty: ["qty", "quantity", "darab", "darabszám", "cantitate", "buc"],
      category: ["category", "kategória", "categorie"],
    },
  },
  {
    key: "malfini",
    label: "Malfini (általános minta)",
    columns: {
      sku: ["code", "product code", "kod", "sku"],
      name: ["name", "product name", "denumire"],
      colorCode: ["color code", "cod culoare", "colorcode"],
      colorName: ["color", "culoare", "color name"],
      size: ["size", "marime", "méret"],
      qty: ["qty", "quantity", "cantitate", "buc"],
      category: ["category", "categorie", "kategória"],
    },
  },
  {
    key: "renbut",
    label: "Renbut (általános minta)",
    columns: {
      sku: ["sku", "code", "kod"],
      name: ["name", "denumire", "product"],
      colorCode: ["colorcode", "cod culoare", "color code"],
      colorName: ["color", "culoare"],
      size: ["size", "marime"],
      qty: ["qty", "cantitate", "buc", "quantity"],
      category: ["category", "categorie", "kategória"],
    },
  },
];

export function guessDelimiter(text: string): "," | ";" | "\t" {
  const sample = text.split(/\r?\n/).slice(0, 5).join("\n");
  const commas = (sample.match(/,/g) || []).length;
  const semis = (sample.match(/;/g) || []).length;
  const tabs = (sample.match(/\t/g) || []).length;
  if (tabs > commas && tabs > semis) return "\t";
  if (semis > commas) return ";";
  return ",";
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
      continue;
    }
    if (!inQ && ch === delim) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsvText(text: string, delim: "," | ";" | "\t"): { headers: string[]; rows: string[][] } {
  const lines = text
    .replace(/\uFEFF/g, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return { headers: [], rows: [] };

  const headers = splitCsvLine(lines[0], delim).map((h) => h.replace(/^"|"$/g, "").trim());
  const rows = lines.slice(1).map((ln) => splitCsvLine(ln, delim).map((c) => c.replace(/^"|"$/g, "").trim()));
  return { headers, rows };
}

function norm(s: string) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function pickColumnIndex(headers: string[], candidates: string[]): number {
  const h = headers.map(norm);
  for (const c of candidates) {
    const idx = h.indexOf(norm(c));
    if (idx >= 0) return idx;
  }
  // fallback: contains match
  for (const c of candidates) {
    const cc = norm(c);
    const idx = h.findIndex((x) => x.includes(cc));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function mapCsvRowsToIncoming(opts: {
  headers: string[];
  rows: string[][];
  profile: SupplierProfile;
}): Array<{
  sku: string;
  brand?: string;
  name: string;
  gender?: string;
  colorCode: string;
  colorName: string;
  size: string;
  buyPrice?: string | null;
  qty: number;
  category: string;
  raw: Record<string, string>;
  issues: string[];
}> {
  const { headers, rows, profile } = opts;

  const idxSku = pickColumnIndex(headers, profile.columns.sku);
  const idxBrand = pickColumnIndex(headers, profile.columns.brand || []);
  const idxName = pickColumnIndex(headers, profile.columns.name);
  const idxGender = pickColumnIndex(headers, profile.columns.gender || []);
  const idxColorCode = pickColumnIndex(headers, profile.columns.colorCode);
  const idxColorName = pickColumnIndex(headers, profile.columns.colorName);
  const idxSize = pickColumnIndex(headers, profile.columns.size);
  const idxBuyPrice = pickColumnIndex(headers, profile.columns.buyPrice || []);
  const idxQty = pickColumnIndex(headers, profile.columns.qty);
  const idxCategory = pickColumnIndex(headers, profile.columns.category);

  return rows.map((r) => {
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => (raw[h] = r[i] ?? ""));

    const issues: string[] = [];
    const sku = idxSku >= 0 ? (r[idxSku] || "").trim() : "";
    const brand = idxBrand >= 0 ? (r[idxBrand] || "").trim() : "";
    const name = idxName >= 0 ? (r[idxName] || "").trim() : "";
    const gender = idxGender >= 0 ? (r[idxGender] || "").trim() : "";
    const colorCode = idxColorCode >= 0 ? (r[idxColorCode] || "").trim() : "";
    const colorName = idxColorName >= 0 ? (r[idxColorName] || "").trim() : "";
    const size = idxSize >= 0 ? (r[idxSize] || "").trim() : "";
    const category = idxCategory >= 0 ? (r[idxCategory] || "").trim() : "";

    const buyPriceRaw = idxBuyPrice >= 0 ? (r[idxBuyPrice] || "").toString().trim() : "";
    const buyPrice = buyPriceRaw ? buyPriceRaw : null;

    let qty = 0;
    if (idxQty >= 0) {
      const q = (r[idxQty] || "").toString().replace(",", ".").trim();
      qty = Math.round(Number(q));
      if (!Number.isFinite(qty)) qty = 0;
    }

    if (!sku) issues.push("Hiányzó kód/SKU");
    if (!name) issues.push("Hiányzó terméknév");
    if (!qty || qty <= 0) issues.push("Hibás darabszám");

    return { sku, brand, name, gender, colorCode, colorName, size, buyPrice, qty, category, raw, issues };
  });
}
