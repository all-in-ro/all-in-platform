import {useCallback,useEffect,useRef,useState} from 'react';
import {MessageSquare,Loader2,Save} from 'lucide-react';
import {smsApi,smsChanged,smsDate,type SmsMeta,type SmsPreference,type SmsProfileStatus} from '../../../lib/aif/smsApi';
import {SmsModal,ChipSelect,CheckRow,SmsHint} from './SmsUi';
export function useSmsProfiles(ids:string[],location?:string){
  const key=[...new Set(ids.filter(Boolean))].sort().join(','),[items,setItems]=useState<Record<string,SmsProfileStatus>>({});
  useEffect(()=>{
    let active=true;
    const load=async()=>{try{const wanted=key?key.split(','):[],all:SmsProfileStatus[]=[];for(let i=0;i<wanted.length;i+=500){const r=await smsApi<{items:SmsProfileStatus[]}>('/preferences/status',{ids:wanted.slice(i,i+500),location});all.push(...r.items);}if(active)setItems(Object.fromEntries(all.map(x=>[x.id,x])));}catch{if(active)setItems(Object.fromEntries((key?key.split(','):[]).map(id=>[id,{id,error:true,enabled:false,arrivals:false,promotions:false,brands:[],genders:[],suppressed:false}])));}};
    void load();window.addEventListener('aif:sms-updated',load);return()=>{active=false;window.removeEventListener('aif:sms-updated',load);};
  },[key,location]);
  return items;
}
export function SmsBadge({status}:{status?:SmsProfileStatus}){return <span className={`sms-profile-badge ${status?.enabled?'enabled':''}`}><MessageSquare size={10}/>{status?.error?'SMS: nem ellenőrizhető':status?.enabled?'SMS aktív':status?.suppressed?'SMS leiratkozott':status?'SMS nincs bekapcsolva':'SMS: ellenőrzés…'}</span>;}
export function SmsProfileButton({customerId,location,role='shop'}:{customerId:string;location?:string;role?:'admin'|'shop'}){
  const[open,setOpen]=useState(false);
  return <><button type="button" className="sms-launcher" onClick={e=>{e.stopPropagation();setOpen(true);}}><MessageSquare size={15}/> SMS és érdeklődések</button>{open?<SmsProfileModal customerId={customerId} location={location} role={role} onClose={()=>setOpen(false)}/>:null}</>;
}
function SmsProfileModal({customerId,location,role,onClose}:{customerId:string;location?:string;role:'admin'|'shop';onClose:()=>void}){
  const[meta,setMeta]=useState<SmsMeta|null>(null),[pref,setPref]=useState<SmsPreference|null>(null),[name,setName]=useState('Kliens'),[phone,setPhone]=useState('');
  const[error,setError]=useState(''),[saving,setSaving]=useState(false),[loaded,setLoaded]=useState(false),busy=useRef(false);
  const load=useCallback(async()=>{setError('');try{const[m,r]=await Promise.all([smsApi<SmsMeta>('/meta'),smsApi<{customer:{name:string;phone:string};preference:SmsPreference}>(`/customers/${encodeURIComponent(customerId)}?location=${encodeURIComponent(location||'')}`)]);setMeta(m);setName(r.customer.name);setPhone(r.customer.phone||'');setPref({...r.preference,consentSource:r.preference.phoneChanged||r.preference.suppressed?'':r.preference.consentSource});setLoaded(true);}catch(e){setError(e instanceof Error?e.message:'Nem tölthető be.');}},[customerId,location]);
  useEffect(()=>{void load();},[load]);
  const patch=(values:Partial<SmsPreference>)=>setPref(p=>p?{...p,...values}:p);
  async function save(){if(!pref||busy.current)return;busy.current=true;setSaving(true);setError('');try{await smsApi(`/customers/${encodeURIComponent(customerId)}`,{...pref,location},'PATCH');smsChanged();onClose();}catch(e){setError(e instanceof Error?e.message:'A mentés nem sikerült.');}finally{busy.current=false;setSaving(false);}}
  return <SmsModal title="SMS és vásárlási érdeklődések" compact onClose={()=>{if(!saving)onClose();}} footer={<><button type="button" className="sms-button" onClick={onClose} disabled={saving}>Mégse</button><button type="button" className="sms-button primary" disabled={saving||!loaded} onClick={()=>void save()}>{saving?<Loader2 size={16} className="sms-spin"/>:<Save size={16}/>} Beállítások mentése</button></>}>
    <div className="sms-content">
      {error?<div className="sms-error">{error}<button type="button" className="sms-button subtle" onClick={()=>void load()}>Újratöltés</button></div>:null}
      {!pref||!meta?<p className="sms-caption">SMS-adatlap betöltése…</p>:<div className="sms-section">
        <div className="sms-card teal"><div className="sms-flex"><div><h3>{name}</h3><p className="sms-caption">{phone||'Nincs telefonszám'}</p></div><span className={`sms-pill ${pref.consent?'live':'test'}`}>{pref.consent?'SMS engedélyezve':'SMS kikapcsolva'}</span></div></div>
        {!pref.validPhone?<div className="sms-error">Az SMS-hez érvényes román mobilszám szükséges. A védett kliensadatot az admin módosíthatja.</div>:null}
        {pref.phoneChanged?<div className="sms-note">A telefonszám megváltozott. Az új számhoz új SMS-hozzájárulást kell rögzíteni.</div>:null}
        {pref.suppressed?<div className="sms-note">Ez a telefonszám leiratkozott. Csak az admin kapcsolhatja vissza, új, igazolt hozzájárulással.{role==='admin'?<CheckRow checked={pref.restoreSuppressed===true} onChange={v=>patch({restoreSuppressed:v})} title="Új hozzájárulás alapján visszaengedem"/>:null}</div>:null}
        <div className="sms-grid two"><div className="sms-card"><h3>Hozzájárulás és üzenettípus</h3><CheckRow checked={pref.consent} onChange={v=>patch({consent:v})} disabled={!pref.validPhone} title="A kliens hozzájárult az SMS-ekhez" hint="Nem kapcsolódik be automatikusan egy telefonszám rögzítésétől."/><CheckRow checked={pref.arrivals} onChange={v=>patch({arrivals:v})} title="Új áru érkezéséről kérek SMS-t"/><CheckRow checked={pref.promotions} onChange={v=>patch({promotions:v})} title="Promóciót és személyes kupont is kérek"/><label>SMS nyelve<select value={pref.language} onChange={e=>patch({language:e.target.value as 'hu'|'ro'})}><option value="hu">Magyar</option><option value="ro">Román</option></select></label></div>
        <div className="sms-card"><h3>Hozzájárulás igazolása <SmsHint text="Rögzítsd hol és mikor kérte a kliens az értesítést, például üzletben, személyesen, dátummal és a hozzájárulási lap számával."/></h3><label style={{marginTop:12}}>Igazolás / megjegyzés<textarea value={pref.consentSource} maxLength={1000} onChange={e=>patch({consentSource:e.target.value})}/></label><p className="sms-caption">Rögzítve: {smsDate(pref.consentAt)}<br/>Utolsó módosító: {pref.updatedBy||'–'}</p></div></div>
        <div className="sms-card"><ChipSelect label="Milyen termékek érdeklik? Több is választható." options={meta.genders} value={pref.genders} onChange={genders=>patch({genders})}/><SmsHint text="Ez érdeklődési kör, nem a kliens nemének meghatározása. A férfi és uniszex külön választható; ismeretlen besorolásra nincs automatikus SMS."/></div>
        <div className="sms-card"><CheckRow checked={pref.allBrands} onChange={allBrands=>patch({allBrands})} title="Minden márka érdekli" hint="Csak külön megjelölésre. Egyébként kizárólag a kiválasztott márkák számítanak."/>{!pref.allBrands?<ChipSelect label="Érdeklődési márkák" options={meta.brands} value={pref.brands} onChange={brands=>patch({brands})}/>:null}</div>
        <details className="sms-card"><summary>Termékkategóriák szűkítése · {pref.categories.length?`${pref.categories.length} kiválasztva`:'minden kategória a fenti feltételeken belül'}</summary><ChipSelect label="Opcionális kategóriák" options={meta.categories} value={pref.categories} onChange={categories=>patch({categories})}/></details>
        <div className="sms-short-note"><span className="sms-pill live">Naplózott hozzájárulás</span><SmsHint text="A leiratkozási elérhetőség a beállítás szerint kerül az SMS-be. A hozzájárulás és módosításai naplózva vannak."/></div>
      </div>}
    </div>
  </SmsModal>;
}
