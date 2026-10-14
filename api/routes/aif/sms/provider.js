import { fail, txt, segmentInfo } from './domain.js';
// Official SMSLink HTTPS POST API. Credentials never enter URLs or browser responses.
const ENDPOINT='https://secure.smslink.ro/sms/gateway/communicate/index.php';
export function providerConfig() {
  return {id:txt(process.env.AIF_SMSLINK_CONNECTION_ID),password:txt(process.env.AIF_SMSLINK_PASSWORD),
    enabled:process.env.AIF_SMS_ALLOW_LIVE==='true',unicodeEnabled:process.env.AIF_SMSLINK_ALLOW_UNICODE==='true',secret:txt(process.env.AIF_SMS_WEBHOOK_SECRET),base:txt(process.env.AIF_SMS_PUBLIC_BASE_URL).replace(/\/$/,'')};
}
export function publicBase() {
  const base=providerConfig().base;
  let u;try{u=new URL(base);}catch{throw fail('A Renderben állítsd be az AIF_SMS_PUBLIC_BASE_URL értékét.','sms_public_url');}
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/') throw fail('A nyilvános SMS-cím HTTPS eredetcím legyen, útvonal nélkül.','sms_public_url');
  return u.origin;
}
export function parseProvider(text, mode='send') {
  const raw=String(text??'').trim();
  const fields=raw.split(';');
  if(fields[0]==='ERROR') throw Object.assign(fail(`SMSLink elutasítás (${fields[1]}): ${fields[2]||'Ismeretlen hiba'}`,'sms_provider_rejected',502),{definitive:true,providerResponse:raw.slice(0,1000)});
  const expected=mode==='credit'?'2':'1';
  if(fields[0]!=='MESSAGE'||fields[1]!==expected||!fields[3]) throw Object.assign(fail('Az SMSLink válasza nem egyértelmű. Nem indítunk automatikus ismétlést.','sms_provider_unknown',502),{definitive:false});
  const data=fields[3].split(',');
  if(mode==='credit') {
    if(!/^\d+(?:\.\d+)?$/.test(data[0])) throw fail('Érvénytelen kreditválasz.','sms_credit',502);
    return {credit:Number(data[0]),checkedAt:new Date().toISOString()};
  }
  if(!/^\d+$/.test(data[0])) throw Object.assign(fail('Hiányzik a szolgáltatói üzenetazonosító.','sms_provider_unknown',502),{definitive:false});
  return {providerId:data[0],response:raw.slice(0,1000)};
}
export function createProvider(fetchFn=globalThis.fetch) {
  let cached=null, pending=null;
  async function post(params) {
    const config=providerConfig();
    if(!config.id||!config.password) throw Object.assign(fail('Hiányzik az SMSLink Connection ID vagy API-jelszó a Renderből.','sms_credentials',503),{definitive:true});
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),18000);
    try {
      const res=await fetchFn(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({connection_id:config.id,password:config.password,...params}),signal:abort.signal,redirect:'error'});
      if(!res.ok) throw Object.assign(fail('Az SMSLink HTTP-válasza bizonytalan ('+res.status+').','sms_provider_unknown',502),{definitive:false});
      return parseProvider(await res.text(),params.mode||'send');
    }catch(e){if(e.code?.startsWith('sms_'))throw e;throw Object.assign(fail('Az SMSLink hálózati válasza nem érkezett meg. A küldés eredménye ismeretlen.','sms_provider_unknown',502),{definitive:false});}finally{clearTimeout(timer);}
  }
  return {
    async credit(force=false) {
      if(!force&&cached&&Date.now()-cached.time<60000)return cached.value;
      if(!pending)pending=post({mode:'credit'}).then(value=>{cached={value,time:Date.now()};return value;}).finally(()=>{pending=null;});
      return pending;
    },
    invalidateCredit(){cached=null;},
    async send({phone,message,sender,test}) {
      if(!test&&!providerConfig().enabled) throw Object.assign(fail('Az éles küldés szerveroldalon tiltva van.','sms_live_disabled',403),{definitive:true});
      if(segmentInfo(message).encoding==='UCS-2'&&!providerConfig().unicodeEnabled)throw Object.assign(fail('Az ékezetes (Unicode) SMS küldését az SMSLinknél előbb igazolni kell. Nem alakítjuk át és nem küldjük ki ékezet nélkül.','sms_unicode_not_confirmed',409),{definitive:true});
      const result=await post({to:phone,message,sender:sender||'numeric',test:test?'1':'0'});
      cached=null; return result;
    }
  };
}
