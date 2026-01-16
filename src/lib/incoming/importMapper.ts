/*
  ALL IN – Incoming import mapper (professional)

  Goal:
  - Accept XLS/XLSX/CSV headers in HU/RO/EN (and vendor-specific like ForIT)
  - Map them into ONE internal canonical draft shape using Hungarian field names
  - Parse missing fields from code where possible (e.g., color_code + size from vendor SKU)
  - Keep raw row for audit/debug

  IMPORTANT:
  - This module is UI-agnostic. TSX components should call mapRowToIncomingDraft()
  - Do not do positional mapping. Only header alias mapping.
*/

export type IncomingGender =
  | 'Férfi'
  | 'Női'
  | 'Unisex'
  | 'Gyerek'
  | 'Ismeretlen';

export type IncomingDraftItem = {
  // Canonical (HU) keys used across the app
  kod: string; // Kód
  marka: string; // Márka
  termeknev: string; // Terméknév
  nem: IncomingGender; // Nem
  szinkod: string; // Színkód
  szin: string; // Szín
  meret: string; // Méret
  kategoria: string; // Kategória
  beszerzesi_ar: number | null; // Beszerzési ár
  db: number | null; // Db

  // Derived
  osszertek: number | null; // Beszerzési ár * Db

  // Meta
  source_headers: Record<string, string>; // canonicalKey -> original header
  issues: string[]; // warnings/errors for UI display/logging
  raw: Record<string, unknown>; // original row
};

export type ImportOptions = {
  // If true, try to parse missing fields from kod (e.g. color/size)
  parseCode?: boolean;

  // If provided, used to normalize DEPT/gender values, etc.
  // Example: { BARBAT: 'Férfi', FEMEIE: 'Női' }
  genderMap?: Record<string, IncomingGender>;
};

const DEFAULT_GENDER_MAP: Record<string, IncomingGender> = {
  BARBAT: 'Férfi',
  FEMEIE: 'Női',
  UNISEX: 'Unisex',
  COPII: 'Gyerek',
  COPIL: 'Gyerek',
  KIDS: 'Gyerek',
  MEN: 'Férfi',
  WOMEN: 'Női',
  MALE: 'Férfi',
  FEMALE: 'Női',
};

// ---- Header normalization -------------------------------------------------

