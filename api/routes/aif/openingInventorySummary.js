// ALLINFASHION_LELTAR_OSSZESITO_20261104
// Egylapos, olvashato, nyomtathato vezetoi osszesito. Csak meglevo adatokat olvas.
// A PDF-et a bongeszo Nyomtatas / Mentes PDF-kent funkcioja kesziti.
const clean = value => String(value ?? '').trim();
const numeric = value => value === null || value === undefined || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const amount = value => numeric(value) ?? 0;
const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
const escapeHtml = value => clean(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const integer = value => Math.round(amount(value)).toLocaleString('hu-HU', {maximumFractionDigits:0});
const money = value => value === null || value === undefined ? 'Nincs adat' : round(value).toLocaleString('hu-HU',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' RON';
const date = value => { if(!value)return '—'; const d=new Date(value);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('hu-HU',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d); };
const isPresent = value => value !== null && value !== undefined && value !== '';

export function summarizeOpeningInventory(detail, custody={}) {
  const lines=Array.isArray(detail?.lines)?detail.lines:[];
  const credit=(custody?.credit?.items||[]).filter(x=>amount(x.outsideQty)>0);
  const reserved=(custody?.reserved?.items||[]).filter(x=>amount(x.qty)>0);
  const out={
    variants:lines.length, countedVariants:0, pendingVariants:0, countedQty:0,
    systemQty:0, systemValue:0, systemMissingPrice:0, countedValue:0, countedMissingPrice:0,
    comparedSystemQty:0, comparedSystemValue:0, comparedSystemMissingPrice:0,
    diffQty:0, diffValue:0, diffMissingPrice:0, shortageQty:0, surplusQty:0,
    shortageValue:0,surplusValue:0, issueVariants:0, unknownQty:0, unknownLines:0,
    creditQty:0,creditDocs:0,creditDue:amount(custody?.credit?.totalDue),creditValue:0,creditMissingPrice:0,
    reservedQty:0,reservedDocs:0,reservedValue:0,reservedMissingPrice:0
  };
  for(const line of lines){
    const qty=amount(line.current_system_qty ?? line.system_qty_start);
    const sell=numeric(line.sell_price ?? line.product?.sellPrice);
    const counted=numeric(line.counted_qty);
    out.systemQty+=qty;
    if(sell===null)out.systemMissingPrice++; else out.systemValue+=qty*sell;
    if(counted===null){out.pendingVariants++;continue;}
    out.countedVariants++;
    out.countedQty+=amount(line.physical_counted_qty ?? counted);
    out.comparedSystemQty+=qty;
    if(sell===null){out.countedMissingPrice++;out.comparedSystemMissingPrice++;out.diffMissingPrice++;}
    else {out.countedValue+=counted*sell;out.comparedSystemValue+=qty*sell;out.diffValue+=(counted-qty)*sell;}
    const diff=counted-qty;
    out.diffQty+=diff;
    if(diff<0){out.shortageQty+=-diff;if(sell!==null)out.shortageValue+=-diff*sell;}
    if(diff>0){out.surplusQty+=diff;if(sell!==null)out.surplusValue+=diff*sell;}
    if(amount(line.movement_during_count_count)>0)out.issueVariants++;
  }
  const unknown=(detail?.unknown||[]).filter(x=>!x.resolved_at && amount(x.qty)>0);
  out.unknownLines=unknown.length;out.unknownQty=unknown.reduce((s,x)=>s+amount(x.qty),0);
  out.creditQty=credit.reduce((s,x)=>s+amount(x.outsideQty),0);
  out.creditDocs=new Set(credit.map(x=>clean(x.saleId||x.saleNumber)).filter(Boolean)).size;
  for(const x of credit){const p=numeric(x.unitPrice);if(p===null)out.creditMissingPrice++;else out.creditValue+=amount(x.outsideQty)*p;}
  out.reservedQty=reserved.reduce((s,x)=>s+amount(x.qty),0);
  out.reservedDocs=new Set(reserved.map(x=>clean(x.reservationId||x.reservationNumber)).filter(Boolean)).size;
  for(const x of reserved){const p=numeric(x.unitPrice);if(p===null)out.reservedMissingPrice++;else out.reservedValue+=amount(x.qty)*p;}
  return out;
}

export function buildOpeningInventorySummaryHtml(detail, custody={}) {
  if(!detail?.session)throw new Error('Hiányos leltáradatok az összesítőhöz.');
  const s=detail.session;
  const x=summarizeOpeningInventory(detail,custody);
  const location=clean(s.location_name||s.location?.name)||'Üzlet';
  const status={draft:'Előkészítés',counting:'Számlálás alatt',review:'Ellenőrzés alatt',applied:'Véglegesített',cancelled:'Megszakított'}[clean(s.status)]||clean(s.status)||'Ismeretlen';
  const final=clean(s.status)==='applied';
  const partial=x.pendingVariants>0 || x.unknownLines>0 || x.issueVariants>0;
  const value=(number,missing)=>missing?`${money(number)}*`:money(number);
  const metric=(label,main,sub,extra='')=>`<div class="metric ${extra}"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-number">${escapeHtml(main)}</div><div class="metric-sub">${escapeHtml(sub)}</div></div>`;
  const tr=(name,qty,val,comment='')=>`<tr><td>${escapeHtml(name)}${comment?`<small>${escapeHtml(comment)}</small>`:''}</td><td class="n">${escapeHtml(qty)}</td><td class="n">${escapeHtml(val)}</td></tr>`;
  const exportDate=new Date();
  return `<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>AllInFashion – Leltár összesítő – ${escapeHtml(s.code)}</title>
<style>
@page{size:A4 portrait;margin:11mm 12mm 10mm}
*{box-sizing:border-box}body{font-family:Arial,'DejaVu Sans',sans-serif;color:#243449;background:#e9edf1;margin:0;font-size:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.toolbar{max-width:794px;margin:14px auto;display:flex;gap:10px;align-items:center;justify-content:space-between;background:#243449;color:#fff;padding:10px 15px;border-radius:8px}.toolbar button{background:#108d8b;color:#fff;border:0;border-radius:6px;padding:10px 16px;cursor:pointer;font:inherit;font-weight:600}
.paper{width:210mm;min-height:297mm;background:#fff;margin:0 auto;padding:11mm 12mm 10mm;box-shadow:0 8px 35px #0002}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #108d8b;padding-bottom:12px}.brand{font-size:12px;letter-spacing:2px;color:#108d8b}.heading{font-size:23px;color:#25364a;letter-spacing:-.5px;margin:5px 0 0}.meta{text-align:right;line-height:1.7;color:#5a6676;font-size:9px}.status{display:inline-block;border:1px solid #c7d2da;border-radius:12px;padding:3px 8px;color:#26364b;margin-top:4px}
.description{margin:9px 0 13px;color:#607085;font-size:9px;line-height:1.45}.metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.metric{border:1px solid #d9e1e7;border-radius:7px;padding:10px 11px;min-height:69px}.metric-label{color:#6b7684;font-size:9px}.metric-number{font-size:19px;font-weight:600;color:#233448;margin:5px 0 2px;white-space:nowrap}.metric-sub{color:#738090;font-size:9px}.metric.primary{border-color:#97d5d2;background:#f1fbfa}.metric.primary .metric-number{color:#087d7b}
h2{font-size:11px;color:#26364b;font-weight:600;margin:15px 0 7px;padding-bottom:5px;border-bottom:1px solid #dce3e8}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#354153;color:#fff;text-align:left;font-size:9px;font-weight:500;padding:7px 8px}th.n,td.n{text-align:right}td{padding:7px 8px;border-bottom:1px solid #e6eaee;font-size:9.5px;vertical-align:middle}td small{display:block;color:#758395;font-size:8px;margin-top:2px}.total td{background:#f1f6f7;font-weight:600}.warn{border-left:3px solid #d99a37;background:#fff8eb;padding:8px 10px;margin-top:10px;color:#685228;font-size:8.8px;line-height:1.45}.legal{color:#627186;font-size:8.2px;line-height:1.4;margin-top:8px}.signatures{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:19px}.sig{border-top:1px solid #7e8c9b;padding-top:7px;font-size:9px;color:#44566c;min-height:37px}.sig span{display:block;color:#8a96a4;font-size:8px;margin-top:4px}.footer{border-top:1px solid #dae2e6;margin-top:14px;padding-top:6px;display:flex;justify-content:space-between;font-size:8px;color:#81909e}
@media print{body{background:#fff}.toolbar{display:none}.paper{padding:0;box-shadow:none;width:auto;min-height:0;margin:0}h2,.signatures,.warn{break-inside:avoid}.metric,table,tr{break-inside:avoid}}@media screen and (max-width:810px){.paper{width:100%;min-height:0;padding:25px}.toolbar{margin:0;border-radius:0}.metric-number{font-size:16px}}
</style></head><body>
<div class="toolbar"><span>Egylapos leltárösszesítő · ${escapeHtml(location)}</span><button type="button" onclick="window.print()">PDF mentése / nyomtatás</button></div>
<main class="paper"><header class="top"><div><div class="brand">ALLINFASHION</div><h1 class="heading">LELTÁR ÖSSZESÍTŐ</h1></div><div class="meta">${escapeHtml(location)}<br>${escapeHtml(s.code||'')}<br>Export: ${escapeHtml(date(exportDate))}<br><span class="status">${escapeHtml(status)}</span></div></header>
<p class="description">Leltár indítása: ${escapeHtml(date(s.started_at||s.created_at))} · Lezárás: ${escapeHtml(date(s.counting_closed_at||s.applied_at))} · Típus: ${clean(s.inventory_mode)==='recovery'?'Helyreállító':'Rendes'} leltár</p>
<section class="metrics">${metric('Rendszerkészlet · üzlet',integer(x.systemQty)+' db',integer(x.variants)+' termékváltozat')}${metric('Bruttó eladási készletérték',value(x.systemValue,x.systemMissingPrice),'Aktuális rendszerkészlet × eladási egységár','primary')}${metric('Fizikailag beolvasott',integer(x.countedQty)+' db',integer(x.countedVariants)+' számolt · '+integer(x.pendingVariants)+' még nem számolt')}${metric('Egyeztetett érték',value(x.countedValue,x.countedMissingPrice),'Csak megszámolt tételek, mozgásokkal korrigálva')}</section>
<h2>Mennyiségi és értékbeli egyeztetés</h2><table><thead><tr><th>Megnevezés</th><th class="n" style="width:23%">Darab</th><th class="n" style="width:32%">Bruttó eladási érték</th></tr></thead><tbody>
${tr('Összehasonlított rendszerkészlet',integer(x.comparedSystemQty),value(x.comparedSystemValue,x.comparedSystemMissingPrice),'Csak a már számolt termékek rendszermennyisége')}
${tr('Egyeztetett leltári mennyiség',integer(x.countedVariants?x.comparedSystemQty+x.diffQty:0),value(x.countedValue,x.countedMissingPrice))}
${tr('Hiány',integer(x.shortageQty),value(x.shortageValue,x.diffMissingPrice))}
${tr('Többlet',integer(x.surplusQty),value(x.surplusValue,x.diffMissingPrice))}
<tr class="total"><td>Nettó eltérés az egyeztetett sorokon</td><td class="n">${escapeHtml((x.diffQty>0?'+':'')+integer(x.diffQty))} db</td><td class="n">${escapeHtml(value(x.diffValue,x.diffMissingPrice))}</td></tr>
</tbody></table>
<h2>Külön nyilvántartott állomány</h2><table><thead><tr><th>Megnevezés</th><th class="n" style="width:23%">Darab</th><th class="n" style="width:32%">Bruttó eladási érték</th></tr></thead><tbody>
${tr('Kliensnél lévő áru',integer(x.creditQty),value(x.creditValue,x.creditMissingPrice),integer(x.creditDocs)+' nyitott hiteles bizonylat · nem bolti készlet')}
${tr('Félretett termék',integer(x.reservedQty),value(x.reservedValue,x.reservedMissingPrice),integer(x.reservedDocs)+' aktív foglalás · a bolti készletben már benne van')}
${tr('Nyitott pénzügyi követelés','—',money(x.creditDue),'Nem azonos a kliensnél lévő áru készletértékével')}
</tbody></table>
${partial?`<div class="warn">FIGYELEM: A leltár még nem teljesen egyeztetett. ${x.pendingVariants?'Nem számolt termékváltozat: '+integer(x.pendingVariants)+'. ':''}${x.unknownLines?'Ismeretlen beolvasás: '+integer(x.unknownLines)+' ('+integer(x.unknownQty)+' db). ':''}${x.issueVariants?'Újraszámolandó sor: '+integer(x.issueVariants)+'. ':''}Az üres / nem számolt mennyiség nem nulla, az értékelt eltérés csak a megszámolt tételekre vonatkozik.</div>`:''}
<p class="legal">${final?'Véglegesített leltár alapján készült összesítő.':'Munkaközi összesítő: az export és az aláírás nem zárja le, nem hagyja jóvá és nem vezeti készletre a leltárt.'} Bruttó érték: a rendszerben tárolt eladási ár szerinti értékelés, nem beszerzési / számviteli készletérték. A félretett árut nem számoljuk kétszer. ${x.systemMissingPrice||x.countedMissingPrice||x.creditMissingPrice||x.reservedMissingPrice?'* Egyes tételek ára hiányzik; az érintett pénzösszegek részlegesek.':''}</p>
<div class="signatures"><div class="sig">Leltározó 1<span>Név / aláírás / dátum</span></div><div class="sig">Leltározó 2<span>Név / aláírás / dátum</span></div><div class="sig">Ellenőrző / vezető<span>Név / aláírás / dátum</span></div></div>
<footer class="footer"><span>AllInFashion · Leltár összesítő</span><span>${escapeHtml(s.code||'')} · 1 / 1 oldal</span></footer></main></body></html>`;
}
