import { createHash } from 'node:crypto';
import { txt, fail, segmentInfo, smsText, smsLinkTransportText, gsm7TestAlternative, phoneNumber, validateBlocks, upgradeLegacyTemplateBlocks, storeLabel } from './domain.js';

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const STORES = new Set(['main_warehouse', 'magazin_targu_secuiesc']);
const MODES = new Set(['auto', 'original', 'gsm7']);
const DIAGNOSTIC = 'AllInFashion SMSLink PROBA: a kapcsolat mukodik. Ez egyetlen tesztuzenet Kerekes Zsoltnak. Ugyfeleknek nem ment SMS.';

// A manager tesztszamahoz tartozo kliens ELOZETESEN MENTETT erdeklodeseit
// hasznaljuk a mintaadatokhoz. A teszt ettol meg KIZAROLAG a mentett
// admin tesztszamra megy; kliens-cimzettlista vagy jovahagyas nem szukseges.
async function managerSavedInterests(db, settings, locationCode, lang) {
  const phone=phoneNumber(settings.testPhone);
  if(!phone)return {brandName:'',categoryName:'',source:'nincs mentett próbaszám'};
  const rows=(await db.query(`
    SELECT p.brands,p.categories,p.all_brands,p.consent,c.full_name
    FROM aif_shop_customers c
    JOIN aif_locations l ON l.id=c.location_id
    JOIN aif_sms_preferences p ON p.customer_id=c.id
    WHERE c.is_active=true AND l.code=$2
      AND right(regexp_replace(COALESCE(c.phone,''),'[^0-9]','','g'),9)=$1
    ORDER BY CASE WHEN lower(btrim(c.full_name))=lower('Kerekes Zsolt') THEN 0 ELSE 1 END,
      CASE WHEN p.consent=true THEN 0 ELSE 1 END,
      p.updated_at DESC NULLS LAST
    LIMIT 1`,[phone.slice(-9),locationCode])).rows;
  const profile=rows[0];
  if(!profile)return {brandName:'',categoryName:'',source:'általános minta'};
  let brandName='',categoryName='';
  const brandIds=Array.isArray(profile.brands)?profile.brands.filter(x=>UUID.test(String(x))):[];
  if(!profile.all_brands&&brandIds.length){
    const names=(await db.query('SELECT name FROM aif_brands WHERE id=ANY($1::uuid[]) AND is_active=true ORDER BY name ASC',[brandIds])).rows;
    brandName=names.slice(0,12).map(x=>txt(x.name)).filter(Boolean).join(', ');
  }
  const categoryIds=Array.isArray(profile.categories)?profile.categories.filter(x=>UUID.test(String(x))):[];
  if(categoryIds.length){
    const names=(await db.query('SELECT name_ro,name_hu FROM aif_categories WHERE id=ANY($1::uuid[]) AND is_active=true ORDER BY name_ro ASC',[categoryIds])).rows;
    categoryName=names.slice(0,12).map(x=>txt(lang==='hu'?(x.name_hu||x.name_ro):x.name_ro)).filter(Boolean).join(', ');
  }
  return {brandName,categoryName,source:'Mentett kliensérdeklődés'};
}

// Pontosan a mentett blokkokat hasznaljuk: sem "Teszt-SMS." sor,
// sem onkenyes termek-/markanev nem kerulhet a valodi tesztbe.
export function managerTestTemplateBody(template, settings, locationCode, sample = {}) {
  if (!STORES.has(locationCode)) throw fail('Válassz érvényes üzletet.', 'sms_test_store', 400);
  const lang = template.language === 'ro' ? 'ro' : 'hu';
  const blocks = validateBlocks(upgradeLegacyTemplateBlocks(template.blocks, lang), template.kind);
  const storeName = txt(settings.shopNames?.[locationCode]) || (locationCode === 'main_warehouse' ? 'AllInFashion Csíkszereda' : 'AllInFashion Kézdivásárhely');
  const address = txt(settings.shopAddresses?.[locationCode]);
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
    if (!value) throw fail('A sablonban szereplő '+block.value+' mezőhöz nincs kiválasztható valós mintaadat. Távolítsd el a mezőt a sablonból, vagy állíts be hozzá tényleges kliensérdeklődést.', 'sms_test_value_missing', 400);
    return value;
  }).join('');
  if (!message.trim()) throw fail('Az üzenetsablon üres.', 'sms_test_template_empty', 400);
  return smsText(message);
}

export async function managerTemplatePreview(db, settings, templateId, locationCode, options = {}) {
  const id = txt(templateId);
  const code = txt(locationCode || 'main_warehouse');
  const encodingMode = txt(options.encodingMode || 'auto');
  if (!STORES.has(code)) throw fail('Érvénytelen üzlet.', 'sms_test_store', 400);
  if (!MODES.has(encodingMode)) throw fail('Érvénytelen SMS-próbaformátum.', 'sms_test_encoding', 400);
  let sourceMessage, templateName, sampleBrandId = '', sampleCategoryId = '', sampleSource='', kind='connection';
  if (id === 'connection') {
    sourceMessage = DIAGNOSTIC;
    templateName = 'Kapcsolatpróba';
  } else {
    if (!UUID.test(id)) throw fail('Válassz mentett üzenetsablont.', 'sms_test_template', 400);
    const record = (await db.query('SELECT id,name,kind,language,blocks FROM aif_sms_templates WHERE id=$1 LIMIT 1', [id])).rows[0];
    if (!record) throw fail('A sablon már nem található.', 'sms_test_template_missing', 404);
    kind=record.kind;
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
    const saved=await managerSavedInterests(db,settings,code,record.language);
    // Egy korabbi kliens explicit mintaadata is tovabbra is jo, de a
    // felulet mar nem ker plusz markavalasztast a tulajdonostol.
    sourceMessage = managerTestTemplateBody(record, settings, code, {
      brandName:brandName||saved.brandName,
      categoryName:categoryName||saved.categoryName
    });
    sampleSource=sampleBrandId||sampleCategoryId?'kézzel választott minta':saved.source;
    templateName = record.name;
  }
  const original = segmentInfo(sourceMessage);
  const unicodeEnabled=process.env.AIF_SMSLINK_ALLOW_UNICODE==='true';
  const parts=encodingMode==='gsm7' ? smsLinkTransportText(gsm7TestAlternative(original.message),false)
    : smsLinkTransportText(original.message,unicodeEnabled);
  const phone = txt(settings.testPhone);
  const fingerprint = createHash('sha256').update(JSON.stringify({
    id, code, sampleBrandId, sampleCategoryId, encodingMode, phone, sender: txt(settings.sender), message: parts.message
  })).digest('hex');
  return {
    templateId: id, templateName, kind, locationCode: code, phone,
    sampleBrandId, sampleCategoryId, encodingMode, message: parts.message,
    segments: parts.segments, encoding: parts.encoding, fingerprint, sampleSource,
    modifiedForGsm7: original.message !== parts.message
  };
}
