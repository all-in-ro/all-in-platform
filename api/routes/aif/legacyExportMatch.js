// Read-only ForIT matching. No barcode generation and no inventory/product writes.
export const FORIT_EXPORT_VERSION = '20261015.3';
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
  const nameParts = name.split('--').map(text);
  let prefixBrand = '', prefixGender = '', prefixCategory = '';
  let inputError = '';
  if (nameParts.length === 3 && (!title || norm(nameParts[2]) !== norm(colorAndSize))) {
    inputError = 'Az A (Denumire) és D (Cod) oszlop cikkszáma, színe vagy mérete ellentmond egymásnak.';
  }
  if (nameParts.length === 3 && codeKey(nameParts[0]).endsWith(codeKey(`-${snCod}`))) {
    const head = nameParts[0].slice(0, -(snCod.length + 1)).split('-').map(text);
    if (head.length >= 3) {
      prefixCategory = head.pop(); prefixGender = head.pop(); prefixBrand = head.join('-');
      if ((text(row?.category) && categoryKey(row.category) && categoryKey(prefixCategory) !== categoryKey(row.category)) ||
          (text(row?.gender) && genderKey(prefixGender) !== genderKey(row.gender))) {
        inputError = 'Az A oszlopban szereplő terméktípus vagy nem eltér a külön oszlop értékétől.';
      }
    }
  } else if (nameParts.length === 3) {
    inputError = 'Az A (Denumire) és D (Cod) oszlop S/N-azonosítója nem egyezik.';
  }
  if ((text(row?.color) && norm(row.color) !== norm(color)) ||
      (text(row?.size) && sizeKey(row.size) !== sizeKey(size)) ||
      (text(row?.snCod) && norm(row.snCod) !== norm(snCod))) {
    inputError = 'Az Excel külön szín-, méret- vagy S/N-mezője eltér a teljes termékazonosítótól.';
  }
  return { code, name, snCod, supplierCode, color, size, title, prefixBrand, prefixGender, prefixCategory, inputError, legacyOnly: false };
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
        if (norm(key).replace(/_/g, '') === norm(alias).replace(/_/g, '') && value != null && typeof value !== 'object' && text(value)) return text(value);
      }
    }
  }
  return '';
}
const first = (...values) => values.map(text).find(Boolean) || '';
const colorAliases = ['CULOARE', 'colorName', 'color_name', 'SZIN NEV'];
const titleAliases = ['ARTICOL/ DENUMIRE PRODUS', 'ARTICOL', 'TERMEK NEV', 'titleRo', 'productName', 'Denumire', 'Denumire produs'];
const snAliases = ['snCod', 'S/N/COD', 'S/N', 'SN EV HONAP', 'serialCode'];
const categoryAliases = ['RODESCR', 'productType', 'Categorie', 'subcategoryName'];
const genderAliases = ['genderRaw', 'GEN', 'DEPT', 'gender'];
const materialAliases = ['COMPOZITIE', 'material', 'composition', 'DESCRIERE'];
const fullNameAliases = ['Denumire', 'Denumire produs', 'legacyOriginalTitle'];
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
  const exactLegacy = [candidate.legacyCode, candidate.internalSku, ...(candidate.fullCodes || [])].some(v =>
    codeKey(v) && codeKey(v) === codeKey(parsed.code));
  if (parsed.legacyOnly) return exactLegacy ? '' : 'code';
  if (!exactLegacy && !sameFullName(parsed, candidate) && codeKey(candidate.productCode) !== codeKey(parsed.supplierCode)) return 'code';
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
  if (parsed.inputError) return failure('missing', 'input_identity_conflict', parsed.inputError);
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
        'Nincs biztos termékkód–szín–méret–név egyezés az AllInFashionban.');
  }
  let byVariant = groupVariants(matches);
  const originalCount = byVariant.size;
  const resolution = resolveRowIdentity(sourceRow, parsed, byVariant);
  if (!resolution.variantId) return failure('ambiguous', resolution.reasonCode || 'multiple_variants',
    resolution.reason || `A teljes sor és az árak ellenőrzése után is ${byVariant.size} variáns maradt. Az eltérések lent láthatók.`,
    { candidateCount: byVariant.size, candidates: describeCandidates(sourceRow, parsed, byVariant) });
  byVariant = new Map([[resolution.variantId, byVariant.get(resolution.variantId)]]);
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
    return { state: 'matched', barcode, variantId, barcodeSource,
      matchMethod: resolution.method, matchFields: resolution.fields,
      resolvedAmbiguity: originalCount > 1, candidateCount: originalCount };
  }
  return failure('missing', 'no_barcode',
    'A terméket azonosítottam, de sem a variánsnál, sem a hozzá tartozó beszállítói/importadatokban nincs mentett vonalkód.', { variantId });
}

