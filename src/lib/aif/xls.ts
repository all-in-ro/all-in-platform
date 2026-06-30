import * as XLSX from "xlsx";
import type { AifParsedRow, AifSupplier } from "./api";

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

function norm(v: unknown): string {
  return clean(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function money(v: unknown): number | null {
  const s = clean(v).replace(/\s+/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function qty(v: unknown): number | null {
  const n = Math.floor(Number(clean(v).replace(",", ".")));
  return Number.isFinite(n) ? n : null;
}

function findValue(row: Record<string, unknown>, aliases: string[]): string {
  const wanted = aliases.map(norm);
  for (const [key, value] of Object.entries(row)) {
    if (wanted.includes(norm(key))) return clean(value);
  }
  return "";
}

function normalizeGender(value: string): "men" | "women" | "kids" | "unisex" {
  const g = norm(value);
  if (["barbati", "barbat", "men", "mens", "male", "masculin", "m"].includes(g)) return "men";
  if (["femei", "femeie", "dama", "dame", "women", "womens", "female", "feminin", "f"].includes(g)) return "women";
  if (["copii", "copil", "kids", "children", "junior", "juniors", "youth", "baieti", "fete"].includes(g)) return "kids";
  return "unisex";
}

function guessCategory(value: string): string | null {
  const c = norm(value);
  if (!c) return null;
  if (c.includes("pantof") || c.includes("incalt") || c.includes("shoe") || c.includes("sneaker") || c.includes("cip") || c.includes("boot")) return "incaltaminte";
  if (c.includes("acces") || c.includes("geanta") || c.includes("rucsac") || c.includes("sapca") || c.includes("caciula") || c.includes("belt") || c.includes("curea") || c.includes("ov")) return "accesorii";
  if (c.includes("outlet")) return "outlet";
  if (c.includes("imbrac") || c.includes("ruha") || c.includes("shirt") || c.includes("tricou") || c.includes("pantal") || c.includes("hanorac") || c.includes("jacheta") || c.includes("rochie")) return "imbracaminte";
  return c;
}

const ALIASES = {
  brand: ["brand", "marca", "márka", "manufacturer", "producator"],
  productCode: ["product code", "cod produs", "cod", "model", "style", "style code", "item", "item no", "article", "articol", "sku"],
  variantCode: ["variant code", "cod varianta", "variant", "sku varianta", "size sku", "cod marime"],
  name: ["name", "product name", "denumire", "denumire produs", "nume", "descriere", "description", "megnevezes", "megnevezés"],
  colorCode: ["color code", "colour code", "cod culoare", "cod culoare furnizor", "szinkod", "színkód"],
  colorName: ["color", "colour", "culoare", "nume culoare", "szin", "szín", "color name", "colour name"],
  size: ["size", "marime", "mărime", "méret", "taille", "numar", "nr"],
  qty: ["qty", "quantity", "cantitate", "stoc", "stock", "buc", "pcs", "db", "menge"],
  buyPrice: ["buy price", "pret achizitie", "preț achiziție", "pret furnizor", "cost", "net price", "purchase price"],
  sellPrice: ["sell price", "pret vanzare", "preț vânzare", "price", "pret", "rrp", "retail price"],
  barcode: ["barcode", "bar code", "ean", "ean13", "cod bare", "cod de bare", "vonalkod", "vonalkód"],
  category: ["category", "categorie", "kategoria", "kategória", "product type", "tip produs"],
  gender: ["gender", "gen", "sex", "departament", "department", "category gender"],
  imageUrl: ["image", "image url", "poza", "imagine", "url imagine", "photo", "picture"],
};

export async function readAifWorkbook(file: File, supplier?: AifSupplier | null): Promise<AifParsedRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  const supplierCode = supplier?.code || "";
  const supplierName = supplier?.name || supplierCode;

  return rows
    .map((row, index): AifParsedRow | null => {
      const productCode = findValue(row, ALIASES.productCode);
      const variantCode = findValue(row, ALIASES.variantCode);
      const name = findValue(row, ALIASES.name);
      const size = findValue(row, ALIASES.size);
      const amount = qty(findValue(row, ALIASES.qty));
      const colorCode = findValue(row, ALIASES.colorCode);
      const colorName = findValue(row, ALIASES.colorName);
      const categoryRaw = findValue(row, ALIASES.category);
      const genderRaw = findValue(row, ALIASES.gender);
      const brandRaw = findValue(row, ALIASES.brand) || supplierName;

      if (!productCode && !variantCode && !name && !size && !amount) return null;

      return {
        rowNo: index + 2,
        raw: row,
        normalized: {
          brandCode: brandRaw,
          brandName: brandRaw,
          categoryCode: guessCategory(categoryRaw),
          modelCode: productCode || variantCode || name,
          titleRo: name || productCode || variantCode,
          gender: normalizeGender(genderRaw),
          colorCode,
          colorName,
          size,
          barcode: findValue(row, ALIASES.barcode),
          buyPrice: money(findValue(row, ALIASES.buyPrice)),
          sellPrice: money(findValue(row, ALIASES.sellPrice)),
          imageUrl: findValue(row, ALIASES.imageUrl),
          supplierProductCode: productCode,
          supplierVariantCode: variantCode,
          supplierColorCode: colorCode,
          supplierSize: size,
          qty: amount,
          sourceSupplier: supplierCode,
        },
      };
    })
    .filter(Boolean) as AifParsedRow[];
}
