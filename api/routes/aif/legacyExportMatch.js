// Read-only ForIT matching. No barcode generation and no inventory/product writes.
export const FORIT_EXPORT_VERSION = '20261015.2';
const text = value => String(value ?? '').trim();
export const codeKey = value => text(value).toLowerCase();
export function norm(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
const SIZE_ENDINGS = [
  'ONE SIZE', 'ONE-SIZE', 'ONE_SIZE', 'OSFA', 'OSFY', 'OSFM', 'XXXXL', 'XXXL',
  'XXS', '3XL', '4XL', '2XL', 'XXL', 'XL', 'XS', 'S', 'M', 'L', 'OS', 'UNI', 'UNIVERSAL',
].sort((a, b) => b.length - a.length);
export function sizeKey(value) {
  const key = norm(value);
  return ['one_size', 'onesize', 'os', 'osfm', 'universal', 'uni'].includes(key) ? 'one_size' : key;
}
export function parseForitCode(row) {
  const code = text(row?.code), name = text(row?.name);
  const tokens = code.split('--').map(text);
  if (tokens.length !== 3 || !tokens.every(Boolean)) return { code, name, legacyOnly: true };
  const [snCod, supplierCode, colorAndSize] = tokens;
  let size = '', color = '';
  for (const ending of SIZE_ENDINGS) {
    if (colorAndSize.toUpperCase().endsWith(`-${ending}`)) {
      size = ending;
      color = text(colorAndSize.slice(0, -(ending.length + 1)));
      break;
    }
  }
  if (!size) {
    const match = colorAndSize.match(/^(.+)-((?:\d{2,3})(?:[.,]\d)?|[A-Za-z]{1,5})$/);
    if (match) { color = text(match[1]); size = match[2]; }
  }
  if (!size || !color) return { code, name, legacyOnly: true };
  const segments = name.split('--');
  const middle = segments.length === 3 ? text(segments[1]) : '';
  const suffix = `-${supplierCode}`;
  const title = codeKey(middle).endsWith(codeKey(suffix)) ? text(middle.slice(0, -suffix.length)) : '';
  return { code, name, snCod, supplierCode, color, size, title, legacyOnly: false };
}

function object(value) {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return {}; } }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function sourceValue(raw, aliases) {
  const source = object(raw);
  const parts = [source, object(source.raw), object(source.normalized)];
  // Alias order is significant: barcode precedes supplierBarcode. JSON property
  // order must not change which of those persisted fields the warehouse uses.
  for (const alias of aliases) {
    for (const part of parts) {
      for (const [key, value] of Object.entries(part)) {
        if (norm(key) === norm(alias) && value != null && typeof value !== 'object' && text(value)) return text(value);
      }
    }
  }
  return '';
}
const first = (...values) => values.map(text).find(Boolean) || '';
const colorAliases = ['CULOARE', 'colorName', 'color_name', 'SZIN NEV'];
const titleAliases = ['ARTICOL/ DENUMIRE PRODUS', 'ARTICOL', 'TERMEK NEV', 'titleRo', 'productName'];
const barcodeAliases = ['barcode', 'supplierBarcode', 'supplier_barcode', 'CodBare', 'EAN', 'EAN13'];

function sameArticleTitle(parsed, value, brand = '') {
  const wanted = norm(parsed.title), actual = norm(value);
  if (!wanted || !actual) return false;
  if (actual === wanted) return true;
  // A historical model title may be the entire ForIT Denumire, not just MODENA/PONTI.
  const encoded = parseForitCode({ code: parsed.code, name: value });
  if (!encoded.legacyOnly && norm(encoded.title) === wanted) return true;
  // Older one-separator ForIT names: require the COMPLETE article name and code,
  // plus the known brand. Never accept a bare substring or a stripped model number.
  const full = `${wanted}_${norm(parsed.supplierCode)}`;
  const endings = [full, `${full}_${norm(parsed.color)}_${norm(parsed.size)}`];
  return Boolean(norm(brand) && actual.startsWith(`${norm(brand)}_`) &&
    endings.some(ending => actual.endsWith(`_${ending}`)));
}
function rejection(parsed, candidate) {
  if (!candidate?.variantId || codeKey(candidate.status) === 'archived') return 'archived';
  const exactLegacy = [candidate.legacyCode, candidate.internalSku].some(v =>
    codeKey(v) && codeKey(v) === codeKey(parsed.code));
  if (parsed.legacyOnly) return exactLegacy ? '' : 'code';
  if (!exactLegacy && codeKey(candidate.productCode) !== codeKey(parsed.supplierCode)) return 'code';
  if (sizeKey(candidate.size) !== sizeKey(parsed.size) ||
      (text(candidate.sourceSize) && sizeKey(candidate.sourceSize) !== sizeKey(parsed.size))) return 'size';
  if (norm(candidate.color) !== norm(parsed.color) ||
      (text(candidate.sourceColor) && norm(candidate.sourceColor) !== norm(parsed.color))) return 'color';
  if (parsed.title && ![candidate.title, candidate.sourceTitle].some(value =>
    sameArticleTitle(parsed, value, candidate.brand))) return 'title';
  if (text(candidate.brand) && parsed.name && !norm(parsed.name).startsWith(`${norm(candidate.brand)}_`)) return 'brand';
  // SN is receipt/collection metadata. The same linked variant can occur on two
  // receipts with different SN. Full article code + actual color/size/title remain mandatory.
  return '';
}
function failure(state, reasonCode, reason, extra = {}) { return { state, reasonCode, reason, ...extra }; }

