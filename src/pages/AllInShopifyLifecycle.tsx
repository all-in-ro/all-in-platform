import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Printer, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { apiAifShopifyLifecycle, apiAifReceiveShopifyReturn, apiAifResolveShopifyQuarantine,
  type AifShopifyLifecycle, type AifShopifyReturnReceiptInput } from '../lib/aif/api';

type Props = {orderId:string;locationCode?:string;onChanged?:()=>void};
const states:Record<string,string>={allocated:'Feladásra vár',partial:'Részben feladva',fulfilled:'Elküldve',cancelled:'Feladás előtt visszaadva',returned:'Visszaérkezett',partially_returned:'Részben visszaérkezett',fulfilled_partial_cancel:'Részben feladva, maradék visszaadva'};
const operations:Record<string,string>={transfer:'Eredeti átadás',addition:'Kiegészítő Aviz',cancel_release:'Lemondás / visszaadás',shipment:'Feladás',return_received:'Visszáru átvéve',quarantine_release:'Elkülönítés feloldva',quarantine_writeoff:'Sérült termék kivezetve'};
const button='inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs text-white transition hover:bg-white/10 disabled:opacity-40';
const field='h-10 rounded-lg border border-white/20 bg-[#253244] px-3 text-sm text-white outline-none focus:border-[#96BF48]';
const key=()=>globalThis.crypto?.randomUUID?.()||`return-${Date.now()}-${Math.random().toString(36).slice(2,12)}`;
const date=(v:string)=>new Date(v).toLocaleString('hu-HU',{timeZone:'Europe/Bucharest'});

