// Identifies an existing AIF variant from the unchanged ForIT Cod/Denumire.
// Deliberately does not generate or reassign barcodes, nor guess by model code alone.
export function norm(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const SIZE_ENDINGS = [
  'ONE SIZE','ONE-SIZE','ONE_SIZE','OSFA','OSFY','OSFM','XXXL','XXXXL',
  '3XL','4XL','2XL','XXL','XL','XS','S','M','L','OS','UNI','UNIVERSAL',
];
export function sizeKey(value) {
  const k = norm(value);
  return ['one_size','onesize','os','osfm','universal','uni'].includes(k) ? 'one_size' : k;
}

export function parseForitCode(row) {
  const code = String(row?.code ?? '').trim();
  const name = String(row?.name ?? '').trim();
  const tokens = code.split('--').map(x => x.trim());
  if (tokens.length !== 3 || !tokens.every(Boolean)) {
    return { code, name, legacyOnly: true };
  }
  const [snCod, supplierCode, colorAndSize] = tokens;
  let size = '';
  let color = '';
  for (const ending of SIZE_ENDINGS) {
    if (colorAndSize.toUpperCase().endsWith(`-${ending}`)) {
      size = ending;
      color = colorAndSize.slice(0, -(ending.length + 1)).trim();
      break;
    }
  }
  if (!size) {
    const match = colorAndSize.match(/^(.+)-((?:\d{2,3})(?:\.\d)?|[A-Za-z]{1,5})$/);
    if (match) { color = match[1]; size = match[2]; }
  }
  if (!size || !color) return { code, name, legacyOnly: true };
  // ForIT Denumire usually encodes --PRODUCT NAME-CODE--COLOR-SIZE.
  const segments = name.split('--');
  const middle = segments.length === 3 ? segments[1].trim() : '';
  const suffix = `-${supplierCode}`;
  const title = middle.toLowerCase().endsWith(suffix.toLowerCase())
    ? middle.slice(0, -suffix.length).trim() : '';
  return { code, name, snCod, supplierCode, color, size, title, legacyOnly: false };
}

function getNonempty(...values) {
  return values.map(v => String(v ?? '').trim()).find(Boolean) || '';
}

function variantMatches(parsed, candidate) {
  if (!candidate?.variantId) return false;
  const exactLegacy = Boolean(norm(parsed.code) &&
    [candidate.legacyCode, candidate.internalSku].some(v => norm(v) === norm(parsed.code)));
  if (parsed.legacyOnly) return exactLegacy;
  // A previous ForIT migration may carry the exact full Cod in the legacy attributes
  // rather than the vendor product code mapping.
  if (!exactLegacy && norm(candidate.productCode) !== norm(parsed.supplierCode)) return false;
  if (!exactLegacy && candidate.snCod && norm(parsed.snCod) !== norm(candidate.snCod)) return false;
  if (sizeKey(candidate.size) !== sizeKey(parsed.size)) return false;
  if (candidate.sourceSize && sizeKey(candidate.sourceSize) !== sizeKey(parsed.size)) return false;
  if (norm(candidate.color) !== norm(parsed.color)) return false;
  if (candidate.sourceColor && norm(candidate.sourceColor) !== norm(parsed.color)) return false;
  // If ForIT explicitly includes the article title, it must match the current model.
  // This prevents MONTEVERDI NAGY/DOMBOR from colliding on model code 112430.
  if (parsed.title && norm(candidate.title) !== norm(parsed.title)) return false;
  if (candidate.brand && parsed.name && !norm(parsed.name).startsWith(`${norm(candidate.brand)}_`)) return false;
  return true;
}

export function chooseBarcode(sourceRow, candidates) {
  const parsed = parseForitCode(sourceRow);
  if (!parsed.code) return { state: 'missing', reason: 'Nincs termékkód.' };
  const matches = (candidates || []).filter(item => variantMatches(parsed, item));
  if (!matches.length) return { state: 'missing', reason: 'Nem találtam biztos egyezést a termékkód, szín és méret alapján.' };
  const byVariant = new Map();
  for (const row of matches) {
    const key = String(row.variantId);
    if (!byVariant.has(key)) byVariant.set(key, []);
    byVariant.get(key).push(row);
  }
  if (byVariant.size !== 1) return { state: 'ambiguous', reason: `Több (${byVariant.size}) különböző AllInFashion-variáns egyezik.` };
  const values = [...byVariant.values()][0].map(row => getNonempty(row.barcode)).filter(Boolean);
  const barcodes = [...new Set(values.map(x => x.toUpperCase()))];
  if (!barcodes.length) return { state: 'missing', reason: 'A megfelelő terméknek még nincs AllInFashion-vonalkódja.' };
  if (barcodes.length !== 1) return { state: 'ambiguous', reason: 'A variánshoz ellentmondó vonalkódok tartoznak.' };
  return { state: 'matched', barcode: values[0], variantId: byVariant.keys().next().value };
}

export async function collectBarcodeCandidates(db, foritRows) {
  const parsed = foritRows.map(parseForitCode);
  const productCodes = [...new Set(parsed.filter(x => !x.legacyOnly).map(x => x.supplierCode))];
  const legacyCodes = [...new Set(parsed.map(x => x.code))];
  const result = [];
  if (productCodes.length) {
    const importRows = await db.query(`
      SELECT r.variant_id::text AS variant_id, r.sn_cod, r.supplier_product_code,
             r.supplier_size,
             COALESCE(NULLIF(r.raw->>'CULOARE',''), NULLIF(r.normalized->>'colorName','')) AS source_color,
             v.barcode,v.color_name,v.size,v.internal_sku,
             v.attributes->>'legacyProductCode' AS legacy_code,
             m.title_ro,b.name AS brand
      FROM aif_import_rows r
      JOIN aif_product_variants v ON v.id=r.variant_id
      JOIN aif_product_models m ON m.id=v.model_id
      LEFT JOIN aif_brands b ON b.id=m.brand_id
      WHERE r.status='committed' AND r.variant_id IS NOT NULL
        AND r.supplier_product_code = ANY($1::text[])
    `, [productCodes]);
    result.push(...importRows.rows.map(row => ({
      variantId: row.variant_id, productCode: row.supplier_product_code, snCod: row.sn_cod,
      sourceColor: row.source_color, sourceSize: row.supplier_size,
      color: row.color_name, size: row.size, barcode: row.barcode,
      internalSku: row.internal_sku, legacyCode: row.legacy_code,
      title: row.title_ro, brand: row.brand, origin: 'import',
    })));
    const supplierRows = await db.query(`
      SELECT sc.variant_id::text AS variant_id, sc.supplier_product_code,
             sc.supplier_size,sc.supplier_color_name AS source_color,
             v.barcode,v.color_name,v.size,v.internal_sku,
             v.attributes->>'legacyProductCode' AS legacy_code,
             m.title_ro,b.name AS brand
      FROM aif_variant_supplier_codes sc
      JOIN aif_product_variants v ON v.id=sc.variant_id
      JOIN aif_product_models m ON m.id=v.model_id
      LEFT JOIN aif_brands b ON b.id=m.brand_id
      WHERE COALESCE(sc.is_active,true)=true
        AND sc.supplier_product_code = ANY($1::text[])
    `, [productCodes]);
    result.push(...supplierRows.rows.map(row => ({
      variantId: row.variant_id, productCode: row.supplier_product_code,
      sourceColor: row.source_color, sourceSize: row.supplier_size,
      color: row.color_name, size: row.size, barcode: row.barcode,
      internalSku: row.internal_sku, legacyCode: row.legacy_code,
      title: row.title_ro, brand: row.brand, origin: 'supplier',
    })));
  }
  if (legacyCodes.length) {
    const existing = await db.query(`
      SELECT v.id::text AS variant_id,v.barcode,v.color_name,v.size,v.internal_sku,
             v.attributes->>'legacyProductCode' AS legacy_code,
             m.title_ro,b.name AS brand
      FROM aif_product_variants v
      JOIN aif_product_models m ON m.id=v.model_id
      LEFT JOIN aif_brands b ON b.id=m.brand_id
      WHERE v.internal_sku = ANY($1::text[])
         OR v.attributes->>'legacyProductCode' = ANY($1::text[])
    `, [legacyCodes]);
    result.push(...existing.rows.map(row => ({
      variantId: row.variant_id, legacyCode: row.legacy_code, internalSku: row.internal_sku,
      barcode: row.barcode, title: row.title_ro, brand: row.brand,
      color: row.color_name, size: row.size, origin: 'legacy',
    })));
  }
  return result;
}