export function chooseBarcode(sourceRow, candidates) {
  const parsed = parseForitCode(sourceRow);
  if (!parsed.code) return failure('missing', 'no_code', 'Nincs termékkód az Excel sorában.');
  const evaluated = (candidates || []).map(candidate => ({ candidate, reason: rejection(parsed, candidate) }));
  const matches = evaluated.filter(x => !x.reason).map(x => x.candidate);
  if (!matches.length) {
    const remaining = evaluated.filter(x => !['code', 'archived'].includes(x.reason));
    const reasons = new Set(remaining.map(x => x.reason));
    if (reasons.size === 1) {
      const why = [...reasons][0];
      const messages = {
        size: `A termékkód létezik, de a méret nem egyezik (${parsed.size}).`,
        color: `A termékkód és méret létezik, de a tényleges szín nem egyezik (${parsed.color}).`,
        title: `A kód, szín és méret egyezik, de a terméknév eltér (${parsed.title}).`,
        brand: 'A termékkód más márkához tartozik.',
      };
      return failure('missing', `${why}_mismatch`, messages[why]);
    }
    return failure('missing', parsed.legacyOnly ? 'legacy_code_not_found' : 'no_match',
      parsed.legacyOnly ? 'Ehhez a teljes ForIT-kódhoz nincs egyértelmű, mentett termékkapcsolat.' :
        'Nincs biztos termékkód–szín–méret egyezés az AllInFashionban.');
  }
  const byVariant = new Map();
  for (const candidate of matches) {
    const id = String(candidate.variantId);
    if (!byVariant.has(id)) byVariant.set(id, []);
    byVariant.get(id).push(candidate);
  }
  if (byVariant.size !== 1) return failure('ambiguous', 'multiple_variants',
    `Több (${byVariant.size}) különböző AllInFashion-variáns egyezik. Nem választok közülük automatikusan.`);
  const [variantId, rows] = [...byVariant.entries()][0];
  const tiers = { variant: [], supplier: [], import: [] };
  for (const row of rows) {
    if (text(row.barcode)) tiers.variant.push(text(row.barcode));
    if (text(row.supplierBarcode)) tiers.supplier.push(text(row.supplierBarcode));
    if (text(row.importBarcode)) tiers.import.push(text(row.importBarcode));
    for (const stored of row.fallbackBarcodes || []) {
      if (!['supplier', 'import'].includes(stored.source) || !text(stored.barcode)) continue;
      if (!parsed.legacyOnly && text(stored.title) && parsed.title &&
          !sameArticleTitle(parsed, stored.title, row.brand)) continue;
      tiers[stored.source].push(text(stored.barcode));
    }
  }
  // Same priority as the warehouse: current variant, then linked supplier barcode,
  // then barcode saved on a committed import. A lower-priority historical value
  // must never replace an existing current barcode.
  for (const [barcodeSource, values] of Object.entries(tiers)) {
    const unique = [...new Map(values.map(value => [codeKey(value), value])).values()];
    if (!unique.length) continue;
    if (unique.length !== 1) return failure('ambiguous', 'conflicting_barcodes',
      'Az azonosított variánshoz több eltérő mentett vonalkód tartozik.', { variantId });
    const barcode = unique[0];
    if (!/^[A-Za-z0-9._-]{1,90}$/.test(barcode)) return failure('missing', 'invalid_barcode',
      'A mentett vonalkód formátuma nem exportálható biztonságosan.', { variantId });
    return { state: 'matched', barcode, variantId, barcodeSource };
  }
  return failure('missing', 'no_barcode',
    'A terméket azonosítottam, de sem a variánsnál, sem a hozzá tartozó beszállítói/importadatokban nincs mentett vonalkód.', { variantId });
}

