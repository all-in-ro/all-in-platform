import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, BarChart3, CalendarDays, ChevronDown, Clock3, Info, RefreshCw, Store, X } from 'lucide-react';
import { apiAifHourlySales, type AifHourlyReport } from '../lib/aif/api';
import { WEEKDAYS, SHOP_COLORS, dateList, hourLabel, localToday, metricValue, moveDate, sampleShops, sumHour, type HourlyAggregate, type HourlyMetric } from '../lib/aif/hourlySalesModel';
import './AllInHourlySales.css';

const metricNames = { purchases: 'Vásárlás', units: 'Darab', value: 'Eladási érték' };
const fmt = (n: number, digits = 0) => n.toLocaleString('hu-HU', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
const unit = (m: HourlyMetric) => m === 'value' ? 'RON' : m === 'units' ? 'db' : 'vásárlás';
const zero = { purchases: 0, credit: 0, refunded: 0, units: 0, value: 0 };

export default function AllInHourlySales({ onBack }: { onBack: () => void }) {
  const yesterday = moveDate(localToday(), -1);
  const [from, setFrom] = useState(() => moveDate(yesterday, -27));
  const [to, setTo] = useState(yesterday);
  const [range, setRange] = useState({ from: moveDate(yesterday,-27), to:yesterday, version:0 });
  const [data, setData] = useState<AifHourlyReport | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [scope, setScope] = useState('both');
  const [weekdays, setWeekdays] = useState([0,1,2,3,4,5,6]);
  const [metric, setMetric] = useState<HourlyMetric>('purchases');
  const [aggregate, setAggregate] = useState<HourlyAggregate>('average');
  const [common, setCommon] = useState(false);
  const [startHour, setStartHour] = useState(8);
  const [endHour, setEndHour] = useState(21);
  const [selectedHour, setSelectedHour] = useState(14);
  const [selectedWeekday, setSelectedWeekday] = useState<number | null>(null);
  const [methodOpen, setMethodOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const requestId = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const errorTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => { headingRef.current?.focus(); window.scrollTo(0,0); }, []);
  useEffect(() => { setSelectedWeekday(null); }, [weekdays]);
  useEffect(() => {
    if (!error) return;
    errorTrigger.current = document.activeElement as HTMLElement;
    errorRef.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setError(''); return; }
      if (e.key !== 'Tab') return;
      const controls = errorRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[href],input,select,[tabindex="0"]');
      if (!controls?.length) { e.preventDefault(); return; }
      const first=controls[0], last=controls[controls.length-1];
      if (e.shiftKey && (document.activeElement===first || document.activeElement===errorRef.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement===last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown',key);
    const overflow=document.body.style.overflow; document.body.style.overflow='hidden';
    return () => { document.removeEventListener('keydown',key); document.body.style.overflow=overflow; errorTrigger.current?.focus(); };
  }, [error]);
  useEffect(() => {
    const controller = new AbortController(), id = ++requestId.current;
    setBusy(true); setData(null);
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    apiAifHourlySales(range.from,range.to,controller.signal).then(result => {
      if(id !== requestId.current) return;
      if(!result?.ok || !Array.isArray(result.shops)) throw new Error('A szerver válasza hiányos. Frissítsd a backend fájlokat is.');
      setData(result);
    }).catch(e => {
      if(id===requestId.current) setError(controller.signal.aborted ? 'A lekérés túl sokáig tartott. Próbálj rövidebb időszakot.' : e instanceof Error ? e.message : 'A kimutatás nem tölthető be.');
    }).finally(() => { window.clearTimeout(timeout); if(id===requestId.current) setBusy(false); });
    return () => { requestId.current++; controller.abort(); window.clearTimeout(timeout); };
  }, [range]);

  const shops = useMemo(() => sampleShops((data?.shops || []).filter(s => scope==='both' || s.code===scope), weekdays, common && scope==='both'), [data,scope,weekdays,common]);
  const hours = Array.from({length:endHour-startHour},(_,i)=>startHour+i);
  const hourly = shops.map(s => hours.map(h=>metricValue(s.days,h,metric,aggregate)));
  const max = Math.max(1,...hourly.flat().filter((x): x is number=>x!==null));
  const total = shops.reduce((a,s) => {
    for(const d of s.days) for(const h of d.hours) if(h.hour>=startHour && h.hour<endHour) for(const key of ['purchases','units','value','credit','refunded'] as const) a[key]+=h[key];
    return a;
  }, {...zero});
  const sampleDays = shops.reduce((a,s)=>a+s.days.length,0);
  const outside = shops.reduce((a,s)=>a+s.days.reduce((n,d)=>n+d.hours.filter(h=>h.hour<startHour||h.hour>=endHour).reduce((n,h)=>n+h.purchases,0),0),0);
  const peak = hours.map(hour=>({hour, value:shops.reduce((n,s)=>n+(metricValue(s.days,hour,'purchases','average') || 0),0)})).sort((a,b)=>b.value-a.value||a.hour-b.hour)[0];
  const selectedDays = shops.map(s=>({...s, days:s.days.filter(d=>selectedWeekday===null||d.weekday===selectedWeekday)}));
  const chartHeight=245, chartWidth=980, left=52, right=16, top=20, bottom=32;
  const px=(i:number)=>left+(hours.length===1?(chartWidth-left-right)/2:i/(hours.length-1)*(chartWidth-left-right));
  const py=(v:number)=>top+(1-v/max)*(chartHeight-top-bottom);
  const dates = data ? dateList(data.from,data.to).filter(d=>weekdays.includes((new Date(`${d}T12:00:00Z`).getUTCDay()+6)%7)).reverse() : [];
  const dirty=from!==range.from||to!==range.to;
  const color=(code:string)=>SHOP_COLORS[code==='main_warehouse'?0:1];
  function apply(nextFrom=from,nextTo=to) {
    if(!nextFrom||!nextTo||nextFrom>nextTo||nextTo>yesterday||Date.parse(nextTo)-Date.parse(nextFrom)>365*86400000){setError('Válassz legfeljebb 366 napos időszakot, legkésőbb tegnapig.');return;}
    setRange(r=>({from:nextFrom,to:nextTo,version:r.version+1}));
  }
  function preset(days:number){const f=moveDate(yesterday,1-days);setFrom(f);setTo(yesterday);apply(f,yesterday);}
  function chooseHour(hour:number,weekday:number|null=null){setSelectedHour(hour);setSelectedWeekday(weekday);}
  return <main className="aif-hours">
    <div className="ah-shell">
      <header className="ah-header">
        <div><div className="ah-eyebrow"><span className="ah-brand-dot"/> ALLINFASHION <span>/</span> ÜZLETI ELEMZÉS</div><h1 ref={headingRef} tabIndex={-1}>Óránkénti eladások</h1><p>Vásárlási ritmus · üzletek összehasonlítása</p></div>
        <div className="ah-header-actions"><button onClick={()=>apply(range.from,range.to)} disabled={busy} aria-label="Kimutatás frissítése"><RefreshCw size={16} className={busy?'ah-spin':''}/></button><button onClick={()=>{window.scrollTo(0,0);onBack();}}><ArrowLeft size={16}/> Kezdőlap</button></div>
      </header>
      <section className="ah-controls" aria-label="Kimutatás szűrői">
        <div className="ah-control-row"><div className="ah-segment ah-shop-select" aria-label="Üzlet">
          {[["both","Összehasonlítás"],["main_warehouse","Csíkszereda"],["magazin_targu_secuiesc","Kézdivásárhely"]].map(([v,n])=><button key={v} aria-pressed={scope===v} onClick={()=>setScope(v)}>{v==='both'?<BarChart3 size={15}/>:<Store size={15}/>} {n}</button>)}
        </div><div className="ah-presets">{[7,28,90].map(n=><button key={n} aria-pressed={range.from===moveDate(yesterday,1-n)&&range.to===yesterday&&!dirty} onClick={()=>preset(n)}>{n} nap</button>)}</div>
        <label className="ah-date">Kezdete<input type="date" value={from} max={to||yesterday} onChange={e=>setFrom(e.target.value)}/></label><label className="ah-date">Vége<input type="date" value={to} min={from} max={yesterday} onChange={e=>setTo(e.target.value)}/></label><button className="ah-primary" onClick={()=>apply()} disabled={busy}>{dirty?'Alkalmazás':'Lekérés'}<ArrowUpRight size={15}/></button></div>
        <div className="ah-control-row ah-secondary-controls"><div className="ah-weekdays" aria-label="Hét napjai"><button aria-pressed={weekdays.length===7} onClick={()=>setWeekdays([0,1,2,3,4,5,6])}>Minden nap</button>{WEEKDAYS.map((d,i)=><button key={d} aria-pressed={weekdays.includes(i)} onClick={()=>setWeekdays(current=>current.includes(i)?current.length===1?current:current.filter(x=>x!==i):[...current,i].sort())}>{d.slice(0,i===1||i===3||i===5?2:1)}</button>)}</div>
        <label className="ah-time"><Clock3 size={14}/><span className="ah-sr-only">Idősáv kezdete</span><select value={startHour} onChange={e=>{const n=Number(e.target.value);setStartHour(n);if(selectedHour<n)chooseHour(n);}}>{Array.from({length:endHour},(_,h)=><option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>)}</select><span>–</span><span className="ah-sr-only">Idősáv vége</span><select aria-label="Idősáv vége" value={endHour} onChange={e=>{const n=Number(e.target.value);setEndHour(n);if(selectedHour>=n)chooseHour(n-1);}}>{Array.from({length:24-startHour},(_,h)=>h+startHour+1).map(h=><option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>)}</select></label>
        {scope==='both'&&<label className="ah-checkbox"><input type="checkbox" checked={common} onChange={e=>setCommon(e.target.checked)}/> Csak közös adatos napok</label>}
        <button className="ah-method-toggle" aria-expanded={methodOpen} onClick={()=>setMethodOpen(x=>!x)}><Info size={15}/> Számítás alapja</button></div>
        {methodOpen&&<div className="ah-method"><p><strong>Vásárlás:</strong> egy eladási bizonylat, az eladás helyi órájában, a hiteles elvitelekkel együtt. A későbbi befizetés nem új vásárlás. Foglalás, csere és külön visszáru nem ad új vásárlást; a később visszafizetett eredeti eladás benne marad.</p><p><strong>Adatos nap:</strong> van eladás vagy napzárás. Az átlag ezekkel a napokkal oszt; napzárással igazolt, eladás nélküli nap is beleszámít. Adat nélküli nap nem nulla. A 0 vásárlás nem igazolja a nyitvatartást.</p><p><strong>Érték:</strong> a bizonylatok jelenlegi, kedvezmény utáni bruttó összege, nem az aznapi pénzbevétel. Utólagos módosítás változtathatja. Időzóna: Europe/Bucharest. Napi összesítésű régi importok nem kerülnek találomra órákhoz.</p></div>}
      </section>
      <div className="ah-context"><span><CalendarDays size={14}/>{range.from.replaceAll('-','.')} – {range.to.replaceAll('-','.')}<span className="ah-muted"> · teljes naptári napok</span></span>{dirty&&<span className="ah-pending">A módosított dátumot még alkalmazni kell</span>}<span className="ah-context-right">{weekdays.length===7?'Hétfő–vasárnap':weekdays.map(i=>WEEKDAYS[i]).join(', ')}</span></div>
      {busy?<div className="ah-loading" role="status"><RefreshCw className="ah-spin" size={23}/> Kimutatás betöltése…</div>:!data?<div className="ah-empty"><BarChart3 size={32}/><h2>Nincs betöltött kimutatás</h2><button onClick={()=>apply(range.from,range.to)}>Újrapróbálás</button></div>:<>
        <section className="ah-kpis" aria-label="Időszak összesítése">
          <article><span>Vásárlások a kijelölt órákban</span><div>{fmt(total.purchases)}<small>alkalom</small></div><p>{fmt(total.credit)} hiteles elvitel · {fmt(total.units)} termék</p></article>
          <article><span>Átlag / adatos üzletnap</span><div>{sampleDays?fmt(total.purchases/sampleDays,2):'—'}<small>vásárlás</small></div><p>{fmt(total.value,2)} RON eladási érték</p></article>
          <article className="ah-kpi-accent"><span>Legerősebb óra</span><div>{peak?.value?hourLabel(peak.hour):'—'}</div><p>Az üzleti napi átlagok összege alapján</p></article>
          <article><span>Adatos üzletnapok</span><div>{fmt(sampleDays)}<small>nap</small></div><p>{shops.map(s=>`${s.name}: ${s.days.length}`).join(' · ')}</p></article>
        </section>
        {sampleDays===0&&<div className="ah-notice">{common&&scope==='both'?'A kiválasztott időszakban nincs közös adatos nap. Kapcsold ki a közös napok szűrőjét, vagy válassz másik időszakot.':'A kijelölt napokra nincs eladás vagy napzárás. Válassz másik időszakot.'}</div>}
        {sampleDays>0&&shops.some(s=>s.days.length<7)&&<div className="ah-sample-note"><Info size={14}/> Kevés adat: {shops.filter(s=>s.days.length<7).map(s=>`${s.name} ${s.days.length} nap`).join(', ')}. Az órás minta még változhat.</div>}
        <div className="ah-chart-layout">
          <section className="ah-panel ah-chart-panel"><div className="ah-panel-title"><div><span className="ah-eyebrow">NAPI RITMUS</span><h2>Óráról órára</h2></div><div className="ah-segment ah-small">{(['average','total'] as const).map(v=><button key={v} aria-pressed={aggregate===v} onClick={()=>setAggregate(v)}>{v==='average'?'Napi átlag':'Összesen'}</button>)}</div></div>
            <div className="ah-chart-toolbar"><div className="ah-legend">{shops.map(s=><span key={s.code}><i style={{background:color(s.code)}}/>{s.name}<small>{s.days.length} nap</small></span>)}</div><label className="ah-metric-label"><span className="ah-sr-only">Mutató</span><select value={metric} onChange={e=>setMetric(e.target.value as HourlyMetric)}>{Object.entries(metricNames).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label></div>
            <div className="ah-chart-unit">{unit(metric)}{aggregate==='average'?' / adatos nap':''}</div>
            <div className="ah-chart-scroll"><svg className="ah-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={`${metricNames[metric]} óránként. A pontos értékek az alábbi óragombokkal választhatók ki.`}>
              <defs>{shops.map(s=><linearGradient key={s.code} id={`ah-fill-${s.code}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color(s.code)} stopOpacity=".24"/><stop offset="100%" stopColor={color(s.code)} stopOpacity=".01"/></linearGradient>)}</defs>
              {[0,.25,.5,.75,1].map(t=><g key={t}><line x1={left} y1={py(t*max)} x2={chartWidth-right} y2={py(t*max)} stroke="#a9bfd4" strokeOpacity=".10"/><text x={left-12} y={py(t*max)+4} textAnchor="end">{fmt(t*max,metric==='value'?0:1)}</text></g>)}
              {hours.includes(selectedHour)&&<rect x={px(hours.indexOf(selectedHour))-12} y={top} width="24" height={chartHeight-top-bottom} fill="#ffffff" fillOpacity=".045" rx="6"/>}
              {shops.map((s,si)=>{if(!s.days.length)return null;const points=hourly[si].map((v,i)=>`${px(i)},${py(v||0)}`);return <g key={s.code}><path d={`M ${px(0)},${py(0)} L ${points.join(' L ')} L ${px(hours.length-1)},${py(0)} Z`} fill={`url(#ah-fill-${s.code})`}/><polyline points={points.join(' ')} fill="none" stroke={color(s.code)} strokeWidth="2.7" strokeLinejoin="round"/>{hourly[si].map((v,i)=><circle key={i} cx={px(i)} cy={py(v||0)} r={hours[i]===selectedHour?5:3} fill="#253446" stroke={color(s.code)} strokeWidth="2"/>)}</g>;})}
              {hours.map((h,i)=><text key={h} x={px(i)} y={chartHeight-8} textAnchor="middle">{String(h).padStart(2,'0')}</text>)}
            </svg><div className="ah-hour-buttons" style={{gridTemplateColumns:`repeat(${hours.length},minmax(30px,1fr))`}}>{hours.map(h=><button key={h} aria-label={`${hourLabel(h)} részletei`} aria-pressed={selectedHour===h&&selectedWeekday===null} onClick={()=>chooseHour(h)}>{String(h).padStart(2,'0')}</button>)}</div></div>
            <div className="ah-chart-footer"><span>Óra kiválasztásával részletezhető</span>{outside>0&&<button onClick={()=>{setStartHour(0);setEndHour(24);}}>{outside} vásárlás ezen az idősávon kívül <ArrowUpRight size={13}/></button>}</div>
          </section>
          <aside className="ah-panel ah-slot" aria-live="polite"><span className="ah-eyebrow">KIJELÖLT IDŐSÁV</span><h2>{hourLabel(selectedHour)}</h2><div className="ah-slot-day">{selectedWeekday===null?'Kiválasztott napok':WEEKDAYS[selectedWeekday]}{selectedWeekday!==null&&<button aria-label="Hétköznap szűrés megszüntetése" onClick={()=>setSelectedWeekday(null)}><X size={13}/></button>}</div>
            {selectedDays.map(s=>{const v=sumHour(s.days,selectedHour),without=s.days.filter(d=>!d.hours.some(h=>h.hour===selectedHour&&h.purchases>0)).length;return <div className="ah-slot-shop" key={s.code}><span><i style={{background:color(s.code)}}/>{s.name}</span><div className="ah-slot-value" style={{color:color(s.code)}}>{s.days.length?fmt(v.purchases/s.days.length,3):'—'}<small>vásárlás / nap</small></div><dl><div><dt>Vásárlás összesen</dt><dd>{s.days.length?fmt(v.purchases):'—'}</dd></div><div><dt>Eladási érték</dt><dd>{s.days.length?`${fmt(v.value,2)} RON`:'—'}</dd></div><div><dt>Vásárlás nélküli nap</dt><dd>{s.days.length?`${without} / ${s.days.length}`:'Nincs adat'}</dd></div></dl></div>;})}
            <p className="ah-slot-note">A nulla vásárlás nem igazolja a nyitvatartást.</p>
          </aside>
        </div>
        <section className="ah-panel ah-heatmaps"><div className="ah-panel-title"><div><span className="ah-eyebrow">HÉT NAPJAI × ÓRÁK</span><h2>Heti órás mintázat</h2></div><div className="ah-heat-key"><span>Kevesebb</span><i/><span>Több</span><span className="ah-no-data-key">— nincs adat</span></div></div><div className="ah-heat-grid">
          {shops.map(s=>{const cellDays=WEEKDAYS.map((_,i)=>s.days.filter(d=>d.weekday===i));const heatMax=Math.max(1,...shops.flatMap(sh=>WEEKDAYS.flatMap((_,i)=>hours.map(h=>metricValue(sh.days.filter(d=>d.weekday===i),h,metric,aggregate)||0))));return <article key={s.code} className="ah-heat-shop"><h3><i style={{background:color(s.code)}}/>{s.name}<span>{s.days.length} adatos nap</span></h3><div className="ah-heat-scroll"><div className="ah-heat-table" style={{gridTemplateColumns:`78px repeat(${hours.length},minmax(29px,1fr)) 30px`}}><span/><>{hours.map(h=><span className="ah-heat-hour" key={h}>{String(h).padStart(2,'0')}</span>)}</><span className="ah-heat-hour">nap</span>{WEEKDAYS.map((day,wi)=><React.Fragment key={day}><span className={`ah-heat-day ${!weekdays.includes(wi)?'ah-muted':''}`}>{day.slice(0,3)}</span>{hours.map(h=>{const v=metricValue(cellDays[wi],h,metric,aggregate),active=selectedHour===h&&selectedWeekday===wi;return <button key={h} disabled={!cellDays[wi].length} className={`ah-cell ${active?'ah-cell-selected':''}`} aria-label={`${s.name}, ${day}, ${hourLabel(h)}: ${v===null?'nincs adat':`${fmt(v,3)} ${unit(metric)}${aggregate==='average'?' / nap':''}, ${cellDays[wi].length} adatos nap`}`} title={`${day} ${hourLabel(h)} · ${v===null?'nincs adat':fmt(v,3)+' '+unit(metric)}`} onClick={()=>chooseHour(h,wi)} style={v===null?undefined:{background:`color-mix(in srgb, ${color(s.code)} ${v===0?5:15+v/heatMax*65}%, #213143)`,color:v/heatMax>.55?'#13283b':'#edf7fa'}}>{v===null?'—':v===0?'0':metric==='value'?(v<1?'<1':fmt(v)):(v<0.1?'<0,1':fmt(v,1))}</button>;})}<span className="ah-heat-n">{cellDays[wi].length||'—'}</span></React.Fragment>)}</div></div></article>;})}
        </div><div className="ah-heat-caption">{metricNames[metric]} · {aggregate==='average'?'napi átlag':'összesen'} · azonos színskála mindkét üzletben. A „nap” oszlop az átlag mintáját mutatja.</div></section>
        <section className="ah-panel ah-days"><button className="ah-days-toggle" aria-expanded={dailyOpen} onClick={()=>setDailyOpen(x=>!x)}><span><CalendarDays size={17}/> Napi részletezés <small>{hourLabel(selectedHour)}</small></span><ChevronDown size={18} style={{transform:dailyOpen?'rotate(180deg)':undefined}}/></button>{dailyOpen&&<div className="ah-table-scroll"><table><thead><tr><th>Dátum</th><th>Nap</th>{shops.map(s=><th key={s.code}>{s.name}<small>vásárlás · {hourLabel(selectedHour)}</small></th>)}</tr></thead><tbody>{dates.filter(d=>selectedWeekday===null||(new Date(`${d}T12:00:00Z`).getUTCDay()+6)%7===selectedWeekday).map(date=><tr key={date}><td>{date.replaceAll('-','.')}</td><td>{WEEKDAYS[(new Date(`${date}T12:00:00Z`).getUTCDay()+6)%7]}</td>{shops.map(s=>{const d=s.days.find(x=>x.date===date);return <td key={s.code}>{d?sumHour([d],selectedHour).purchases:<span className="ah-muted">— nincs adat / nincs a mintában</span>}</td>;})}</tr>)}</tbody></table></div>}</section>
        <footer className="ah-footer"><span>Eladás időpontja · hiteles elvitelekkel · Europe/Bucharest</span><span>{data.generatedAt?`Lekérve: ${new Date(data.generatedAt).toLocaleTimeString('hu-HU',{timeZone:'Europe/Bucharest',hour:'2-digit',minute:'2-digit'})}`:''}</span></footer>
      </>}
    </div>
    {error&&<div className="ah-error-backdrop"><div className="ah-error-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ah-error-title" aria-describedby="ah-error-message" tabIndex={-1} ref={errorRef}><div className="ah-error-icon"><Info size={24}/></div><h2 id="ah-error-title">A kimutatás nem készíthető el</h2><p id="ah-error-message">{error}</p><button className="ah-primary" onClick={()=>setError('')}>Rendben</button></div></div>}
  </main>;
}
