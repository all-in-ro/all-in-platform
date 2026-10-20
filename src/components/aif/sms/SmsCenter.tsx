import {useCallback,useEffect,useRef,useState} from 'react';
import {Activity,ArrowRight,CheckCircle2,ClipboardList,Eye,FileText,Gift,History,Info,Loader2,MessageSquare,Package,Pause,Pencil,Radio,RefreshCw,Save,Send,Settings,ShieldCheck,Trash2,Users,X} from 'lucide-react';
import {smsApi,smsChanged,smsDate,smsKey,smsToday,SMS_STATUS,type SmsAuditRow,type SmsBlock,type SmsCampaign,type SmsCampaignDetail,type SmsCouponCopy,type SmsDraft,type SmsMeta,type SmsRecipient,type SmsApiError,type SmsSettings,type SmsSource,type SmsSourceDetails,type SmsStatus,type SmsTestPreview} from '../../../lib/aif/smsApi';
import {SmsModal,ChipSelect,CheckRow,PhonePreview,Empty,SmsHint} from './SmsUi';
import {SmsSelect,SmsDatePicker,smsDisplayDate} from './SmsFields';
import {SmsBlockEditor,defaultCouponCopy,initialBlocks} from './SmsBlockEditor';
import {prepareSmsTransportPreview} from '../../../lib/aif/smsTransportPreview';
type Tab='overview'|'arrival'|'promotion'|'history'|'templates'|'settings'|'audit';
type Template={id:string;name:string;kind:'arrival'|'promotion';language:'hu'|'ro';blocks:SmsBlock[];coupon_copy?:SmsCouponCopy|null;coupon_stackable?:boolean|null;updated_at?:string};

// Csak a ténylegesen módosított beállítások menthetők újra.
function smsSettingsHaveChanges(draft:SmsSettings,saved:SmsSettings):boolean {
  return JSON.stringify(draft)!==JSON.stringify(saved);
}

// A sablonhoz nem tartozik DB-ben uzletkod. Az egyertelmu nevvel mentett
// uzletsablonoknal a nev alapjan valasztunk, mas esetben a megorzott uzlet az elso.
function smsTemplateLocation(t:Template,meta:SmsMeta|null):string|null {
  const name=t.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const kezdi=/kezdivasarhely|targu\s+secuiesc/.test(name);
  const csik=/csikszereda|miercurea\s+ciuc/.test(name);
  const code=kezdi===csik?null:kezdi?'magazin_targu_secuiesc':'main_warehouse';
  return code&&meta?.locations.some(l=>l.code===code)?code:null;
}
function smsDefaultLocation(meta:SmsMeta,requested?:string):string {
  return meta.locations.find(l=>l.code===requested)?.code||meta.locations.find(l=>l.code==='main_warehouse')?.code||meta.locations[0]?.code||'';
}
const errText=(e:unknown)=>e instanceof Error?e.message:'A művelet nem sikerült.';
const n=(value:unknown)=>Number(value||0).toLocaleString('ro-RO');
const previewNames=(values:string[])=>[...new Set(values.map(v=>v.trim()).filter(Boolean))].slice(0,2).join(', ');
const SMS_MAX_ARRIVAL_SOURCES=50;

// Short preset uses existing blocks, preserving editor-generated IDs and token metadata.
// It keeps shop data and optionally recipient-specific brands, removing unnecessary prose.
// Final per-recipient SMS length is still checked after the backend renders the message.
function compactArrivalBlocks(blocks:SmsBlock[],language:'hu'|'ro',showBrands=true):SmsBlock[]|null {
  const brands=blocks.find(b=>b.type==='token'&&b.value==='brands');
  const shop=blocks.find(b=>b.type==='token'&&b.value==='store');
  const texts=blocks.filter(b=>b.type==='text');
  if(!shop||!texts.length)return null;
  if(showBrands&&brands&&texts.length>=2){
    return [
      {...texts[0],value:language==='ro'?'Produse noi: ':'Uj aru: '},
      brands,
      {...texts[1],value:language==='ro'?'. Te asteptam: ':'. Varunk: '},
      shop
    ];
  }
  // Generic short fallback retains audience targeting but omits a potentially
  // unbounded per-recipient brand list. No brand is invented or silently truncated.
  return [
    {...texts[0],value:language==='ro'?'Au sosit produse noi! Te asteptam: ':'Uj aru erkezett! Varunk: '},
    shop
  ];
}