function mapCandidate(row, origin) {
  return {
    variantId: row.variant_id, productCode: first(row.supplier_product_code,
      sourceValue(row.source_normalized, ['supplierProductCode'])), snCod: row.sn_cod,
    sourceColor: first(row.source_color, sourceValue(row.source_raw, colorAliases), sourceValue(row.source_normalized, colorAliases)),
    sourceSize: row.supplier_size,
    sourceTitle: first(sourceValue(row.source_raw, titleAliases), sourceValue(row.source_normalized, titleAliases)),
    color: row.color_name, size: row.size, barcode: row.barcode,
    internalSku: row.internal_sku, legacyCode: row.legacy_code,
    title: row.title_ro, brand: row.brand, status: row.variant_status, origin,
  };
}
export function indexBarcodeCandidates(candidates) {
  const byProduct = new Map(), byLegacy = new Map();
  const add = (map, key, item) => { if (key) { if (!map.has(key)) map.set(key, []); map.get(key).push(item); } };
  for (const candidate of candidates) {
    add(byProduct, codeKey(candidate.productCode), candidate);
    for (const key of new Set([codeKey(candidate.legacyCode), codeKey(candidate.internalSku)])) add(byLegacy, key, candidate);
  }
  return row => {
    const parsed = parseForitCode(row);
    return [...new Set([...(byProduct.get(codeKey(parsed.supplierCode)) || []), ...(byLegacy.get(codeKey(parsed.code)) || [])])];
  };
}

export async function collectBarcodeCandidates(db, foritRows) {
  const parsed = foritRows.map(parseForitCode);
  const productCodes = [...new Set(parsed.filter(x => !x.legacyOnly).map(x => codeKey(x.supplierCode)))];
  const legacyCodes = [...new Set(parsed.map(x => codeKey(x.code)).filter(Boolean))];
  const result = [];
  if (productCodes.length) {
    const imports = await db.query(`/* forit:imports */
      SELECT r.variant_id::text AS variant_id,r.sn_cod,r.supplier_product_code,r.supplier_size,
             r.raw AS source_raw,r.normalized AS source_normalized,
             v.barcode,v.color_name,v.size,v.internal_sku,v.status AS variant_status,
             v.attributes->>'legacyProductCode' AS legacy_code,m.title_ro,b.name AS brand
      FROM aif_import_rows r
      JOIN aif_product_variants v ON v.id=r.variant_id
      JOIN aif_product_models m ON m.id=v.model_id
      LEFT JOIN aif_brands b ON b.id=m.brand_id
      WHERE r.status='committed' AND r.variant_id IS NOT NULL
        AND COALESCE(v.status,'active')<>'archived'
        AND (lower(btrim(COALESCE(r.supplier_product_code,'')))=ANY($1::text[])
          OR (NULLIF(btrim(r.supplier_product_code),'') IS NULL
            AND lower(btrim(COALESCE(r.normalized->>'supplierProductCode','')))=ANY($1::text[])))
    `, [productCodes]);
    result.push(...imports.rows.map(row => mapCandidate(row, 'import')));
    const suppliers = await db.query(`/* forit:suppliers */
      SELECT sc.variant_id::text AS variant_id,sc.supplier_product_code,sc.supplier_size,
             sc.supplier_color_name AS source_color,sc.raw AS source_normalized,
             v.barcode,v.color_name,v.size,v.internal_sku,v.status AS variant_status,
             v.attributes->>'legacyProductCode' AS legacy_code,m.title_ro,b.name AS brand
      FROM aif_variant_supplier_codes sc
      JOIN aif_product_variants v ON v.id=sc.variant_id
      JOIN aif_product_models m ON m.id=v.model_id
      LEFT JOIN aif_brands b ON b.id=m.brand_id
      WHERE COALESCE(sc.is_active,true)=true AND COALESCE(v.status,'active')<>'archived'
        AND lower(btrim(COALESCE(sc.supplier_product_code,'')))=ANY($1::text[])
    `, [productCodes]);
    result.push(...suppliers.rows.map(row => mapCandidate(row, 'supplier')));
  }
  if (legacyCodes.length) {
    const legacy = await db.query(`/* forit:legacy */
      SELECT v.id::text AS variant_id,v.barcode,v.color_name,v.size,v.internal_sku,
             v.status AS variant_status,v.attributes->>'legacyProductCode' AS legacy_code,
             m.title_ro,b.name AS brand
      FROM aif_product_variants v
      JOIN aif_product_models m ON m.id=v.model_id
      LEFT JOIN aif_brands b ON b.id=m.brand_id
      WHERE COALESCE(v.status,'active')<>'archived' AND (
        lower(btrim(COALESCE(v.internal_sku,'')))=ANY($1::text[])
        OR lower(btrim(COALESCE(v.attributes->>'legacyProductCode','')))=ANY($1::text[]))
    `, [legacyCodes]);
    result.push(...legacy.rows.map(row => mapCandidate(row, 'legacy')));
  }
  const ids = [...new Set(result.filter(row => !text(row.barcode)).map(row => String(row.variantId)))];
  if (ids.length) {
    // Load by the already identified variant ID, never by a loose model-number guess.
    const fallback = await db.query(`/* forit:fallbacks */
      SELECT sc.variant_id::text AS variant_id,'supplier'::text AS origin,
             sc.supplier_barcode AS stored_barcode,sc.supplier_color_name AS source_color,
             sc.supplier_size,sc.raw AS source_normalized,NULL::jsonb AS source_raw
      FROM aif_variant_supplier_codes sc
      WHERE sc.variant_id=ANY($1::uuid[]) AND COALESCE(sc.is_active,true)=true
      UNION ALL
      SELECT r.variant_id::text AS variant_id,'import'::text AS origin,
             NULL::text AS stored_barcode,NULL::text AS source_color,
             r.supplier_size,r.normalized AS source_normalized,r.raw AS source_raw
      FROM aif_import_rows r
      WHERE r.variant_id=ANY($1::uuid[]) AND r.status='committed'
    `, [ids]);
    const byVariant = new Map();
    for (const row of fallback.rows) {
      const id = String(row.variant_id);
      if (!byVariant.has(id)) byVariant.set(id, []);
      byVariant.get(id).push(row);
    }
    for (const candidate of result) {
      if (text(candidate.barcode)) continue;
      candidate.fallbackBarcodes = [];
      for (const row of byVariant.get(String(candidate.variantId)) || []) {
        const color = first(row.source_color, sourceValue(row.source_raw, colorAliases), sourceValue(row.source_normalized, colorAliases));
        if (color && norm(color) !== norm(candidate.color)) continue;
        if (text(row.supplier_size) && sizeKey(row.supplier_size) !== sizeKey(candidate.size)) continue;
        const barcode = first(row.stored_barcode, sourceValue(row.source_normalized, barcodeAliases), sourceValue(row.source_raw, barcodeAliases));
        if (!barcode) continue;
        candidate.fallbackBarcodes.push({ barcode, source: row.origin,
          title: first(sourceValue(row.source_raw, titleAliases), sourceValue(row.source_normalized, titleAliases)) });
      }
    }
  }
  return result;
}

