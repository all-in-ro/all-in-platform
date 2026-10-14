import {useCallback,useEffect,useId,useMemo,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {CalendarDays,Check,ChevronDown,ChevronLeft,ChevronRight,Search,X} from 'lucide-react';
import {smsToday} from '../../../lib/aif/smsApi';

export type SmsSelectOption={value:string;label:string;description?:string};

/** The store's dark, searchable single-select, rendered above scrollable SMS dialogs. */
export function SmsSelect({label,value,options,onChange,placeholder='Válassz…',disabled=false,searchable}:{
  label:string;value:string;options:SmsSelectOption[];onChange:(value:string)=>void;
  placeholder?:string;disabled?:boolean;searchable?:boolean;
}){
  const id=useId(),button=useRef<HTMLButtonElement|null>(null),popup=useRef<HTMLDivElement|null>(null);
  const[open,setOpen]=useState(false),[search,setSearch]=useState(''),[position,setPosition]=useState<CSSProperties>({});
  const shouldSearch=searchable??options.length>9;
  const selected=options.find(o=>o.value===value);
  const visible=useMemo(()=>{
    const q=search.toLocaleLowerCase('hu-HU').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    return options.filter(o=>`${o.label} ${o.description||''}`.toLocaleLowerCase('hu-HU').normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q));
  },[options,search]);
  const close=useCallback(()=>{setOpen(false);setSearch('');},[]);
  const layout=useCallback(()=>{
    const r=button.current?.getBoundingClientRect();if(!r)return;
    const gap=6,padding=9,height=Math.min(340,58+(shouldSearch?55:0)+Math.max(1,options.length)*42);
    const spaceBelow=window.innerHeight-r.bottom-padding,spaceAbove=r.top-padding;
    const upwards=spaceBelow<Math.min(200,height)&&spaceAbove>spaceBelow;
    const width=Math.min(Math.max(r.width,225),window.innerWidth-padding*2);
    const left=Math.max(padding,Math.min(r.left,window.innerWidth-width-padding));
    setPosition({position:'fixed',top:upwards?Math.max(padding,r.top-gap):Math.min(window.innerHeight-padding,r.bottom+gap),left,width,
      maxHeight:Math.max(120,Math.min(height,(upwards?spaceAbove:spaceBelow)-gap)),transform:upwards?'translateY(-100%)':undefined,zIndex:100000});
  },[options.length,shouldSearch]);
  useEffect(()=>{
    if(!open)return;
    layout();
    const pointer=(e:PointerEvent)=>{const target=e.target as Node;if(!button.current?.contains(target)&&!popup.current?.contains(target))close();};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();button.current?.focus();}};
    document.addEventListener('pointerdown',pointer,true);document.addEventListener('keydown',key,true);
    window.addEventListener('resize',layout);window.addEventListener('scroll',layout,true);
    return()=>{document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('keydown',key,true);window.removeEventListener('resize',layout);window.removeEventListener('scroll',layout,true);};
  },[open,close,layout]);
  useEffect(()=>{if(disabled&&open)close();},[disabled,open,close]);
  const choose=(next:string)=>{onChange(next);close();button.current?.focus();};
  return <div className="sms-field">
    <span className="sms-field-label" id={`${id}-label`}>{label}</span>
    <button ref={button} type="button" className={`sms-select-trigger ${open?'is-open':''}`} aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-label`} disabled={disabled}
      onClick={()=>{setOpen(v=>!v);setSearch('');}} onKeyDown={e=>{if(e.key==='ArrowDown'&&!open){e.preventDefault();setOpen(true);}}}>
      <span className={selected?'':'sms-placeholder'}>{selected?.label||placeholder}</span><ChevronDown size={16}/>
    </button>
    {open?createPortal(<div ref={popup} data-sms-popover="true" className="aif-sms sms-floating-picker sms-select-menu" style={position} role="listbox" aria-label={label}>
      {shouldSearch?<div className="sms-picker-search"><Search size={16}/><input autoFocus value={search} placeholder="Keresés…" aria-label={`${label} keresése`} onChange={e=>setSearch(e.target.value)}/>{search?<button type="button" aria-label="Keresés törlése" onClick={()=>setSearch('')}><X size={14}/></button>:null}</div>:null}
      <div className="sms-picker-options">{visible.length?visible.map(o=><button key={o.value} role="option" aria-selected={value===o.value} type="button" className={value===o.value?'chosen':''} onClick={()=>choose(o.value)}>
        <span><strong>{o.label}</strong>{o.description?<small>{o.description}</small>:null}</span>{o.value===value?<Check size={16}/>:null}
      </button>):<p className="sms-picker-empty">Nincs találat.</p>}</div>
    </div>,document.body):null}
  </div>;
}

const pad=(n:number)=>String(n).padStart(2,'0');
export function smsDisplayDate(value:string){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value||'');return m?`${m[3]}.${m[2]}.${m[1]}`:'';}
function safeIso(y:number,m:number,d:number){
  const check=new Date(Date.UTC(y,m-1,d));
  return y>=1900&&y<=2100&&check.getUTCFullYear()===y&&check.getUTCMonth()===m-1&&check.getUTCDate()===d?`${y}-${pad(m)}-${pad(d)}`:null;
}
function parseDate(value:string){
  const a=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if(a)return safeIso(Number(a[3]),Number(a[2]),Number(a[1]));
  const b=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  return b?safeIso(Number(b[1]),Number(b[2]),Number(b[3])):null;
}
const monthNames=['január','február','március','április','május','június','július','augusztus','szeptember','október','november','december'];
export function SmsDatePicker({label,value,onChange,min,max,disabled=false,hint}:{
  label:string;value:string;onChange:(iso:string)=>void;min?:string;max?:string;disabled?:boolean;hint?:string;
}){
  const id=useId(),button=useRef<HTMLButtonElement|null>(null),popup=useRef<HTMLDivElement|null>(null);
  const[open,setOpen]=useState(false),[text,setText]=useState(smsDisplayDate(value)),[position,setPosition]=useState<CSSProperties>({});
  const[month,setMonth]=useState(()=>{const v=parseDate(value)||smsToday();return new Date(`${v.slice(0,7)}-01T12:00:00Z`);});
  useEffect(()=>{setText(smsDisplayDate(value));},[value]);
  const close=useCallback(()=>setOpen(false),[]);
  const layout=useCallback(()=>{
    const r=button.current?.getBoundingClientRect();if(!r)return;
    const padding=9,gap=6,width=Math.min(324,window.innerWidth-2*padding),height=365;
    const below=window.innerHeight-r.bottom-padding,above=r.top-padding,up=below<height&&above>below;
    setPosition({position:'fixed',left:Math.max(padding,Math.min(r.left,window.innerWidth-width-padding)),width,
      top:up?Math.max(padding,r.top-gap):r.bottom+gap,transform:up?'translateY(-100%)':undefined,zIndex:100000,
      maxHeight:Math.max(210,Math.min(height,(up?above:below)-gap))});
  },[]);
  useEffect(()=>{
    if(!open)return;layout();
    const pointer=(e:PointerEvent)=>{const t=e.target as Node;if(!button.current?.parentElement?.contains(t)&&!popup.current?.contains(t))close();};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();button.current?.focus();}};
    document.addEventListener('pointerdown',pointer,true);document.addEventListener('keydown',key,true);
    window.addEventListener('resize',layout);window.addEventListener('scroll',layout,true);
    return()=>{document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('keydown',key,true);window.removeEventListener('resize',layout);window.removeEventListener('scroll',layout,true);};
  },[open,close,layout]);
  useEffect(()=>{if(disabled&&open)close();},[disabled,open,close]);
  const inRange=(iso:string)=>!((min&&iso<min)||(max&&iso>max));
  const commit=(raw:string)=>{const v=parseDate(raw);if(v&&inRange(v)){onChange(v);setText(smsDisplayDate(v));return true;}setText(smsDisplayDate(value));return false;};
  const choose=(iso:string)=>{if(!inRange(iso))return;onChange(iso);setText(smsDisplayDate(iso));close();};
  const shift=(delta:number)=>setMonth(d=>new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+delta,1,12)));
  const year=month.getUTCFullYear(),m=month.getUTCMonth();
  const first=(new Date(Date.UTC(year,m,1)).getUTCDay()+6)%7;
  const total=new Date(Date.UTC(year,m+1,0)).getUTCDate();
  const cells=Array.from({length:Math.ceil((first+total)/7)*7},(_,i)=>{const day=i-first+1;return day>=1&&day<=total?safeIso(year,m+1,day):null;});
  const today=smsToday();
  return <div className="sms-field">
    <span id={`${id}-label`} className="sms-field-label">{label}</span>
    <div className={`sms-date-input ${open?'is-open':''}`}>
      <input type="text" value={text} placeholder="NN.HH.ÉÉÉÉ" maxLength={10} disabled={disabled} inputMode="numeric" aria-labelledby={`${id}-label`} aria-description={hint}
        onChange={e=>setText(e.target.value)} onBlur={()=>{if(text!==smsDisplayDate(value))commit(text);}}
        onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commit(text);close();}}}/>
      <button type="button" ref={button} aria-label={`${label} naptár megnyitása`} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={()=>{
        if(!open){const current=parseDate(text)||parseDate(value)||smsToday();setMonth(new Date(`${current.slice(0,7)}-01T12:00:00Z`));}setOpen(v=>!v);
      }}><CalendarDays size={17}/></button>
    </div>
    {hint?<small className="sms-date-hint">{hint}</small>:null}
    {open?createPortal(<div ref={popup} data-sms-popover="true" className="aif-sms sms-floating-picker sms-calendar" style={position} role="dialog" aria-label={`${label} naptár`}>
      <div className="sms-calendar-header"><button type="button" onClick={()=>shift(-1)} aria-label="Előző hónap"><ChevronLeft size={17}/></button><strong>{year}. {monthNames[m]}</strong><button type="button" onClick={()=>shift(1)} aria-label="Következő hónap"><ChevronRight size={17}/></button></div>
      <div className="sms-calendar-days">{['H','K','Sz','Cs','P','Sz','V'].map((day,i)=><span key={i} aria-label={['Hétfő','Kedd','Szerda','Csütörtök','Péntek','Szombat','Vasárnap'][i]}>{day}</span>)}</div>
      <div className="sms-calendar-grid">{cells.map((iso,i)=>iso?<button key={iso} type="button" disabled={!inRange(iso)} className={[iso===value?'picked':'',iso===today?'today':''].join(' ')} aria-label={smsDisplayDate(iso)} aria-pressed={iso===value} onClick={()=>choose(iso)}>{Number(iso.slice(-2))}</button>:<span key={`e-${i}`}/>)}</div>
      <div className="sms-calendar-footer"><button type="button" onClick={()=>{const t=smsToday();setMonth(new Date(`${t.slice(0,7)}-01T12:00:00Z`));if(inRange(t))choose(t);}}>Ma</button><span>Nap.Hó.Év</span></div>
    </div>,document.body):null}
  </div>;
}
