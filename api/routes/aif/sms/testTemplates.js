import { createHash } from 'node:crypto';
import { txt, fail, segmentInfo, validateBlocks, upgradeLegacyTemplateBlocks, storeLabel } from './domain.js';

// Test sends are ALWAYS addressed to the admin's saved test phone. Tokens use
// explicit sample data. No customer, coupon or unsubscribe token is created.
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const STORES = new Set(['main_warehouse', 'magazin_targu_secuiesc']);
const DIAGNOSTIC = 'AllInFashion SMSLink PROBA: a kapcsolat mukodik. Ez egyetlen tesztuzenet Kerekes Zsoltnak. Ugyfeleknek nem ment SMS.';

export function managerTestTemplateBody(template, settings, locationCode) {
  if (!STORES.has(locationCode)) throw fail('Válassz érvényes üzletet.', 'sms_test_store', 400);
  const lang = template.language === 'ro' ? 'ro' : 'hu';
  const blocks = validateBlocks(upgradeLegacyTemplateBlocks(template.blocks, lang), template.kind);
  const storeName = txt(settings.shopNames?.[locationCode]) || (locationCode === 'main_warehouse' ? 'AllInFashion Csíkszereda' : 'AllInFashion Kézdivásárhely');
  const address = txt(settings.shopAddresses?.[locationCode]);
  const values = {
    name: 'Kerekes Zsolt',
    store: storeLabel(settings, locationCode, storeName),
    storeName,
    storeAddress: address || (lang === 'hu' ? 'üzlet címe' : 'adresa magazinului'),
    brands: 'Mayo Chix',
    categories: lang === 'hu' ? 'blúzok' : 'bluze',
    coupon: 'TESZT2026',
    discount: '10% (minta)',
    expiry: '31.12.2026',
  };
  const body = blocks.map(block => block.type === 'text' ? block.value : txt(values[block.value])).join('').trim();
  if (!body) throw fail('Az üzenetsablon üres.', 'sms_test_template_empty', 400);
  const foot = lang === 'ro' ? 'TEST. Codul nu este valid.' : 'TESZT. A kupon nem érvényes.';
  // Avoid inserting a fictitious clickable opt-out URL into a real SMS.
  return [body, template.kind === 'promotion' ? foot : (lang === 'ro' ? 'SMS de test.' : 'Teszt-SMS.')].join('\n');
}

export async function managerTemplatePreview(db, settings, templateId, locationCode) {
  const id = txt(templateId);
  const code = txt(locationCode || 'main_warehouse');
  if (!STORES.has(code)) throw fail('Érvénytelen üzlet.', 'sms_test_store', 400);
  let message, templateName;
  if (id === 'connection') {
    message = DIAGNOSTIC;
    templateName = 'Kapcsolatpróba';
  } else {
    if (!UUID.test(id)) throw fail('Válassz mentett üzenetsablont.', 'sms_test_template', 400);
    const record = (await db.query('SELECT id,name,kind,language,blocks FROM aif_sms_templates WHERE id=$1 LIMIT 1', [id])).rows[0];
    if (!record) throw fail('A sablon már nem található.', 'sms_test_template_missing', 404);
    message = managerTestTemplateBody(record, settings, code);
    templateName = record.name;
  }
  const parts = segmentInfo(message);
  const phone = txt(settings.testPhone);
  const fingerprint = createHash('sha256').update(JSON.stringify({
    id, code, phone, sender: txt(settings.sender), message: parts.message
  })).digest('hex');
  return { templateId: id, templateName, locationCode: code, phone,
    message: parts.message, segments: parts.segments, encoding: parts.encoding, fingerprint };
}
