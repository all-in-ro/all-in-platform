import { randomBytes } from 'node:crypto';
import { txt, unique, fail, phoneNumber, GENDERS, genderKey, profileMatchesProduct, promotionMatches } from './domain.js';
import { audit } from './schema.js';
export function mapPreference(row={}) {
  return {customerId:String(row.customer_id||row.id||''),consent:row.consent===true,arrivals:row.arrivals===true,promotions:row.promotions===true,
    phone:row.phone||null,language:row.language||'hu',brands:row.brands||[],genders:row.genders||[],categories:row.categories||[],allBrands:row.all_brands===true,
    consentAt:row.consent_at,consentSource:row.consent_source||'',updatedBy:row.updated_by,updatedAt:row.updated_at,version:Number(row.version||0)};
}
export async function metadata(db) {
  const [b,c,l]=await Promise.all([
    db.query(`SELECT id::text, name, code FROM aif_brands WHERE is_active=true ORDER BY name`),
    db.query(`SELECT id::text, COALESCE(NULLIF(name_hu,''),name_ro) AS name, parent_id::text FROM aif_categories WHERE is_active=true ORDER BY sort_order,name_ro`),
    db.query(`SELECT id::text,code,name FROM aif_locations WHERE is_active=true AND code IN('main_warehouse','magazin_targu_secuiesc') ORDER BY code`)
  ]);
  return {brands:b.rows,categories:c.rows,locations:l.rows,genders:GENDERS};
}
export async function getCustomer(db,id,locationId=null) {
  const {rows}=await db.query(`SELECT * FROM aif_shop_customers WHERE id::text=$1 AND is_active=true AND ($2::uuid IS NULL OR location_id=$2)`,[id,locationId]);
  if(!rows.length)throw fail('A kliens ebben az üzletben nem található.','sms_customer',404);
  return rows[0];
}
export async function getPreference(db,customer) {
  const {rows}=await db.query(`SELECT * FROM aif_sms_preferences WHERE customer_id=$1`,[customer.id]);
  const pref=mapPreference(rows[0]||{id:customer.id});
  const phone=phoneNumber(customer.phone);
  const suppressed=phone?(await db.query('SELECT reason FROM aif_sms_suppressions WHERE phone=$1',[phone])).rows[0]:null;
  return {...pref,currentPhone:phone,validPhone:!!phone,phoneChanged:!!pref.phone&&pref.phone!==phone,suppressed:!!suppressed,suppressionReason:suppressed?.reason||null};
}
export async function savePreference(db,customer,input,actor,isAdmin=false) {
  const before=(await db.query(`SELECT * FROM aif_sms_preferences WHERE customer_id=$1 FOR UPDATE`,[customer.id])).rows[0];
  if(Number(input.version||0)!==Number(before?.version||0))throw fail('A kliens SMS-beállításait közben más módosította. Nyisd meg újra az adatlapot.','sms_preference_conflict',409);
  const phone=phoneNumber(customer.phone),consent=input.consent===true;
  const brands=unique(input.brands),genders=unique(input.genders),categories=unique(input.categories);
  const meta=await metadata(db);
  if(brands.some(id=>!meta.brands.some(b=>b.id===id))||categories.some(id=>!meta.categories.some(c=>c.id===id))||genders.some(id=>!GENDERS.some(g=>g.id===id)))throw fail('Ismeretlen érdeklődési beállítás.');
  const suppressed=phone?(await db.query('SELECT * FROM aif_sms_suppressions WHERE phone=$1',[phone])).rows[0]:null;
  const newConsent=consent&&(!before?.consent||before.phone!==phone||!!suppressed);
  const source=txt(input.consentSource);
  if(consent&&!phone)throw fail('Előbb érvényes román mobilszámot kell rögzíteni a kliens törzsadatainál.');
  if(newConsent&&source.length<5)throw fail('Rögzítsd, hol és mikor adta a kliens az SMS-hozzájárulását.');
  if(consent&&suppressed&&(!isAdmin||input.restoreSuppressed!==true))throw fail('A szám leiratkozott. Új, igazolt hozzájárulással csak az admin engedélyezheti újra.','sms_suppressed',403);
  if(consent&&input.arrivals===true&&(!genders.length||(!input.allBrands&&!brands.length)))throw fail('Újáru-értesítéshez válassz márkát és termékkört (női/férfi/gyermek/uniszex).');
  if(consent&&input.arrivals!==true&&input.promotions!==true)throw fail('Válaszd ki, melyik SMS-típust kéri a kliens.');
  const token=before?.unsubscribe_token||randomBytes(20).toString('hex');
  const {rows}=await db.query(`INSERT INTO aif_sms_preferences(customer_id,consent,arrivals,promotions,phone,language,brands,genders,categories,all_brands,consent_at,consent_source,consent_version,unsubscribe_token,updated_by)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,CASE WHEN $2 THEN now() ELSE NULL END,$11,'aif-sms-consent-v1',$12,$13)
    ON CONFLICT(customer_id) DO UPDATE SET consent=EXCLUDED.consent,arrivals=EXCLUDED.arrivals,promotions=EXCLUDED.promotions,phone=EXCLUDED.phone,
      language=EXCLUDED.language,brands=EXCLUDED.brands,genders=EXCLUDED.genders,categories=EXCLUDED.categories,all_brands=EXCLUDED.all_brands,
      consent_at=CASE WHEN $14 THEN now() ELSE aif_sms_preferences.consent_at END,
      consent_source=CASE WHEN $14 THEN EXCLUDED.consent_source ELSE aif_sms_preferences.consent_source END,
      updated_by=EXCLUDED.updated_by,updated_at=now(),version=aif_sms_preferences.version+1 RETURNING *`,
    [customer.id,consent,consent&&input.arrivals===true,consent&&input.promotions===true,phone,['hu','ro'].includes(input.language)?input.language:'hu',JSON.stringify(brands),JSON.stringify(genders),JSON.stringify(categories),input.allBrands===true,source.slice(0,1000),token,actor,newConsent]);
  if(consent&&suppressed&&isAdmin&&input.restoreSuppressed===true)await db.query('DELETE FROM aif_sms_suppressions WHERE phone=$1',[phone]);
  if(before?.consent&&!consent&&phone)await db.query(`INSERT INTO aif_sms_suppressions(phone,reason,actor) VALUES($1,'Kliens kérésére kikapcsolva',$2) ON CONFLICT(phone) DO NOTHING`,[phone,actor]);
  await audit(db,{customerId:customer.id,locationId:customer.location_id,actor,event:newConsent?'consent_granted':!consent&&before?.consent?'consent_revoked':'preferences_saved',payload:{before:mapPreference(before),after:mapPreference(rows[0]),newConsent,source:newConsent?source:undefined}});
  return getPreference(db,customer);
}
export async function sourcesFor(db,locationId) {
  const imports=await db.query(`SELECT b.id::text,'import' AS type,COALESCE(NULLIF(rec.invoice_number,''),b.source_file_name,'Bevételezés') AS title,
    max(b.committed_at) AS date,sum(r.qty)::int AS qty,count(DISTINCT r.variant_id)::int AS variants
    FROM aif_import_batches b JOIN aif_import_rows r ON r.batch_id=b.id
    LEFT JOIN aif_receptions rec ON rec.id=b.reception_id
    WHERE COALESCE(rec.target_location_id,b.target_location_id)=$1 AND r.status='committed' AND r.qty>0 AND r.variant_id IS NOT NULL
    GROUP BY b.id,rec.invoice_number ORDER BY max(b.committed_at) DESC NULLS LAST LIMIT 60`,[locationId]);
  let transfers=[];
  if((await db.query(`SELECT to_regclass('aif_shop_transfer_receipts') AS present`)).rows[0]?.present){
    transfers=(await db.query(`SELECT d.id::text,'transfer' AS type,d.document_number AS title,max(r.received_at) AS date,sum(r.qty)::int AS qty,count(DISTINCT r.variant_id)::int AS variants
      FROM aif_shop_transfer_receipts r JOIN aif_stock_transfer_documents d ON d.id=r.document_id
      WHERE r.target_location_id=$1 AND d.status='issued'
      AND NOT EXISTS(SELECT 1 FROM aif_stock_transfer_document_deletions x WHERE x.transfer_id=d.transfer_id)
      GROUP BY d.id ORDER BY max(r.received_at) DESC LIMIT 60`,[locationId])).rows;
  }
  return [...imports.rows,...transfers].sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)).slice(0,80);
}
// Read-only inspection: the quantities are those RECEIVED on the document,
// not today's remaining stock. The user must be authorized for that store.
export async function sourceDetailsFor(db, locationId, type, id) {
  const uid = txt(id);
  if (!['import', 'transfer'].includes(type) || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(uid)) {
    throw fail('Érvénytelen szállítmány.', 'sms_source_invalid', 400);
  }
  const source = (await sourcesFor(db, locationId)).find(s => s.type === type && s.id === uid);
  if (!source) throw fail('A szállítmány nem ehhez az üzlethez tartozik.', 'sms_source_forbidden', 403);
  const query = type === 'import' ? `
    SELECT r.row_no AS line_no,
      COALESCE(NULLIF(r.normalized->>'titleRo',''), m.title_ro, 'Termék') AS title,
      COALESCE(NULLIF(r.supplier_product_code,''), m.model_code) AS code,
      COALESCE(NULLIF(r.normalized->>'colorName',''), v.color_name, '') AS color,
      COALESCE(NULLIF(r.supplier_size,''), v.size, '') AS size,
      COALESCE(b.name, '') AS brand,
      COALESCE(sc.name_ro, c.name_ro, '') AS category,
      r.qty::numeric AS qty
    FROM aif_import_rows r
    JOIN aif_product_variants v ON v.id=r.variant_id
    JOIN aif_product_models m ON m.id=v.model_id
    LEFT JOIN aif_brands b ON b.id=m.brand_id
    LEFT JOIN aif_categories c ON c.id=m.category_id
    LEFT JOIN aif_categories sc ON sc.id=m.subcategory_id
    WHERE r.batch_id=$1::uuid AND r.status='committed' AND r.qty>0
    ORDER BY r.row_no ASC, r.id ASC
  ` : `
    SELECT row_number() OVER (ORDER BY m.title_ro, v.size, v.color_name)::int AS line_no,
      COALESCE(m.title_ro,'Termék') AS title,
      COALESCE(NULLIF(v.attributes->>'legacyProductCode',''),m.model_code) AS code,
      COALESCE(v.color_name,'') AS color,
      COALESCE(v.size,'') AS size,
      COALESCE(b.name,'') AS brand,
      COALESCE(sc.name_ro,c.name_ro,'') AS category,
      sum(r.qty)::numeric AS qty
    FROM aif_shop_transfer_receipts r
    JOIN aif_product_variants v ON v.id=r.variant_id
    JOIN aif_product_models m ON m.id=v.model_id
    LEFT JOIN aif_brands b ON b.id=m.brand_id
    LEFT JOIN aif_categories c ON c.id=m.category_id
    LEFT JOIN aif_categories sc ON sc.id=m.subcategory_id
    WHERE r.document_id=$1::uuid AND r.target_location_id=$2::uuid AND r.qty>0
    GROUP BY v.id,m.id,b.name,c.name_ro,sc.name_ro
    ORDER BY m.title_ro, v.size, v.color_name
  `;
  const params = type === 'import' ? [uid] : [uid, locationId];
  const result = await db.query(query, params);
  const items = result.rows.map(r => ({
    lineNo: Number(r.line_no), title: txt(r.title), code: txt(r.code),
    brand: txt(r.brand), color: txt(r.color), size: txt(r.size),
    category: txt(r.category), qty: Number(r.qty)
  }));
  if (items.reduce((sum, r) => sum + r.qty, 0) !== Number(source.qty)) {
    throw fail('A szállítmány tételeinek összege nem egyezik. Frissítsd a listát.', 'sms_source_mismatch', 409);
  }
  return { source, items };
}