// Money is compared in bani, never by string or exact floating point equality.
export function moneyCents(value) {
  if (value == null || text(value) === '') return null;
  let token = text(value).replace(/\s|\u00a0/g, '').replace(/(?:RON|LEI)$/i, '');
  if (token.includes(',') && token.includes('.')) {
    token = token.lastIndexOf(',') > token.lastIndexOf('.')
      ? token.replace(/\./g, '').replace(',', '.') : token.replace(/,/g, '');
  } else token = token.replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) return null;
  const amount = Number(token);
  if (!Number.isFinite(amount) || Math.abs(amount) > 1e10) return null;
  return Math.round((amount + Math.sign(amount) * 1e-9) * 100);
}
const amount = value => { const cents = moneyCents(value); return cents === null ? null : cents / 100; };
function categoryKey(value) {
  let key = norm(value).replace(/^imbracaminte_/, '');
  if (['', 'fashion', 'imbracaminte', 'clothing', 'haine', 'marfa'].includes(key)) return '';
  return ({ pantaloni: 'pantaloni', pantalon: 'pantaloni', bluze: 'bluza', bluz: 'bluza',
    rochii: 'rochie', jacheta: 'jachete' })[key] || key;
}
function genderKey(value) {
  const key = norm(value);
  return ({ women: 'women', woman: 'women', female: 'women', femeie: 'women', femei: 'women', dama: 'women', feminin: 'women', noi: 'women', no: 'women',
    men: 'men', man: 'men', male: 'men', barbat: 'men', barbati: 'men', masculin: 'men', ferfi: 'men',
    boys: 'boys', baiat: 'boys', baieti: 'boys', fiu: 'boys', girls: 'girls', fata: 'girls', fete: 'girls', lany: 'girls',
    kids: 'kids', copii: 'kids', copil: 'kids', unisex: 'unisex' })[key] || key;
}
function materialKey(value) {
  // A free-form marketing description is not a composition identifier.
  if (!text(value).includes('%')) return '';
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\s+/g, '').replace(/,/g, '.');
}
function groupVariants(rows) {
  const map = new Map();
  for (const row of rows) { const id = String(row.variantId); if (!map.has(id)) map.set(id, []); map.get(id).push(row); }
  return map;
}
const fieldNames = { fullName: 'A: teljes terméknév', fullCode: 'D: teljes azonosító', sku: 'SKU',
  category: 'terméktípus', gender: 'nem', material: 'anyagösszetétel', sellPrice: 'eladási ár', buyPrice: 'vételár' };
