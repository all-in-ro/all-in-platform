import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react';
import { localToday, moveDate } from '../lib/aif/hourlySalesModel';
const MONTHS=['január','február','március','április','május','június','július','augusztus','szeptember','október','november','december'];
const DAYS=['H','K','Sze','Cs','P','Szo','V'];
const hh=(h:number)=>`${String(h).padStart(2,'0')}:00`;
export function huHourlyDate(value:string){return value?`${value.slice(0,4)}. ${value.slice(5,7)}. ${value.slice(8,10)}.`:'Dátum választása';}
function PickerDialog({title,children,onClose}:{title:string;children:React.ReactNode;onClose:()=>void}) {
  const ref=useRef<HTMLDivElement>(null),closeRef=useRef(onClose); closeRef.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    (ref.current?.querySelector<HTMLElement>('[aria-pressed="true"]')||ref.current)?.focus();
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeRef.current();return;}
      if(e.key!=='Tab')return;
      const nodes=ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]');
      if(!nodes?.length){e.preventDefault();return;}
      const first=nodes[0],last=nodes[nodes.length-1];
      if(e.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    };
    window.addEventListener('keydown',key,true);
    return()=>{document.body.style.overflow=overflow;window.removeEventListener('keydown',key,true);previous?.focus();};
  },[]);
  return createPortal(<div className="aif-hours ah-picker-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="ah-picker-dialog" ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}><div className="ah-picker-title"><span>{title}</span><button type="button" aria-label="Bezárás" onClick={onClose}><X size={18}/></button></div>{children}</div></div>,document.body);
}
export function HourlyDatePicker({value,onChange,label,min,max}:{value:string;onChange:(v:string)=>void;label:string;min?:string;max:string}){
  const [open,setOpen]=useState(false),[view,setView]=useState(value.slice(0,7));
  const year=Number(view.slice(0,4)),month=Number(view.slice(5,7))-1;
  const first=new Date(Date.UTC(year,month,1,12));
  const offset=(first.getUTCDay()+6)%7;
  const firstKey=first.toISOString().slice(0,10);
  const cells=Array.from({length:42},(_,i)=>moveDate(firstKey,i-offset));
  function shift(n:number){setView(new Date(Date.UTC(year,month+n,1,12)).toISOString().slice(0,7));}
  function choose(date:string){if((min&&date<min)||date>max)return;onChange(date);setOpen(false);}
  const yesterday=moveDate(localToday(),-1);
  return <><button type="button" className="ah-date-trigger" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setView(value.slice(0,7));setOpen(true);}}><CalendarDays size={15}/>{huHourlyDate(value)}<ChevronDown size={13}/></button>{open&&<PickerDialog title={label} onClose={()=>setOpen(false)}><div className="ah-calendar-nav"><button type="button" aria-label="Előző hónap" disabled={Boolean(min&&view<=min.slice(0,7))} onClick={()=>shift(-1)}><ChevronLeft size={18}/></button><div><span>Naptár</span><p>{year}. {MONTHS[month]}</p></div><button type="button" aria-label="Következő hónap" disabled={view>=max.slice(0,7)} onClick={()=>shift(1)}><ChevronRight size={18}/></button></div><div className="ah-calendar-grid">{DAYS.map(d=><span key={d} className="ah-calendar-weekday">{d}</span>)}{cells.map(date=><button type="button" key={date} aria-label={huHourlyDate(date)} aria-pressed={date===value} disabled={Boolean((min&&date<min)||date>max)} className={date.slice(0,7)===view?'':'ah-other-month'} onClick={()=>choose(date)}>{Number(date.slice(8))}</button>)}</div><div className="ah-picker-footer"><button type="button" disabled={Boolean((min&&yesterday<min)||yesterday>max)} onClick={()=>choose(yesterday)}>Tegnap</button><button type="button" className="ah-primary" onClick={()=>setOpen(false)}>Bezárás</button></div></PickerDialog>}</>;
}
export function HourlyTimePicker({start,end,onChange}:{start:number;end:number;onChange:(start:number,end:number)=>void}){
  const [open,setOpen]=useState(false),[draftStart,setStart]=useState(start),[draftEnd,setEnd]=useState(end);
  return <><button type="button" className="ah-time-trigger" aria-label="Napi idősáv beállítása" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setStart(start);setEnd(end);setOpen(true);}}><Clock3 size={15}/><span>Napi idősáv</span><strong>{hh(start)} – {hh(end)}</strong><ChevronDown size={14}/></button>{open&&<PickerDialog title="Napi idősáv" onClose={()=>setOpen(false)}><div className="ah-time-preview">{hh(draftStart)}<span>—</span>{hh(draftEnd)}</div><div className="ah-time-columns"><div><h3>Kezdete</h3><div className="ah-time-grid">{Array.from({length:24},(_,h)=><button type="button" key={h} aria-label={`Kezdete: ${hh(h)}`} aria-pressed={draftStart===h} onClick={()=>{setStart(h);if(draftEnd<=h)setEnd(h+1);}}>{hh(h)}</button>)}</div></div><div><h3>Vége</h3><div className="ah-time-grid">{Array.from({length:24},(_,i)=>i+1).map(h=><button type="button" key={h} aria-label={`Vége: ${hh(h)}`} disabled={h<=draftStart} aria-pressed={draftEnd===h} onClick={()=>setEnd(h)}>{hh(h)}</button>)}</div></div></div><div className="ah-picker-footer"><button type="button" onClick={()=>setOpen(false)}>Mégse</button><button type="button" className="ah-primary" onClick={()=>{onChange(draftStart,draftEnd);setOpen(false);}}><Check size={15}/>Alkalmazás</button></div></PickerDialog>}</>;
}