const live=(s:SmsStatus|null)=>!!s?.serverLiveEnabled&&!!s.settings.liveEnabled;
const couponTermsPreview=(draft:SmsDraft)=>{
  if(draft.kind!=='promotion'||!draft.coupon.value)return '';
  const r=draft.coupon,date=smsDisplayDate(r.validFrom);
  const copy=draft.couponCopy||defaultCouponCopy(draft.language,r.stackable);
  const minimum=r.minimum>0?(draft.language==='ro'?`Cumpărături minime: ${r.minimum} RON.`:`Minimum vásárlás: ${r.minimum} RON.`):'';
  return [copy.eligibility,draft.language==='ro'?`Începând cu: ${date}.`:`Kezdete: ${date}.`,minimum,copy.stacking].filter(Boolean).join('\n');
};
function SmsInfoHelp(){
  return <div className="sms-preview-help"><div className="sms-help-wrapper">
    <button type="button" className="sms-help-dot" aria-label="Tájékoztatás az SMS-előnézetről" aria-describedby="sms-help-details"><Info size={16}/></button>
    <div className="sms-help-popover" id="sms-help-details" role="tooltip">
      <strong>Az SMS-előnézetről</strong>
      <p>Csak a szerkesztőben beállított szöveg és adatmezők szerepelnek. A márkát nem szúrjuk be automatikusan.</p>
      <p>Az SMS alján a Vezérlőpultban beállított leiratkozás, illetve az engedélyezett webcím jelenik meg.</p>
      <p>A küldhető karakterkészlet szerinti szöveget látod. A tényleges SMS-részeket címzettenként ellenőrizzük.</p>
    </div>
  </div></div>;
}
function useStatus(){
  const[status,setStatus]=useState<SmsStatus|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),active=useRef(true);
  const load=useCallback(async(force=false)=>{setLoading(true);try{const s=await smsApi<SmsStatus>(`/status${force?'?refresh=1':''}`);if(active.current){setStatus(s);setError('');}}catch(e){if(active.current)setError(errText(e));}finally{if(active.current)setLoading(false);}},[]);
  useEffect(()=>{active.current=true;void load();const event=()=>void load(),timer=window.setInterval(event,90000);window.addEventListener('aif:sms-updated',event);return()=>{active.current=false;clearInterval(timer);window.removeEventListener('aif:sms-updated',event);};},[load]);
  return {status,error,loading,load};
}
export function SmsLauncher({locationCode,role='shop'}:{locationCode?:string;role?:'admin'|'shop'}){
  const[open,setOpen]=useState(false),{status,error,loading,load}=useStatus();
  const credit=status?.balance?`${n(status.balance.credit)} kredit`:loading?'Betöltés…':status?.configured?'Nincs kreditadat':'Nincs összekötve';
  return <><button type="button" className="sms-launcher" title={error||'SMS-központ megnyitása'} onClick={()=>setOpen(true)}><MessageSquare size={17}/>{role==='admin'?'SMS beállítások':'SMS küldése'}<strong>{credit}</strong></button>{open?<SmsCenter locationCode={locationCode} status={status} statusError={error} reloadStatus={load} onClose={()=>setOpen(false)}/>:null}</>;
}
function SmsCenter({locationCode,status,statusError,reloadStatus,onClose}:{locationCode?:string;status:SmsStatus|null;statusError:string;reloadStatus:(force?:boolean)=>Promise<void>;onClose:()=>void}){
  const[tab,setTab]=useState<Tab>('overview'),[meta,setMeta]=useState<SmsMeta|null>(null),[error,setError]=useState(''),[detail,setDetail]=useState<SmsCampaignDetail|null>(null),[template,setTemplate]=useState<Template|null>(null);
  const[settingsSaveNotice,setSettingsSaveNotice]=useState('');
  const contentRef=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{if(tab==='overview'&&settingsSaveNotice&&contentRef.current)contentRef.current.scrollTop=0;},[tab,settingsSaveNotice]);
  const[preferredLocation,setPreferredLocation]=useState<string>(locationCode||'');
  useEffect(()=>{if(locationCode)setPreferredLocation(locationCode);},[locationCode]);
  useEffect(()=>{smsApi<SmsMeta>('/meta').then(setMeta).catch(e=>setError(errText(e)));},[]);
  const isAdmin=status?.role==='admin';
  const navigation:Array<{id:Tab;name:string;icon:typeof Activity}>=[{id:'overview',name:'Áttekintés',icon:Activity},{id:'arrival',name:'Új áru · SMS',icon:Package},{id:'promotion',name:'Promóció és kupon',icon:Gift},{id:'history',name:'Küldési napló',icon:History},{id:'templates',name:'Üzenetsablonok',icon:FileText},...(isAdmin?[{id:'settings' as Tab,name:'Vezérlőpult',icon:Settings},{id:'audit' as Tab,name:'Admin auditnapló',icon:ClipboardList}]:[])];
  async function show(id:string){setError('');try{setDetail(await smsApi<SmsCampaignDetail>(`/campaigns/${encodeURIComponent(id)}`));}catch(e){setError(errText(e));}}
  return <SmsModal title="SMS vezérlőközpont" onClose={onClose} extra={<><span className={`sms-pill ${live(status)?'live':'test'}`}>{live(status)?'ÉLES KÜLDÉS':'PRÓBAMÓD'}</span><div className="sms-credit"><small>SMSLink egyenleg</small><strong>{status?.balance?`${n(status.balance.credit)} kredit`:'Nincs kreditadat'}</strong></div><button type="button" aria-label="SMS-egyenleg frissítése" className="sms-button icon" onClick={()=>void reloadStatus(true)}><RefreshCw size={16}/></button></>}>
    <div className="sms-body"><nav className="sms-nav">{navigation.map(item=><button type="button" key={item.id} className={tab===item.id?'active':''} onClick={()=>{setTab(item.id);setError('');setSettingsSaveNotice('');if(item.id!=='arrival'&&item.id!=='promotion')setTemplate(null);}}><item.icon size={18}/>{item.name}</button>)}</nav>
      <div ref={contentRef} className="sms-content">{statusError||error?<div className="sms-error" style={{marginBottom:14}}>{statusError||error}</div>:null}
        {tab==='overview'&&settingsSaveNotice?<div className="sms-ok" role="status" style={{marginBottom:14,display:'flex',alignItems:'center',gap:8}}><CheckCircle2 size={17}/>{settingsSaveNotice}</div>:null}
        {!status||!meta?<Empty><Loader2 className="sms-spin" size={22}/> SMS-rendszer betöltése…</Empty>:<>
          {tab==='overview'?<Overview status={status} onTab={setTab}/>:null}
          {tab==='arrival'||tab==='promotion'?<Composer key={`${tab}-${template?.id||'new'}`} kind={tab} status={status} meta={meta} locationCode={preferredLocation||locationCode} onLocationChange={setPreferredLocation} template={template} onPrepared={d=>{setDetail(d);smsChanged();}}/>:null}
          {tab==='history'?<CampaignHistory onShow={id=>void show(id)} isAdmin={Boolean(isAdmin)}/>:null}
          {tab==='settings'&&isAdmin?<SmsSettingsPanel status={status} onSaved={returnToOverview=>{smsChanged();if(returnToOverview){setSettingsSaveNotice('Beállítások sikeresen mentve.');setTab('overview');}}}/>:null}
          {tab==='templates'?<Templates isAdmin={status.role==='admin'} tokens={meta.tokens} onUse={t=>{const loc=smsTemplateLocation(t,meta);if(loc)setPreferredLocation(loc);setTemplate(t);setTab(t.kind);}}/>:null}
          {tab==='audit'&&isAdmin?<AuditPanel/>:null}
        </>}
      </div>
    </div>
    {detail&&status?<CampaignModal initial={detail} status={status} onClose={()=>{setDetail(null);smsChanged();}}/>:null}
  </SmsModal>;
}
function Overview({status:s,onTab}:{status:SmsStatus;onTab:(tab:Tab)=>void}){
  const cards=[{label:'SMS-hozzájárulás',value:s.stats.subscribers,hint:'Rögzített kliensprofil',icon:Users},{label:'Kézbesítve',value:s.stats.delivered,hint:'Szolgáltatói visszaigazolás alapján',icon:CheckCircle2},{label:'Küldés folyamatban',value:s.stats.running,hint:'Kampány a küldési sorban',icon:Radio},{label:'Átadva a szolgáltatónak',value:s.stats.accepted,hint:'Még nincs kézbesítési visszajelzés',icon:Send},{label:'Ellenőrzést igényel',value:s.stats.attention,hint:'Hiba vagy bizonytalan eredmény',icon:ShieldCheck},{label:'Próbaküldések',value:s.stats.simulated,hint:'Nem ment ki SMS, nem fogyott kredit',icon:Activity}];
  return <div className="sms-section">
    <div className="sms-card teal"><div className="sms-flex"><div><p className="sms-overline">CÉLZOTT ÉRTESÍTÉSEK · SZEMÉLYES KUPONOK</p><h2>A megfelelő áru. A megfelelő kliens.</h2><SmsHint text="Márka, termékkör és üzlet alapján célzunk. Egy telefonszám kampányonként egyszer kaphat üzenetet."/></div><span className="sms-icon"><MessageSquare size={27}/></span></div><div className="sms-actions" style={{marginTop:20}}><button type="button" className="sms-button primary" onClick={()=>onTab('arrival')}><Package size={17}/> Új áru érkezett <ArrowRight size={15}/></button><button type="button" className="sms-button" onClick={()=>onTab('promotion')}><Gift size={17}/> Személyes promóció</button>{s.role==='admin'?<button type="button" className="sms-button" onClick={()=>onTab('settings')}><Send size={17}/> Teszt-SMS</button>:null}</div></div>
    {!live(s)?<div className="sms-short-note"><span className="sms-pill test">Próbamód</span><SmsHint text="Az ügyfélkampányok csak szimulálhatók. Kerekes Zsolt a saját mentett számára külön, jóváhagyott valódi teszt-SMS-t küldhet."/></div>:null}
    {!s.configured||!s.publicUrlReady||!s.webhookReady?<div className="sms-note">Kapcsolat ellenőrzése: SMSLink API {s.configured?'✓':'nincs beállítva'} · leiratkozási cím {s.publicUrlReady?'✓':'hiányzik'} · kézbesítési webhook titka {s.webhookReady?'✓':'hiányzik'}{s.role==='admin'?<button type="button" className="sms-plain-link" style={{marginLeft:10}} onClick={()=>onTab('settings')}>Vezérlőpult</button>:null}</div>:null}
    {s.balanceError?<div className="sms-error">Egyenleg: {s.balanceError}</div>:null}
    {s.balance&&s.balance.credit<s.settings.lowCredit?<div className="sms-note">Alacsony SMS-kredit: {n(s.balance.credit)}. Riasztási küszöb: {n(s.settings.lowCredit)}.</div>:null}
    <div className="sms-grid three">{cards.map(c=><div className="sms-card" key={c.label}><div className="sms-flex"><p className="sms-label">{c.label}</p><span className="sms-kpi-icon"><c.icon size={18}/></span></div><div className="sms-metric">{n(c.value)}</div><small>{c.hint}</small></div>)}</div>
    <div className="sms-grid two"><div className="sms-card"><h3>Küldési védőkorlátok</h3><p className="sms-caption">Küldés: {s.settings.sendFromHour}:00–{s.settings.sendUntilHour}:00 · romániai idő<br/>Két élő SMS között: {s.settings.frequencyHours} óra<br/>Kampányonként: legfeljebb {n(s.settings.maxRecipients)} címzett<br/>Napi keret: {n(s.settings.dailySegmentLimit)} SMS-rész</p></div><div className="sms-card"><h3>Eladói küldés és jóváhagyás</h3><p className="sms-caption">Eladói küldés: {s.settings.sellersCanSend?'engedélyezett':'tiltott'}<br/>Kerekes Zsolt jóváhagyása: {s.settings.requireApproval?'kötelező az eladói kampányokhoz':'nem kötelező'}<br/>A név, márka és kuponkód listából választott mező.<br/>A végleges SMS minden címzettnél külön ellenőrizhető.</p></div></div>
  </div>;
}
function Composer({kind,status,meta,locationCode,onLocationChange,template,onPrepared}:{kind:'arrival'|'promotion';status:SmsStatus;meta:SmsMeta;locationCode?:string;onLocationChange:(code:string)=>void;template:Template|null;onPrepared:(detail:SmsCampaignDetail)=>void}){
  const [draft,setDraft]=useState<SmsDraft>(()=>{
    const language=template?.language||'hu';
    const initial=initialBlocks(kind,language);
    const defaultBlocks=kind==='arrival'?compactArrivalBlocks(initial,language)||initial:initial;
    return {title:kind==='arrival'?'Új áru érkezett':'Személyes promóció',kind,location:smsDefaultLocation(meta,locationCode),language,sources:[],filters:{brands:[],genders:[],categories:[]},blocks:template?.blocks||defaultBlocks,couponCopy:template?.coupon_copy||defaultCouponCopy(language,template?.coupon_stackable===true),coupon:{type:'percent',value:0,minimum:0,validFrom:smsToday(),validUntil:smsToday(30),stackable:template?.coupon_stackable===true}};
  });
  const [couponValueText,setCouponValueText]=useState('');
  const [selectedTemplateId,setSelectedTemplateId]=useState(template?.id||'');
  const[sources,setSources]=useState<SmsSource[]>([]),[templates,setTemplates]=useState<Template[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[sourceBusy,setSourceBusy]=useState(false),[saveNotice,setSaveNotice]=useState(''),locked=useRef(false),requestKey=useRef('');
  const [sourceDetail,setSourceDetail]=useState<{loading:boolean;source:SmsSource;details?:SmsSourceDetails;error?:string}|null>(null);
  const [emptyAudience,setEmptyAudience]=useState(false),[emptyAudienceReasons,setEmptyAudienceReasons]=useState<Array<{reason:string;count:number}>>([]),[emptyAudienceChecked,setEmptyAudienceChecked]=useState(0);
  const patch=(values:Partial<SmsDraft>)=>{requestKey.current='';setDraft(d=>({...d,...values}));setSaveNotice('');};
  useEffect(()=>{let active=true;setSourceBusy(true);if(kind==='arrival'&&draft.location)smsApi<{items:SmsSource[]}>(`/sources?location=${encodeURIComponent(draft.location)}`).then(r=>{if(active)setSources(r.items);}).catch(e=>{if(active)setError(errText(e));}).finally(()=>{if(active)setSourceBusy(false);});else setSourceBusy(false);return()=>{active=false;};},[draft.location,kind]);
  useEffect(()=>{smsApi<{items:Template[]}>('/templates').then(r=>setTemplates(r.items)).catch(()=>{});},[]);
  const shopName=status.settings.shopNames[draft.location]||meta.locations.find(l=>l.code===draft.location)?.name||'Üzlet';
  const shopAddress=status.settings.shopAddresses?.[draft.location]||'';
  const tokenValues:Record<string,string>={name:'Kliens neve',store:[shopName,shopAddress].filter(Boolean).join(', '),storeName:shopName,storeAddress:shopAddress||'[az üzlet címe nincs beállítva]',brands:previewNames(meta.brands.filter(b=>draft.filters.brands.includes(b.id)).map(b=>b.name))||(draft.language==='ro'?'[marca din lista clientului]':'[címzett márkája]'),categories:draft.language==='ro'?'[tipul de produs al clientului]':'[címzett terméktípusa]',coupon:'VK7B6T5 (minta)',discount:draft.coupon.value>0?`${draft.coupon.value}${draft.coupon.type==='percent'?'%':' RON'}`:'[kedvezmény nincs beállítva]',expiry:smsDisplayDate(draft.coupon.validUntil)};
  const unsubscribeContact=status.settings.unsubscribePhone||'';
  const showUnsubscribeLink=status.settings.includeUnsubscribeLink===true||!unsubscribeContact;
  const unsubscribePreview=showUnsubscribeLink&&unsubscribeContact?`${unsubscribeContact} / [személyes leiratkozási link]`:showUnsubscribeLink?'[személyes leiratkozási link]':unsubscribeContact;
  const websitePreview=status.settings.includeWebsite===true&&status.settings.websiteUrl?.trim()?`Online: ${status.settings.websiteUrl.trim()}`:'';
  const preview=[
    [draft.blocks.map(b=>b.type==='text'?b.value:tokenValues[b.value]||'…').join('').trim(),couponTermsPreview(draft)].filter(Boolean).join('\n'),
    ...(websitePreview?['',websitePreview]:[]),
    `${draft.language==='ro'?'Dezabonare':'Leiratkozás'}: ${unsubscribePreview}`
  ].join('\n');
  const smsTransportPreview=prepareSmsTransportPreview(preview,status.providerUnicodeEnabled===true);
  const couponMissing=kind==='promotion'&&(!Number.isFinite(draft.coupon.value)||draft.coupon.value<=0||draft.coupon.value>(draft.coupon.type==='percent'?90:5000));
  const unsafe=draft.blocks.some(b=>b.type==='text'&&/[{}]/.test(b.value));
  async function prepare(){if(locked.current)return;if(kind==='arrival'&&(!draft.sources.length||draft.sources.length>SMS_MAX_ARRIVAL_SOURCES)){setError(`Válassz 1–${SMS_MAX_ARRIVAL_SOURCES} már bevételezett szállítmányt.`);return;}if(couponMissing){setError('A kampány előtt add meg a kedvezmény értékét.');return;}locked.current=true;setBusy(true);setError('');try{if(!requestKey.current)requestKey.current=smsKey();const d=await smsApi<SmsCampaignDetail>('/campaigns',{...draft,requestKey:requestKey.current});onPrepared(d);}catch(e){const code=(e as {code?:string})?.code;if(code==='sms_empty_audience'||errText(e).includes('Nincs megfelelő, SMS-hez hozzájárult')){const reason=e as SmsApiError;setEmptyAudienceReasons(reason.excludedReasons||[]);setEmptyAudienceChecked(reason.checkedClients||0);setEmptyAudience(true);setError('');}else setError(errText(e));}finally{locked.current=false;setBusy(false);}}
  async function inspectSource(source:SmsSource){
    setSourceDetail({loading:true,source});
    try{
      const result=await smsApi<SmsSourceDetails>(`/sources/${encodeURIComponent(source.type)}/${encodeURIComponent(source.id)}/details?location=${encodeURIComponent(draft.location)}`);
      setSourceDetail(current=>current?.source.id===source.id?{loading:false,source,details:result}:current);
    }catch(e){setSourceDetail(current=>current?.source.id===source.id?{loading:false,source,error:errText(e)}:current);}
  }
  async function saveTemplate(){
    setBusy(true);setError('');setSaveNotice('');
    try {
      // The campaign title is NOT the template's name when updating a saved one.
      const selected=templates.find(t=>t.id===selectedTemplateId)||
        (template?.id===selectedTemplateId?template:null);
      if(selectedTemplateId&&!selected)throw new Error('A mentett sablon időközben eltűnt. Frissítsd a listát.');
      let createdId='';
      if(selected){
        await smsApi(`/templates/${encodeURIComponent(selected.id)}`,{
          blocks:draft.blocks,...(kind==='promotion'?{couponCopy:draft.couponCopy,stackable:draft.coupon.stackable}:{}),
          expectedUpdatedAt:selected.updated_at
        },'PATCH');
        setSaveNotice(`Sablon frissítve: ${selected.name}`);
      }else{
        const created=await smsApi<{id:string}>('/templates',{
          name:draft.title,kind,language:draft.language,blocks:draft.blocks,
          ...(kind==='promotion'?{couponCopy:draft.couponCopy,stackable:draft.coupon.stackable}:{})
        });
        createdId=created.id;
        setSaveNotice('Új sablon létrehozva. A következő Mentés már ezt frissíti.');
      }
      const refreshed=(await smsApi<{items:Template[]}>('/templates')).items;
      setTemplates(refreshed);
      if(createdId)setSelectedTemplateId(createdId);
    }catch(e){setError(errText(e));}finally{setBusy(false);}
  }
  return <div className="sms-section">
    <div><p className="sms-overline">{kind==='arrival'?'BEÉRKEZETT ÁRU · ÉRDEKLŐDÉS ALAPJÁN':'PROMÓCIÓ · EGY KLIENS, EGY KÓD'}</p><h2>{kind==='arrival'?'Új áru érkezett az üzletbe':'Személyes kuponkampány'}</h2><SmsHint text="A címzettlista és az SMS-ek előnézete először elkészül. Éles küldés csak külön jóváhagyással indul."/></div>
    {error?<div className="sms-error">{error}</div>:null}{saveNotice?<div className="sms-ok">{saveNotice}</div>:null}
    <fieldset disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0}}><div className="sms-section">
      <div className="sms-card"><div className="sms-grid three"><label>Kampány neve<input value={draft.title} maxLength={120} onChange={e=>patch({title:e.target.value})}/></label><SmsSelect label="Üzlet" value={draft.location} onChange={value=>{onLocationChange(value);setSources([]);patch({location:value,sources:[]});}} options={meta.locations.map(l=>({value:l.code||'',label:l.name}))}/><SmsSelect label="Üzenet nyelve" value={draft.language} onChange={value=>{const language=value as 'hu'|'ro';setSelectedTemplateId('');patch({language,blocks:initialBlocks(kind,language),couponCopy:defaultCouponCopy(language,draft.coupon.stackable)});}} options={[{value:'hu',label:'Magyar'},{value:'ro',label:'Román'}]}/></div><SmsHint text="Az üzlet, SMS-típus, nyelv és igazolt hozzájárulás együtt számít. Nyelvváltáskor az alapsablon töltődik be."/></div>
      {kind==='arrival'?<div className="sms-card">
        <div className="sms-flex"><h3>Bevételezések és PV-k</h3><span className="sms-caption">Kijelölve: <strong>{draft.sources.length} / {SMS_MAX_ARRIVAL_SOURCES}</strong></span><SmsHint text="Kattints a Tételek gombra a bizonylat tartalmához. Csak a pipával választod ki az SMS-kampányba. Az eredeti átvett mennyiséget mutatjuk."/></div>
        {sourceBusy?<p className="sms-caption">Betöltés…</p>:sources.length?<div className="sms-source-list">
          {sources.map(source=>{
            const key=`${source.type}:${source.id}`;
            return <div className="sms-source-entry" key={key}>
              <label className="sms-source-check">
                <input type="checkbox" checked={draft.sources.includes(key)} disabled={!draft.sources.includes(key)&&draft.sources.length>=SMS_MAX_ARRIVAL_SOURCES} onChange={e=>{
                  if(e.target.checked&&draft.sources.length>=SMS_MAX_ARRIVAL_SOURCES){setError(`Legfeljebb ${SMS_MAX_ARRIVAL_SOURCES} bevételezést választhatsz.`);return;}
                  patch({sources:e.target.checked?[...draft.sources,key]:draft.sources.filter(item=>item!==key)});
                }}/>
                <span><strong>{source.title}</strong><small>{smsDate(source.date)} · {source.variants} variáns · {source.qty} db</small></span>
              </label>
              <button type="button" className="sms-source-inspect" aria-label={`${source.title} tételeinek megtekintése`} onClick={()=>void inspectSource(source)}><Eye size={15}/> Tételek</button>
            </div>;
          })}
        </div>:<Empty>Nincs bevételezés.</Empty>}
      </div>:<div className="sms-card teal"><h3>Kupon feltételei</h3><div className="sms-grid three" style={{marginTop:14}}><SmsSelect label="Kedvezmény típusa" value={draft.coupon.type} onChange={value=>patch({coupon:{...draft.coupon,type:value as 'percent'|'fixed'}})} options={[{value:'percent',label:'Százalék'},{value:'fixed',label:'Fix összeg · RON'}]}/><label>Kedvezmény értéke *<input type="number" min="0.01" max={draft.coupon.type==='percent'?90:5000} step="0.01" placeholder="Add meg a kedvezményt" value={couponValueText} onChange={e=>{setCouponValueText(e.target.value);patch({coupon:{...draft.coupon,value:e.target.value===''?0:Number(e.target.value)}});}}/></label><label>Minimum vásárlás · RON<input type="number" min="0" step="0.01" value={draft.coupon.minimum} onChange={e=>patch({coupon:{...draft.coupon,minimum:Number(e.target.value)}})}/></label><SmsDatePicker label="Kedvezmény kezdete" value={draft.coupon.validFrom} max={draft.coupon.validUntil} onChange={value=>patch({coupon:{...draft.coupon,validFrom:value}})}/><SmsDatePicker label="Felhasználható eddig" value={draft.coupon.validUntil} min={draft.coupon.validFrom} hint="Az utolsó napon is, 23:59-ig érvényes." onChange={value=>patch({coupon:{...draft.coupon,validUntil:value}})}/></div><div className="sms-validity-example"><strong>A kliensnek egyértelműen:</strong> {smsDisplayDate(draft.coupon.validFrom)} napjától <b>{smsDisplayDate(draft.coupon.validUntil)} 23:59-ig</b> használható (romániai idő szerint).<br/><small>Az SMS-ben: {draft.language==='ro'?'Valabil până la':'Felhasználható'} {smsDisplayDate(draft.coupon.validUntil)}{draft.language==='hu'?'-ig':''}.</small></div>{couponMissing?<p className="sms-note" style={{marginTop:12}}>Nincs automatikus 10% kedvezmény. A kampány csak az általad beírt százalékkal vagy RON-összeggel készíthető elő.</p>:null}<CheckRow checked={draft.coupon.stackable} onChange={v=>{const current=draft.couponCopy||defaultCouponCopy(draft.language,draft.coupon.stackable);patch({coupon:{...draft.coupon,stackable:v},couponCopy:{...current,stacking:defaultCouponCopy(draft.language,v).stacking}});}} title="Más kedvezménnyel is összevonható" hint="Alapból nem. A teljes kosárra érvényes, személyes, üzlethez kötött kupon. A minimum, kezdőnap és összevonhatóság feltételei automatikusan bekerülnek a végleges SMS-be."/></div>}
      <details className="sms-card"><summary>{kind==='arrival'?'Szállítmány szűkítése':'Célcsoport szűkítése'} · opcionális</summary><div className="sms-section"><ChipSelect label="Márkák" options={meta.brands} value={draft.filters.brands} onChange={brands=>patch({filters:{...draft.filters,brands}})}/><ChipSelect label="Termékkör" options={meta.genders} value={draft.filters.genders} onChange={genders=>patch({filters:{...draft.filters,genders}})}/><ChipSelect label="Kategóriák" options={meta.categories} value={draft.filters.categories} onChange={categories=>patch({filters:{...draft.filters,categories}})}/><p className="sms-caption">Új árunál minden megadott feltételnek ugyanazon terméken kell egyeznie. A kliens saját érdeklődéseit akkor is figyelembe vesszük, ha itt semmit nem szűkítesz.</p></div></details>
      <div className="sms-composer"><div className="sms-card"><SmsSelect label="Mentett sablon" value={selectedTemplateId} onChange={value=>{setSelectedTemplateId(value);const t=templates.find(x=>x.id===value);if(t)patch({blocks:t.blocks,coupon:{...draft.coupon,stackable:t.coupon_stackable===true},couponCopy:t.coupon_copy||defaultCouponCopy(draft.language,t.coupon_stackable===true)});else setSaveNotice('');}} placeholder="Új sablon (vagy válassz meglévőt)" options={templates.filter(t=>t.kind===kind&&t.language===draft.language).map(t=>({value:t.id,label:t.name}))}/><div className="sms-divider"/><SmsBlockEditor kind={kind} blocks={draft.blocks} tokens={meta.tokens} onChange={blocks=>patch({blocks})}/>{kind==='arrival'?<div className="sms-actions" style={{marginTop:10,flexWrap:'wrap'}}>
        <button type="button" className="sms-button subtle" onClick={()=>{
          const blocks=compactArrivalBlocks(draft.blocks,draft.language);
          if(!blocks){setError('A rövid sablonhoz a Márkák és Üzlet adatmező, valamint két szövegrész szükséges.');return;}
          patch({blocks});setError('');
        }}>Rövid SMS · márkákkal</button>
        <button type="button" className="sms-button subtle" onClick={()=>{
          const blocks=compactArrivalBlocks(draft.blocks,draft.language,false);
          if(!blocks){setError('A rövid üzenethez az Üzlet neve és teljes címe adatmező szükséges.');return;}
          patch({blocks});setError('');
        }}>Még rövidebb · márkák nélkül</button>
        <span className="sms-caption">A címzett-szűrés változatlan; a második változat hosszú márkalista helyett általános újáru-értesítést használ.</span>
      </div>:null}{kind==='promotion'?<div className="sms-coupon-copy"><h3>Kuponfeltételek szövege · szerkeszthető</h3><p className="sms-caption">Ezek a mondatok is bekerülnek az SMS-be. A kezdőnap és a minimum vásárlás a kupon beállításaiból kerül melléjük.</p><label>Személyes felhasználásról szóló szöveg<textarea rows={2} maxLength={180} value={draft.couponCopy?.eligibility||''} onChange={e=>patch({couponCopy:{...(draft.couponCopy||defaultCouponCopy(draft.language,draft.coupon.stackable)),eligibility:e.target.value}})}/></label><label>Más kedvezményekkel való összevonás szövege<textarea rows={2} maxLength={180} value={draft.couponCopy?.stacking||''} onChange={e=>patch({couponCopy:{...(draft.couponCopy||defaultCouponCopy(draft.language,draft.coupon.stackable)),stacking:e.target.value}})}/></label><small className="sms-caption">A szöveg feleljen meg a ténylegesen beállított kuponszabálynak.</small></div>:null}{unsafe?<p className="sms-error" style={{marginTop:12}}>A kapcsos zárójelet töröld a szövegből. Adatmezőt a listából válassz.</p>:null}{status.role==='admin'?<button type="button" className="sms-button subtle" style={{marginTop:14}} onClick={()=>void saveTemplate()}><Save size={15}/> {selectedTemplateId?'Sablon módosításainak mentése':'Új sablon mentése'}</button>:null}</div><div className="sms-sticky"><div className="sms-flex" style={{justifyContent:'flex-end',marginBottom:8}}><span className="sms-pill" title="A megjelenített, SMSLink-kompatibilis mintaszöveg várható SMS-részeinek száma. A szerver újáru-SMS-nél automatikusan rövidít, és minden címzett végleges üzenetét 1 SMS-részre korlátozza.</p>">{smsTransportPreview.error?'Nem számolható':`${smsTransportPreview.segments} várható SMS-rész`}</span></div><PhonePreview message={smsTransportPreview.message} subtitle={`SMS-előnézet · ${shopName}`}/>{smsTransportPreview.error?<p className="sms-error">{smsTransportPreview.error}</p>:null}{kind==='arrival'&&!smsTransportPreview.error&&smsTransportPreview.segments>1?<p className="sms-note">A minta {smsTransportPreview.segments} SMS-rész lenne. Az új kampány előkészítésekor a szerver minden címzettnél automatikusan megpróbálja 1 részbe tömöríteni. A címzettlistában a ténylegesen elküldendő SMS-t látod; ha nem fér bele, nem készül új kampány.</p>:null}<SmsInfoHelp/></div></div>
      <div className="sms-card"><div className="sms-flex"><div><h3>{live(status)?'Készen áll az ellenőrzésre?':'Próbakampány előkészítése'}</h3><SmsHint text="Csak előnézetet és címzettlistát készít, SMS-t nem küld."/></div><button type="button" className="sms-button primary" disabled={busy||unsafe||couponMissing||!draft.location||(kind==='arrival'&&!draft.sources.length)} onClick={()=>void prepare()}>{busy?<Loader2 className="sms-spin" size={18}/>:<Users size={18}/>} Címzettek ellenőrzése <ArrowRight size={16}/></button></div></div>
    </div></fieldset>
    {sourceDetail?<SmsModal title={`${sourceDetail.source.title} · tételek`} eyebrow="ALLINFASHION · BIZONYLAT" compact onClose={()=>setSourceDetail(null)} extra={<span className="sms-pill">{sourceDetail.source.qty} db</span>}>
      <div className="sms-content">
        {sourceDetail.loading?<p className="sms-caption">Tételek betöltése…</p>:sourceDetail.error?<div className="sms-error">{sourceDetail.error}</div>:sourceDetail.details?<>
          <div className="sms-flex" style={{marginBottom:14}}><h3>{sourceDetail.details.items.length} tétel</h3><span className="sms-pill">Összesen: {sourceDetail.details.items.reduce((sum,x)=>sum+x.qty,0)} db</span></div>
          <div className="sms-table-wrap" style={{maxHeight:'60vh'}}><table className="sms-source-table"><thead><tr><th>Termék / kód</th><th>Szín</th><th>Méret</th><th>Db</th></tr></thead><tbody>
            {sourceDetail.details.items.map((line,i)=><tr key={`${line.lineNo}-${i}`}><td><strong>{line.title}</strong><br/><small>{[line.brand,line.category,line.code].filter(Boolean).join(' · ')}</small></td><td>{line.color||'–'}</td><td>{line.size||'–'}</td><td>{line.qty}</td></tr>)}
          </tbody></table></div>
        </>:null}
        <div className="sms-actions" style={{justifyContent:'flex-end',marginTop:18}}><button type="button" className="sms-button primary" onClick={()=>setSourceDetail(null)}>Bezárás</button></div>
      </div>
    </SmsModal>:null}
    {emptyAudience?<SmsModal title="Nincs megfelelő SMS-címzett" eyebrow="SMS · CÍMZETTEK ELLENŐRZÉSE" compact onClose={()=>setEmptyAudience(false)}>
      <div className="sms-content"><div className="sms-card"><div className="sms-flex"><span className="sms-pill unknown">0 címzett</span><SmsHint text="A kliensnek az adott üzletben igazolt SMS-hozzájárulás, megfelelő nyelv, márka és termékkör szükséges. A kiválasztott szállítmány adatait is ellenőrizzük."/></div><h3 style={{marginTop:13}}>Nincs most küldhető címzett.</h3>
        {emptyAudienceChecked>0?<div style={{marginTop:12}}><span className="sms-pill">{emptyAudienceChecked} ellenőrzött kliens</span></div>:<p className="sms-caption" style={{marginTop:10}}>Ebben az üzletben nincs ellenőrizhető aktív kliens.</p>}
        {emptyAudienceReasons.length>0?<div className="sms-audience-reasons" style={{marginTop:10}}>{emptyAudienceReasons.map(x=><div className="sms-flex" key={x.reason}><span>{x.reason}</span><strong>{x.count}</strong></div>)}</div>:null}
      </div><div className="sms-actions" style={{justifyContent:'flex-end'}}><button type="button" className="sms-button primary" onClick={()=>setEmptyAudience(false)}>Rendben</button></div></div>
    </SmsModal>:null}
  </div>;
}
function CampaignHistory({onShow,isAdmin}:{onShow:(id:string)=>void;isAdmin:boolean}){
  const[items,setItems]=useState<SmsCampaign[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const[confirmIds,setConfirmIds]=useState<string[]|null>(null),[deleting,setDeleting]=useState(false);
  const load=useCallback(async()=>{setLoading(true);try{setItems((await smsApi<{items:SmsCampaign[]}>('/campaigns')).items);setError('');}catch(e){setError(errText(e));}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  const discardable=items.filter(c=>c.can_discard===true);
  const partsLabel=(c:SmsCampaign)=>{const count=Number(c.recipient_count||0),total=Number(c.segment_count||0),lo=c.min_sms_parts,hi=c.max_sms_parts;return count>0&&lo!=null&&hi!=null&&lo===hi&&lo*count===total?`${count} címzett × ${lo} rész`:`${count} címzett · ${total} rész összesen`;};
  const confirmedItems=(confirmIds||[]).map(id=>items.find(c=>c.id===id)).filter((c):c is SmsCampaign=>Boolean(c));
  async function discardConfirmed(){
    if(!confirmIds?.length||deleting)return;
    setDeleting(true);setError('');
    try{
      const result=await smsApi<{ok:boolean;deleted:number}>('/campaigns/discard-prepared',{ids:confirmIds,confirmCount:confirmIds.length});
      setConfirmIds(null);
      await load();smsChanged();
      if(result.deleted!==confirmIds.length)throw new Error('A törölt előkészítések darabszáma nem egyezik.');
    }catch(e){setError(errText(e));}
    finally{setDeleting(false);}
  }
  return <div className="sms-section">
    <div className="sms-flex"><div><h2>Küldési napló</h2><SmsHint text="Az előkészített kampány nem elküldött SMS. A valóban elindított kampányok és a tényleges tesztküldések naplója megmarad."/></div>
      <div className="sms-actions">
        {isAdmin&&discardable.length>0?<button type="button" className="sms-button danger" disabled={loading||deleting} onClick={()=>setConfirmIds(discardable.map(c=>c.id))}><Trash2 size={15}/> Előkészítések törlése ({discardable.length})</button>:null}
        <button type="button" className="sms-button" disabled={loading||deleting} onClick={()=>void load()}><RefreshCw className={loading?'sms-spin':''} size={16}/> Frissítés</button>
      </div>
    </div>
    {error?<div className="sms-error">{error}</div>:null}
    {items.length?<div className="sms-table-wrap"><table className="sms-table"><thead><tr>
      <th>Kampány / üzlet</th><th>Indította</th><th>Címzett / becsült SMS <SmsHint text="Példa: 2 címzett × 2 rész = összesen 4 fizetős SMS-rész. Az előkészítés önmagában nem von le kreditet."/></th><th>Állapot</th><th>Időpont</th>{isAdmin?<th aria-label="Előkészítés törlése"/>:null}
    </tr></thead><tbody>{items.map(c=><tr key={c.id} className="selectable" onClick={()=>onShow(c.id)}>
      <td><strong style={{fontWeight:500}}>{c.title}</strong><br/><small>{c.location_code==='main_warehouse'?'Csíkszereda':c.location_code==='magazin_targu_secuiesc'?'Kézdivásárhely':c.location_code||'Ismeretlen üzlet'} · {c.kind==='arrival'?'Új áru':'Kupon'}</small></td>
      <td>{c.launched_by||'Még nincs indítva'}<br/><small>Előkészítette: {c.created_by}</small></td>
      <td>{partsLabel(c)}<br/>
        <small>{c.segment_count} rész összesen · {!c.launched_at?'nincs elküldve':`${c.delivered||0} kézbesítve`}</small>
      </td>
      <td><span className={`sms-pill ${c.status}`}>{SMS_STATUS[c.status]||c.status}</span><br/><small>{c.mode==='test'?'Próbamód':c.launched_at?'Éles':'Élesre előkészítve'}</small></td>
      <td>{smsDate(c.launched_at||c.created_at)}</td>
      {isAdmin?<td>{c.can_discard===true?<button type="button" className="sms-button danger icon" title="Nem indított előkészítés törlése" aria-label={`${c.title} előkészítésének törlése`} onClick={e=>{e.stopPropagation();setConfirmIds([c.id]);}} disabled={deleting}><Trash2 size={16}/></button>:<SmsHint text="Csak olyan előkészítés törölhető, amelynél nem volt kampányindítás, valódi teszt-SMS, szolgáltatói küldés vagy aktív kupon."/>}</td>:null}
    </tr>)}</tbody></table></div>:<Empty>{loading?'Kampányok betöltése…':'Még nincs SMS-kampány.'}</Empty>}
    {confirmIds?<SmsModal compact title="Előkészítések törlése" eyebrow="SMS · ADMIN" onClose={()=>{if(!deleting)setConfirmIds(null);}}>
      <div className="sms-content">
        <div className="sms-card">
          <div className="sms-flex"><h3>{confirmedItems.length} nem indított előkészítés</h3><span className="sms-pill unknown">0 kiküldött SMS</span></div>
          <div className="sms-message-list" style={{marginTop:12,maxHeight:260}}>
            {confirmedItems.map(c=><div className="sms-message-row" key={c.id}><strong>{c.title}</strong><br/><small>{c.location_code==='main_warehouse'?'Csíkszereda':'Kézdivásárhely'} · {smsDate(c.created_at)} · {c.recipient_count} tervezett címzett</small></div>)}
          </div>
          <p className="sms-caption">Csak a küldés nélküli előkészítések és függő címzettlistáik törlődnek. Küldés vagy próba-SMS nyoma esetén a szerver megállítja az egész műveletet.</p>
        </div>
        {error?<div className="sms-error" style={{marginTop:12}}>{error}</div>:null}
        <div className="sms-actions" style={{marginTop:15,justifyContent:'flex-end'}}>
          <button type="button" className="sms-button" disabled={deleting} onClick={()=>setConfirmIds(null)}>Mégse</button>
          <button type="button" className="sms-button danger" disabled={deleting||confirmedItems.length!==confirmIds.length} onClick={()=>void discardConfirmed()}>{deleting?<Loader2 className="sms-spin" size={16}/>:<Trash2 size={16}/>} Törlés megerősítése</button>
        </div>
      </div>
    </SmsModal>:null}
  </div>;
}
function CampaignModal({initial,status,onClose}:{initial:SmsCampaignDetail;status:SmsStatus;onClose:()=>void}){
  const[data,setData]=useState(initial),[selected,setSelected]=useState(initial.recipients[0]?.id||''),[search,setSearch]=useState(''),[filter,setFilter]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[count,setCount]=useState(''),[auditOpen,setAuditOpen]=useState(false),[testConfirm,setTestConfirm]=useState(false),[testing,setTesting]=useState(false),[testFeedback,setTestFeedback]=useState(''),guard=useRef(false),testGuard=useRef(false);
  const c=data.campaign,isAdmin=status.role==='admin';
  // Arrival campaign is not allowed to launch with a 2-part or unknown-length recipient SMS.
  // The customer-facing payload itself is assembled by the backend. This guard uses
  // the real prepared, recipient-specific segment counts, NOT the editor sample.
  const arrivalTooLong=c.kind==='arrival'&&c.mode==='live'
    ?data.recipients.filter(r=>!Number.isInteger(Number(r.segments))||Number(r.segments)!==1)
    :[];
  const arrivalLengthBlocked=arrivalTooLong.length>0;
  const arrivalAutoShortened=Number((c.definition as {arrivalShortening?:{total?:number}})?.arrivalShortening?.total||0);

  const reload=useCallback(async()=>{const d=await smsApi<SmsCampaignDetail>(`/campaigns/${initial.campaign.id}`);setData(d);},[initial.campaign.id]);
  useEffect(()=>{if(!['queued','sending'].includes(c.status))return;const id=window.setInterval(()=>{void reload().catch(e=>setError(errText(e)));},5000);return()=>clearInterval(id);},[c.status,reload]);
  const rows=data.recipients.filter(r=>(!filter||r.status===filter)&&(!search||`${r.customer_name} ${r.phone} ${r.coupon_code||''}`.toLowerCase().includes(search.toLowerCase())));
  const active=data.recipients.find(r=>r.id===selected)||rows[0];
  const processed=data.recipients.filter(r=>!['pending','sending'].includes(r.status)).length;
  const canStart=['draft','approved','awaiting_approval','paused'].includes(c.status);
  const needsApproval=!isAdmin&&status.settings.requireApproval&&!c.approved_at;
  async function sendTest(){
    if(!active||testGuard.current||!testConfirm)return;
    testGuard.current=true;setTesting(true);setError('');setTestFeedback('');
    try{const r=await smsApi<{ok:boolean;phone:string;segments:number;providerId:string;message:string}>(`/campaigns/${c.id}/test-sms`,{recipientId:active.id});setTestFeedback(`${r.message} Cím: ${r.phone}. SMS-részek: ${r.segments}. Szolgáltatói azonosító: ${r.providerId}.`);setTestConfirm(false);smsChanged();}
    catch(e){setError(errText(e));setTestConfirm(false);}
    finally{setTesting(false);testGuard.current=false;}
  }
  async function action(type:string){if(guard.current)return;if(type==='launch'&&arrivalLengthBlocked){setError(`A kampányban ${arrivalTooLong.length} címzett SMS-e nem egyrészes. Rövidítsd a sablont, és készíts új címzettlistát.`);return;}guard.current=true;setBusy(true);setError('');try{setData(await smsApi<SmsCampaignDetail>(`/campaigns/${c.id}/${type}`,{confirmCount:Number(count),location:c.location_code}));setConfirm(false);setCount('');smsChanged();}catch(e){setError(errText(e));}finally{setBusy(false);guard.current=false;}}
  return <SmsModal title={c.title} onClose={()=>{if(!busy)onClose();}} extra={<><span className={`sms-pill ${c.mode==='live'?'live':'test'}`}>{c.mode==='live'?'ÉLES':'PRÓBA'}</span><span className={`sms-pill ${c.status}`}>{SMS_STATUS[c.status]}</span></>}>
    <div className="sms-content"><div className="sms-section">
      {error?<div className="sms-error">{error}</div>:null}
      <div className="sms-grid three"><div className="sms-card teal"><p className="sms-label">Címzett</p><div className="sms-metric">{c.recipient_count}</div><small>Egyedi telefonszám a listában</small></div><div className="sms-card"><p className="sms-label">SMS-részek / becsült kredit</p><div className="sms-metric">{c.segment_count}</div><small>{c.mode==='test'?'Próbamódban nem kerül kiküldésre':'A végleges díjazást az SMSLink állapítja meg'}</small></div><div className="sms-card"><p className="sms-label">Feldolgozott címzettek</p><div className="sms-metric">{processed} / {c.recipient_count}</div><div className="sms-progress"><span style={{width:`${c.recipient_count?processed/c.recipient_count*100:0}%`}}/></div></div></div>
      <div className="sms-card soft"><div className="sms-flex"><p className="sms-caption">Előkészítette: <b>{c.created_by}</b> · {smsDate(c.created_at)}<br/>Jóváhagyta: <b>{c.approved_by||'–'}</b> · Indította: <b>{c.launched_by||'–'}</b></p><button type="button" className="sms-button" onClick={()=>void reload().catch(e=>setError(errText(e)))}><RefreshCw size={15}/> Állapot frissítése</button></div>{c.note?<p className="sms-note" style={{marginTop:12}}>{c.note}</p>:null}</div>
      {c.definition.unknownGender>0?<div className="sms-note">A kiválasztott szállítmányban {c.definition.unknownGender} variáns nemi / termékköri besorolása ismeretlen. Ezek nem képezik célzott SMS alapját.</div>:null}
      <div className="sms-grid two"><div className="sms-card"><div className="sms-grid two"><label>Címzett keresése<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Név, telefon vagy kód…"/></label><SmsSelect label="Küldési állapot" value={filter} onChange={setFilter} options={[{value:'',label:'Minden állapot'},...[...new Set(data.recipients.map(r=>r.status))].map(s=>({value:s,label:SMS_STATUS[s]||s}))]}/></div><p className="sms-caption" style={{marginBottom:10}}>{rows.length} címzett · kattints a kész SMS megtekintéséhez</p><div className="sms-message-list">{rows.map(r=><button type="button" className={`sms-message-row ${active?.id===r.id?'selected':''}`} onClick={()=>{setSelected(r.id);setTestConfirm(false);setTestFeedback('');}} key={r.id}><div className="sms-flex"><strong>{r.customer_name}</strong><span className={`sms-pill ${r.status}`}>{SMS_STATUS[r.status]}</span></div><small>{r.phone} · {r.segments} SMS-rész</small>{r.reason?<p className="sms-caption">{r.reason}</p>:null}{r.coupon_code?<p className="sms-caption">{r.coupon_code} · {SMS_STATUS[r.coupon_status||'inactive']}</p>:null}</button>)}</div></div>
        <div className="sms-card">{active?<><PhonePreview message={active.message} subtitle={`${active.customer_name} · ${active.phone}`}/><p className="sms-caption" style={{marginTop:15}}>Szolgáltatói azonosító: {active.provider_id||'–'}<br/>Átadva: {smsDate(active.accepted_at)}<br/>Kézbesítve: {smsDate(active.delivered_at)}{active.used_at?<><br/>Kupon beváltva: {smsDate(active.used_at)} · {active.used_by}</>:null}</p>{active.status==='unknown'&&isAdmin?<Reconcile key={active.id} recipient={active} onSaved={()=>void reload()}/>:null}</>:<Empty>Nincs kiválasztott címzett.</Empty>}</div></div>
      <details className="sms-card"><summary>Kimaradt kliensek és kizárási okok · {c.definition.excluded?.length||0}</summary><div className="sms-table-wrap"><table className="sms-table"><thead><tr><th>Kliens</th><th>Kizárás oka</th></tr></thead><tbody>{(c.definition.excluded||[]).map((r,i)=><tr key={`${r.id}-${i}`}><td>{r.name}<br/><small>{r.phone}</small></td><td>{r.reason}</td></tr>)}</tbody></table></div></details>
      {canStart&&isAdmin?<div className="sms-card sms-test-card">
        <div className="sms-flex"><div><p className="sms-overline">KEREKES ZSOLT · ÉLES TESZT</p><h3>Teszt-SMS · Kerekes Zsolt</h3></div><span className="sms-pill test">1 címzett · tényleges kredit</span></div>
        <SmsHint text="Csak Kerekes Zsolt mentett tesztszámára megy a kiválasztott kliens konkrét üzenete. A kampány nem indul, a kupon nem aktiválódik."/>
        <div className="sms-test-recipient"><span>Kerekes Zsolt telefonszáma</span><strong>{status.settings.testPhone||'Nincs még beállítva'}</strong><small>Kiválasztott mintakliens: {active?.customer_name||'Nincs címzett'}</small></div>
        {!status.configured||!status.serverLiveEnabled?<p className="sms-note">Az SMSLink-fiók még nem kész éles küldésre. A valódi teszt-SMS-hez SMSLink-azonosítók és a Renderben <code>AIF_SMS_ALLOW_LIVE=true</code> szükséges. A kampány főkapcsolója ettől még maradhat kikapcsolva.</p>:null}
        {!status.settings.testPhone?<p className="sms-note">A Vezérlőpultban add meg és mentsd el a „Kerekes Zsolt teszt-SMS telefonszáma” mezőt.</p>:null}
        {testFeedback?<div className="sms-ok">{testFeedback}</div>:null}
        <CheckRow checked={testConfirm} onChange={setTestConfirm} disabled={testing||!active} title="Egy valódi, kreditet fogyasztó teszt-SMS-t kérek a saját számomra" hint="Az üzenet nem a kiválasztott kliens telefonszámára megy. Éles kampány csak külön indítással indulhat."/>
        <button type="button" className="sms-button primary" disabled={testing||busy||!testConfirm||!active||(c.kind==='arrival'&&Number(active.segments)!==1)||!status.settings.testPhone||!status.configured||!status.serverLiveEnabled} onClick={()=>void sendTest()}>{testing?<Loader2 className="sms-spin" size={16}/>:<Send size={16}/>} Teszt-SMS küldése</button>
      </div>:null}
      {c.kind==='arrival'&&arrivalAutoShortened>0?<div className="sms-note" role="status">A szerver {arrivalAutoShortened} címzettnek automatikusan rövidítette az SMS-t, hogy 1 fizetős részbe férjen. Az egyedi kész szövegek a címzettlistában láthatók.</div>:null}
      {arrivalLengthBlocked?<div className="sms-error" role="alert"><strong>Egyrészes SMS védelem:</strong> {arrivalTooLong.length} címzett üzenete több mint egy rész, vagy a hossza nem ellenőrizhető. A tényleges küldést letiltottuk. Rövidítsd a szöveget, majd készíts új kampány-előkészítést; a régi előkészítést ne indítsd el.</div>:null}
      {canStart?<div className="sms-card teal"><h3>{needsApproval?'Kerekes Zsolt jóváhagyása szükséges':c.mode==='test'?'Próbafeldolgozás indítása':'SMS-küldés jóváhagyása'}</h3><p className="sms-caption">{needsApproval?'Az eladó kérheti a kész címzettlista és az üzenetek jóváhagyását. Addig semmi nem megy ki.':c.mode==='test'?'Nem küldünk SMS-t. A tesztkuponok sem használhatók valódi vásárlásnál.':'Az ellenőrzött címzettlista üzenetei az SMSLinken keresztül indulnak. Küldés előtt újra ellenőrizzük a leiratkozásokat és a küldési korlátokat.'}</p>
        {!needsApproval?<><CheckRow checked={confirm} onChange={setConfirm} title={c.mode==='test'?'Ellenőriztem az üzeneteket és indítom a próbát':'Ellenőriztem a címzetteket és a kész üzeneteket'} hint={c.mode==='live'?'Tudomásul veszem az SMS-kredit felhasználását. A már átadott SMS nem hívható vissza.':undefined}/><label style={{maxWidth:270}}>Írd be a címzettek számát: {c.recipient_count}<input type="number" min="0" value={count} onChange={e=>setCount(e.target.value)}/></label></>:null}
        <div className="sms-actions" style={{marginTop:14}}>{isAdmin&&['draft','awaiting_approval'].includes(c.status)?<button type="button" className="sms-button" disabled={busy||arrivalLengthBlocked} onClick={()=>void action('approve')}><ShieldCheck size={16}/> Jóváhagyom a kampányt</button>:null}<button type="button" className="sms-button primary" disabled={busy||arrivalLengthBlocked||(!needsApproval&&(!confirm||Number(count)!==c.recipient_count))} onClick={()=>void action('launch')}>{busy?<Loader2 className="sms-spin" size={16}/>:<Send size={16}/>} {needsApproval?'Jóváhagyás kérése':c.mode==='test'?'Szimuláció indítása':c.status==='paused'?'Fennmaradó SMS-ek folytatása':'SMS-ek indítása'}</button></div></div>:null}
      <div className="sms-actions">{['queued','sending'].includes(c.status)?<button type="button" className="sms-button" disabled={busy} onClick={()=>void action('pause')}><Pause size={16}/> Szüneteltetés</button>:null}{!['cancelled','finished'].includes(c.status)?<button type="button" className="sms-button danger" disabled={busy} onClick={()=>void action('cancel')}><X size={16}/> Még el nem küldött üzenetek leállítása</button>:null}{isAdmin?<button type="button" className="sms-button" onClick={()=>setAuditOpen(v=>!v)}><ClipboardList size={16}/> Kampány auditnaplója</button>:null}</div>
      {auditOpen?<AuditPanel campaignId={c.id}/>:null}
    </div></div>
  </SmsModal>;
}
function Reconcile({recipient,onSaved}:{recipient:SmsRecipient;onSaved:()=>void}){
  const[result,setResult]=useState('accepted'),[providerId,setProviderId]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function save(){setBusy(true);setError('');try{await smsApi(`/recipients/${recipient.id}/reconcile`,{result,providerId,note});onSaved();}catch(e){setError(errText(e));}finally{setBusy(false);}}
  return <details className="sms-card soft" style={{marginTop:15}}><summary>Bizonytalan küldés kézi egyeztetése</summary><p className="sms-caption">Csak az SMSLink naplójában végzett ellenőrzés után. Ez nem küld új SMS-t.</p>{error?<div className="sms-error">{error}</div>:null}<div className="sms-section" style={{marginTop:12}}><SmsSelect label="Ellenőrzött eredmény" value={result} onChange={setResult} options={[{value:'accepted',label:'SMSLink átvette'},{value:'delivered',label:'SMSLink szerint kézbesítve'},{value:'failed',label:'Biztosan nem került elküldésre'}]}/><label>SMSLink üzenetazonosító<input value={providerId} onChange={e=>setProviderId(e.target.value)}/></label><label>Ellenőrzés részletei<textarea value={note} onChange={e=>setNote(e.target.value)}/></label><button type="button" className="sms-button" disabled={busy||note.length<12} onClick={()=>void save()}>Ellenőrzött eredmény rögzítése</button></div></details>;
}
function SmsSettingsPanel({status,onSaved}:{status:SmsStatus;onSaved:(returnToOverview:boolean)=>void}){
  const[s,setS]=useState<SmsSettings>(status.settings),[savedSettings,setSavedSettings]=useState<SmsSettings>(status.settings),[busy,setBusy]=useState(false),[error,setError]=useState(''),[ok,setOk]=useState('');
  const settingsDirty=smsSettingsHaveChanges(s,savedSettings);
  const saveLock=useRef(false);
  const[testConfirm,setTestConfirm]=useState(false),[testBusy,setTestBusy]=useState(false),[testError,setTestError]=useState(''),[testOk,setTestOk]=useState('');
  const[testTemplates,setTestTemplates]=useState<Template[]>([]),[testTemplateId,setTestTemplateId]=useState(''),[testLocation,setTestLocation]=useState('main_warehouse');

  const[testPreview,setTestPreview]=useState<SmsTestPreview|null>(null),[testPreviewError,setTestPreviewError]=useState(''),[testPreviewBusy,setTestPreviewBusy]=useState(false);
  const testPhoneSaved=Boolean(savedSettings.testPhone)&&s.testPhone===savedSettings.testPhone;
  useEffect(()=>{let active=true;smsApi<{items:Template[]}>('/templates').then(r=>{if(active)setTestTemplates(r.items);}).catch(e=>{if(active)setTestPreviewError(errText(e));});return()=>{active=false;};},[]);
  useEffect(()=>{
    let active=true;
    setTestPreview(null);setTestPreviewError('');setTestConfirm(false);
    if(!testTemplateId)return;
    setTestPreviewBusy(true);
    smsApi<SmsTestPreview>('/manager-connection-test/preview',{templateId:testTemplateId,locationCode:testLocation})
      .then(r=>{if(active)setTestPreview(r);})
      .catch(e=>{if(active)setTestPreviewError(errText(e));})
      .finally(()=>{if(active)setTestPreviewBusy(false);});
    return()=>{active=false;};
  },[testTemplateId,testLocation,savedSettings.testPhone]);
  async function sendConnectionTest(){
    if(testBusy||!testConfirm||!testPhoneSaved||!status.configured||!status.serverLiveEnabled||!testPreview||testPreview.blockedReason)return;
    setTestBusy(true);setTestError('');setTestOk('');
    try{
      const r=await smsApi<{ok:boolean;phone:string;segments:number;providerId:string;message:string}>('/manager-connection-test',{
        templateId:testTemplateId,locationCode:testLocation,previewFingerprint:testPreview.fingerprint
      },'POST');
      setTestOk(`SMSLink átvette: ${r.phone} · ${r.segments} rész · ${r.providerId}`);
      setTestConfirm(false);smsChanged();
    }catch(e){setTestError(errText(e));setTestConfirm(false);if((e as {code?:string})?.code==='sms_test_preview_stale')setTestTemplateId('');}
    finally{setTestBusy(false);}
  }
  const patch=(v:Partial<SmsSettings>)=>{if(busy)return;setS(s=>({...s,...v}));setOk('');setError('');};
  async function save(returnToOverview=false){
    if(saveLock.current||!settingsDirty)return;
    saveLock.current=true;setBusy(true);setError('');setOk('');
    try{
      const r=await smsApi<{settings:SmsSettings}>('/settings',s,'PATCH');
      setS(r.settings);setSavedSettings(r.settings);
      if(!returnToOverview)setOk('Beállítások mentve.');
      onSaved(returnToOverview);
    }catch(e){setError(errText(e));}
    finally{saveLock.current=false;setBusy(false);}
  }
  const fields:Array<{key:keyof SmsSettings;label:string;min:number;max:number}>=[{key:'maxRecipients',label:'Címzett / kampány',min:1,max:5000},{key:'maxSegments',label:'Maximum SMS-rész / üzenet',min:1,max:8},{key:'campaignSegmentLimit',label:'SMS-rész / kampány',min:1,max:20000},{key:'dailySegmentLimit',label:'SMS-rész / nap',min:1,max:50000},{key:'frequencyHours',label:'Két SMS között legalább · óra',min:0,max:720},{key:'lowCredit',label:'Alacsony kredit riasztási küszöb',min:0,max:100000},{key:'sendFromHour',label:'Küldés ettől az órától',min:0,max:23},{key:'sendUntilHour',label:'Küldés eddig az óráig',min:1,max:24}];
  return <div className="sms-section"><div><p className="sms-overline">ADMIN · SMS VEZÉRLŐPULT</p><h2>Kapcsolat, keretek, jogosultságok</h2><SmsHint text="Az API-jelszó kizárólag a Render szerverkörnyezetében van. A böngésző és az eladók nem látják."/></div>{error?<div className="sms-error">{error}</div>:null}{ok?<div className="sms-ok">{ok}</div>:null}
    <div className="sms-grid three">{[{title:'SMSLink API',ready:status.configured,hint:'Connection ID + API-jelszó'},{title:'Éles szerverkapcsoló',ready:status.serverLiveEnabled,hint:'AIF_SMS_ALLOW_LIVE'},{title:'Kézbesítési webhook',ready:status.webhookReady,hint:'Biztonsági titok beállítva'}].map(x=><div className="sms-card" key={x.title}><div className="sms-flex"><h3>{x.title}</h3><span className={`sms-pill ${x.ready?'live':'unknown'}`}>{x.ready?'Beállítva':'Hiányzik'}</span></div><SmsHint text={x.hint}/></div>)}</div>
    <div className="sms-card">
      <div className="sms-flex"><h3>Teszt-SMS · Kerekes Zsolt</h3><SmsHint text="A kiválasztott sablont mintaadatokkal küldjük kizárólag a mentett tesztszámra. Semmilyen kliensnek nem küld. Az SMS valódi és kreditet fogyaszt."/></div>
      <label style={{marginTop:13}}>Teszttelefonszám<input type="tel" inputMode="tel" autoComplete="tel" value={s.testPhone||''} placeholder="+40745123456" onChange={e=>{patch({testPhone:e.target.value});setTestConfirm(false);setTestOk('');}}/></label>
      {!testPhoneSaved?<div className="sms-actions" style={{marginTop:9}}><button type="button" className="sms-button" disabled={busy||!settingsDirty||!s.testPhone?.trim()} onClick={()=>void save(false)}>{busy?<Loader2 size={15} className="sms-spin"/>:<Save size={15}/>} Szám mentése</button></div>:<div className="sms-short-note" style={{marginTop:10}}><span className="sms-pill live">Mentett szám</span></div>}
      <div className="sms-grid two" style={{marginTop:17}}>
        <SmsSelect label="Küldendő sablon" value={testTemplateId} onChange={value=>{setTestTemplateId(value);setTestConfirm(false);setTestOk('');}} options={[{value:'connection',label:'Kapcsolatpróba · alap'},...testTemplates.map(t=>({value:t.id,label:`${t.name} · ${t.language.toUpperCase()}`}))]} placeholder="Válaszd ki az üzenetet"/>
        <SmsSelect label="Üzlet a mintában" value={testLocation} onChange={value=>{setTestLocation(value);setTestConfirm(false);}} options={[{value:'main_warehouse',label:'Csíkszereda'},{value:'magazin_targu_secuiesc',label:'Kézdivásárhely'}]}/>
      </div>
      {testTemplateId?<div style={{marginTop:13}}>
        <div className="sms-short-note" style={{marginTop:13}}><strong>Pontosan ezt küldjük</strong><SmsHint text="A mentett sablonból készül. A márkákat a tesztszámhoz tartozó kliens mentett érdeklődése alapján tölti ki. Az SMSLink-kompatibilis szöveg automatikusan készül, a sablon ékezetei megmaradnak."/></div>
        {testPreviewBusy?<p className="sms-caption">Előnézet betöltése…</p>:testPreview?<>
          <pre className="sms-test-body">{testPreview.message}</pre>
          <span className="sms-pill">{testPreview.segments} SMS-rész{testPreview.modifiedForGsm7?' · SMSLink-kompatibilis szöveg':''}</span>{testPreview.sampleSource?<SmsHint text={`Mintaadatok forrása: ${testPreview.sampleSource}. A küldendő szöveg fent teljes egészében látszik.`}/>:null}
          {testPreview.blockedReason?<div className="sms-error" style={{marginTop:10}}>{testPreview.blockedReason}</div>:null}
        </>:null}
        {testPreviewError?<div className="sms-error" style={{marginTop:10}}>{testPreviewError}</div>:null}
      </div>:null}
      {testError?<div className="sms-error" style={{marginTop:12}}>{testError}</div>:null}
      {testOk?<div className="sms-ok" style={{marginTop:12}}>{testOk}</div>:null}
      <div style={{marginTop:12}}><CheckRow checked={testConfirm} onChange={setTestConfirm} disabled={testBusy||busy||!testPhoneSaved||!status.configured||!status.serverLiveEnabled||!testPreview||!!testPreview.blockedReason} title="Ezt az egy fizetős teszt-SMS-t kérem"/></div>
      <button type="button" className="sms-button primary" style={{marginTop:10}} disabled={testBusy||busy||!testConfirm||!testPhoneSaved||!status.configured||!status.serverLiveEnabled||!testPreview||!!testPreview.blockedReason} onClick={()=>void sendConnectionTest()}>{testBusy?<Loader2 className="sms-spin" size={16}/>:<Send size={16}/>} Teszt-SMS küldése</button>
    </div>
    <div className="sms-card teal"><h3>Küldési főkapcsolók</h3><CheckRow checked={s.liveEnabled} onChange={v=>patch({liveEnabled:v})} title="Éles SMS-küldés engedélyezése" hint="A Renderben az AIF_SMS_ALLOW_LIVE=true is szükséges. Ha bármelyik kapcsoló ki van kapcsolva, új kampány csak próbában készül."/><CheckRow checked={s.sellersCanSend} onChange={v=>patch({sellersCanSend:v})} title="Az eladók indíthatnak SMS-kampányt"/><CheckRow checked={s.requireApproval} onChange={v=>patch({requireApproval:v})} title="Eladói kampányhoz Kerekes Zsolt jóváhagyása kell" hint="Az eladó szerkeszthet, de a kész címzettlista és üzenetek jóváhagyásáig nem küldhet."/></div>
    <div className="sms-card"><h3>Kredit- és gyakorisági korlátok</h3><div className="sms-grid three" style={{marginTop:15}}>{fields.map(f=><label key={f.key}>{f.label}<input type="number" min={f.min} max={f.max} step="1" value={Number(s[f.key])} onChange={e=>patch({[f.key]:Number(e.target.value)})}/></label>)}</div><SmsHint text="A napi keret SMS-részeket számol. Romániai idő szerint a csendidőbe érő kampány szünetel, és kézzel folytatható."/></div>
    <div className="sms-card teal"><h3>Leiratkozás · kapcsolattartó</h3>
      <div className="sms-grid two" style={{marginTop:12}}>
        <label>Leiratkozási telefonszám az SMS-ben<input type="tel" inputMode="tel" autoComplete="tel" value={s.unsubscribePhone||''} placeholder="+40745123456" onChange={e=>patch({unsubscribePhone:e.target.value})}/></label>
        <div><CheckRow checked={s.includeUnsubscribeLink===true} onChange={v=>patch({includeUnsubscribeLink:v})} title="Személyes leiratkozási linket is tegyen az SMS-be" hint="Alapból kikapcsolva. Bekapcsolva a telefonszám után a személyes link is megjelenik, ami hosszabb SMS-t jelent."/></div>
      </div>
      <div className="sms-note" style={{marginTop:12}}><strong>SMS előnézet, leiratkozási sor:</strong> <code>{`Leiratkozás: ${s.unsubscribePhone?(s.includeUnsubscribeLink?`${s.unsubscribePhone} / [személyes link]`:s.unsubscribePhone):'[személyes leiratkozási link]'}`}</code></div>
      <SmsHint text="A leiratkozási telefonszámra érkező kérést rögzíteni kell a kliens adatlapján. A személyes link csak külön engedélyezéssel jelenik meg."/>
    </div>
    <div className="sms-grid two"><div className="sms-card"><label>SMSLinknél engedélyezett feladó<input value={s.sender} maxLength={11} onChange={e=>patch({sender:e.target.value})}/></label><SmsHint text="A numeric beállítás az SMSLink rövid számát használja. Saját feladónevet SMSLink-jóváhagyás után állíts be."/></div><div className="sms-card"><h3>Üzletnevek és teljes címek az SMS-ben</h3>
      <label style={{marginTop:12}}>Csíkszereda · üzlet neve<input value={s.shopNames.main_warehouse} maxLength={60} onChange={e=>patch({shopNames:{...s.shopNames,main_warehouse:e.target.value}})}/></label>
      <label style={{marginTop:12}}>Csíkszereda · teljes cím<input value={s.shopAddresses?.main_warehouse||''} maxLength={160} placeholder="Utca, házszám, Csíkszereda, Hargita megye" onChange={e=>patch({shopAddresses:{...s.shopAddresses,main_warehouse:e.target.value}})}/></label>
      <label style={{marginTop:12}}>Kézdivásárhely · üzlet neve<input value={s.shopNames.magazin_targu_secuiesc} maxLength={60} onChange={e=>patch({shopNames:{...s.shopNames,magazin_targu_secuiesc:e.target.value}})}/></label>
      <label style={{marginTop:12}}>Kézdivásárhely · teljes cím<input value={s.shopAddresses?.magazin_targu_secuiesc||''} maxLength={160} placeholder="Utca, házszám, Kézdivásárhely, Kovászna megye" onChange={e=>patch({shopAddresses:{...s.shopAddresses,magazin_targu_secuiesc:e.target.value}})}/></label>
      <div className="sms-note" style={{marginTop:12}}><strong>SMS-ben így jelenik meg:</strong><div style={{marginTop:6}}>Csíkszereda: {[s.shopNames.main_warehouse,s.shopAddresses?.main_warehouse].filter(Boolean).join(', ')}</div><div style={{marginTop:4}}>Kézdivásárhely: {[s.shopNames.magazin_targu_secuiesc,s.shopAddresses?.magazin_targu_secuiesc].filter(Boolean).join(', ')}</div></div>
      <SmsHint text="Az SMS üzletadatmezője a tényleges üzletnevet és címet használja. Az előkészített kampányt beállításváltozás után készítsd újra."/>
    </div></div>
    <div className="sms-card teal"><div className="sms-flex"><div><p className="sms-overline">KÖZÖS ONLINE ÜZLET</p><h3>Webáruház címe az SMS végén</h3></div><span className="sms-pill live">Mindkét üzlet</span></div>
      <div className="sms-grid two" style={{marginTop:14}}>
        <label>Online üzlet weboldala (opcionális)<input type="text" autoComplete="url" maxLength={160} value={s.websiteUrl??''} placeholder="www.allinfashion.ro" onChange={e=>patch({websiteUrl:e.target.value,...(!e.target.value.trim()?{includeWebsite:false}:{})})}/></label>
        <div><CheckRow checked={s.includeWebsite===true&&Boolean(s.websiteUrl?.trim())} onChange={v=>patch({includeWebsite:v&&Boolean(s.websiteUrl?.trim())})} title="A webáruház megjelenjen az SMS végén" hint="Csak akkor jelenik meg, ha megadtad a címet ÉS bekapcsoltad. Üres mező esetén nincs webshop az SMS-ben."/></div>
      </div>
      <div className="sms-note" style={{marginTop:12}}><strong>Üzenetben így jelenik meg:</strong><div style={{marginTop:7}}>{s.includeWebsite&&s.websiteUrl?.trim()?`Online: ${s.websiteUrl.trim()}`:s.websiteUrl?.trim()?'A webáruház az SMS-ben ki van kapcsolva.':'Nincs megadva weboldal, ezért az SMS-be sem kerül.'}</div></div>
      <SmsHint text="A webáruház címe opcionális. Csak megadva és bekapcsolva kerül az SMS végére, és növelheti a szükséges SMS-részek számát."/>
    </div>
    <details className="sms-card"><summary>Render-környezeti változók és SMSLink-bekötés</summary><p className="sms-caption">AIF_SMSLINK_CONNECTION_ID<br/>AIF_SMSLINK_PASSWORD<br/>AIF_SMS_PUBLIC_BASE_URL = a rendszer HTTPS eredetcíme, útvonal nélkül<br/>AIF_SMS_WEBHOOK_SECRET = véletlen, legalább 32 karakteres titok<br/>AIF_SMS_ALLOW_LIVE = false kezdetben, majd tudatosan true</p><p className="sms-caption">SMSLink DLR-cím: <code>/api/aif/sms/delivery?key=SAJÁT_TITOK</code> az eredetcím után. Kérd az opcionális connection_id és message_count mezőket is. A státusz itt csak a titok meglétét ellenőrzi, a szolgáltatói URL tényleges beállítását nem.</p></details>
    <div className="sms-flex"><p className="sms-caption">Minden módosítást az admin auditnapló őriz.</p><button type="button" className="sms-button primary" disabled={busy||!settingsDirty} onClick={()=>void save(true)}>{busy?<Loader2 className="sms-spin" size={17}/>:<Save size={17}/>} {busy?'Mentés…':'Beállítások mentése'}</button></div>
  </div>;
}
function Templates({onUse,isAdmin,tokens}:{onUse:(t:Template)=>void;isAdmin:boolean;tokens:SmsMeta['tokens']}){
  const[items,setItems]=useState<Template[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const[editing,setEditing]=useState<Template|null>(null),[editName,setEditName]=useState(''),
    [editBlocks,setEditBlocks]=useState<SmsBlock[]>([]),[editCouponCopy,setEditCouponCopy]=useState<SmsCouponCopy|null>(null);
  const[deleting,setDeleting]=useState(''),[busyId,setBusyId]=useState('');
  const refresh=useCallback(async()=>{setItems((await smsApi<{items:Template[]}>('/templates')).items);},[]);
  useEffect(()=>{void refresh().catch(e=>setError(errText(e)));},[refresh]);
  function startEdit(t:Template){
    setDeleting('');setEditing(t);setEditName(t.name);setEditBlocks(t.blocks.map(b=>({...b})));
    setEditCouponCopy(t.kind==='promotion'?{...(t.coupon_copy||defaultCouponCopy(t.language,t.coupon_stackable===true))}:null);
    setError('');setNotice('');
  }
  async function saveEdit(){
    if(!editing||busyId)return;
    const name=editName.trim();
    if(name.length<3||name.length>100){setError('A sablonnév 3–100 karakter hosszú legyen.');return;}
    setBusyId(editing.id);setError('');setNotice('');
    try{
      await smsApi(`/templates/${encodeURIComponent(editing.id)}`,{
        name,blocks:editBlocks,expectedUpdatedAt:editing.updated_at,
        ...(editing.kind==='promotion'?{couponCopy:editCouponCopy,stackable:editing.coupon_stackable===true}:{})
      },'PATCH');
      await refresh();setEditing(null);setNotice(`Sablon mentve: ${name}`);
    }catch(e){setError(errText(e));}finally{setBusyId('');}
  }
  async function remove(t:Template){
    if(deleting!==t.id)return;
    setBusyId(t.id);setError('');setNotice('');
    try{
      await smsApi(`/templates/${encodeURIComponent(t.id)}`,{confirm:true},'DELETE');
      await refresh();setDeleting('');setNotice(`Sablon törölve: ${t.name}`);
    }catch(e){setError(errText(e));}finally{setBusyId('');}
  }
  const editPreview=editBlocks.map(b=>b.type==='token'?`[${tokens.find(t=>t.id===b.value)?.name||b.value}]`:b.value).join('').trim();
  return <div className="sms-section"><div className="sms-flex"><h2>Üzenetsablonok</h2><SmsHint text="Ceruza: név és teljes SMS-szöveg módosítása. Mentéskor ugyanaz a sablon frissül, az előző kampányok nem."/></div>
    {error&&!editing?<div className="sms-error">{error}</div>:null}{notice?<div className="sms-ok">{notice}</div>:null}
    {items.length?<div className="sms-grid two">{items.map(t=><div className="sms-card sms-template-card" key={t.id}>
      <div className="sms-template-heading"><div className="sms-template-title"><h3>{t.name}</h3><span className="sms-pill">{t.language.toUpperCase()} · {t.kind==='arrival'?'Új áru':'Kupon'}</span></div>
      {isAdmin?<div className="sms-template-actions"><button type="button" aria-label={`${t.name} szerkesztése`} title="Név és üzenet szerkesztése" disabled={!!busyId} onClick={()=>startEdit(t)}><Pencil size={15}/></button><button type="button" aria-label={`${t.name} törlése`} title="Törlés" disabled={!!busyId} onClick={()=>{setEditing(null);setDeleting(t.id);setError('');}}><Trash2 size={15}/></button></div>:null}</div>
      {deleting===t.id?<div className="sms-template-confirm"><strong>Biztosan törlöd ezt a sablont?</strong><div className="sms-actions" style={{marginTop:10}}><button type="button" className="sms-button danger" disabled={!!busyId} onClick={()=>void remove(t)}><Trash2 size={14}/> Törlés</button><button type="button" className="sms-button" disabled={!!busyId} onClick={()=>setDeleting('')}>Mégse</button></div></div>:null}
      <div className="sms-template-preview">{t.blocks.map(b=>b.type==='token'?`[${b.value}]`:b.value).join('').trim()}{t.kind==='promotion'&&t.coupon_copy?`\n${t.coupon_copy.eligibility}\n${t.coupon_copy.stacking}`:''}</div>
      <button type="button" className="sms-button primary" style={{marginTop:14}} disabled={!!busyId} onClick={()=>onUse(t)}>Kampány készítése <ArrowRight size={15}/></button>
    </div>)}</div>:<Empty>Még nincs mentett sablon.</Empty>}
    {editing?<SmsModal title="Sablon szerkesztése" eyebrow="ALLINFASHION · ÜZENETSABLON" compact onClose={()=>{if(!busyId){setEditing(null);setError('');}}}>
      <div className="sms-content sms-section">
        <div className="sms-card">
          <label>Sablon neve<input autoFocus maxLength={100} value={editName} disabled={!!busyId} onChange={e=>setEditName(e.target.value)}/></label>
          <div className="sms-flex" style={{marginTop:12}}><span className="sms-pill">{editing.language.toUpperCase()} · {editing.kind==='arrival'?'Új áru':'Kupon'}</span><SmsHint text="A meglévő sablon frissül, nem készül másolat. Az SMS változó adatait listából választhatod."/></div>
        </div>
        {error?<div className="sms-error">{error}</div>:null}
        <fieldset disabled={!!busyId} style={{border:0,padding:0,margin:0,minWidth:0}}>
          <div className="sms-card"><SmsBlockEditor kind={editing.kind} blocks={editBlocks} tokens={tokens} onChange={setEditBlocks}/>
            {editing.kind==='promotion'&&editCouponCopy?<div className="sms-coupon-copy" style={{marginTop:16}}>
              <label>Személyes kupon feltétele<textarea rows={2} maxLength={180} value={editCouponCopy.eligibility} onChange={e=>setEditCouponCopy(x=>x?{...x,eligibility:e.target.value}:x)}/></label>
              <label>Összevonhatóság szövege<textarea rows={2} maxLength={180} value={editCouponCopy.stacking} onChange={e=>setEditCouponCopy(x=>x?{...x,stacking:e.target.value}:x)}/></label>
            </div>:null}
          </div>
          <div className="sms-card soft"><h3>Üzenet előnézete</h3><pre className="sms-template-preview" style={{whiteSpace:'pre-wrap',marginTop:10}}>{editPreview}{editing.kind==='promotion'&&editCouponCopy?`\n${editCouponCopy.eligibility}\n${editCouponCopy.stacking}`:''}</pre></div>
          <div className="sms-actions" style={{justifyContent:'flex-end'}}><button type="button" className="sms-button" onClick={()=>{setEditing(null);setError('');}}>Mégse</button><button type="button" className="sms-button primary" onClick={()=>void saveEdit()}><Save size={16}/> Módosítások mentése</button></div>
        </fieldset>
      </div>
    </SmsModal>:null}
  </div>;
}
const EVENT_LABEL:Record<string,string>={campaign_finished:'Kampány feldolgozva',campaign_prepared:'Kampány előkészítve',campaign_discarded:'Előkészítés törölve',sms_test_attempt:'Teszt-SMS indítva',sms_test_accepted:'Teszt-SMS átadva',sms_test_failed:'Teszt-SMS elutasítva',sms_test_unknown:'Teszt-SMS eredménye bizonytalan',approval_requested:'Jóváhagyás kérve',campaign_approve:'Kampány jóváhagyva',campaign_launch:'Kampány indítva',campaign_pause:'Kampány szüneteltetve',campaign_auto_paused:'Automatikus szüneteltetés',campaign_cancel:'Kampány leállítva',consent_granted:'SMS-hozzájárulás rögzítve',consent_revoked:'SMS-hozzájárulás visszavonva',preferences_saved:'Érdeklődések módosítva',settings_saved:'SMS-beállítások módosítva',template_created:'Sablon létrehozva',template_updated:'Sablon módosítva',template_renamed:'Sablon átnevezve',template_deleted:'Sablon törölve',send_started:'SMS-küldés indítva',send_simulated:'Próbafeldolgozás',provider_accepted:'SMSLink átvette',send_failed:'SMSLink elutasította',send_unknown:'Bizonytalan küldés',recipient_skipped:'Címzett kihagyva',delivery_confirmed:'Kézbesítés visszaigazolva',delivery_failed:'Kézbesítés sikertelen',coupon_redeemed:'Kupon beváltva',provider_manually_reconciled:'Küldés kézzel egyeztetve'};
function AuditPanel({campaignId}:{campaignId?:string}){
  const[rows,setRows]=useState<SmsAuditRow[]>([]),[offset,setOffset]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{setBusy(true);try{const r=await smsApi<{items:SmsAuditRow[]}>(`/audit?offset=${offset}&campaignId=${encodeURIComponent(campaignId||'')}`);setRows(r.items);setError('');}catch(e){setError(errText(e));}finally{setBusy(false);}},[offset,campaignId]);
  useEffect(()=>{void load();},[load]);
  return <div className="sms-section"><div className="sms-flex"><div><h3>Visszakövethető műveletek</h3><p className="sms-caption">Ki, mikor, melyik kampánynál vagy kliensnél végzett műveletet?</p></div><button type="button" className="sms-button" onClick={()=>void load()}><RefreshCw size={15} className={busy?'sms-spin':''}/> Frissítés</button></div>{error?<div className="sms-error">{error}</div>:null}<div className="sms-table-wrap"><table className="sms-table"><thead><tr><th>Időpont</th><th>Felhasználó</th><th>Művelet</th><th>Részletek</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{smsDate(r.created_at)}</td><td>{r.actor}</td><td>{EVENT_LABEL[r.event]||r.event}</td><td><details><summary>Adatok</summary><pre className="sms-json">{JSON.stringify(r.payload,null,2)}</pre></details></td></tr>)}</tbody></table></div><div className="sms-actions"><button type="button" className="sms-button" disabled={!offset||busy} onClick={()=>setOffset(Math.max(0,offset-200))}>Újabb 200</button><button type="button" className="sms-button" disabled={rows.length<200||busy} onClick={()=>setOffset(offset+200)}>Korábbi 200</button></div></div>;
}