function rowWants(row, parsed) {
  const prefix = text(row.name).split('--')[0];
  // Category and gender are primarily taken from explicit columns. The A-column
  // prefix is also validated when reconstructing the complete stored identity.
  return { category: categoryKey(row.category || parsed.prefixCategory), gender: genderKey(row.gender || parsed.prefixGender),
    material: materialKey(row.material), sellPrice: moneyCents(row.sellPrice), buyPrice: moneyCents(row.buyPrice),
    prefix, parsed };
}
function sameFullName(row, candidate) {
  return [candidate.title, candidate.sourceTitle, ...(candidate.fullNames || [])]
    .some(value => text(value) && norm(value) === norm(row.name));
}
function sameFullCode(row, parsed, candidate) {
  return [candidate.internalSku, candidate.legacyCode, ...(candidate.fullCodes || [])]
    .some(value => text(value) && codeKey(value) === codeKey(row.code));
}
function sameSourceIdentity(row, parsed, candidate) {
  if (parsed.legacyOnly || !parsed.prefixBrand || !parsed.prefixGender || !parsed.prefixCategory) return false;
  const contexts = [
    { sn: candidate.snCod, title: candidate.sourceTitle || candidate.title,
      gender: candidate.sourceGender || candidate.gender, category: candidate.sourceCategory || candidate.category },
    { sn: candidate.variantSnCod, title: candidate.title, gender: candidate.gender, category: candidate.category },
  ];
  return contexts.some(c => text(c.sn) && norm(c.sn) === norm(parsed.snCod) &&
    sameArticleTitle(parsed, c.title, candidate.brand) && norm(candidate.brand) === norm(parsed.prefixBrand) &&
    genderKey(c.gender) === genderKey(parsed.prefixGender) && categoryKey(c.category) === categoryKey(parsed.prefixCategory));
}
function profilesFor(row, parsed, candidate) {
  const current = { category: categoryKey(candidate.category) || categoryKey(candidate.sourceCategory),
    gender: genderKey(candidate.gender) || genderKey(candidate.sourceGender),
    material: materialKey(candidate.material) || materialKey(candidate.sourceMaterial), sellPrice: moneyCents(candidate.sellPrice), buyPrice: moneyCents(candidate.buyPrice) };
  const source = { category: categoryKey(candidate.sourceCategory) || current.category,
    gender: genderKey(candidate.sourceGender) || current.gender,
    material: materialKey(candidate.sourceMaterial) || current.material,
    // Do not combine an old receipt's purchase price with another receipt's selling price.
    sellPrice: moneyCents(candidate.sourceSellPrice), buyPrice: moneyCents(candidate.sourceBuyPrice) };
  const sourceTitleAgrees = !parsed.title || !text(candidate.sourceTitle) || sameArticleTitle(parsed, candidate.sourceTitle, candidate.brand);
  const hasSourcePrice = sourceTitleAgrees && (source.sellPrice != null || source.buyPrice != null);
  const hasCurrentPrice = current.sellPrice != null || current.buyPrice != null;
  // A second price-less profile must not make a known price mismatch disappear.
  const values = !hasSourcePrice || hasCurrentPrice ? [{ kind: 'current', values: current }] : [];
  if (hasSourcePrice) values.push({ kind: 'source', values: source });
  return values.map(profile => {
    const wanted = rowWants(row, parsed), equal = [], different = [], unknown = [];
    for (const field of ['category', 'gender', 'material', 'sellPrice', 'buyPrice']) {
      const target = wanted[field];
      if (target == null || target === '') continue;
      const value = profile.values[field];
      if (value == null || value === '') unknown.push(field);
      else (value === target ? equal : different).push(field);
    }
    return { ...profile, equal, different, unknown };
  });
}
function resolveRowIdentity(row, parsed, variants) {
  const baseFields = parsed.legacyOnly ? ['teljes termékazonosító'] : ['teljes cikkszám', 'szín', 'méret', 'terméknév'];
  if (variants.size === 1) return { variantId: variants.keys().next().value, method: 'unique_product', fields: baseFields };
  // Independent explicit identifiers must agree. Never let a price override a
  // different exact SKU/full-name/full-code assignment.
  const explicit = [
    ['fullName', c => text(row.name) && sameFullName(row, c)],
    ['fullCode', c => sameFullCode(row, parsed, c)],
    ['sku', c => text(row.sku) && codeKey(row.sku) === codeKey(c.internalSku)],
  ].map(([field, predicate]) => ({ field, ids: new Set([...variants].filter(([, rows]) => rows.some(predicate)).map(([id]) => id)) }))
    .filter(signal => signal.ids.size);
  let allowed = new Set(variants.keys());
  const fields = [...baseFields];
  for (const signal of explicit) {
    allowed = new Set([...allowed].filter(id => signal.ids.has(id)));
    fields.push(fieldNames[signal.field]);
  }
  if (!allowed.size) return { reasonCode: 'identity_evidence_conflict',
    reason: 'Az A oszlop, a teljes kód/S/N vagy az SKU különböző variánsokra mutat. Az ellentmondó adatokat nem döntöm el ár alapján.' };
  if (allowed.size === 1) return { variantId: [...allowed][0], method: 'full_identity', fields };
  // Reconstruct the A-column's brand/type/gender/SN/article/color/size from one
  // stored source context. A bare SN hit is insufficient and cannot override an
  // exact persisted A/D/SKU identity.
  const sourceIds = [...allowed].filter(id => variants.get(id).some(c => sameSourceIdentity(row, parsed, c)));
  if (sourceIds.length) {
    allowed = new Set(sourceIds);
    fields.push('A: teljes név + típus + nem + S/N');
    if (allowed.size === 1) return { variantId: [...allowed][0], method: 'source_identity', fields };
  }
  const alternatives = new Map([...allowed].map(id => [id, variants.get(id).flatMap(c => profilesFor(row, parsed, c))]));
  // A candidate is eliminated only by an actual recorded contradiction, not by
  // missing data. A coherent current record OR a coherent receipt can support it.
  const viable = [...alternatives].filter(([, profiles]) => profiles.some(p => !p.different.length));
  if (viable.length === 1) {
    const [id, profiles] = viable[0];
    const positive = profiles.filter(p => !p.different.length && p.equal.length)
      .sort((a, b) => b.equal.length - a.equal.length || a.unknown.length - b.unknown.length)[0];
    if (positive) return { variantId: id, method: positive.kind === 'source' ? 'source_row' : 'row_attributes',
      fields: [...fields, ...positive.equal.map(field => fieldNames[field])] };
  }
  return { reasonCode: viable.length === 0 ? 'row_values_conflict' : 'multiple_variants',
    reason: viable.length === 0
      ? 'A jelöltek közül egyiknél sem egyezik egy összetartozó adatsoron a termékadat és az ár. A konkrét eltérések lent láthatók.'
      : viable.length > 1 ? `A teljes név, S/N, típus, nem, összetétel és árak vizsgálata után is több (${viable.length}) variáns lehetséges. Nincs bizonyított egyedi egyezés.`
        : 'Az egyetlen fennmaradó jelölt adatából sem igazolható a teljes sor egyezése. A hiányzó adat nem számít egyezésnek.' };
}
function describeCandidates(row, parsed, variants) {
  return [...variants].slice(0, 8).map(([variantId, rows]) => {
    const head = rows[0], uniq = values => [...new Set(values.filter(value => value != null && value !== ''))];
    return { variantId, title: head.title, productCode: head.productCode,
      color: head.color, size: head.size, sellPrice: amount(head.sellPrice), buyPrice: amount(head.buyPrice),
      category: head.category || '', gender: head.gender || '', material: head.material || '',
      snCodes: uniq(rows.flatMap(c => [c.snCod, c.variantSnCod])),
      sourceSellPrices: uniq(rows.map(c => amount(c.sourceSellPrice))),
      sourceBuyPrices: uniq(rows.map(c => amount(c.sourceBuyPrice))),
      exactName: rows.some(c => sameFullName(row, c)), exactCode: rows.some(c => sameFullCode(row, parsed, c)),
      // No price/title/color from separate records is silently combined here.
      comparisons: rows.flatMap(c => profilesFor(row, parsed, c).map(p => ({
        kind: p.kind, source: c.sourceReference || '',
        equal: p.equal.map(field => fieldNames[field]), different: p.different.map(field => fieldNames[field]),
        unknown: p.unknown.map(field => fieldNames[field]),
      }))).filter((p, i, all) => all.findIndex(v => JSON.stringify(v) === JSON.stringify(p)) === i).slice(0, 6) };
  });
}
function sourcePrice(row, field) {
  const direct = row[field === 'sell' ? 'source_sell_price_ron' : 'source_buy_price_ron'];
  if (moneyCents(direct) != null) return direct;
  const normalized = row.source_normalized, raw = row.source_raw;
  const ron = sourceValue(normalized, field === 'sell' ? ['sellPriceRon', 'sellPriceGrossRon'] : ['buyPriceRon']);
  if (moneyCents(ron) != null) return ron;
  const currency = sourceValue(normalized, field === 'sell' ? ['sellPriceCurrency', 'sell_price_currency'] : ['currencyCode', 'currency']);
  // Without a known RON price a foreign-currency source cannot discriminate variants.
  if (currency && !['ron', 'lei'].includes(codeKey(currency))) return null;
  const explicitlyRon = ['ron', 'lei'].includes(codeKey(currency)) || row.source_is_ron === true ||
    (field === 'sell' && codeKey(sourceValue(normalized, ['sellPriceIsRon'])) === 'true');
  if (!explicitlyRon) return null;
  if (field === 'sell' && codeKey(sourceValue(normalized, ['sellPriceIncludesTva', 'salesPriceIncludesTva'])) === 'false') return null;
  return first(sourceValue(normalized, field === 'sell' ? ['sellPrice'] : ['buyPrice']),
    sourceValue(raw, field === 'sell' ? ['PretVanz', 'PRET DE VANZARE', 'PRET DE VINZARE', 'ELADASI AR'] : ['PretAchiz', 'PRET DE ACHIZITIE', 'VETELAR'])) || null;
}
function mapCandidate(row, origin) {
  const attributes = object(row.variant_attributes);
  return {
    variantId: row.variant_id, productCode: first(row.supplier_product_code,
      sourceValue(row.source_normalized, ['supplierProductCode'])),
    snCod: first(row.sn_cod, sourceValue(row.source_normalized, snAliases), sourceValue(row.source_raw, snAliases)),
    variantSnCod: row.variant_sn_cod,
    sourceColor: first(row.source_color, sourceValue(row.source_raw, colorAliases), sourceValue(row.source_normalized, colorAliases)),
    sourceSize: first(row.supplier_size, sourceValue(row.source_normalized, ['size', 'supplierSize']), sourceValue(row.source_raw, ['MARIME', 'size'])),
    sourceTitle: first(sourceValue(row.source_raw, titleAliases), sourceValue(row.source_normalized, titleAliases)),
    color: row.color_name, size: row.size, barcode: row.barcode,
    internalSku: row.internal_sku, legacyCode: row.legacy_code,
    title: row.title_ro, brand: row.brand, status: row.variant_status, origin,
    sellPrice: row.sell_price, buyPrice: row.buy_price,
    category: row.product_type, gender: row.gender, material: row.material,
    sourceSellPrice: sourcePrice(row, 'sell'), sourceBuyPrice: sourcePrice(row, 'buy'),
    sourceCategory: first(sourceValue(row.source_raw, categoryAliases), sourceValue(row.source_normalized, categoryAliases)),
    sourceGender: first(sourceValue(row.source_raw, genderAliases), sourceValue(row.source_normalized, genderAliases)),
    sourceMaterial: first(sourceValue(row.source_raw, materialAliases), sourceValue(row.source_normalized, materialAliases)),
    sourceReference: row.source_reference || '',
    fullNames: [attributes.legacyOriginalTitle, sourceValue(row.source_raw, fullNameAliases), sourceValue(row.source_normalized, fullNameAliases)].filter(Boolean),
    fullCodes: [attributes.legacyOriginalProductCode, sourceValue(row.source_raw, ['Cod', 'legacyProductCode']),
      sourceValue(row.source_normalized, ['legacyProductCode'])].filter(Boolean),
  };
}
export function indexBarcodeCandidates(candidates) {
  const byProduct = new Map(), byLegacy = new Map(), byName = new Map();
  const add = (map, key, item) => { if (key) { if (!map.has(key)) map.set(key, []); map.get(key).push(item); } };
  for (const candidate of candidates) {
    add(byProduct, codeKey(candidate.productCode), candidate);
    for (const key of new Set([candidate.legacyCode, candidate.internalSku, ...(candidate.fullCodes || [])].map(codeKey))) add(byLegacy, key, candidate);
    for (const name of new Set([candidate.title, candidate.sourceTitle, ...(candidate.fullNames || [])].map(norm))) add(byName, name, candidate);
  }
  return row => {
    const parsed = parseForitCode(row);
    return [...new Set([...(byProduct.get(codeKey(parsed.supplierCode)) || []), ...(byLegacy.get(codeKey(parsed.code)) || []), ...(byLegacy.get(codeKey(row.sku)) || []), ...(byName.get(norm(row.name)) || [])])];
  };
}

