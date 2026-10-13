export type SmsBlock = { type: 'text' | 'token'; value: string };
export type SmsOption = {id: string; name: string; code?: string; parent_id?: string | null};
export type SmsMeta = { brands: SmsOption[]; categories: SmsOption[]; genders: SmsOption[]; locations: SmsOption[]; tokens: SmsOption[] };
export type SmsSettings = {
  liveEnabled: boolean; sellersCanSend: boolean; requireApproval: boolean; sender: string;
  maxRecipients: number; maxSegments: number; campaignSegmentLimit: number; dailySegmentLimit: number;
  frequencyHours: number; sendFromHour: number; sendUntilHour: number; lowCredit: number;
  shopNames: Record<string,string>; shopAddresses: Record<string,string>;
  unsubscribePhone: string; includeUnsubscribeLink: boolean;
};
export type SmsStatus = {
  ok: boolean; role: 'admin'|'shop'; settings: SmsSettings; configured: boolean;
  serverLiveEnabled: boolean; webhookReady: boolean; publicUrlReady: boolean;
  balance: { credit: number; checkedAt: string } | null; balanceError: string;
  stats: { campaigns: number; running: number; delivered: number; accepted: number; attention: number; simulated: number; subscribers: number };
};
export type SmsPreference = {
  customerId: string; consent: boolean; arrivals: boolean; promotions: boolean; phone: string | null;
  language: 'hu'|'ro'; brands: string[]; genders: string[]; categories: string[]; allBrands: boolean;
  consentAt?: string; consentSource: string; updatedBy?: string; updatedAt?: string; version: number;
  currentPhone?: string|null; validPhone?: boolean; phoneChanged?: boolean; suppressed?: boolean; suppressionReason?: string;
  restoreSuppressed?: boolean;
};
export type SmsProfileStatus = { error?: boolean; id: string; enabled: boolean; arrivals: boolean; promotions: boolean; brands: string[]; genders: string[]; suppressed: boolean };
export type SmsSource = { id: string; type: string; title: string; date: string; qty: number; variants: number };
export type SmsRules = { type:'percent'|'fixed'; value:number; minimum:number; validFrom:string; validUntil:string; stackable:boolean };
export type SmsDraft = { title:string; kind:'arrival'|'promotion'; location:string; language:'hu'|'ro'; sources:string[]; filters:{brands:string[];genders:string[];categories:string[]}; blocks:SmsBlock[]; coupon:SmsRules };
export type SmsCampaign = {
  id:string; title:string; kind:'arrival'|'promotion'; location_code:string; mode:'test'|'live'; status:string;
  recipient_count:number; segment_count:number; created_by:string; created_at:string; approved_by?:string; approved_at?:string;
  launched_by?:string; launched_at?:string; note?:string; delivered?:number; attention?:number;
  definition: SmsDraft & {sender:string;unsubscribePhone?:string;messageSettings?:{unsubscribePhone:string;includeUnsubscribeLink:boolean;storeName:string;storeAddress:string;messageFormatVersion?:number};unknownGender:number;excluded:Array<{id:string;name:string;phone:string;reason:string}>};
};
export type SmsRecipient = { id:string;customer_id:string; customer_name:string;phone:string;message:string;segments:number;status:string;reason?:string;provider_id?:string;accepted_at?:string;delivered_at?:string;coupon_code?:string;coupon_status?:string;used_at?:string;used_by?:string;used_sale_id?:string };
export type SmsCampaignDetail = {campaign:SmsCampaign;recipients:SmsRecipient[]};
export type SmsQuote = {ok:true;code:string;discount:number;payable:number;validUntil:string;stackable:boolean};
export type SmsAuditRow = {id:string;campaign_id?:string;actor:string;event:string;created_at:string;payload:Record<string,unknown>};
export async function smsApi<T>(path:string, body?:unknown, method=body===undefined?'GET':'POST'):Promise<T> {
  const res=await fetch(`/api/aif/sms${path}`,{method,credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await res.json().catch(()=>null);
  if(!res.ok){const e=new Error(data?.error||`SMS-kérés sikertelen (${res.status})`) as Error&{code?:string};e.code=data?.code;throw e;}
  return data as T;
}
export function smsKey() { return crypto.randomUUID(); }
export function smsChanged() { window.dispatchEvent(new CustomEvent('aif:sms-updated')); }
export function smsDate(value?:string) { if(!value)return '–';const d=new Date(value);return Number.isNaN(d.getTime())?value:d.toLocaleString('hu-HU',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}); }
export function smsToday(offset=0) {return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+offset*86400000));}
export const SMS_STATUS:Record<string,string>={draft:'Előkészítve',awaiting_approval:'Jóváhagyásra vár',approved:'Jóváhagyva',queued:'Sorban áll',sending:'Küldés alatt',paused:'Szünetel',finished:'Feldolgozva',cancelled:'Leállítva',pending:'Küldésre vár',accepted:'Szolgáltatónak átadva',delivered:'Kézbesítve',undelivered:'Nem kézbesíthető',failed:'Elutasítva',unknown:'Ellenőrzendő',skipped:'Kihagyva',simulated:'Szimulálva',inactive:'Még nem aktív',active:'Aktív',used:'Beváltva',revoked:'Visszavonva'};
