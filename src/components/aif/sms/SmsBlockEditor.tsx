import {ArrowUp,ArrowDown,Trash2,Plus,Tag} from 'lucide-react';
import type {SmsBlock,SmsOption} from '../../../lib/aif/smsApi';
import {SmsSelect} from './SmsFields';
// Text blocks deliberately contain line breaks: every important SMS item
// is a separate readable line in the phone preview and the actual SMS.
export function initialBlocks(kind:'arrival'|'promotion',language:'hu'|'ro'):SmsBlock[]{
  if(kind==='arrival')return language==='hu'
    ?[{type:'text',value:'Szia '},{type:'token',value:'name'},{type:'text',value:'!\nÚj áruk érkeztek: '},{type:'token',value:'brands'},{type:'text',value:'.\nVárunk: '},{type:'token',value:'store'},{type:'text',value:'.'}]
    :[{type:'text',value:'Bună, '},{type:'token',value:'name'},{type:'text',value:'!\nAu sosit noutăți: '},{type:'token',value:'brands'},{type:'text',value:'.\nTe așteptăm la: '},{type:'token',value:'store'},{type:'text',value:'.'}];
  return language==='hu'
    ?[{type:'text',value:'Szia '},{type:'token',value:'name'},{type:'text',value:'! Személyes kedvezményed: '},{type:'token',value:'discount'},{type:'text',value:'.\nKód: '},{type:'token',value:'coupon'},{type:'text',value:'\nFelhasználható: '},{type:'token',value:'expiry'},{type:'text',value:'-ig.\nVárunk: '},{type:'token',value:'store'},{type:'text',value:'.'}]
    :[{type:'text',value:'Bună, '},{type:'token',value:'name'},{type:'text',value:'! Reducerea ta personală: '},{type:'token',value:'discount'},{type:'text',value:'.\nCod: '},{type:'token',value:'coupon'},{type:'text',value:'\nValabil până la: '},{type:'token',value:'expiry'},{type:'text',value:' inclusiv.\nTe așteptăm la: '},{type:'token',value:'store'},{type:'text',value:'.'}];
}
export function defaultCouponCopy(language:'hu'|'ro',stackable:boolean){
  return language==='hu'
    ?{eligibility:'Személyes, egyszer használható, csak a megjelölt üzletben.',stacking:stackable?'Más kedvezménnyel összevonható.':'Más kedvezménnyel nem vonható össze.'}
    :{eligibility:'Personal, o singură utilizare, doar în magazinul indicat.',stacking:stackable?'Se poate cumula cu alte reduceri.':'Nu se cumulează cu alte reduceri.'};
}
export function SmsBlockEditor({blocks,onChange,tokens,kind}:{blocks:SmsBlock[];onChange:(value:SmsBlock[])=>void;tokens:SmsOption[];kind:'arrival'|'promotion'}){
  const allowed=tokens.filter(t=>kind==='promotion'||!['coupon','discount','expiry'].includes(t.id));
  const patch=(i:number,b:SmsBlock)=>onChange(blocks.map((x,n)=>i===n?b:x));
  const move=(i:number,d:number)=>{const next=[...blocks];if(i+d<0||i+d>=next.length)return;[next[i],next[i+d]]=[next[i+d],next[i]];onChange(next);};
  return <div><div className="sms-flex"><div><h3>Biztonságos SMS-szerkesztő</h3><p className="sms-caption">Szövegrészek és listából választott adatmezők. Nem kell sablonzárójeleket gépelni.</p></div></div>
    {blocks.map((b,i)=><div className="sms-block" key={i}><div>{b.type==='text'?<textarea aria-label={`${i+1}. szövegblokk`} value={b.value} maxLength={600} onChange={e=>patch(i,{type:'text',value:e.target.value})} rows={2}/>:<div className="sms-token"><Tag size={15}/><SmsSelect label={`${i+1}. adatmező`} value={b.value} onChange={value=>patch(i,{type:'token',value})} options={allowed.map(t=>({value:t.id,label:t.name}))}/></div>}</div><div className="sms-block-tools"><button type="button" aria-label="Blokk feljebb" onClick={()=>move(i,-1)} disabled={i===0}><ArrowUp size={14}/></button><button type="button" aria-label="Blokk lejjebb" onClick={()=>move(i,1)} disabled={i===blocks.length-1}><ArrowDown size={14}/></button><button type="button" aria-label="Blokk törlése" onClick={()=>onChange(blocks.filter((_,n)=>n!==i))}><Trash2 size={14}/></button></div></div>)}
    <div className="sms-actions" style={{marginTop:12}}><button type="button" className="sms-button" disabled={blocks.length>=40} onClick={()=>onChange([...blocks,{type:'text',value:' '}])}><Plus size={14}/> Szövegrész</button><button type="button" className="sms-button primary" disabled={blocks.length>=40} onClick={()=>onChange([...blocks,{type:'token',value:allowed[0]?.id||'name'}])}><Tag size={14}/> Adatmező listából</button></div>
  </div>;
}
