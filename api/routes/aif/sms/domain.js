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
export const TOKENS = [{id:'name',name:'Kliens neve'},{id:'store',name:'Üzlet neve'},{id:'brands',name:'Érdeklődésnek megfelelő márkák'},{id:'categories',name:'Érdeklődésnek megfelelő terméktípusok'},{id:'coupon',name:'Személyes kuponkód'},{id:'discount',name:'Kupon kedvezménye'},{id:'expiry',name:'Kupon lejárata'}];
export const DEFAULT_SETTINGS = Object.freeze({
  liveEnabled:false, sellersCanSend:true, requireApproval:true, sender:'numeric',
  maxRecipients:300, maxSegments:4, campaignSegmentLimit:1000, dailySegmentLimit:2000,
  frequencyHours:72, sendFromHour:9, sendUntilHour:20, lowCredit:100,
  // Optional manager/contact phone for unsubscribe requests; link stays automatic.
  unsubscribePhone:'',
  shopNames:{ main_warehouse:'AllInFashion Csikszereda', magazin_targu_secuiesc:'AllInFashion Kezdivasarhely' }
});
export function cleanSettings(input, current = DEFAULT_SETTINGS) {
  const o = { ...current };
  for (const k of ['liveEnabled','sellersCanSend','requireApproval']) if (k in input) {
    if (typeof input[k] !== 'boolean') throw fail('Érvénytelen kapcsoló: '+k); o[k]=input[k];
  }
  for (const [k,min,max] of [['maxRecipients',1,5000],['maxSegments',1,4],['campaignSegmentLimit',1,20000],['dailySegmentLimit',1,50000],['frequencyHours',0,720],['sendFromHour',0,23],['sendUntilHour',1,24],['lowCredit',0,100000]]) if (k in input) {
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
  if(input.shopNames) o.shopNames=Object.fromEntries(['main_warehouse','magazin_targu_secuiesc'].map(k=>[k,txt(input.shopNames[k]||current.shopNames[k]).slice(0,50)]));
  return o;
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
  if(!out.some(b=>b.type==='token'&&b.value==='store')) throw fail('Az SMS-ben kötelező az üzlet neve adatmező.');
  if(kind==='arrival'&&!out.some(b=>b.type==='token'&&b.value==='brands')) throw fail('Az újáru-értesítésben kötelező az érdeklődésnek megfelelő márkák adatmező.');
  if(kind==='promotion') for(const key of ['coupon','discount','expiry']) if(!out.some(b=>b.type==='token'&&b.value===key)) throw fail('A promóciós üzenetben kötelező a kuponkód, kedvezmény és lejárat adatblokk.');
  if(!out.some(b=>b.type==='text'&&b.value.trim())) throw fail('Írj szöveget is az üzenethez.');
  return out;
}
// SMSLink HTTP documentation: 160 / 152 units; quotes, CR/LF and extension characters cost two.
// This integration deliberately transliterates to a controlled ASCII subset. No unverified Unicode mode.
export function smsText(raw) {
  return String(raw??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'").replace(/[“”„]/g,'"').replace(/[–—]/g,'-').replace(/…/g,'...').replace(/\u00a0/g,' ').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim();
}
export function segmentInfo(text) {
  const message=smsText(text);
  if(!message||/[^\x20-\x7e]/.test(message)) throw fail('Az SMS nem támogatott karaktert tartalmaz (például emojit). A küldéshez latin betűs, ékezetmentes szöveg készül.');
  const double=new Set('[\\]{}|^~"`');
  const units=[...message].reduce((n,c)=>n+(double.has(c)?2:1),0);
  return {message,units,segments:units<=160?1:Math.ceil(units/152)};
}
export function couponTerms(rules, language='hu') {
  const date=rules.validFrom.split('-').reverse().join('.');
  const minimum=rules.minimum>0 ? (language==='ro'?` Min. ${rules.minimum} RON.`:` Min. vasarlas: ${rules.minimum} RON.`) : '';
  return language==='ro'
    ? `Personal, o singura utilizare, doar in magazinul indicat. De la ${date}.${minimum} ${rules.stackable?'Cumulabil cu alte reduceri.':'Nu se cumuleaza cu alte reduceri.'}`
    : `Szemelyes, egyszeri, csak a megjelolt uzletben. Kezdete: ${date}.${minimum} ${rules.stackable?'Mas kedvezmennyel osszevonhato.':'Mas kedvezmennyel nem vonhato ossze.'}`;
}
export function renderMessage(blocks, values, unsubscribeUrl, language='hu', terms='', unsubscribePhone='') {
  const raw=blocks.map(b=>{
    if(b.type==='text') return b.value;
    const value=txt(values[b.value]); if(!value) throw fail('Nem tölthető ki az SMS adatmezője: '+b.value,'sms_missing_value'); return value;
  }).join('');
  if(!unsubscribeUrl.startsWith('https://')) throw fail('Hiányzik a biztonságos leiratkozási cím.');
  const contact=unsubscribePhone?phoneNumber(unsubscribePhone):'';
  if(unsubscribePhone&&!contact)throw fail('Érvénytelen leiratkozási kapcsolattartó telefonszám.');
  // Keep the personal self-service link: a phone call/text to the manager is NOT an automatic opt-out.
  const optOut=contact?`${contact} / ${unsubscribeUrl}`:unsubscribeUrl;
  return segmentInfo(`AllInFashion: ${raw} ${terms} ${language==='ro'?'Dezabonare':'Leiratkozas'}: ${optOut}`);
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
