/** SMS rules and cryptographically secure voucher-code generation. */
import { randomInt } from 'node:crypto';
export const txt = v => String(v ?? '').trim();
export const norm = v => txt(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
export const unique = values => [...new Set((Array.isArray(values) ? values : []).map(txt).filter(Boolean))];
export const money = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
export function fail(message, code = 'sms_invalid', statusCode = 400) { return Object.assign(new Error(message), { code, statusCode }); }
export function phoneNumber(raw) {
  let s = txt(raw).replace(/[\s().-]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^07\d{8}$/.test(s)) s = '+4' + s;
  if (/^7\d{8}$/.test(s)) s = '+40' + s;
  if (/^407\d{8}$/.test(s)) s = '+' + s;
  return /^\+407\d{8}$/.test(s) ? s : null;
}
export function genderKey(value) {
  const s = norm(value);
  if (['men','man','male','m','barbati','barbat','ferfi','ferfiak','masculin'].includes(s)) return 'men';
  if (['women','woman','female','f','femei','femeie','no','noi','nok','feminin','dama','dame'].includes(s)) return 'women';
  if (['unisex','uni','adulti_unisex'].includes(s)) return 'unisex';
  if (['kids','kid','children','child','copii','copil','gyerek','gyermek','junior','baieti','fete','fiuk','lanyok'].includes(s)) return 'children';
  return ''; // Missing/unknown gender is never interpreted as "everyone".
}
// Easily typed at checkout: four letters + three digits, shuffled securely;
// omit the ambiguous I/O/0/1 characters. The DB enforces global uniqueness.
const COUPON_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const COUPON_DIGITS = '23456789';
export function generateShortCouponCode() {
  const chars = [
    ...Array.from({length:4},()=>COUPON_LETTERS[randomInt(COUPON_LETTERS.length)]),
    ...Array.from({length:3},()=>COUPON_DIGITS[randomInt(COUPON_DIGITS.length)])
  ];
  for(let i=chars.length-1;i>0;i--) {
    const j=randomInt(i+1);
    [chars[i],chars[j]]=[chars[j],chars[i]];
  }
  return chars.join('');
}
export const GENDERS = [{id:'women',name:'Női'},{id:'men',name:'Férfi'},{id:'unisex',name:'Uniszex'},{id:'children',name:'Gyermek'}];
export const TOKENS = [{id:'name',name:'Kliens neve'},{id:'store',name:'Üzlet neve és teljes címe'},{id:'storeName',name:'Csak az üzlet neve'},{id:'storeAddress',name:'Csak az üzlet címe'},{id:'brands',name:'Érdeklődésnek megfelelő márkák'},{id:'categories',name:'Érdeklődésnek megfelelő terméktípusok'},{id:'coupon',name:'Személyes kuponkód'},{id:'discount',name:'Kupon kedvezménye'},{id:'expiry',name:'Kupon lejárata'}];
export const DEFAULT_SETTINGS = Object.freeze({
  liveEnabled:false, sellersCanSend:true, requireApproval:true, sender:'numeric',
  maxRecipients:300, maxSegments:4, campaignSegmentLimit:1000, dailySegmentLimit:2000,
  frequencyHours:72, sendFromHour:9, sendUntilHour:20, lowCredit:100,
  // A phone-only SMS is shorter. A personal opt-out link is optional and separately configurable.
  unsubscribePhone:'', includeUnsubscribeLink:false,
  testPhone:'', // Separate manager-only real test recipient, never a campaign audience member.
  shopNames:{ main_warehouse:'AllInFashion Csíkszereda', magazin_targu_secuiesc:'AllInFashion Kézdivásárhely' },
  // No invented street addresses. The administrator enters each real store address.
  shopAddresses:{main_warehouse:'',magazin_targu_secuiesc:''},
  // Optional webshop link for both shops. Empty by default; the admin opts in explicitly.
  websiteUrl:'', includeWebsite:false
});
// Allow only a website home address. Never include arbitrary schemes, credentials, SMS separators or control chars.
export function normalizeWebsite(value) {
  if(typeof value !== 'string') throw fail('A webáruház címe szöveg kell legyen.');
  const raw=txt(value);
  if(!raw) return '';
  if(raw.length>160) throw fail('A webáruház címe túl hosszú (maximum 160 karakter).');
  const result=/^(?:https:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\/?$/i.exec(raw);
  if(!result) throw fail('Érvénytelen webáruház-cím. Például: www.allinfashion.ro vagy https://www.allinfashion.ro.');
  const domain=result[1].toLowerCase();
  const parts=domain.split('.');
  if(parts.length<2||!/^([a-z]{2,63})$/.test(parts.at(-1))||parts.some(x=>x.length>63||x.startsWith('-')||x.endsWith('-')))
    throw fail('Érvénytelen webáruház-domain.');
  return domain; // Short, readable and without protocol, as requested for the SMS.
}
export function cleanSettings(input, current = DEFAULT_SETTINGS) {
  const o = { ...current };
  for (const k of ['liveEnabled','sellersCanSend','requireApproval','includeUnsubscribeLink','includeWebsite']) if (k in input) {
    if (typeof input[k] !== 'boolean') throw fail('Érvénytelen kapcsoló: '+k); o[k]=input[k];
  }
  for (const [k,min,max] of [['maxRecipients',1,5000],['maxSegments',1,8],['campaignSegmentLimit',1,20000],['dailySegmentLimit',1,50000],['frequencyHours',0,720],['sendFromHour',0,23],['sendUntilHour',1,24],['lowCredit',0,100000]]) if (k in input) {
    const n=Number(input[k]); if (!Number.isInteger(n)||n<min||n>max) throw fail('Érvénytelen határérték: '+k); o[k]=n;
  }
  if(o.sendFromHour>=o.sendUntilHour) throw fail('A küldési időszak kezdete legyen korábbi a végénél.');
  if('sender' in input) { o.sender=txt(input.sender)||'numeric'; if(!/^[a-zA-Z0-9 ]{1,11}$/.test(o.sender)) throw fail('A feladó legfeljebb 11 latin betű vagy szám lehet.'); }
  if('unsubscribePhone' in input) {
    if(input.unsubscribePhone != null && typeof input.unsubscribePhone !== 'string') throw fail('A leiratkozási telefonszám érvénytelen.');
    const raw=txt(input.unsubscribePhone),phone=raw?phoneNumber(raw):'';
    if(raw&&!phone)throw fail('A leiratkozási kapcsolattartónál romániai mobilszám szükséges (például +40745123456).');
    o.unsubscribePhone=phone||'';
  }
  if('testPhone' in input) {
    if(input.testPhone!=null&&typeof input.testPhone!=='string')throw fail('A teszt-SMS telefonszáma érvénytelen.');
    const raw=txt(input.testPhone),phone=raw?phoneNumber(raw):'';
    if(raw&&!phone)throw fail('A főnöki teszt-SMS-hez érvényes romániai mobilszám kell (például +40745123456).');
    o.testPhone=phone||'';
  }
  if('websiteUrl' in input) o.websiteUrl=normalizeWebsite(input.websiteUrl);
  // Blank website is always optional: even a previously enabled toggle must not block saving.
  // Avoid a logically enabled-but-empty state when old settings are submitted.
  if(!txt(o.websiteUrl))o.includeWebsite=false;
  const shopCodes=['main_warehouse','magazin_targu_secuiesc'];
  if(input.shopNames!==undefined) {
    if(!input.shopNames||typeof input.shopNames!=='object'||Array.isArray(input.shopNames))throw fail('Az üzletnevek adatai érvénytelenek.');
    o.shopNames=Object.fromEntries(shopCodes.map(k=>{
      const raw=input.shopNames[k]===undefined?current.shopNames?.[k]:input.shopNames[k];
      if(typeof raw!=='string'||!txt(raw)||txt(raw).length>60||/[\x00-\x1f{}]/.test(raw))throw fail('Az üzlet neve legyen kitöltve, legfeljebb 60 karakterrel.');
      return [k,txt(raw)];
    }));
  }
  if(input.shopAddresses!==undefined) {
    if(!input.shopAddresses||typeof input.shopAddresses!=='object'||Array.isArray(input.shopAddresses))throw fail('Az üzletcímek adatai érvénytelenek.');
    o.shopAddresses=Object.fromEntries(shopCodes.map(k=>{
      const raw=input.shopAddresses[k]===undefined?current.shopAddresses?.[k]||'':input.shopAddresses[k];
      if(typeof raw!=='string'||raw.length>160||/[\x00-\x1f{}]/.test(raw))throw fail('Az üzlet címe legfeljebb 160 karakteres, egysoros szöveg lehet.');
      return [k,txt(raw).replace(/\s+/g,' ')];
    }));
  }
  return o;
}
// A prepared SMS is immutable. Check these message-sensitive settings again before live launch
// and before each recipient; a changed address or opt-out method must not send old text.
export function messageSettingsSnapshot(settings,locationCode) {
  return {
    unsubscribePhone:txt(settings.unsubscribePhone),
    includeUnsubscribeLink:settings.includeUnsubscribeLink===true,
    storeName:txt(settings.shopNames?.[locationCode]),
    storeAddress:txt(settings.shopAddresses?.[locationCode]),
    websiteUrl:txt(settings.websiteUrl),
    includeWebsite:settings.includeWebsite===true&&Boolean(txt(settings.websiteUrl)),
    // V4 separates the optional webshop URL and the mandatory opt-out contact
    // onto their own physical SMS lines. Never send V3 drafts with old formatting.
    messageFormatVersion:6
  };
}
export function messageSettingsMatch(definition,settings,locationCode) {
  const previous=definition?.messageSettings;
  if(!previous||typeof previous!=='object')return false; // Legacy drafts must be re-prepared.
  const current=messageSettingsSnapshot(settings,locationCode);
  return Object.keys(current).every(key=>previous[key]===current[key]);
}
export function storeLabel(settings,locationCode,fallbackName='') {
  const name=txt(settings.shopNames?.[locationCode])||txt(fallbackName);
  const address=txt(settings.shopAddresses?.[locationCode]);
  return [name,address].filter(Boolean).join(', ');
}
// Show/use legacy saved Hungarian templates with the new punctuation and lines.
// This does not overwrite an archived campaign or modify the saved DB template.
export function upgradeLegacyTemplateBlocks(blocks,language='hu') {
  if(!Array.isArray(blocks)||language!=='hu')return blocks;
  return blocks.map(block=>{
    if(block?.type!=='text'||typeof block.value!=='string')return block;
    let value=block.value
      .replace(/! Uj aruk erkeztek:/g,'!\nÚj áruk érkeztek:')
      .replace(/Szemelyes kedvezmenyed:/g,'Személyes kedvezményed:')
      .replace(/\. (?:Kod|Kód): ?/g,'.\nKód: ')
      .replace(/^\. (?:Felhasznalhato|Felhasználható): ?/,'\nFelhasználható: ')
      .replace(/\. (?:Ervenyes|Érvényes): ?/g,'.\nÉrvényes: ')
      .replace(/\. (?:Varunk|Várunk): ?/g,'.\nVárunk: ')
      .replace(/\bVarunk:/g,'Várunk:');
    return value===block.value?block:{...block,value};
  });
}
export function validateBlocks(blocks, kind) {
  if(!Array.isArray(blocks)||!blocks.length||blocks.length>40) throw fail('Az üzenethez 1–40 szöveg- vagy adatblokk szükséges.');
  const allowed=new Set(TOKENS.map(t=>t.id));
  const out=blocks.map(b=>{
    if(b?.type==='text') {
      const value=String(b.value??'');
      if(value.length>600||/[{}\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)) throw fail('A szövegblokkban nem lehet sablonzárójel vagy vezérlőkarakter. Az adatokat a listából szúrd be.');
      return {type:'text',value};
    }
    if(b?.type==='token'&&allowed.has(b.value)) {
      if(kind==='arrival'&&['coupon','discount','expiry'].includes(b.value)) throw fail('Kuponmező csak promóciós kampányban használható.');
      return {type:'token',value:b.value};
    }
    throw fail('Ismeretlen SMS-adatblokk.');
  });
  const fullStore=out.some(b=>b.type==='token'&&b.value==='store');
  const splitStore=['storeName','storeAddress'].every(key=>out.some(b=>b.type==='token'&&b.value===key));
  if(!fullStore&&!splitStore) throw fail('Az SMS-ben kötelező az üzlet neve és címe. Használd az összetett mezőt vagy a név és cím mezőket együtt.');
  if(kind==='arrival'&&!out.some(b=>b.type==='token'&&b.value==='brands')) throw fail('Az újáru-értesítésben kötelező az érdeklődésnek megfelelő márkák adatmező.');
  if(kind==='promotion') for(const key of ['coupon','discount','expiry']) if(!out.some(b=>b.type==='token'&&b.value===key)) throw fail('A promóciós üzenetben kötelező a kuponkód, kedvezmény és lejárat adatblokk.');
  if(!out.some(b=>b.type==='text'&&b.value.trim())) throw fail('Írj szöveget is az üzenethez.');
  return out;
}
// Preserve Hungarian and Romanian accents in the prepared and sent SMS.
// SMSLink documents GSM-7; Unicode content is enabled for physical sending only
// after the provider confirms that this account/connection supports UCS-2.
export function smsText(raw) {
  return String(raw??'').normalize('NFC')
    .replace(/[’‘]/g,"'").replace(/[“”„]/g,'"').replace(/[–—]/g,'-')
    .replace(/…/g,'...').replace(/\u00a0/g,' ')
    .replace(/\r\n?/g,'\n').replace(/[^\S\n]+/g,' ')
    .replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
// GSM-7 basic + extension alphabet, SMSLink HTTP's conservative counting.
// HTTP quotes/backticks and LF take two units per SMSLink's documentation.
const GSM_BASIC=new Set([...`@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà`]);
const GSM_EXT=new Set([...`^{}\\[~]|€\"\``]);
export function segmentInfo(text) {
  const message=smsText(text);
  if(!message||/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/u.test(message)||[...message].some(c=>c.codePointAt(0)>0xFFFF))
    throw fail('Az SMS üres, tiltott vezérlőkaraktert vagy nem támogatott jelet (például emojit) tartalmaz.');
  let units=0,unicode=false;
  for(const c of message) {
    if(c==='\n'||GSM_EXT.has(c))units+=2;
    else if(GSM_BASIC.has(c))units++;
    else unicode=true;
  }
  if(unicode) {
    units=message.length; // UTF-16 code units, BMP only: Hungarian/Romanian accents count one.
    return {message,units,segments:units<=70?1:Math.ceil(units/67),encoding:'UCS-2'};
  }
  return {message,units,segments:units<=160?1:Math.ceil(units/152),encoding:'GSM-7'};
}
export function defaultCouponCopy(language='hu',stackable=false) {
  return language==='ro'
    ? {eligibility:'Personal, o singură utilizare, doar în magazinul indicat.',stacking:stackable?'Se poate cumula cu alte reduceri.':'Nu se cumulează cu alte reduceri.'}
    : {eligibility:'Személyes, egyszer használható, csak a megjelölt üzletben.',stacking:stackable?'Más kedvezménnyel összevonható.':'Más kedvezménnyel nem vonható össze.'};
}
export function cleanCouponCopy(input,language='hu',stackable=false) {
  const fallback=defaultCouponCopy(language,stackable);
  if(input===undefined||input===null)return fallback;
  if(!input||typeof input!=='object'||Array.isArray(input))throw fail('Érvénytelen kuponszöveg.');
  const out={};
  for(const key of ['eligibility','stacking']) {
    if(typeof input[key]!=='string')throw fail('A kuponfeltételek szövege hiányzik.');
    const value=txt(input[key]);
    if(!value||value.length>180||/[{}\x00-\x1f\x7f]/.test(value))throw fail('A kuponfeltételek két szövege legyen kitöltve, egysoros és legfeljebb 180 karakteres.');
    out[key]=value;
  }
  return out;
}
export function couponTerms(rules,language='hu',copy=null) {
  const words=cleanCouponCopy(copy,language,rules.stackable);
  const date=rules.validFrom.split('-').reverse().join('.');
  const minimum=rules.minimum>0?(language==='ro'?`Cumpărături minime: ${rules.minimum} RON.`:`Minimum vásárlás: ${rules.minimum} RON.`):'';
  return [words.eligibility,language==='ro'?`Începând cu: ${date}.`:`Kezdete: ${date}.`,minimum,words.stacking].filter(Boolean).join('\n');
}
export function compactSmsNames(values,language='hu',kind='brands') {
  const uniqueNames=unique(values);
  const suffix=kind==='categories'?(language==='ro'?'și alte produse':'és további termékek'):(language==='ro'?'și alte mărci':'és további márkák');
  return uniqueNames.length>2?`${uniqueNames.slice(0,2).join(', ')} ${suffix}`:uniqueNames.join(', ');
}
export function renderMessage(blocks, values, unsubscribeUrl, language='hu', terms='', unsubscribePhone='', includeUnsubscribeLink=false, websiteUrl='', includeWebsite=false) {
  const raw=blocks.map(b=>{
    if(b.type==='text') return b.value;
    const value=txt(values[b.value]); if(!value) throw fail('Nem tölthető ki az SMS adatmezője: '+b.value,'sms_missing_value'); return value;
  }).join('');
  const contact=unsubscribePhone?phoneNumber(unsubscribePhone):'';
  if(unsubscribePhone&&!contact)throw fail('Érvénytelen leiratkozási kapcsolattartó telefonszám.');
  const showLink=includeUnsubscribeLink===true||!contact;
  if(showLink&&!/^https:\/\/[^\s]+$/.test(unsubscribeUrl))throw fail('Hiányzik a biztonságos személyes leiratkozási cím.');
  // Phone-only: manual opt-out requests must be recorded promptly in the SMS preferences.
  const optOut=showLink&&contact?`${contact} / ${unsubscribeUrl}`:showLink?unsubscribeUrl:contact;
  // The SMS body identifies the store through its required address token, not
  // through an awkward automatic store-name prefix. SMSLink sender is separate.
  const storeName=txt(values.storeName);
  if(!storeName)throw fail('Az SMS feladó üzletneve nincs beállítva.','sms_missing_store_name');
  // No website entered means no webshop text, regardless of stale enabled settings.
  const webshop=includeWebsite&&txt(websiteUrl)?normalizeWebsite(websiteUrl):'';
  // Each footer item gets its own physical SMS line, not another space-separated sentence.
  // The required opt-out contact is always the last line, even without a webshop URL.
  const mainText=[raw.trim(),terms].filter(Boolean).join('\n');
  const lines=[mainText];
  if(webshop)lines.push('',`Online: ${webshop}`);
  lines.push(`${language==='ro'?'Dezabonare':'Leiratkozás'}: ${optOut}`);
  return segmentInfo(lines.join('\n'));
}
export function profileMatchesProduct(pref, product) {
  const g=genderKey(product.gender);
  if(!g||!pref.genders?.includes(g)) return false;
  if(!pref.allBrands&&!pref.brands?.includes(String(product.brand_id))) return false;
  if(pref.categories?.length&&!pref.categories.includes(String(product.category_id))&&!pref.categories.includes(String(product.subcategory_id))) return false;
  return true;
}
export function promotionMatches(pref, filters) {
  if(filters.brands?.length&&!pref.allBrands&&!filters.brands.some(id=>pref.brands?.includes(id))) return false;
  if(filters.genders?.length&&!filters.genders.some(g=>pref.genders?.includes(g))) return false;
  if(filters.categories?.length&&pref.categories?.length&&!filters.categories.some(id=>pref.categories.includes(id))) return false;
  return true;
}
export function cleanCouponRules(input) {
  if(!input||!['percent','fixed'].includes(input.type)) throw fail('Válassz százalékos vagy összegszerű kupont.');
  const value=money(input.value),minimum=money(input.minimum||0);
  if(!Number.isFinite(value)||value<=0||(input.type==='percent'?value>90:value>5000)) throw fail('A kupon értéke érvénytelen (legfeljebb 90% vagy 5000 RON).');
  if(!Number.isFinite(minimum)||minimum<0||minimum>100000) throw fail('Érvénytelen minimum vásárlás.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(txt(input.validUntil))||!Number.isFinite(Date.parse(input.validUntil+'T00:00:00Z'))) throw fail('Válassz lejárati dátumot.');
  const validFrom=txt(input.validFrom)||new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest'}).format(new Date());
  if(!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)||validFrom>input.validUntil) throw fail('Érvénytelen kuponidőszak.');
  for(const date of [validFrom,input.validUntil]) if(new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date) throw fail('Nem létező kupondátum.');
  return {type:input.type,value,minimum,validFrom,validUntil:input.validUntil,stackable:input.stackable===true};
}
export function couponDiscount(rules, base, manualDiscount=0, hasPercentDiscount=false) {
  base=money(base); manualDiscount=money(manualDiscount);
  if(!Number.isFinite(base)||base<0||!Number.isFinite(manualDiscount)||manualDiscount<0||manualDiscount>base) throw fail('Érvénytelen kosárérték.');
  if(!rules.stackable&&(manualDiscount>0||hasPercentDiscount)) throw fail('Ez a kupon más kedvezménnyel nem vonható össze. Töröld a kézi kedvezményt.','coupon_not_stackable');
  const eligible=money(base-manualDiscount);
  if(eligible<rules.minimum) throw fail(`A kuponhoz legalább ${rules.minimum.toFixed(2)} RON vásárlás szükséges.`,'coupon_minimum');
  const amount=money(Math.min(eligible,rules.type==='percent'?eligible*rules.value/100:rules.value));
  if(amount<=0) throw fail('A kupon ennél a kosárnál nem ad kedvezményt.','coupon_zero');
  return amount;
}
export function withinSendHours(settings, now=new Date()) {
  const hour=Number(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',hourCycle:'h23',timeZone:'Europe/Bucharest'}).format(now));
  return hour>=settings.sendFromHour&&hour<settings.sendUntilHour;
}
