import {useRef,useState} from 'react';
import {Ticket,CheckCircle2,Loader2,X} from 'lucide-react';
import {smsApi,type SmsQuote} from '../../../lib/aif/smsApi';
import './sms.css';
type Line={variantId:string;quantity:number;discountPercent:number};
type Options={location:string;customerId?:string;lines:Line[];manualDiscount:number;beforeCoupon:number;locked:boolean;onChange:()=>void};
const ron=(v:number)=>`${v.toLocaleString('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:2})} RON`;
/** A quote is read-only and belongs to exactly one customer and cart snapshot. */
export function useSmsCoupon(options:Options){
  const[input,setInput]=useState(''),[quote,setQuote]=useState<{value:SmsQuote;signature:string}|null>(null);
  const[loading,setLoading]=useState(false),[error,setError]=useState(''),request=useRef(0),busy=useRef(false);
  const code=input.trim().toUpperCase().replace(/\s+/g,'');
  const signature=JSON.stringify([options.location,options.customerId,code,options.lines,options.manualDiscount,options.beforeCoupon]);
  const latest=useRef(signature);latest.current=signature;
  const valid=!!code&&quote?.signature===signature;
  const active=valid?quote!.value:null;
  const reset=()=>{request.current++;busy.current=false;setLoading(false);setInput('');setQuote(null);setError('');};
  const change=(value:string)=>{request.current++;busy.current=false;setLoading(false);setInput(value.toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,40));setQuote(null);setError('');options.onChange();};
  async function check(){
    if(options.locked||busy.current)return;
    if(!options.customerId){setError('Előbb válaszd ki azt a klienst, aki a személyes kupont kapta.');return;}
    if(!code){setError('Írd be az SMS-ben kapott kuponkódot.');return;}
    const current=++request.current,captured=signature;
    busy.current=true;setLoading(true);setError('');setQuote(null);
    try{
      const result=await smsApi<SmsQuote>('/coupon/quote',{location:options.location,customerId:options.customerId,code,lines:options.lines,manualExtraDiscount:options.manualDiscount});
      if(current!==request.current||latest.current!==captured)return;
      if(!Number.isFinite(result.discount)||!Number.isFinite(result.payable)||Math.abs(result.payable-(options.beforeCoupon-result.discount))>.011){
        setError('A termékár időközben megváltozott. Frissítsd a kosár termékárait, majd ellenőrizd újra a kupont.');return;
      }
      setQuote({value:result,signature:captured});options.onChange();
    }catch(e){if(current===request.current&&latest.current===captured)setError(e instanceof Error?e.message:'A kupon nem ellenőrizhető.');}
    finally{if(current===request.current){busy.current=false;setLoading(false);}}
  }
  const box=<section className="aif-sms sms-coupon-box" aria-label="Személyes SMS-kupon">
    <div className="sms-flex"><h3><Ticket size={17}/> Személyes SMS-kupon</h3>{active?<span className="sms-pill live">Ellenőrizve</span>:null}</div>
    <p className="sms-caption">A kód csak a sikeresen lezárt eladással használódik fel.</p>
    <div className="sms-coupon-input"><input aria-label="SMS-kupon kódja" value={input} disabled={options.locked} onChange={e=>change(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();void check();}}} autoComplete="off" spellCheck={false} placeholder="AIF-…" maxLength={40}/><button type="button" className="sms-button primary" onClick={()=>void check()} disabled={options.locked||loading||!code}>{loading?<Loader2 size={16} className="sms-spin"/>:<CheckCircle2 size={16}/>} Ellenőrzés</button>{input?<button type="button" className="sms-button icon" disabled={options.locked} onClick={()=>{reset();options.onChange();}} aria-label="Kupon törlése a kosárból"><X size={16}/></button>:null}</div>
    {error?<div className="sms-error">{error}</div>:null}
    {active?<div className="sms-ok"><b>Kuponkedvezmény: −{ron(active.discount)}</b><br/>Érvényes: {active.validUntil.replace(/-/g,'. ')} · {active.stackable?'Más kedvezménnyel összevonható':'Más kedvezménnyel nem vonható össze'}</div>:code&&!loading&&!error?<p className="sms-caption">A kódot ehhez a klienshez és kosárhoz még ellenőrizni kell.</p>:null}
  </section>;
  return {box,reset,code,valid,discount:active?.discount||0,blocked:!!code&&!valid,loading,expectedDiscount:active?.discount};
}
