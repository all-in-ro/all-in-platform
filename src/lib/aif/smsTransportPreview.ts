/**
 * Read-only presentation of the exact transport character set used by
 * api/routes/aif/sms/domain.js. No client-side SMS is ever dispatched.
 * Recipient-specific values/links are resolved only by the server.
 */
export type SmsTransportPreview = {
  message: string;
  units: number;
  segments: number;
  encoding: 'GSM-7'|'UCS-2';
  converted: boolean;
  error?: string;
};

const GSM_BASIC = new Set([...`@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà`]);
const GSM_EXT = new Set([...`^{}\\[~]|€"\``]);
const EXTRA: Record<string,string> = {
  'Ł':'L','ł':'l','Đ':'D','đ':'d','Ð':'D','ð':'d',
  'Þ':'Th','þ':'th','Œ':'OE','œ':'oe'
};
function normalizeSms(input: string): string {
  return String(input || '').normalize('NFC')
    .replace(/[’‘]/g,"'").replace(/[“”„]/g,'"').replace(/[–—]/g,'-')
    .replace(/…/g,'...').replace(/\u00a0/g,' ')
    .replace(/\r\n?/g,'\n').replace(/[^\S\n]+/g,' ')
    .replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
function countSmsParts(raw: string): Omit<SmsTransportPreview,'converted'|'error'> {
  const message=normalizeSms(raw);
  if (!message || /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/u.test(message) ||
      [...message].some(c => (c.codePointAt(0) || 0) > 0xFFFF)) {
    throw new Error('Üres SMS vagy nem támogatott karakter (például emoji).');
  }
  let units=0, unicode=false;
  for(const c of message){
    if(c==='\n'||GSM_EXT.has(c))units+=2;
    else if(GSM_BASIC.has(c))units+=1;
    else unicode=true;
  }
  if(unicode){
    units=message.length;
    return {message,units,segments:units<=70?1:Math.ceil(units/67),encoding:'UCS-2'};
  }
  return {message,units,segments:units<=160?1:Math.ceil(units/152),encoding:'GSM-7'};
}
export function prepareSmsTransportPreview(raw:string, unicodeEnabled=false):SmsTransportPreview {
  try {
    const original=countSmsParts(raw);
    if (original.encoding==='GSM-7' || unicodeEnabled) {
      return {...original,converted:false};
    }
    const compatible=[...original.message].map(c =>
      c==='\n'||GSM_BASIC.has(c)||GSM_EXT.has(c)
        ? c
        : EXTRA[c]||c.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    ).join('');
    const ready=countSmsParts(compatible);
    if (ready.encoding !== 'GSM-7') throw new Error('Az üzenetben nem átalakítható karakter van.');
    return {...ready,converted:ready.message!==original.message};
  } catch(error) {
    return {
      message:normalizeSms(raw), units:0, segments:0, encoding:'GSM-7', converted:false,
      error:error instanceof Error?error.message:'Az SMS karakterkészlete nem ellenőrizhető.'
    };
  }
}