/** Only an explicit, confirmed receipt can put a dispatched item back in stock. */
export default function AllInShopifyLifecycle({orderId,locationCode,onChanged}:Props){
  const [data,setData]=useState<AifShopifyLifecycle|null>(null);
  const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [loading,setLoading]=useState(false);const [busy,setBusy]=useState(false);
  const [form,setForm]=useState(false);const [counts,setCounts]=useState<Record<string,number>>({});
  const [conditions,setConditions]=useState<Record<string,'restock'|'quarantine'>>({});
  const [location,setLocation]=useState('');const [note,setNote]=useState('');
  const [replacement,setReplacement]=useState('');const [confirmed,setConfirmed]=useState(false);
  const [pending,setPending]=useState(false);
  const pendingRef=useRef<AifShopifyReturnReceiptInput|null>(null);
  const quarantineRef=useRef<{id:string;body:{idempotencyKey:string;quantity:number;action:'restock'|'writeoff';note:string}}|null>(null);
  const [quarantineAction,setQuarantineAction]=useState<{id:string;quantity:number;action:'restock'|'writeoff'}|null>(null);
  const [quarantineNote,setQuarantineNote]=useState('');
  const mounted=useRef(true);
  const loadSequence=useRef(0);
  const storageKey=`allin:shopify:return-receipt:${orderId}`;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const load=useCallback(async()=>{
    const sequence=++loadSequence.current;
    setLoading(true);
    try{
      const value=await apiAifShopifyLifecycle(orderId,locationCode);
      if(!mounted.current||sequence!==loadSequence.current)return;
      setData(value);setError('');setLocation(current=>current||value.order.source_location_id);
      const qrequest=quarantineRef.current;
      if(qrequest&&value.events.some(e=>e.event_key===`quarantine:${qrequest.body.idempotencyKey}`)){
        quarantineRef.current=null;setQuarantineAction(null);setQuarantineNote('');try{sessionStorage.removeItem(storageKey+'::quarantine');}catch{}
        setNotice('Az elkülönített visszáru korábbi rendezése már rögzítve van.');
      }
      const request=pendingRef.current;
      if(request&&value.events.some(e=>e.event_key===`receipt:${request.idempotencyKey}`)){
        pendingRef.current=null;setPending(false);try{sessionStorage.removeItem(storageKey);}catch{}
        setNotice('A korábbi visszavétel már rögzítve van. Újabb készletmozgás nem történt.');setForm(false);setCounts({});
      }
    }catch(e){if(mounted.current&&sequence===loadSequence.current)setError(e instanceof Error?e.message:'A rendelés készlettörténete nem tölthető be.');}
    finally{if(mounted.current&&sequence===loadSequence.current)setLoading(false);}
  },[orderId,locationCode,storageKey]);
  useEffect(()=>{
    setData(null);setForm(false);setCounts({});setConditions({});setLocation('');setConfirmed(false);setNotice('');
    pendingRef.current=null;setPending(false);quarantineRef.current=null;setQuarantineAction(null);
    try{const saved=sessionStorage.getItem(storageKey+'::quarantine');if(saved){const q=JSON.parse(saved);if(q.id&&q.body?.idempotencyKey){quarantineRef.current=q;setQuarantineAction({id:q.id,quantity:q.body.quantity,action:q.body.action});setQuarantineNote(q.body.note);}}}catch{}
    try{const saved=sessionStorage.getItem(storageKey);if(saved){const p=JSON.parse(saved);if(p.idempotencyKey&&Array.isArray(p.lines)){pendingRef.current=p;setPending(true);setForm(true);}}}catch{}
    void load();
  },[load,storageKey]);
  function changed(){try{window.dispatchEvent(new CustomEvent('aif:stock-moves-changed'));}catch{}onChanged?.();}
  async function receive(){
    if(!data||busy)return;
    let request=pendingRef.current;
    if(!request){
      const lines=data.lines.filter(l=>Number(counts[l.shopify_line_item_id])>0).map(l=>({lineId:l.shopify_line_item_id,quantity:Number(counts[l.shopify_line_item_id]),condition:conditions[l.shopify_line_item_id]||'restock' as const}));
      if(!confirmed||!note.trim()||!location||!lines.length){setError('Jelöld a visszavett darabokat, add meg az indokot és erősítsd meg a tényleges átvételt.');return;}
      request={idempotencyKey:key(),physicallyReceived:true,locationId:location,note:note.trim(),replacementOrder:replacement.trim(),lines};
      pendingRef.current=request;setPending(true);try{sessionStorage.setItem(storageKey,JSON.stringify(request));}catch{}
    }
    setBusy(true);setError('');
    try{
      const result=await apiAifReceiveShopifyReturn(orderId,request,locationCode);
      pendingRef.current=null;setPending(false);try{sessionStorage.removeItem(storageKey);}catch{}
      setNotice(`${result.documentNumber}: ${result.duplicate?'korábban már rögzítve':'visszavétel rögzítve'}. Pénzvisszatérítés nem történt.`);
      setForm(false);setCounts({});setConfirmed(false);setNote('');setReplacement('');await load();changed();
    }catch(e){
      const status=Number((e as {status?:number})?.status||0);
      if(status>=400&&status<500){pendingRef.current=null;setPending(false);try{sessionStorage.removeItem(storageKey);}catch{}}
      setError((e instanceof Error?e.message:'A visszavétel nem sikerült.')+(status===0||status>=500?' A mentés eredménye bizonytalan. Frissíts, vagy ugyanazzal a műveletazonosítóval próbáld újra.':''));
    }finally{setBusy(false);}
  }
  async function print(number:string){
    setError('');
    try{
      const place=locationCode||data?.order.source_code||'';
      const response=await fetch(`/api/aif/shopify/warehouse/shop/source/documents/${encodeURIComponent(number)}?location=${encodeURIComponent(place)}`,{credentials:'include',cache:'no-store'});
      const detail=await response.json();if(!response.ok||!detail.document)throw new Error(detail.error||'A bizonylat nem tölthető be.');
      const {printShopifyStockDocument}=await import('./AllInProductMoves');printShopifyStockDocument(detail);
    }catch(e){setError(e instanceof Error?e.message:'A nyomtatás nem sikerült.');}
  }
  async function resolveQuarantine(){
    if(!quarantineAction||!quarantineNote.trim()||busy)return;
    const draft=quarantineRef.current||{id:quarantineAction.id,body:{...quarantineAction,note:quarantineNote.trim(),idempotencyKey:key()}};
    quarantineRef.current=draft;try{sessionStorage.setItem(storageKey+'::quarantine',JSON.stringify(draft));}catch{}setBusy(true);setError('');
    try{const result=await apiAifResolveShopifyQuarantine(draft.id,draft.body);quarantineRef.current=null;try{sessionStorage.removeItem(storageKey+'::quarantine');}catch{}setQuarantineAction(null);setQuarantineNote('');setNotice(`${result.documentNumber}: elkülönített visszáru rendezve.`);await load();changed();}
    catch(e){const status=Number((e as {status?:number})?.status||0);if(status>=400&&status<500){quarantineRef.current=null;try{sessionStorage.removeItem(storageKey+'::quarantine');}catch{}}setError(e instanceof Error?e.message:'Rendezési hiba.');}
    finally{setBusy(false);}
  }
  return <section className="space-y-3 rounded-[20px] border border-[#96BF48]/35 bg-[#303a4c] p-4 text-white">
    <header className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] uppercase tracking-wider text-[#c9e5a0]">Shopify • készletút és visszáru</p><h3 className="mt-1 text-lg">{data?.order.order_name||'Rendelés'} {data?`• ${states[String(data.order.raw?.lifecycleState||data.order.state)]||data.order.state}`:''}</h3></div><button type="button" className={button} disabled={loading||busy} onClick={()=>void load()}><RefreshCw size={15} className={loading?'animate-spin':''}/>Frissítés</button></header>
    {error?<div role="alert" className="whitespace-pre-wrap rounded-xl border border-amber-300/35 bg-amber-500/10 p-3 text-xs text-amber-100">{error}</div>:null}
    {notice?<div role="status" className="rounded-xl border border-[#96BF48]/40 bg-[#96BF48]/10 p-3 text-xs"><CheckCircle2 size={14} className="mr-2 inline"/>{notice}</div>:null}
    {!data&&loading?<p className="py-6 text-center text-xs"><Loader2 className="mr-2 inline animate-spin" size={16}/>Készlettörténet betöltése…</p>:null}
    {data?<>
      {!data.enabled?<p className="rounded-xl border border-amber-300/30 bg-amber-500/10 p-3 text-xs text-amber-100">A visszáru-automatizmus még nincs engedélyezve. A megtekintés működik, készletmódosítás nem indítható.</p>:null}
      {data.errors.map((e,i)=><p key={i} className="whitespace-pre-wrap rounded-xl border border-rose-300/30 bg-rose-500/10 p-3 text-xs text-rose-100"><AlertTriangle className="mr-2 inline" size={15}/>{e.error}</p>)}
      <div className="overflow-x-auto rounded-xl border border-white/15"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-black/15 text-white/60"><tr><th className="p-3 font-normal">Termék</th><th className="p-2 font-normal">Átadva</th><th className="p-2 font-normal">Foglalt</th><th className="p-2 font-normal">Feladva</th><th className="p-2 font-normal">Lemondva</th><th className="p-2 font-normal">Visszaérkezett</th></tr></thead><tbody>{data.lines.map(l=><tr key={l.shopify_line_item_id} className="border-t border-white/10"><td className="p-3">{l.product_title}<span className="mt-1 block text-[10px] text-white/50">{l.size} • {l.barcode}</span></td><td className="p-2">{l.allocated_qty}</td><td className="p-2 text-[#c9e5a0]">{l.pending_qty}</td><td className="p-2">{l.shipped_qty}</td><td className="p-2">{l.released_qty}</td><td className="p-2">{l.returned_qty}</td></tr>)}</tbody></table></div>
      <div className="space-y-2"><p className="text-xs text-white/60">Kapcsolódó, változatlanul megőrzött bizonylatok</p>{data.documents.map(d=><div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/10 px-3 py-2"><div className="text-xs"><span>{d.document_number}</span><span className="ml-2 text-white/55">{operations[String(d.raw?.shopifyOperation||'transfer')]||d.title} • {d.total_qty} db</span><span className="mt-1 block text-[10px] text-white/40">{date(d.created_at)}{d.raw?.originalAviz?` • Előzmény: ${String(d.raw.originalAviz)}`:''}</span></div><button type="button" className={button} onClick={()=>void print(d.document_number)}><Printer size={14}/>PDF</button></div>)}</div>
      {data.returns.length?<div className="rounded-xl border border-white/10 p-3 text-xs"><p className="text-white/60">Shopify-visszárujelzések, nem átvételi igazolások</p>{data.returns.map(r=><p key={r.shopify_return_id} className="mt-1">{r.status} • {date(r.updated_at)}</p>)}</div>:null}
      {data.canReceive&&data.lines.some(l=>Number(l.returnable_qty)>0)?<button type="button" className={`${button} border-[#96BF48]/50 bg-[#96BF48]/20`} disabled={!data.enabled||busy} onClick={()=>setForm(v=>!v)}><RotateCcw size={16}/>Tényleges visszáru átvétele</button>:null}
      {form?<div className="space-y-3 rounded-2xl border border-[#96BF48]/40 bg-[#253244] p-4">
        <p className="text-sm">Visszaérkezett termékek ellenőrzése</p><p className="text-xs text-white/60">Csak a fizikailag átvett darabot rögzítsd. A pénzvisszatérítés és a csere-termék kiadása ettől külön történik.</p>
        {pending?<div className="rounded-xl border border-amber-300/30 p-3 text-xs text-amber-100">Korábbi mentés ellenőrzése / újrapróbálása ugyanazzal az azonosítóval. Az adatok addig nem módosíthatók.</div>:null}
        <fieldset disabled={busy||pending} className="space-y-3 disabled:opacity-60">
          <label className="grid gap-1 text-xs">Fizikai átvétel helye<select value={location} onChange={e=>setLocation(e.target.value)} className={field}>{data.locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          {data.lines.filter(l=>Number(l.returnable_qty)>0).map(l=><div key={l.shopify_line_item_id} className="grid gap-2 rounded-xl border border-white/10 p-3 sm:grid-cols-[1fr_90px_190px]"><div className="text-xs">{l.product_title} • {l.size}<p className="mt-1 text-white/50">Legfeljebb {l.returnable_qty} db{!l.valuation_known?' • Régi készletérték ellenőrizendő':''}</p></div><input aria-label={`${l.product_title} visszavett darab`} className={field} type="number" min={0} max={l.returnable_qty} step={1} disabled={!l.valuation_known} value={counts[l.shopify_line_item_id]||0} onChange={e=>setCounts(v=>({...v,[l.shopify_line_item_id]:Number(e.target.value)}))}/><select aria-label="Visszáru állapota" className={field} value={conditions[l.shopify_line_item_id]||'restock'} onChange={e=>setConditions(v=>({...v,[l.shopify_line_item_id]:e.target.value as 'restock'|'quarantine'}))}><option value="restock">Ép, újra eladható</option><option value="quarantine">Sérült / ellenőrzendő</option></select></div>)}
          <label className="grid gap-1 text-xs">Indok / megjegyzés<textarea className={`${field} h-20 py-2`} value={note} onChange={e=>setNote(e.target.value)} placeholder="Méretprobléma, át nem vett csomag, sérülés…"/></label>
          <label className="grid gap-1 text-xs">Csere esetén az új Shopify-rendelés száma, opcionális<input className={field} value={replacement} onChange={e=>setReplacement(e.target.value)} placeholder="AIF-…"/></label>
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>A termékeket ténylegesen átvettem, a mennyiséget és állapotot ellenőriztem.</label>
        </fieldset>
        <button type="button" onClick={()=>void receive()} disabled={busy||!data.enabled} className={`${button} border-[#96BF48]/60 bg-[#96BF48]/25`}><ShieldCheck size={16}/>{busy?'Rögzítés…':pending?'Azonos mentés újrapróbálása':'Átvétel rögzítése és bizonylat készítése'}</button>
      </div>:null}
      {data.quarantine.length?<div className="space-y-2 rounded-xl border border-amber-300/30 bg-amber-500/5 p-3"><p className="text-sm text-amber-100">Elkülönített, nem eladható visszáru</p>{data.quarantine.map(q=><div key={q.id} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>{data.lines.find(l=>l.shopify_line_item_id===q.shopify_line_item_id)?.product_title} • {Number(q.qty)-Number(q.resolved_qty)} db • {q.location_name}</span>{data.canResolveQuarantine?<div className="flex gap-2"><button type="button" className={button} disabled={busy||Boolean(quarantineRef.current)} onClick={()=>{setQuarantineAction({id:q.id,quantity:Number(q.qty)-Number(q.resolved_qty),action:'restock'});setQuarantineNote('');}}>Eladhatóvá</button><button type="button" className={button} disabled={busy||Boolean(quarantineRef.current)} onClick={()=>{setQuarantineAction({id:q.id,quantity:Number(q.qty)-Number(q.resolved_qty),action:'writeoff'});setQuarantineNote('');}}>Sérültként kivezetni</button></div>:null}</div>)}</div>:null}
      {quarantineAction?<div className="space-y-2 rounded-xl border border-amber-300/30 p-3"><p className="text-sm">{quarantineAction.action==='restock'?'Elkülönítés feloldása':'Sérült termék végleges kivezetése'}</p><input type="number" min={1} max={Number(data.quarantine.find(q=>q.id===quarantineAction.id)?.qty||0)-Number(data.quarantine.find(q=>q.id===quarantineAction.id)?.resolved_qty||0)} disabled={busy||Boolean(quarantineRef.current)} className={field} value={quarantineAction.quantity} onChange={e=>setQuarantineAction({...quarantineAction,quantity:Number(e.target.value)})}/><input className={`${field} w-full`} disabled={busy||Boolean(quarantineRef.current)} placeholder="Ellenőrzés eredménye / kötelező indok" value={quarantineNote} onChange={e=>setQuarantineNote(e.target.value)}/><button type="button" disabled={busy||!quarantineNote.trim()} onClick={()=>void resolveQuarantine()} className={button}>Rendezés megerősítése</button></div>:null}
      <p className="text-[11px] text-white/50">Ez a felület nem utal vissza pénzt, nem készít AWB-t, és nem rögzít bolti kasszabevételt.</p>
    </>:null}
  </section>;
}