export function normalizeHeader(input: string): string {
  // Lowercase, remove diacritics, strip separators
  return String(input)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function toStringSafe(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function toNumberSafe(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;

  const s = String(v).trim();
  if (!s) return null;

  // Common vendor formats: "12,50" or "RON 12,50" or "12.50"
  const cleaned = s
    .replace(/\s+/g, '')
    .replace(/(ron|lei|eur|usd)/gi, '')
    .replace(/[^0-9,.-]/g, '');

  // If has comma and dot, assume dot is thousands separator and comma decimal (RO style)
  // Example: 1.234,56 -> 1234.56
  let normalized = cleaned;
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');
  if (hasComma && hasDot) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (hasComma && !hasDot) {
    normalized = normalized.replace(',', '.');
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function toIntSafe(v: unknown): number | null {
  const n = toNumberSafe(v);
  if (n === null) return null;
  const i = Math.round(n);
  return Number.isFinite(i) ? i : null;
}

// ---- Alias dictionary (HU/RO/EN + vendor-specific) ------------------------

// Canonical keys (internal HU) -> acceptable headers (normalized)
const ALIASES: Record<
  keyof Omit<IncomingDraftItem, 'osszertek' | 'source_headers' | 'issues' | 'raw'>,
  string[]
> = {
  kod: [
    'kod',
    'productcode',
    'sku',
    'itemcode',
    'cod',
    'codprodus',
    'codarticol',
    'code',
  ],
  marka: ['marka', 'brand', 'marca', 'info1'],
  termeknev: ['termeknev', 'productname', 'name', 'denumire', 'nume', 'descriere'],
  nem: ['nem', 'gender', 'gen', 'sex', 'dept', 'department'],
  szinkod: ['szinkod', 'colorcode', 'codculoare', 'codculoareprodus', 'colourcode'],
  szin: ['szin', 'color', 'culoare', 'colour', 'colorname', 'culoareprodus'],
  meret: ['meret', 'size', 'marime', 'mărime'.normalize('NFD').replace(/[\u0300-\u036f]/g, ''), 'dimensione'],
  kategoria: ['kategoria', 'category', 'categorie', 'grupa', 'tip'],
  beszerzesi_ar: [
    'beszerzesi ar'.replace(/\s/g, ''),
    'beszerzesi_ar',
    'buyprice',
    'purchaseprice',
    'cost',
    'pretachiz',
    'pretachizitie',
    'pretachizitie'.replace(/\s/g, ''),
  ],
  db: ['db', 'qty', 'quantity', 'cant', 'cantitate', 'buc', 'pieces'],
};

// ---- Vendor specific: ForIT/Forms mapping ---------------------------------

// ForIT typical headers (normalized): denumire, um, codbare, cod, cant, categorie, pretachiz, dept, info1
const FORIT_HINT_HEADERS = ['denumire', 'cod', 'cant', 'categorie', 'pretachiz'];

function isLikelyForIt(headersNormalized: string[]): boolean {
  const set = new Set(headersNormalized);
  return FORIT_HINT_HEADERS.every((h) => set.has(h));
}

// ---- Code parsing ----------------------------------------------------------

export type ParsedCode = {
  color_code?: string;
  size?: string;
  confidence: 'high' | 'low' | 'none';
};

/**
 * Parse vendor code patterns.
 * Current supported pattern (example): 1125--3027382-001-001--7
 * Heuristic: take the last "--<size>" part as size, and last "-<ccc>-<ccc>--" as color.
 */
export function parseCode(code: string): ParsedCode {
  const c = toStringSafe(code);
  if (!c) return { confidence: 'none' };

  // Size: last "--<something>" where <something> is 1-6 chars alnum
  const sizeMatch = c.match(/--([A-Za-z0-9]{1,6})$/);

  // Color: -<3digits>-<3digits>-- (take the first of the pair)
  const colorMatch = c.match(/-([0-9]{3})-([0-9]{3})--/);

  const out: ParsedCode = { confidence: 'none' };
  if (sizeMatch) out.size = sizeMatch[1];
  if (colorMatch) out.color_code = colorMatch[1];

  if (out.size || out.color_code) {
    out.confidence = out.size && out.color_code ? 'high' : 'low';
  }

  return out;
}

// ---- Gender normalization --------------------------------------------------

export function normalizeGender(input: unknown, genderMap?: Record<string, IncomingGender>): IncomingGender {
  const raw = toStringSafe(input);
  if (!raw) return 'Ismeretlen';

  const key = raw.trim().toUpperCase();
  const map = { ...DEFAULT_GENDER_MAP, ...(genderMap || {}) };
  return map[key] || 'Ismeretlen';
}

// ---- Core mapping ----------------------------------------------------------

type CanonicalKey = keyof typeof ALIASES;

function buildHeaderIndex(row: Record<string, unknown>): {
  // normalized header -> original header
  normalizedToOriginal: Record<string, string>;
  // normalized header -> value
  normalizedToValue: Record<string, unknown>;
  headersNormalized: string[];
} {
  const normalizedToOriginal: Record<string, string> = {};
  const normalizedToValue: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(row || {})) {
    const nk = normalizeHeader(k);
    if (!nk) continue;
    // keep first occurrence
    if (!(nk in normalizedToOriginal)) normalizedToOriginal[nk] = k;
    if (!(nk in normalizedToValue)) normalizedToValue[nk] = v;
  }

  return {
    normalizedToOriginal,
    normalizedToValue,
    headersNormalized: Object.keys(normalizedToOriginal),
  };
}

function pickValue(
  idx: ReturnType<typeof buildHeaderIndex>,
  candidates: string[]
): { value: unknown; usedHeader: string | null } {
  for (const c of candidates) {
    const nc = normalizeHeader(c);
    if (nc in idx.normalizedToValue) {
      return { value: idx.normalizedToValue[nc], usedHeader: idx.normalizedToOriginal[nc] };
    }
  }
  return { value: undefined, usedHeader: null };
}

export function mapRowToIncomingDraft(
  row: Record<string, unknown>,
  options: ImportOptions = {}
): IncomingDraftItem {
  const idx = buildHeaderIndex(row);
  const issues: string[] = [];
  const source_headers: Record<string, string> = {};

  const likelyForIt = isLikelyForIt(idx.headersNormalized);

  // If ForIT, force vendor mapping priorities
  const forcedForIt: Partial<Record<CanonicalKey, string[]>> = likelyForIt
    ? {
        termeknev: ['Denumire'],
        kod: ['Cod'],
        db: ['Cant'],
        kategoria: ['Categorie'],
        beszerzesi_ar: ['PretAchiz'],
        marka: ['INFO1'],
        nem: ['DEPT'],
      }
    : {};

  function getCanonical(key: CanonicalKey): { value: unknown; header: string | null } {
    const forced = forcedForIt[key];
    if (forced) return pickValue(idx, forced);
    return pickValue(idx, ALIASES[key]);
  }

  const kodPick = getCanonical('kod');
  const termeknevPick = getCanonical('termeknev');
  const markaPick = getCanonical('marka');
  const nemPick = getCanonical('nem');
  const szinkodPick = getCanonical('szinkod');
  const szinPick = getCanonical('szin');
  const meretPick = getCanonical('meret');
  const katPick = getCanonical('kategoria');
  const arPick = getCanonical('beszerzesi_ar');
  const dbPick = getCanonical('db');

  if (kodPick.header) source_headers.kod = kodPick.header;
  if (termeknevPick.header) source_headers.termeknev = termeknevPick.header;
  if (markaPick.header) source_headers.marka = markaPick.header;
  if (nemPick.header) source_headers.nem = nemPick.header;
  if (szinkodPick.header) source_headers.szinkod = szinkodPick.header;
  if (szinPick.header) source_headers.szin = szinPick.header;
  if (meretPick.header) source_headers.meret = meretPick.header;
  if (katPick.header) source_headers.kategoria = katPick.header;
  if (arPick.header) source_headers.beszerzesi_ar = arPick.header;
  if (dbPick.header) source_headers.db = dbPick.header;

  const kod = toStringSafe(kodPick.value);
  const termeknev = toStringSafe(termeknevPick.value);
  const marka = toStringSafe(markaPick.value);
  const nem = normalizeGender(nemPick.value, options.genderMap);

  let szinkod = toStringSafe(szinkodPick.value);
  const szin = toStringSafe(szinPick.value);
  let meret = toStringSafe(meretPick.value);

  const kategoria = toStringSafe(katPick.value);
  const beszerzesi_ar = toNumberSafe(arPick.value);
  const db = toIntSafe(dbPick.value);

  if (!kod) issues.push('Hiányzó Kód (kod).');
  if (!termeknev) issues.push('Hiányzó Terméknév (termeknev).');
  if (db === null) issues.push('Hiányzó / hibás Db (qty/cant).');
  if (beszerzesi_ar === null) issues.push('Hiányzó / hibás Beszerzési ár (buy price / pret achiz).');

  // Optional code parsing for missing fields
  const parseEnabled = options.parseCode !== false;
  if (parseEnabled && kod) {
    const parsed = parseCode(kod);
    if (!szinkod && parsed.color_code) {
      szinkod = parsed.color_code;
      issues.push(`Színkód kiszámolva a Kódból (${parsed.confidence}).`);
    }
    if (!meret && parsed.size) {
      meret = parsed.size;
      issues.push(`Méret kiszámolva a Kódból (${parsed.confidence}).`);
    }
  }

  const osszertek = beszerzesi_ar !== null && db !== null ? Number((beszerzesi_ar * db).toFixed(2)) : null;

  return {
    kod,
    marka,
    termeknev,
    nem,
    szinkod,
    szin,
    meret,
    kategoria,
    beszerzesi_ar,
    db,
    osszertek,
    source_headers,
    issues,
    raw: row || {},
  };
}

/**
 * Utility for mapping a whole sheet (array of row objects).
 */
export function mapRowsToIncomingDraft(
  rows: Array<Record<string, unknown>>,
  options: ImportOptions = {}
): IncomingDraftItem[] {
  return (rows || []).map((r) => mapRowToIncomingDraft(r, options));
}
