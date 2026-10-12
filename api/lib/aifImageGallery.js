/** AllInFashion – a régi image_url mellett használt sorrendezett képgaléria. */
export const AIF_MAX_GALLERY_IMAGES = 60;

export function aifImageUrl(value) {
  const url = String(value ?? '').trim();
  if (!/^https:\/\//i.test(url) || url.length > 2048) return '';
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '' ? url : '';
  } catch { return ''; }
}

export function aifImageGallery(value, legacyPrimary = '', options = {}) {
  let input = value;
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      input = Array.isArray(parsed) ? parsed : [input];
    } catch { input = [input]; }
  }
  if (!Array.isArray(input)) input = input && typeof input === 'object' ? [input] : [];
  const urls = [];
  const seen = new Set();
  const add = (value) => {
    const url = aifImageUrl(value && typeof value === 'object'
      ? value.url ?? value.src ?? value.imageUrl ?? value.image_url
      : value);
    if (!url || seen.has(url)) return;
    if (urls.length >= AIF_MAX_GALLERY_IMAGES) return;
    urls.push(url);
    seen.add(url);
  };
  for (const item of input) add(item);
  const primary = aifImageUrl(legacyPrimary);
  if (primary && !seen.has(primary) && options.includeLegacy !== false) urls.unshift(primary);
  return urls.slice(0, AIF_MAX_GALLERY_IMAGES);
}

/** Új listánál az első URL a fő kép, az üres lista szándékos törlés. */
export function aifValidatedGallery(value) {
  if (!Array.isArray(value)) throw Object.assign(new Error('A képgaléria csak képlistaként menthető.'), { statusCode: 400 });
  if (value.length > AIF_MAX_GALLERY_IMAGES) throw Object.assign(new Error(`Legfeljebb ${AIF_MAX_GALLERY_IMAGES} kép adható egy változathoz.`), { statusCode: 400 });
  for (const item of value) {
    const url = item && typeof item === 'object' ? item.url ?? item.src : item;
    if (!aifImageUrl(url)) throw Object.assign(new Error('A képekhez nyilvános HTTPS URL szükséges.'), { statusCode: 400 });
  }
  return aifImageGallery(value, '', { includeLegacy: false });
}
