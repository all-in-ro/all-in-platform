/**
 * Shopify-színnevek biztonságos, csak MEGJELENÍTÉSI egységesítése.
 * Az AllIn eredeti színkódját, termékazonosítóját, SKU-ját nem írja át.
 * A karakterkészlet, betűméret, ékezet és többszörös szóköz azonosításhoz
 * nem számít; különböző szavakat / gyári színkódokat NEM egyesít.
 */
export function colorIdentityKey(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('ro');
}

// Csak igazolt és egyértelmű elnevezések, nem teljes "színszótár".
const KNOWN_LABELS = new Map([
  ['verde inchis', 'Verde închis'],
]);

function displayScore(value) {
  const raw = String(value ?? '').trim();
  const letters = [...raw].filter(char => /\p{L}/u.test(char));
  const upper = letters.filter(char => char === char.toUpperCase() && char !== char.toLowerCase()).length;
  const marks = (raw.normalize('NFD').match(/[\u0300-\u036f]/g) || []).length;
  // Diakritikus, természetes írásmód > teljesen nagybetűs / kódjellegű.
  return marks * 100 + (letters.length ? (1 - upper / letters.length) * 10 : 0);
}

/**
 * Kizárólag azonos, ékezet- és kisbetűfüggetlen nevek közül választ.
 * Ha az inputok NEM egyeznek identitásban, hibát jelez.
 */
export function preferredColorLabel(values) {
  const names = [...new Set((values || []).map(v => String(v ?? '').trim().replace(/\s+/gu, ' ')).filter(Boolean))];
  if (!names.length) return '';
  const key = colorIdentityKey(names[0]);
  if (names.some(name => colorIdentityKey(name) !== key)) {
    throw new Error('COLOR_IDENTITY_MISMATCH: különböző színeket nem lehet így összevonni.');
  }
  if (KNOWN_LABELS.has(key)) return KNOWN_LABELS.get(key);
  return names.slice().sort((a, b) => displayScore(b) - displayScore(a) || a.localeCompare(b, 'ro'))[0];
}

/** Új export esetén CSAK a biztosan ismert különleges feliratok javítása. */
export function canonicalShopifyColorLabel(value) {
  const raw = String(value ?? '').trim().replace(/\s+/gu, ' ');
  if (!raw) return '';
  return KNOWN_LABELS.get(colorIdentityKey(raw)) || raw;
}