export async function findBarcodeConflicts(db, matches) {
  const conflicts = new Map();
  const codes = [...new Set([...matches.values()].map(match => codeKey(match.barcode)))];
  if (!codes.length) return conflicts;
  const owners = await db.query(`/* forit:owners */
    SELECT v.id::text AS variant_id,v.barcode
    FROM aif_product_variants v
    WHERE lower(btrim(COALESCE(v.barcode,'')))=ANY($1::text[])
    UNION ALL
    SELECT sc.variant_id::text AS variant_id,sc.supplier_barcode AS barcode
    FROM aif_variant_supplier_codes sc
    JOIN aif_product_variants v ON v.id=sc.variant_id
    WHERE COALESCE(sc.is_active,true)=true AND COALESCE(v.status,'active')<>'archived'
      AND lower(btrim(COALESCE(sc.supplier_barcode,'')))=ANY($1::text[])
  `, [codes]);
  const byBarcode = new Map();
  const add = (barcode, id) => {
    const key = codeKey(barcode);
    if (!byBarcode.has(key)) byBarcode.set(key, new Set());
    byBarcode.get(key).add(String(id));
  };
  for (const row of owners.rows) add(row.barcode, row.variant_id);
  for (const match of matches.values()) add(match.barcode, match.variantId);
  for (const [rowNo, match] of matches) {
    if ([...(byBarcode.get(codeKey(match.barcode)) || [])].some(id => id !== String(match.variantId))) {
      conflicts.set(rowNo, failure('ambiguous', 'barcode_owned_elsewhere',
        'Ez a vonalkód másik variánshoz is kapcsolódik. Az ütköző kódot nem írtam az Excelbe.', { variantId: match.variantId }));
    }
  }
  return conflicts;
}
