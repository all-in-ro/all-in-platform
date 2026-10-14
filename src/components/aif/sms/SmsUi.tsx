import {useEffect,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {X,Radio,CheckCircle2} from 'lucide-react';
import type {SmsOption} from '../../../lib/aif/smsApi';
import './sms.css';
let depth=0,originalOverflow='';
export function SmsModal({title,eyebrow='ALLINFASHION · SMS KÖZPONT',children,onClose,compact=false,extra,footer}:{title:string;eyebrow?:string;children:ReactNode;onClose:()=>void;compact?:boolean;extra?:ReactNode;footer?:ReactNode}) {
  const root=useRef<HTMLDivElement|null>(null),panel=useRef<HTMLElement|null>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    if(depth++===0){originalOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}
    panel.current?.focus();
    const key=(e:KeyboardEvent)=>{
      const overlays=document.querySelectorAll('.sms-overlay');if(overlays[overlays.length-1]!==root.current)return;
      if(e.key==='Escape'){if(document.querySelector('[data-sms-popover="true"]'))return;e.preventDefault();e.stopImmediatePropagation();close.current();}
      if(e.key==='Tab'){if(document.querySelector('[data-sms-popover="true"]'))return;
        const els=panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]');
        const items=els?Array.from(els).filter(el=>el.offsetParent!==null):[];
        if(!items.length){e.preventDefault();return;}
        if(e.shiftKey&&(document.activeElement===items[0]||document.activeElement===panel.current)){e.preventDefault();items[items.length-1].focus();}
        if(!e.shiftKey&&document.activeElement===items[items.length-1]){e.preventDefault();items[0].focus();}
      }
    };
    window.addEventListener('keydown',key,true);
    return()=>{window.removeEventListener('keydown',key,true);if(--depth===0)document.body.style.overflow=originalOverflow;if(previous?.isConnected)previous.focus();};
  },[]);
  return createPortal(<div ref={root} className="aif-sms sms-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`sms-shell ${compact?'sms-compact':''}`}>
      <header className="sms-top"><div className="sms-brand"><span className="sms-icon"><Radio size={26}/></span><div><p className="sms-overline">{eyebrow}</p><h2>{title}</h2></div></div><div className="sms-actions">{extra}<button type="button" className="sms-button icon subtle" aria-label="SMS-ablak bezárása" onClick={onClose}><X size={18}/></button></div></header>
      {children}{footer?<footer className="sms-footer">{footer}</footer>:null}
    </section>
  </div>,document.body);
}
export function ChipSelect({label,options,value,onChange}:{label:string;options:SmsOption[];value:string[];onChange:(value:string[])=>void}){
  return <div><p className="sms-label">{label}</p><div className="sms-chipset">{options.map(o=><button type="button" key={o.id} className={value.includes(o.id)?'selected':''} aria-pressed={value.includes(o.id)} onClick={()=>onChange(value.includes(o.id)?value.filter(id=>id!==o.id):[...value,o.id])}>{value.includes(o.id)?'✓ ':''}{o.name}</button>)}</div></div>;
}
export function CheckRow({checked,onChange,title,hint,disabled=false}:{checked:boolean;onChange:(v:boolean)=>void;title:string;hint?:string;disabled?:boolean}){
  return <label className="sms-check"><input type="checkbox" checked={checked} disabled={disabled} onChange={e=>onChange(e.target.checked)}/><span><b>{title}</b>{hint?<small>{hint}</small>:null}</span></label>;
}
export function PhonePreview({message,subtitle='SMS-előnézet'}:{message:string;subtitle?:string}){
  return <div className="sms-phone"><div className="sms-phone-title">{subtitle}</div><div className="sms-bubble">{message||'Itt jelenik meg a kliensnek szánt SMS.'}</div><p className="sms-phone-footer">Az SMS-linkek és kódok küldés előtt kitöltődnek.</p></div>;
}
export function Empty({children}:{children:ReactNode}){return <div className="sms-list-empty"><CheckCircle2 size={28} style={{margin:'0 auto 12px',opacity:.5}}/>{children}</div>;}
