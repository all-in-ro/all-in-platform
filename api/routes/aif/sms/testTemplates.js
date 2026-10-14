import { createHash } from 'node:crypto';
import { txt, fail, segmentInfo, smsText, gsm7TestAlternative, validateBlocks, upgradeLegacyTemplateBlocks, storeLabel } from './domain.js';

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const STORES = new Set(['main_warehouse', 'magazin_targu_secuiesc']);
const MODES = new Set(['original', 'gsm7']);
const DIAGNOSTIC = 'AllInFashion SMSLink PROBA: a kapcsolat mukodik. Ez egyetlen tesztuzenet Kerekes Zsoltnak. Ugyfeleknek nem ment SMS.';

// Pontosan a mentett blokkokat hasznaljuk: sem "Teszt-SMS." sor,
// sem onkenyes termek-/markanev nem kerulhet a valodi tesztbe.
export function managerTestTemplateBody(template, settings, locationCode, sample = {}) {
  if (!STORES.has(locationCode)) throw fail('Válassz érvényes üzletet.', 'sms_test_store', 400);
  const lang = template.language === 'ro' ? 'ro' : 'hu';
  const blocks = validateBlocks(upgradeLegacyTemplateBlocks(template.blocks, lang), template.kind);
  if (blocks.some(block => block.type === 'token' && block.value === 'categories') && !txt(sample.categoryName)) {
    throw fail('Válassz mintakategóriát a teszt-SMS előtt.', 'sms_test_category_required', 400);
  }
  const storeName = txt(settings.shopNames?.[locationCode]) || (locationCode === 'main_warehouse' ? 'AllInFashion Csíkszereda' : 'AllInFashion Kézdivásárhely');
  const address = txt(settings.shopAddresses?.[locationCode]);
  if (blocks.some(block => block.type === 'token' && block.value === 'brands') && !txt(sample.brandName)) {
    throw fail('Válassz mintamárkát a teszt-SMS előtt.', 'sms_test_brand_required', 400);
  }
  const values = {
    name: 'Kerekes Zsolt',
    store: storeLabel(settings, locationCode, storeName),
    storeName,
    storeAddress: address,
    brands: txt(sample.brandName),
    categories: txt(sample.categoryName),
    // Nem lehet valos kuponkent bevaltani; nincs DB-ben foglalt kod.
    coupon: 'NEMERVENYES',
    discount: lang === 'hu' ? 'minta kedvezmény' : 'reducere demonstrativă',
    expiry: '31.12.2099',
  };
  const message = blocks.map(block => {
    if (block.type === 'text') return block.value;
    const value = txt(values[block.value]);
    if (!value) throw fail('Az üzenetsablon kitöltéséhez hiányzik az adat: ' + block.value, 'sms_test_value_missing', 400);
    return value;
  }).join('');
  if (!message.trim()) throw fail('Az üzenetsablon üres.', 'sms_test_template_empty', 400);
  return smsText(message);
}

export async function managerTemplatePreview(db, settings, templateId, locationCode, options = {}) {
  const id = txt(templateId);
  const code = txt(locationCode || 'main_warehouse');
  const encodingMode = txt(options.encodingMode || 'original');
  if (!STORES.has(code)) throw fail('Érvénytelen üzlet.', 'sms_test_store', 400);
  if (!MODES.has(encodingMode)) throw fail('Érvénytelen SMS-próbaformátum.', 'sms_test_encoding', 400);
  let sourceMessage, templateName, sampleBrandId = '', sampleCategoryId = '';
  if (id === 'connection') {
    sourceMessage = DIAGNOSTIC;
    templateName = 'Kapcsolatpróba';
  } else {
    if (!UUID.test(id)) throw fail('Válassz mentett üzenetsablont.', 'sms_test_template', 400);
    const record = (await db.query('SELECT id,name,kind,language,blocks FROM aif_sms_templates WHERE id=$1 LIMIT 1', [id])).rows[0];
    if (!record) throw fail('A sablon már nem található.', 'sms_test_template_missing', 404);
    sampleBrandId = txt(options.sampleBrandId);
    let brandName = '';
    if (sampleBrandId) {
      if (!UUID.test(sampleBrandId)) throw fail('Érvénytelen mintamárka.', 'sms_test_brand', 400);
      const brand = (await db.query('SELECT name FROM aif_brands WHERE id=$1 AND is_active=true LIMIT 1', [sampleBrandId])).rows[0];
      if (!brand) throw fail('A kiválasztott mintamárka nem elérhető.', 'sms_test_brand', 409);
      brandName = brand.name;
    }
    sampleCategoryId = txt(options.sampleCategoryId);
    let categoryName = '';
    if (sampleCategoryId) {
      if (!UUID.test(sampleCategoryId)) throw fail('Érvénytelen mintakategória.', 'sms_test_category', 400);
      const category = (await db.query('SELECT name_ro,name_hu FROM aif_categories WHERE id=$1 AND is_active=true LIMIT 1', [sampleCategoryId])).rows[0];
      if (!category) throw fail('A kiválasztott mintakategória nem elérhető.', 'sms_test_category', 409);
      categoryName = txt(record.language === 'hu' ? (category.name_hu || category.name_ro) : category.name_ro);
    }
    sourceMessage = managerTestTemplateBody(record, settings, code, { brandName, categoryName });
    templateName = record.name;
  }
  const original = segmentInfo(sourceMessage);
  const parts = encodingMode === 'gsm7' ? segmentInfo(gsm7TestAlternative(original.message)) : original;
  const phone = txt(settings.testPhone);
  const fingerprint = createHash('sha256').update(JSON.stringify({
    id, code, sampleBrandId, sampleCategoryId, encodingMode, phone, sender: txt(settings.sender), message: parts.message
  })).digest('hex');
  return {
    templateId: id, templateName, locationCode: code, phone,
    sampleBrandId, sampleCategoryId, encodingMode, message: parts.message,
    segments: parts.segments, encoding: parts.encoding, fingerprint,
    modifiedForGsm7: encodingMode === 'gsm7' && original.message !== parts.message
  };
}
