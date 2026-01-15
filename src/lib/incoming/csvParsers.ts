import type { IncomingItemDraft } from "./types";

export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

export type SupplierProfile = {
  key: string;
  label: string;
  delimiter?: string; // preferred delimiter
  // header -> field mapping (loose). We'll also do fuzzy matching via synonyms.
  fields: Partial<Record<IncomingFieldKey, string[]>>;
};

export type IncomingFieldKey =
  | "sku"
  | "name"
  | "brand"
  | "category"
  | "colorName"
  | "colorCode"
  | "size"
  | "qty";

export const SUPPLIER_PROFILES: Record<string, SupplierProfile> = {
  generic: {
    key: "generic",
    label: "Általános (auto felismerés)",
    fields: {
      sku: ["sku", "code", "productcode", "termekkod", "cikkszam", "artikel", "cod", "cód", "cod produs"],
      name: ["name", "product", "termeknev", "megnevezes", "denumire", "produs"],
      brand: ["brand", "marka", "márka", "marca"],
      category: ["category", "kategoria", "categorii", "categorie"],
      colorName: ["color", "szin", "culoare"],
      colorCode: ["colorcode", "szinkod", "culoarecod", "culoare cod", "cod culoare", "cod culoare"],
      size: ["size", "meret", "mărime", "marime", "marimea"],
      qty: ["qty", "quantity", "darab", "db", "cantitate", "cant."]
    }
  },
  malfini: {
    key: "malfini",
    label: "Malfini (tippelt)",
    delimiter: ";",
    fields: {
      sku: ["code", "cikkszam", "artikel"],
      name: ["name", "product"],
      colorCode: ["colorcode", "szinkod", "variant"],
      size: ["size", "meret"],
      qty: ["qty", "darab", "db", "quantity"],
      brand: ["brand", "márka"],
      category: ["category", "kategoria"]
    }
  },
  renbut: {
    key: "renbut",
    label: "Renbut (tippelt)",
    delimiter: ";",
    fields: {
      sku: ["sku", "code", "cikkszam"],
      name: ["name", "termeknev"],
      size: ["size", "meret"],
      qty: ["qty", "darab", "db", "cantitate"],
      colorName: ["color", "szin", "culoare"],
      colorCode: ["colorcode", "szinkod"]
    }
  }
};

function norm(s: string) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[._-]+/g, "");
}

export function guessDelimiter(text: string): string | null {
  const firstLine = (text || "").split(/\r?\n/).find((l) => l.trim().length) || "";
  const commas = (firstLine.match(/,/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  if (semis > commas) return ";";
  if (commas > semis) return ",";
  return null;
}

export function parseCsvText(text: string, opts?: { delimiter?: string }): ParsedCsv {
  const delimiter = (opts?.delimiter || ",").slice(0, 1);

  // Minimal CSV parser (quotes supported). Humans love edge-cases; we pretend they don't exist.
  const lines = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim().length);
  if (!lines.length) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
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

      if (!inQ && ch === delimiter) {
        out.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  };

  const headersRaw = parseLine(lines[0]);
  const headers = headersRaw.map((h, i) => (h ? h : `col${i + 1}`));

  const rows: Record<string, string>[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = parseLine(lines[li]);
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) row[headers[i]] = cells[i] ?? "";
    rows.push(row);
  }

  return { headers, rows };
}

function findHeader(headers: string[], candidates: string[]): string | null {
  const hNorm = headers.map((h) => ({ h, n: norm(h) }));
  for (const c of candidates) {
    const cn = norm(c);
    const exact = hNorm.find((x) => x.n === cn);
    if (exact) return exact.h;
  }
  // contains match (loose)
  for (const c of candidates) {
    const cn = norm(c);
    const partial = hNorm.find((x) => x.n.includes(cn) || cn.includes(x.n));
    if (partial) return partial.h;
  }
  return null;
}

function toInt(v: string): number {
  const s = String(v || "").trim().replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

export function mapCsvRowsToIncoming(parsed: ParsedCsv, profile: SupplierProfile): { items: IncomingItemDraft[]; issues: string[] } {
  const issues: string[] = [];
  const headers = parsed.headers || [];

  const mapKeyToHeader: Partial<Record<IncomingFieldKey, string>> = {};
  const fields = profile.fields || ({} as any);

  (Object.keys(fields) as IncomingFieldKey[]).forEach((k) => {
    const h = findHeader(headers, fields[k] || []);
    if (h) mapKeyToHeader[k] = h;
  });

  // minimum requirements: qty + (sku or name)
  if (!mapKeyToHeader.qty) issues.push("Nem találtam mennyiség oszlopot (qty/db/cantitate).");
  if (!mapKeyToHeader.sku && !mapKeyToHeader.name) issues.push("Nem találtam termékkód vagy terméknév oszlopot.");

  const items: IncomingItemDraft[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const r = parsed.rows[i];

    const sku = mapKeyToHeader.sku ? String(r[mapKeyToHeader.sku] || "").trim() : "";
    const name = mapKeyToHeader.name ? String(r[mapKeyToHeader.name] || "").trim() : "";
    const brand = mapKeyToHeader.brand ? String(r[mapKeyToHeader.brand] || "").trim() : "";
    const category = mapKeyToHeader.category ? String(r[mapKeyToHeader.category] || "").trim() : "";
    const colorName = mapKeyToHeader.colorName ? String(r[mapKeyToHeader.colorName] || "").trim() : "";
    const colorCode = mapKeyToHeader.colorCode ? String(r[mapKeyToHeader.colorCode] || "").trim() : "";
    const size = mapKeyToHeader.size ? String(r[mapKeyToHeader.size] || "").trim() : "";

    const qtyRaw = mapKeyToHeader.qty ? String(r[mapKeyToHeader.qty] || "").trim() : "0";
    const qty = toInt(qtyRaw);

    if (!qty || qty <= 0) continue;
    if (!sku && !name) continue;

    items.push({
      sku,
      name,
      brand,
      category,
      colorName,
      colorCode,
      size,
      qty,
      sourceMetaId: ""
    });
  }

  if (!items.length) issues.push("Nem lett egyetlen értelmezhető tétel sem (qty>0 és (sku vagy név)).");

  return { items, issues };
}