export async function collectBarcodeCandidates(db, foritRows) {
  const parsed = foritRows.map(parseForitCode);
  const productCodes = [...new Set(parsed.filter(x => !x.legacyOnly).map(x => codeKey(x.supplierCode)))];
  const legacyCodes = [...new Set(foritRows.flatMap(x => [codeKey(x.code), codeKey(x.sku)]).filter(Boolean))];
  const fullNames = [...new Set(foritRows.map(x => codeKey(x.name)).filter(Boolean))];
  const result = [];
  if (productCodes.length) {
    const imports = await db.query(`/* forit:imports */
      SELECT r.variant_id::text AS variant_id,r.sn_cod,r.supplier_product_code,r.supplier_size,
             r.raw AS source_raw,r.normalized AS source_normalized,
             r.sell_price_ron AS source_sell_price_ron,r.buy_price_ron AS source_buy_price_ron,
             ('import ' || r.batch_id::text || ' / ' || r.row_no::text) AS source_reference,
             v.barcode,v.color_name,v.size,v.internal_sku,v.status AS variant_status,
             v.attributes->>'legacyProductCode' AS legacy_code,m.title_ro,b.name AS brand,
             v.sell_price,v.buy_price,v.sn_cod AS variant_sn_cod,v.attributes AS variant_attributes,
             m.product_type,m.gender,m.material
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
             v.attributes->>'legacyProductCode' AS legacy_code,m.title_ro,b.name AS brand,
             v.sell_price,v.buy_price,v.sn_cod AS variant_sn_cod,v.attributes AS variant_attributes,
             m.product_type,m.gender,m.material
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
             m.title_ro,b.name AS brand,
             v.sell_price,v.buy_price,v.sn_cod AS variant_sn_cod,v.attributes AS variant_attributes,
             m.product_type,m.gender,m.material
      FROM aif_product_variants v
      JOIN aif_product_models m ON m.id=v.model_id
      LEFT JOIN aif_brands b ON b.id=m.brand_id
      WHERE COALESCE(v.status,'active')<>'archived' AND (
        lower(btrim(COALESCE(v.internal_sku,'')))=ANY($1::text[])
        OR lower(btrim(COALESCE(v.attributes->>'legacyProductCode','')))=ANY($1::text[])
        OR lower(btrim(COALESCE(v.attributes->>'legacyOriginalProductCode','')))=ANY($1::text[])
        OR lower(btrim(COALESCE(m.title_ro,'')))=ANY($2::text[])
        OR lower(btrim(COALESCE(v.attributes->>'legacyOriginalTitle','')))=ANY($2::text[]))
    `, [legacyCodes, fullNames]);
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