export async function sourceProducts(db,locationId,sources) {
  const keys=unique(sources);
  if(!keys.length||keys.length>50)throw fail('Válassz 1–50 már bevételezett szállítmányt.','sms_sources_limit',400);
  const available=await sourcesFor(db,locationId);
  if(keys.some(key=>!available.some(s=>`${s.type}:${s.id}`===key)))throw fail('A kiválasztott bevételezés nem ehhez az üzlethez tartozik, vagy már nem elérhető.','sms_source',403);
  // Batch reads avoid up to 50 separate PostgreSQL round trips.
  // All identifiers are checked against sourcesFor() above before being queried.
  const importIds=keys.filter(key=>key.startsWith('import:')).map(key=>key.slice(7));
  const transferIds=keys.filter(key=>key.startsWith('transfer:')).map(key=>key.slice(9));
  const [importRows,transferRows]=await Promise.all([
    importIds.length
      ?db.query(`SELECT DISTINCT variant_id::text AS id FROM aif_import_rows
          WHERE batch_id::text=ANY($1::text[]) AND status='committed' AND qty>0 AND variant_id IS NOT NULL`,[importIds])
      :Promise.resolve({rows:[]}),
    transferIds.length
      ?db.query(`SELECT DISTINCT variant_id::text AS id FROM aif_shop_transfer_receipts
          WHERE document_id::text=ANY($1::text[]) AND target_location_id=$2 AND variant_id IS NOT NULL`,[transferIds,locationId])
      :Promise.resolve({rows:[]})
  ]);
  const ids=unique([...importRows.rows,...transferRows.rows].map(r=>r.id));
  const products=(await db.query(`SELECT v.id::text AS id,m.title_ro AS title,m.brand_id::text,m.category_id::text,m.subcategory_id::text,m.gender,
    b.name AS brand,COALESCE(NULLIF(sub.name_hu,''),sub.name_ro,c.name_hu,c.name_ro) AS category,v.size,v.color_name,s.qty,v.barcode
    FROM aif_product_variants v JOIN aif_product_models m ON m.id=v.model_id
    JOIN aif_stock s ON s.variant_id=v.id AND s.location_id=$2 AND s.qty>0
    LEFT JOIN aif_brands b ON b.id=m.brand_id LEFT JOIN aif_categories c ON c.id=m.category_id LEFT JOIN aif_categories sub ON sub.id=m.subcategory_id
    WHERE v.id::text=ANY($1::text[]) AND COALESCE(v.status,'active')='active' AND COALESCE(m.status,'active')='active'`,[unique(ids),locationId])).rows;
  return {products,sources:available.filter(s=>keys.includes(`${s.type}:${s.id}`)),unknownGender:products.filter(p=>!genderKey(p.gender)).length};
}
export async function audienceFor(db,locationId,definition,products,settings,mode) {
  const {rows}=await db.query(`SELECT c.id,c.full_name,c.phone AS current_phone,p.*,
    (SELECT max(r.send_started_at) FROM aif_sms_recipients r JOIN aif_sms_campaigns k ON k.id=r.campaign_id
     WHERE r.phone=p.phone AND k.mode='live' AND r.status IN('sending','accepted','delivered','undelivered','unknown')) AS last_sent,
    EXISTS(SELECT 1 FROM aif_sms_suppressions s WHERE s.phone=p.phone) AS suppressed
    FROM aif_shop_customers c LEFT JOIN aif_sms_preferences p ON p.customer_id=c.id
    WHERE c.location_id=$1 AND c.is_active=true ORDER BY c.id`,[locationId]);
  if(rows.length>10000)throw fail('Túl nagy kliensállomány ehhez az előkészítéshez. Külön feldolgozás szükséges.');
  const eligible=[],excluded=[],seen=new Set();
  for(const row of rows){
    const pref=mapPreference(row),phone=phoneNumber(row.current_phone);
    let reason='',matched=[];
    if(!phone)reason='Érvénytelen / hiányzó mobilszám';
    else if(row.suppressed)reason='Leiratkozott telefonszám';
    else if(!pref.consent)reason='Nincs igazolt SMS-hozzájárulás';
    else if(pref.phone!==phone)reason='Telefonszám-változás: új hozzájárulás kell';
    else if(!pref[definition.kind==='arrival'?'arrivals':'promotions'])reason='Nem kéri ezt az SMS-típust';
    else if(definition.language!==pref.language)reason='Eltérő üzenetnyelv';
    else if(mode==='live'&&settings.frequencyHours&&row.last_sent&&Date.now()-new Date(row.last_sent).getTime()<settings.frequencyHours*3600000)reason='Küldési gyakorisági korlát';
    else if(definition.kind==='arrival'){
      matched=products.filter(p=>profileMatchesProduct(pref,p));
      if(!matched.length)reason='Nincs megfelelő márka + termékkör + kategória egyazon terméken';
    }else if(!promotionMatches(pref,definition.filters))reason='Nem egyezik a promóció célcsoportjával';
    if(!reason&&seen.has(phone))reason='Ugyanaz a telefonszám már szerepel a címzettek között';
    if(reason){excluded.push({id:String(row.id),name:row.full_name,phone:phone||row.current_phone||'',reason});continue;}
    seen.add(phone);eligible.push({customerId:String(row.id),name:row.full_name,phone,pref,token:row.unsubscribe_token,matched});
  }
  return {eligible,excluded};
}
