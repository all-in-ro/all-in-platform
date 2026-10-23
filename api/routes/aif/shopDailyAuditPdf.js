import express from 'express';
import PDFDocument from 'pdfkit';
import fs from 'node:fs';

// READ-ONLY daily audit. Uses precisely dated events; never posts a receipt,
// updates a sale, adjusts cash or changes the inventory.
const moneyNumber = (value) => Number.isFinite(Number(value)) ? Math.round((Number(value) + Number.EPSILON) * 100) / 100 : 0;
const totalOf = (rows, field) => moneyNumber(rows.reduce((sum, r) => sum + moneyNumber(r[field]), 0));
const actorKey = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('hu-HU');
const validDay = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
const toDate = (d) => d ? new Date(d) : null;
const bucharest = (value, mode = 'stamp') => {
  if (!value) return '–';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '–';
  return new Intl.DateTimeFormat('hu-HU', {
    timeZone: 'Europe/Bucharest',
    year: mode === 'time' ? undefined : 'numeric',
    month: mode === 'time' ? undefined : '2-digit',
    day: mode === 'time' ? undefined : '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(d);
};
const amount = (v) => `${moneyNumber(v).toLocaleString('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:2})} RON`;
const toIso = (v) => v ? new Date(v).toISOString() : null;
const dateInZone = (v) => v ? new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v)) : null;
const eventTime = (r) => new Date(r.at || r.sold_at || r.paid_at || 0).getTime();
const withinShift = (r, handover) => !handover || (eventTime(r) >= new Date(handover.shift_start_at).getTime() && eventTime(r) <= new Date(handover.cutoff_at).getTime());
const hasRealStartTime = (v) => Boolean(v) && bucharest(v,'time') !== '00:00' && bucharest(v,'time') !== '–';

const fontCandidates = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
];
const boldCandidates = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
];
const palette = { ink:'#25344A',muted:'#617186',line:'#D5DFE7',light:'#F3F7FA',teal:'#148A86',red:'#C71B32' };
// The manager account is recorded as ADMIN in historical data. The printable
// recipient name is a display alias only; the stored actor remains unchanged.
export const aifAuditActorLabel = value => {
  const name = String(value || '').trim();
  return name.toUpperCase() === 'ADMIN' ? 'Kerekes Zsolt' : (name || '–');
};
export const aifAuditExportFilename = ({date, location, employee, handoverId, mode='full'}) => {
  const name = String(employee || '').trim();
  const code = String(location?.code || '').toLowerCase();
  const city = code === 'main_warehouse' ? 'Csíkszereda'
    : code === 'magazin_targu_secuiesc' ? 'Kézdivásárhely'
    : String(location?.name || 'Uzlet').trim();
  // Preserve Hungarian accents for UTF-8 filename*; never include path delimiters.
  const cleanPart = value => String(value).replace(/[/\\:*?"<>|\x00-\x1f]/g,'')
    .trim().replace(/\s+/g,'_').replace(/[^\p{L}\p{N}_-]/gu,'').slice(0,76) || 'Uzlet';
  const personOrCity = cleanPart(name || city);
  const suffix = `${handoverId ? '_Muszak' : ''}${mode==='summary' ? '_Osszefoglalo' : ''}`;
  return `AllInFashion_${date}-${personOrCity}${suffix}.pdf`;
};

// Human-readable product identifiers: barcode / internal product code, never the
// misleading receipt ID. Values remain text, preserving leading zeroes.
export const aifAuditIdentity = item => [
  String(item?.barcode ?? '').trim(),
  String(item?.product_code ?? '').trim(),
].filter(Boolean).join(' / ');

// Show an actual cash transfer on the day it was requested AND, when on another
// day, its later acceptance/cancellation as a separate non-revenue audit event.
// Historical PDFs must not retroactively mark a pending day as confirmed.
export function aifDailyAuditCashEvents(m, date) {
  const requestedDay = dateInZone(m.requested_at);
  const confirmedDay = dateInZone(m.confirmed_at || m.effective_at);
  const rejectedDay = dateInZone(m.rejected_at);
  const cancelledDay = dateInZone(m.cancelled_at);
  const manager = String(m.movement_type) === 'manager_handover';
  const from = aifAuditActorLabel(m.requested_by);
  // Only print the actual recipient when the database records one. Never
  // invent a boss name for an as-yet unconfirmed cash handover.
  const to = m.confirmed_by ? aifAuditActorLabel(m.confirmed_by) : '';
  const raw = m.raw && typeof m.raw === 'object' ? m.raw : {};
  const periodIso = v => {
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0,10);
    return /^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0,10) : '';
  };
  const periodFrom = periodIso(m.handover_from_date) || periodIso(raw.handoverFromDate || raw.handover_from_date);
  const periodTo = periodIso(m.handover_to_date) || periodIso(raw.handoverToDate || raw.handover_to_date);
  const inferredLegacy = Boolean(raw.handoverPeriodInferredLegacy);
  const dayCount = Number(m.covered_day_count ?? raw.coveredDayCount ?? raw.covered_day_count) || null;
  const period = manager && periodFrom && periodTo
    ? `Időszak: ${periodFrom === periodTo ? periodFrom : periodFrom + ' – ' + periodTo}${inferredLegacy ? ' (régi adatból visszaszámítva)' : ''}`
    : '';
  const ref = String(m.reference || '').trim();
  const appendix = [period, ref ? `Hivatkozás: ${ref}` : ''].filter(Boolean).join(' • ');
  const persons = [from, to ? `→ ${to}` : '', appendix].filter(Boolean).join(' ');
  const base = {
    cashType:String(m.movement_type || ''), amount:moneyNumber(m.amount),
    requestedBy:from, requestedAt:m.requested_at || null,
    confirmedBy:to, confirmedAt:m.confirmed_at || m.effective_at || null,
    periodFrom, periodTo, periodInferred:inferredLegacy,
    coveredDayCount:dayCount, movementId:String(m.id || ''),
    cashNote:String(m.note || '').trim(),
    reference:ref,
  };
  const list=[];
  if (date === requestedDay) {
    let status = manager ? 'Zárolva · átvételre vár' : 'Bankbefizetés rögzítve';
    let cashStatus = manager ? 'pending' : 'confirmed';
    if (date === confirmedDay) {
      status = manager ? `Átvéve ${bucharest(m.confirmed_at || m.effective_at,'time')}` : 'Befizetve';
      cashStatus = 'confirmed';
    } else if (date === rejectedDay) {
      status = 'Elutasítva'; cashStatus='rejected';
    } else if (date === cancelledDay) {
      status = 'Visszavonva'; cashStatus='cancelled';
    }
    list.push({ ...base, at:m.requested_at,
      type:manager?'Készpénz átadása':'Bankbefizetés',people:persons,status,
      cashStatus,cashPhase:'request'});
  }
  if (date === confirmedDay && date !== requestedDay) {
    list.push({...base,at:m.confirmed_at || m.effective_at,
      type:manager?'Korábbi pénzátadás átvétele':'Bankbefizetés megerősítve',
      people:[persons,`Kezdeményezve: ${requestedDay||'–'}`].join(' • '),
      status:manager?'Átvéve':'Befizetve', cashStatus:'confirmed',cashPhase:'confirmation'});
  }
  if (date === rejectedDay && date !== requestedDay) {
    list.push({...base,at:m.rejected_at,type:'Pénzátadás elutasítva',
      people:[persons,`Kezdeményezve: ${requestedDay||'–'}`].join(' • '),
      status:'Elutasítva',cashStatus:'rejected',cashPhase:'resolution'});
  }
  if (date === cancelledDay && date !== requestedDay) {
    list.push({...base,at:m.cancelled_at,type:'Pénzátadás visszavonva',
      people:[persons,`Kezdeményezve: ${requestedDay||'–'}`].join(' • '),
      status:'Visszavonva',cashStatus:'cancelled',cashPhase:'resolution'});
  }
  return list;
}


/** PDF drawing, A4 landscape. Every table row may wrap and is never clipped. */
/**
 * Compact, print-first A4 landscape daily audit.
 * A single employee starts on page 1 (no decorative cover page).
 * Empty sections never render. Tables always include their own totals.
 * Receipt/Sale identifiers stay in the database, but product SKU/barcode/color/size
 * are printed so each item remains traceable without long internal receipt IDs.
 */
export function writeShopDailyAuditPdf(doc, report) {
  const normalFont = fontCandidates.find(f => fs.existsSync(f));
  const boldFont = boldCandidates.find(f => fs.existsSync(f));
  if (normalFont) doc.registerFont('AIF', normalFont);
  if (boldFont) doc.registerFont('AIF-B', boldFont);
  const F = normalFont ? 'AIF' : 'Helvetica';
  const B = boldFont ? 'AIF-B' : normalFont ? 'AIF' : 'Helvetica-Bold';
  const clean = s => normalFont ? String(s ?? '') : String(s ?? '').replace(/ő/g,'ö').replace(/ű/g,'ü').replace(/Ő/g,'Ö').replace(/Ű/g,'Ü');
  const fmt = n => moneyNumber(n).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const qty = n => Number(n||0).toLocaleString('ro-RO',{maximumFractionDigits:3});
  const total = (rows,fn) => moneyNumber(rows.reduce((v,r) => v + Number(fn(r) || 0),0));
  const W = 841.89, H = 595.28, margin = 30, contentWidth = W - margin * 2;
  const bottom = H - 40;
  let y = 0, pageTitle = '', pageCount = 0;
  const paragraph = (s,x,top,width,opts={}) => doc.text(clean(s),x,top,{width,lineGap:0,...opts});
  function newPage(heading, subtitle = '') {
    pageTitle = heading;
    doc.addPage({size:'A4',layout:'landscape',margin:0});
    pageCount++;
    doc.rect(0,0,W,49).fill(palette.ink);
    doc.fillColor('#FFFFFF').font(B).fontSize(13);
    paragraph('ALLINFASHION  /  NAPI AUDIT',margin,14,330,{lineBreak:false});
    doc.fillColor('#E7F8F7').font(F).fontSize(8.5);
    paragraph(`${report.date}  •  ${report.location.name}  •  ${heading}`,margin+310,17,contentWidth-310,{align:'right',lineBreak:false});
    y = 61;
    if (subtitle) {
      doc.font(F).fontSize(8).fillColor(palette.muted);
      paragraph(subtitle,margin,y,contentWidth);
      y += 16;
    }
  }
  function reserve(h) { if (y + h > bottom) newPage(pageTitle); }
  function heading(title, heightAfter=0) {
    reserve(28 + heightAfter);
    doc.fillColor(palette.teal).font(B).fontSize(10.3);
    paragraph(title,margin,y,contentWidth);
    y += 17;
    doc.moveTo(margin,y).lineTo(W-margin,y).strokeColor(palette.line).lineWidth(0.6).stroke();
    y += 6;
  }
  function statCells(cells) {
    if (!cells.length) return;
    reserve(49);
    const gap = 6, cw = (contentWidth - gap*(cells.length-1))/cells.length;
    for (let i=0;i<cells.length;i++) {
      const x = margin + i*(cw+gap);
      doc.roundedRect(x,y,cw,40,5).fillAndStroke(palette.light,palette.line);
      doc.font(F).fontSize(7).fillColor(palette.muted);
      paragraph(cells[i][0],x+7,y+6,cw-14,{lineBreak:false});
      doc.font(B).fontSize(10).fillColor(cells[i][2]===true?palette.red:palette.ink);
      paragraph(cells[i][1],x+7,y+22,cw-14,{lineBreak:false});
    }
    y += 46;
  }
  function infoLine(key,value) {
    reserve(16);
    doc.font(F).fontSize(7.7).fillColor(palette.muted);
    paragraph(key,margin,y,152,{lineBreak:false});
    doc.font(B).fontSize(8).fillColor(palette.ink);
    paragraph(value,margin+157,y,contentWidth-157,{lineBreak:false});
    y += 16;
  }
  function sectionTable(label, headers, rows, widths, sums, footnote='') {
    if (!rows.length) return;
    const numeric = new Set(sums?.numeric ?? []);
    const positions = [margin];
    widths.forEach(w=>positions.push(positions[positions.length-1]+w));
    const headerHeight=21, footerHeight=23;
    const fontSize=7.2;
    const rowHeight = vals => {
      doc.font(F).fontSize(fontSize);
      const measured = vals.map((value,i) => doc.heightOfString(clean(value),{
        width: Math.max(15,widths[i]-12),lineGap:0
      }));
      return Math.max(21,Math.ceil(Math.max(...measured,12)+7));
    };
    function tableHeader() {
      if (y + headerHeight > bottom) newPage(pageTitle);
      doc.rect(margin,y,contentWidth,headerHeight).fill(palette.ink);
      doc.font(B).fontSize(7.1).fillColor('#FFFFFF');
      headers.forEach((h,i)=>paragraph(h,positions[i]+5,y+5,widths[i]-10,{
        align:numeric.has(i)?'right':'left',lineBreak:false
      }));
      y += headerHeight;
    }
    const data=rows.map(row=>row.map(val=>String(val??'')));
    const firstHeight=rowHeight(data[0]);
    heading(label,headerHeight+firstHeight+4);
    tableHeader();
    for(let k=0;k<data.length;k++){
      const row=data[k],rh=rowHeight(row);
      const last = k===data.length-1;
      // Keep an ending subtotal directly below the last row, never on its own sheet.
      if (y + rh + (last?footerHeight:0) > bottom) {
        newPage(pageTitle);
        tableHeader();
      }
      if (k%2===0)doc.rect(margin,y,contentWidth,rh).fill(palette.light);
      doc.font(F).fontSize(fontSize).fillColor(palette.ink);
      row.forEach((value,i)=>paragraph(value,positions[i]+5,y+5,widths[i]-10,{
        align:numeric.has(i)?'right':'left'
      }));
      doc.moveTo(margin,y+rh).lineTo(W-margin,y+rh).strokeColor(palette.line).lineWidth(0.4).stroke();
      y += rh;
    }
    doc.rect(margin,y,contentWidth,footerHeight).fill('#E3F3F1');
    doc.font(B).fontSize(7.7).fillColor(palette.ink);
    sums.cells.forEach(([column,val])=>paragraph(clean(val),positions[column]+5,y+5,widths[column]-10,{
      align:numeric.has(column)?'right':'left',lineBreak:false
    }));
    y += footerHeight+7;
    if(footnote){
      doc.font(F).fontSize(7).fillColor(palette.muted);
      const h=doc.heightOfString(clean(footnote),{width:contentWidth});
      reserve(h+8);paragraph(footnote,margin,y,contentWidth);y+=h+7;
    }
  }
  // Identifiers are preserved as strings (leading barcode zeroes must survive).
  const productText = (item, nameOverride = '') => {
    const name = String(nameOverride || item?.product_title || item?.title || item?.product_code || 'Ismeretlen termék').trim();
    const details = [];
    if (item?.color_name) details.push(`Szín: ${String(item.color_name).trim()}`);
    if (item?.size) details.push(`Méret: ${String(item.size).trim()}`);
    const identification = aifAuditIdentity(item);
    if (identification) details.push(identification);
    if (item?.sn_cod) details.push(`S/N: ${String(item.sn_cod).trim()}`);
    return [name, details.join('  •  ')].filter(Boolean).join('\n');
  };
  function employeeNotes(actor, entries) {
    if (!entries?.length) return;
    const list = [], dedup = new Map();
    for (const n of entries) {
      const t = bucharest(n.at);
      const noteKey = String(n.note||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('hu-HU');
      // A note for two different items must NEVER be merged just because its text matches.
      const identity = n.lineId || (n.reference && /^EL\//.test(n.reference) ? n.reference : '');
      const id = [actorKey(n.actor), noteKey, t, identity].join('|');
      if (dedup.has(id)) {
        const existing = dedup.get(id);
        if (!existing.types.includes(n.type)) existing.types.push(n.type);
        for (const pi of n.products || []) {
          if (!existing.products.some(ex => String(ex.line_id||'') === String(pi.line_id||'') &&
            String(ex.product_code||'') === String(pi.product_code||'') &&
            String(ex.barcode||'') === String(pi.barcode||''))) existing.products.push(pi);
        }
      } else {
        const item = { ...n, types:[n.type], products:[...(n.products || [])] };
        dedup.set(id,item); list.push(item);
      }
    }
    heading(`${actor} · megjegyzések (${list.length})`,38);
    for (const n of list) {
      const notedLater = dateInZone(n.at) && dateInZone(n.at) !== report.date;
      const titleText = `${bucharest(n.at)}  •  ${n.actor || '–'}  •  ${n.types.join(' / ')}${notedLater ? '  •  Utólagos bejegyzés' : ''}`;
      const productDescription = (n.products || []).map(p => productText(p)).join('\n');
      const noteText = String(n.note || '').trim();
      doc.font(B).fontSize(7.6);
      const labelH=doc.heightOfString(clean(titleText),{width:contentWidth-20});
      doc.font(F).fontSize(7.2);
      const productH=productDescription ? doc.heightOfString(clean(productDescription),{width:contentWidth-20}) + 5 : 0;
      doc.font(F).fontSize(8);
      const textH=doc.heightOfString(clean(noteText),{width:contentWidth-20});
      const blockH=Math.ceil(10+labelH+productH+5+textH+9);
      if(y+blockH>bottom)newPage(actor);
      doc.roundedRect(margin,y,contentWidth,blockH,4).fillAndStroke(palette.light,palette.line);
      doc.font(B).fontSize(7.6).fillColor(palette.ink);
      paragraph(titleText,margin+10,y+6,contentWidth-20);
      let nextY=y+6+labelH+5;
      if (productDescription) {
        doc.font(F).fontSize(7.2).fillColor(palette.teal);
        paragraph(productDescription,margin+10,nextY,contentWidth-20);
        nextY+=productH;
      }
      doc.font(F).fontSize(8).fillColor(palette.ink);
      paragraph(noteText,margin+10,nextY,contentWidth-20);
      y+=blockH+5;
    }
  }
  const receiptMethod=m=>({cash:'Készpénz',card:'Bankkártya',bank_transfer:'Átutalás'})[String(m||'').toLowerCase()]||m||'–';
  function employeeSection(s, first=false) {
    if(!first)newPage(s.actor);
    else newPage(s.actor, report.scope==='handover' && report.handover
      ? `Műszakátadás: ${hasRealStartTime(report.handover.shift_start_at)?`${bucharest(report.handover.shift_start_at)} → `:''}${bucharest(report.handover.cutoff_at)}  •  Kiállítva: ${bucharest(new Date().toISOString())}`
      : `Eladó: ${s.actor}  •  Kiállítva: ${bucharest(new Date().toISOString())}`);
    const a=s.totals;
    statCells([['Befolyt',amount(a.received)],['Bruttó érték',amount(a.gross)],['Kedvezmény',amount(a.discount)],['Készpénz',amount(a.cash)],['Bankkártya',amount(a.card)]]);
    const extra=[['Új eladás',amount(a.newSales)],['Eladott termék',`${qty(total(s.normal,r=>r.quantity))} db`]];
    if(Math.abs(a.creditReceived)>0.005)extra.push(['Régi hitel fizetve',amount(a.creditReceived)]);
    if(Math.abs(a.creditIssued)>0.005)extra.push(['Hitelre elvitt',amount(a.creditIssued)]);
    if(s.creditReceipts.size)extra.push(['Hiteles vásárlás',String(s.creditReceipts.size)]);
    statCells(extra);
    if(s.shifts.length){
      heading('Kassza és műszakidők',10);
      for(const h of s.shifts)infoLine(h.label,[h.period,h.person,h.cash,h.status].filter(Boolean).join('  •  '));
    }
    sectionTable('Eladott termékek · időrendben',
      ['Idő','Termék / azonosítók','Kliens','Db','Rendes ár','Kedvezmény','Fizetendő'],
      s.normal.map(r=>[bucharest(r.sold_at,'time'),productText(r),r.customer_name||'',String(r.quantity),fmt(moneyNumber(r.list_price)*moneyNumber(r.quantity)),fmt(moneyNumber(r.list_price)*moneyNumber(r.quantity)-moneyNumber(r.line_total)),fmt(r.line_total)]),
      [55,318,112,37,87,82,90],
      {numeric:[3,4,5,6],cells:[[1,'ÖSSZESEN'],[3,qty(total(s.normal,r=>r.quantity))],[4,fmt(total(s.normal,r=>moneyNumber(r.list_price)*moneyNumber(r.quantity)))],[5,fmt(total(s.normal,r=>moneyNumber(r.list_price)*moneyNumber(r.quantity)-moneyNumber(r.line_total)))],[6,fmt(total(s.normal,r=>r.line_total))]]});
    sectionTable('Hitelre kiadott termékek · nem napi bevétel',
      ['Idő','Termék / azonosítók','Kliens','Db','Rendes ár','Kedvezmény','Hitel összege'],
      s.credits.map(r=>[bucharest(r.sold_at,'time'),productText(r),r.customer_name||'',String(r.qty),fmt(r.list_total),fmt(r.discount_total),fmt(r.net_total)]),
      [55,318,112,37,87,82,90],
      {numeric:[3,4,5,6],cells:[[1,'ÖSSZESEN'],[3,qty(total(s.credits,r=>r.qty))],[4,fmt(total(s.credits,r=>r.list_total))],[5,fmt(total(s.credits,r=>r.discount_total))],[6,fmt(total(s.credits,r=>r.net_total))]]});
    sectionTable('Korábbi hitel rendezése · fizetés napján',
      ['Idő','Termék','Kliens','Db','Eredeti ár','Kedvezmény','Fizetve'],
      s.settlements.map(r=>[bucharest(r.paid_at,'time'),productText(r),r.customer_name||'',String(r.quantity||''),fmt(r.gross),fmt(r.discount),fmt(r.amount)]),
      [55,318,112,37,87,82,90],
      {numeric:[3,4,5,6],cells:[[1,'ÖSSZESEN'],[3,qty(total(s.settlements,r=>r.quantity))],[4,fmt(total(s.settlements,r=>r.gross))],[5,fmt(total(s.settlements,r=>r.discount))],[6,fmt(total(s.settlements,r=>r.amount))]]});
    sectionTable('Tételes fizetési események',
      ['Idő','Mit fizettek ki?','Fizetési mód','Összeg'],
      s.payments.map(r=>[bucharest(r.paid_at,'time'),r.description||r.type||'Fizetés',receiptMethod(r.method),fmt(r.amount)]),
      [63,477,132,109],
      {numeric:[3],cells:[[1,'ÖSSZESEN'],[2,`${s.payments.length} fizetés`],[3,fmt(total(s.payments,r=>r.amount))]]},
      '');
    // Ordinary shifts and stock returns stay separate from the money physically
    // handed over to the boss. Never add the same manager handover as a sale,
    // shift transfer or a second cash deduction on the acceptance date.
    const managerEvents=s.moves.filter(x=>x.cashType==='manager_handover' && x.cashPhase);
    const shifts=s.moves.filter(x=>!(x.cashType==='manager_handover' && x.cashPhase));
    const balanceEvent=shifts.filter(x=>x.type==='Napzárás'||x.type==='Műszakátadás').at(-1);
    const bankDeposits=shifts.filter(x=>x.cashPhase==='request'&&x.cashType==='bank_deposit'&&x.cashStatus==='confirmed');
    sectionTable('Műszak- és kasszaesemények',
      ['Idő','Művelet','Kinek / kitől','Állapot','Összeg / kassza'],
      shifts.map(r=>[bucharest(r.at,'time'),r.type,r.people||'',r.status||'',fmt(r.amount)]),
      [63,203,232,142,141],
      {numeric:[4],cells:[[1,'ÖSSZESEN'],[2,`${shifts.length} esemény`], ...(balanceEvent?[[4,`Záró: ${fmt(balanceEvent.amount)}`]]:[])]},
      bankDeposits.length?`Bankbefizetés: ${fmt(total(bankDeposits,x=>x.amount))} RON`:'' );

    if (managerEvents.length) {
      const periodText = r => {
        if (!r.periodFrom || !r.periodTo) return 'Nincs rögzített időszak';
        const from=r.periodFrom.replace(/-/g,'. ');
        const to=r.periodTo.replace(/-/g,'. ');
        const range=from===to?from:`${from} – ${to}`;
        const count=Number(r.coveredDayCount)>0 ? ` (${Math.round(Number(r.coveredDayCount))} nap)` : '';
        return range+count+(r.periodInferred?'\nRégi adatból rekonstruált':'');
      };
      const statusText = r => {
        // At the request date, preserve what the seller knew at day end.
        // A later acceptance may still be shown with its REAL timestamp,
        // explicitly marked as occurring later (not as a same-day transfer).
        const later = r.confirmedAt && dateInZone(r.confirmedAt)!==report.date;
        const lines=[String(r.status||'').trim()];
        if (r.confirmedAt) lines.push(
          `${later?'Később átvéve':'Átvétel'}: ${bucharest(r.confirmedAt)} • ${r.confirmedBy||'átvevő neve nincs rögzítve'}`
        );
        else if (r.cashStatus==='pending') lines.push('Átvétel még nem igazolt');
        if (r.cashPhase==='confirmation') lines.push('Visszaigazolás, nem új pénzlevonás');
        return lines.filter(Boolean).join('\n');
      };
      const cashTransferRows=managerEvents.map(r=>[
        `${bucharest(r.at)}\n${r.cashPhase==='request'?'Átadás rögzítve':r.cashPhase==='confirmation'?'Átvétel igazolva':'Átadás státuszváltozása'}`,
        periodText(r),
        `${r.requestedBy||'–'}\n→ ${r.confirmedBy||(r.cashStatus==='confirmed'?'Nincs név rögzítve':r.cashStatus==='pending'?'Átvételre vár':'Átvétel nem történt')}`,
        statusText(r),
        fmt(r.amount),
      ]);
      const requested=managerEvents.filter(r=>r.cashPhase==='request' && !['rejected','cancelled'].includes(r.cashStatus));
      const acceptedToday=requested.filter(r=>r.cashStatus==='confirmed');
      const pendingToday=requested.filter(r=>r.cashStatus==='pending');
      const confirmedPreviously=managerEvents.filter(r=>r.cashPhase==='confirmation');
      const footerAmount=requested.length
        ? total(requested,r=>r.amount)
        : confirmedPreviously.length
          ? total(confirmedPreviously,r=>r.amount)
          : 0;
      const summaryParts = [
        acceptedToday.length ? `Aznap átvéve: ${fmt(total(acceptedToday,r=>r.amount))} RON` : '',
        pendingToday.length ? `Átvételre vár (zárolva): ${fmt(total(pendingToday,r=>r.amount))} RON` : '',
        confirmedPreviously.length ? `Korábbi átadás átvétele: ${fmt(total(confirmedPreviously,r=>r.amount))} RON (nem új levonás)` : '',
      ].filter(Boolean);
      const totalLabel=summaryParts.join('  •  ') || 'Nem történt új pénzlevonás';
      sectionTable('Készpénzátadás / átvétel · elszámolt időszak',
        ['Esemény ideje','Ettől – eddig','Átadó / átvevő','Átvétel / státusz','Összeg'],
        cashTransferRows,
        [132,163,160,215,111.89],
        {numeric:[4],cells:[[0,'ÖSSZESEN'],[1,`${managerEvents.length} esemény`],[3,requested.length?'Aznap átadott':confirmedPreviously.length?'Korábbi átvétel igazolva':'Státuszváltozás'],[4,fmt(footerAmount)]]},
        totalLabel);
    }
    employeeNotes(s.actor,s.notes);
  }
  if(report.scope==='all'){
    newPage('Teljes üzleti jelentés',`Kiállítva: ${bucharest(new Date().toISOString())}`);
    const a=report.totals;
    statCells([['Befolyt összesen',amount(a.received)],['Bruttó érték',amount(a.gross)],['Kedvezmény',amount(a.discount)],['Készpénz',amount(a.cash)],['Bankkártya',amount(a.card)]]);
    const extras=[['Új eladás',amount(a.newSales)]];
    if(a.creditReceived)extras.push(['Régi hitel fizetve',amount(a.creditReceived)]);
    if(a.creditIssued)extras.push(['Hitelre elvitt',amount(a.creditIssued)]);
    if(report.closure)extras.push(['Záró kassza',amount(report.closure.counted_cash)]);
    statCells(extras);
    sectionTable('Eladók pénzügyi összesítője',
      ['Eladó','Befolyt','Bruttó','Kedvezmény','Készpénz','Bankkártya','Hitelre elvitt'],
      report.sections.map(s=>[s.actor,fmt(s.totals.received),fmt(s.totals.gross),fmt(s.totals.discount),fmt(s.totals.cash),fmt(s.totals.card),fmt(s.totals.creditIssued)]),
      [156,108,102,102,100,105,108],
      {numeric:[1,2,3,4,5,6],cells:[[0,'ÖSSZESEN'],[1,fmt(a.received)],[2,fmt(a.gross)],[3,fmt(a.discount)],[4,fmt(a.cash)],[5,fmt(a.card)],[6,fmt(a.creditIssued)]]});
    if(report.closure){heading('Kasszazárás');infoLine('Lezárta',`${report.closure.actor} • ${bucharest(report.closure.closed_at)}`);infoLine('Záró kassza',amount(report.closure.counted_cash));infoLine('Eltérés',amount(report.closure.cash_difference));}
  }
  for(let i=0;i<report.sections.length;i++)employeeSection(report.sections[i],i===0&&report.scope!=='all');
  if(!report.sections.length && report.scope!=='all') {newPage('Napi audit'); infoLine('Napi állapot','Nincs rögzített eladás vagy műszakadat.');}
  if(report.miscNotes.length){newPage('Egyéb megjegyzések'); employeeNotes('Egyéb szerzők',report.miscNotes);}
  const pages=doc.bufferedPageRange();
  for(let i=pages.start;i<pages.start+pages.count;i++){
    doc.switchToPage(i);
    doc.font(F).fontSize(7).fillColor(palette.muted);
    paragraph(`${report.location.name}  •  ${report.date}  •  ${report.scope==='all'?'Teljes üzlet':report.sections.map(s=>s.actor).join(', ')}`,margin,H-21,contentWidth-95,{lineBreak:false});
    paragraph(`${i-pages.start+1}/${pages.count}`,W-margin-73,H-21,73,{align:'right',lineBreak:false});
  }
}


/**
 * Single-page executive / employee overview, intentionally not a cropped first
 * page of the detailed audit. It contains figures and cash events, no product
 * rows. Unlike full export, it always produces exactly one A4 landscape page.
 */
export function writeShopDailySummaryPdf(doc, report) {
  const normalFont=fontCandidates.find(f=>fs.existsSync(f));
  const boldFont=boldCandidates.find(f=>fs.existsSync(f));
  if(normalFont)doc.registerFont('AIF',normalFont);
  if(boldFont)doc.registerFont('AIF-B',boldFont);
  const F=normalFont?'AIF':'Helvetica';
  const B=boldFont?'AIF-B':normalFont?'AIF':'Helvetica-Bold';
  const clean=s=>normalFont?String(s??''):String(s??'').replace(/ő/g,'ö').replace(/ű/g,'ü');
  const money=v=>moneyNumber(v).toLocaleString('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:2});
  const sum=(rows,key)=>moneyNumber(rows.reduce((v,r)=>v+moneyNumber(r[key]),0));
  const W=841.89,H=595.28,M=30,CW=W-2*M;
  const actor=report.scope==='all'?'Teljes üzlet':(report.sections[0]?.actor||'Eladó');
  const a=report.scope==='all'?report.totals:(report.sections[0]?.totals||report.totals);
  let y=64;
  const put=(value,x,top,width,opts={})=>doc.text(clean(value),x,top,{width,lineGap:0,...opts});
  const label=(value,x,top,width)=>{doc.font(F).fontSize(7.4).fillColor(palette.muted);put(value,x,top,width,{lineBreak:false});};
  const section=title=>{doc.font(B).fontSize(10).fillColor(palette.teal);put(title,M,y,CW);y+=16;
    doc.moveTo(M,y).lineTo(W-M,y).strokeColor(palette.line).lineWidth(.7).stroke();y+=8;};
  const cards=items=>{
    if(!items.length)return;
    const gap=8,cw=(CW-gap*(items.length-1))/items.length;
    for(let i=0;i<items.length;i++){
      const [title,value]=items[i];const x=M+i*(cw+gap);
      doc.roundedRect(x,y,cw,49,5).fillAndStroke(palette.light,palette.line);
      label(title,x+8,y+8,cw-16);
      doc.font(B).fontSize(11).fillColor(palette.ink);
      put(value,x+8,y+25,cw-16,{lineBreak:false,ellipsis:true});
    }
    y+=58;
  };
  const line=(left,right,flag=false)=>{
    const h=21;
    doc.font(F).fontSize(8).fillColor(palette.muted);put(left,M+5,y+3,CW*.43,{lineBreak:false,ellipsis:true});
    doc.font(flag?B:F).fontSize(8).fillColor(palette.ink);put(right,M+CW*.43,y+3,CW*.56,{lineBreak:false,ellipsis:true});
    doc.moveTo(M,y+h).lineTo(W-M,y+h).strokeColor(palette.line).lineWidth(.35).stroke();y+=h;
  };
  const singleActor=report.sections.length===1?report.sections[0]:null;
  doc.addPage({size:'A4',layout:'landscape',margin:0});
  doc.rect(0,0,W,49).fill(palette.ink);
  doc.font(B).fontSize(13).fillColor('#fff');put('ALLINFASHION / NAPI AUDIT',M,14,340,{lineBreak:false});
  doc.font(F).fontSize(8.5).fillColor('#E7F8F7');
  put(`${report.date}  •  ${report.location.name}  •  ${actor}`,M+310,17,CW-310,{align:'right',lineBreak:false});
  doc.font(B).fontSize(14).fillColor(palette.ink);
  put('Napi pénzügyi összefoglaló',M,y,CW,{lineBreak:false});y+=27;
  cards([['Befolyt',`${money(a.received)} RON`],['Bruttó',`${money(a.gross)} RON`],
    ['Kedvezmény',`${money(a.discount)} RON`],['Készpénz',`${money(a.cash)} RON`],['Bankkártya',`${money(a.card)} RON`]]);
  const highlights=[['Új eladás',`${money(a.newSales)} RON`]];
  if(a.creditReceived)highlights.push(['Régi hitel fizetve',`${money(a.creditReceived)} RON`]);
  if(a.creditIssued)highlights.push(['Hitelre elvitt',`${money(a.creditIssued)} RON`]);
  const itemsSold=report.sections.reduce((sum,s)=>sum+s.normal.reduce((n,r)=>n+Number(r.quantity||0),0),0);
  highlights.push(['Eladott darab',`${itemsSold.toLocaleString('ro-RO')} db`]);
  if(report.closure)highlights.push(['Üzleti záró kassza',`${money(report.closure.counted_cash)} RON`]);
  cards(highlights);

  if(report.scope==='all') {
    section('Eladónkénti összegek');
    doc.rect(M,y,CW,21).fill(palette.ink);doc.font(B).fontSize(7.7).fillColor('#fff');
    const labels=[['Eladó',M+7,183,'left'],['Befolyt',M+193,96,'right'],['Bruttó',M+298,96,'right'],
      ['Kedvezmény',M+403,96,'right'],['Készpénz',M+508,96,'right'],['Bankkártya',M+613,96,'right']];
    for(const [k,x,w,align] of labels)put(k,x,y+5,w,{align,lineBreak:false});y+=21;
    // At most the rows that fit on the page. The sums above always represent
    // ALL employees, and the detailed report contains the complete breakdown.
    const available=Math.max(1,Math.floor((H-155-y)/22));
    for(const [index,s] of report.sections.entries()){
      if(index>=available)break;
      if(index%2===0)doc.rect(M,y,CW,22).fill(palette.light);
      doc.font(F).fontSize(8).fillColor(palette.ink);
      for(const [value,x,w,align] of [
        [s.actor,M+7,183,'left'],[money(s.totals.received),M+193,96,'right'],
        [money(s.totals.gross),M+298,96,'right'],[money(s.totals.discount),M+403,96,'right'],
        [money(s.totals.cash),M+508,96,'right'],[money(s.totals.card),M+613,96,'right']
      ])put(value,x,y+5,w,{align,lineBreak:false,ellipsis:true});
      y+=22;
    }
    if(report.sections.length>available)line('További dolgozók a részletes auditban',`${report.sections.length-available} eladó`,true);
    if(report.closure&&y< H-100){y+=7;line('Napzárás',`${bucharest(report.closure.closed_at)} • ${aifAuditActorLabel(report.closure.actor)} • ${money(report.closure.counted_cash)} RON`,true);}
  }else if(singleActor) {
    section('Kassza és műszak');
    for(const h of singleActor.shifts.slice(0,5))line(h.label,[h.period,aifAuditActorLabel(h.person),h.cash,h.status].filter(Boolean).join(' • '));
    if(report.handover)line('Műszak elszámolása',`${hasRealStartTime(report.handover.shift_start_at)?bucharest(report.handover.shift_start_at)+' – ':''}${bucharest(report.handover.cutoff_at)}`);
  }
  // Real manager cash handovers only; never synthesize them from free-text notes.
  const managerEvents=report.sections.flatMap(s=>s.moves||[]).filter(e=>e.cashType==='manager_handover'&&e.cashPhase);
  // An overall report must not double-print one shared cash event if it appears
  // in multiple employee sections.
  const uniqueCash=[...new Map(managerEvents.map(e=>[`${e.movementId}:${e.cashPhase}`,e])).values()];
  if(uniqueCash.length&&y< H-120){
    y+=8;section('Készpénzátadás / átvétel · elszámolt időszak');
    for(const e of uniqueCash.slice(0,Math.max(1,Math.floor((H-77-y)/25)))){
      const period=e.periodFrom&&e.periodTo?`${e.periodFrom} – ${e.periodTo}`:'Időszak nincs rögzítve';
      const persons=`${aifAuditActorLabel(e.requestedBy)} → ${e.confirmedBy?aifAuditActorLabel(e.confirmedBy):'átvételre vár'}`;
      line(`${bucharest(e.at)} • ${period}`,`${persons} • ${money(e.amount)} RON • ${e.status}`,true);
    }
  }
  // Avoid printing details on a 'one page' summary; full audit contains product
  // identifiers, returns, timestamped payment events, notes and every handover.
  doc.moveTo(M,H-34).lineTo(W-M,H-34).strokeColor(palette.line).lineWidth(.5).stroke();
  doc.font(F).fontSize(7).fillColor(palette.muted);
  put(`${report.location.name}  •  ${report.date}  •  ${actor}`,M,H-25,CW-95,{lineBreak:false});
  put('1/1',W-M-73,H-25,73,{align:'right',lineBreak:false});
}


function buildTotals(employee) {
  const regular=employee.normal;
  const payments=employee.payments;
  const grossNew=totalOf(regular,'gross');
  const netNew=totalOf(regular,'line_total');
  const settledNet=totalOf(employee.settlements,'amount');
  const settledGross=totalOf(employee.settlements,'gross');
  const discounts=moneyNumber(grossNew-netNew + settledGross-settledNet);
  return {
    newSales:netNew,creditReceived:settledNet,
    received:totalOf(payments,'amount'),
    gross:moneyNumber(grossNew+settledGross),discount:discounts,
    creditIssued:totalOf(employee.credits,'net_total'),
    cash:totalOf(payments.filter(p=>p.method==='cash'),'amount'),
    card:totalOf(payments.filter(p=>p.method==='card'),'amount'),
    bank:totalOf(payments.filter(p=>p.method==='bank_transfer'),'amount'),
  };
}

async function readProductNotes(client,locationId,date){
  // The sale-line notes module is separate and may use the legacy table name;
  // introspect read-only so no DDL is required for PDF export.
  const columns=await client.query(`SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='public' AND (
      table_name ILIKE 'aif%shop%sale%note%' OR table_name ILIKE 'aif%shop%sale%comment%'
    )`);
  const groups=new Map();for(const r of columns.rows){if(!groups.has(r.table_name))groups.set(r.table_name,new Set());groups.get(r.table_name).add(r.column_name);}
  const table=Array.from(groups.entries()).sort(([a],[b])=>
    (a==='aif_shop_sale_line_notes'?-2:0)-(b==='aif_shop_sale_line_notes'?-2:0)
  ).find(([name,cols]) =>
    (cols.has('sale_line_id')||cols.has('line_id')) &&
    (cols.has('note')||cols.has('body')||cols.has('content')||cols.has('message')) &&
    !/history|audit|deleted|archive/.test(name));
  if(!table)return [];
  const [name,cols]=table;
  const quote=s=>'"'+s.replace(/"/g,'""')+'"';
  const lineCol=cols.has('sale_line_id')?'sale_line_id':'line_id';
  const noteCol=cols.has('note')?'note':cols.has('body')?'body':cols.has('content')?'content':'message';
  const actorCol=cols.has('actor')?'actor':cols.has('created_by')?'created_by':cols.has('author')?'author':null;
  const whenCol=cols.has('created_at')?'created_at':cols.has('added_at')?'added_at':null;
  // Linked to selected day's sold products, including notes written later.
  const activeNoteFilter = (cols.has('deleted_at')?' AND n.deleted_at IS NULL':'')+(cols.has('is_deleted')?' AND COALESCE(n.is_deleted,false)=false':'')+(cols.has('is_active')?' AND COALESCE(n.is_active,true)=true':'');
  const sql=`SELECT sl.sale_id,sl.id AS line_id,s.sale_number,s.actor AS sale_actor,s.sold_at,
    sl.product_title,
    COALESCE(NULLIF(sl.product_code,''),NULLIF(v.internal_sku,'')) AS product_code,
    COALESCE(NULLIF(sl.barcode,''),NULLIF(v.barcode,'')) AS barcode,
    COALESCE(NULLIF(sl.color_name,''),NULLIF(v.color_name,'')) AS color_name,
    sl.size, NULLIF(v.sn_cod,'') AS sn_cod,
    ${actorCol?`n.${quote(actorCol)}::text`:'s.actor'} AS note_actor,
    n.${quote(noteCol)}::text AS note,
    ${whenCol?`n.${quote(whenCol)}`:'s.sold_at'} AS note_at
    FROM ${quote(name)} n JOIN aif_shop_sale_lines sl ON sl.id=n.${quote(lineCol)}
    JOIN aif_shop_sales s ON s.id=sl.sale_id
    LEFT JOIN aif_product_variants v ON v.id=sl.variant_id
    WHERE s.location_id=$1 AND (s.sold_at AT TIME ZONE 'Europe/Bucharest')::date=$2::date ${activeNoteFilter}
    ORDER BY note_at, s.sale_number`;
  const result=await client.query(sql,[locationId,date]);
  return result.rows.map(r=>({type:'Termékmegjegyzés',actor:r.note_actor||r.sale_actor,at:r.note_at,
    reference:r.sale_number,lineId:r.line_id,productInfo:{...r},note:r.note}));
}

export async function loadShopDailyAudit({client,location,date,employee=null,handoverId=null,loadCreditHistory,scope='mine'}){
  const id=location.id;
  const [original,receiptLines,customerReceipts,normalReceipts,exchangePayments,handovers,closings,dailyNotes,cashMoves,saleEvents,saleNotes,returnEvents]=await Promise.all([
    client.query(`SELECT s.id AS sale_id,s.sale_number,s.sold_at,s.actor,s.customer_name,s.customer_phone,s.sale_type,s.status,s.note AS sale_note,
      sl.id AS line_id,sl.product_title,
      COALESCE(NULLIF(sl.product_code,''),NULLIF(v.internal_sku,'')) AS product_code,
      COALESCE(NULLIF(sl.barcode,''),NULLIF(v.barcode,'')) AS barcode,
      COALESCE(NULLIF(sl.color_name,''),NULLIF(v.color_name,'')) AS color_name,
      sl.size, NULLIF(v.sn_cod,'') AS sn_cod,
      sl.quantity,sl.list_price,sl.discount_amount,sl.discount_percent,sl.line_total
      FROM aif_shop_sales s JOIN aif_shop_sale_lines sl ON sl.sale_id=s.id
      LEFT JOIN aif_product_variants v ON v.id=sl.variant_id
      WHERE s.location_id=$1 AND s.status='completed' AND s.sale_type<>'credit'
        AND (s.sold_at AT TIME ZONE 'Europe/Bucharest')::date=$2::date
      ORDER BY s.sold_at,s.sale_number,sl.line_no`,[id,date]),
    client.query(`SELECT cp.id AS payment_id,cp.paid_at,cp.actor,cp.method,cp.amount AS payment_total,cp.note,
      s.sale_number,s.customer_name,s.sold_at AS original_sold_at,
      sl.product_title,
      COALESCE(NULLIF(sl.product_code,''),NULLIF(v.internal_sku,'')) AS product_code,
      COALESCE(NULLIF(sl.barcode,''),NULLIF(v.barcode,'')) AS barcode,
      COALESCE(NULLIF(sl.color_name,''),NULLIF(v.color_name,'')) AS color_name,
      sl.size, NULLIF(v.sn_cod,'') AS sn_cod,
      sl.list_price,sl.line_total,sl.quantity AS original_qty,la.quantity,la.amount
      FROM aif_shop_customer_payments cp
      JOIN aif_shop_customer_payment_line_allocations la ON la.customer_payment_id=cp.id
      JOIN aif_shop_sales s ON s.id=la.sale_id
      JOIN aif_shop_sale_lines sl ON sl.id=la.sale_line_id
      LEFT JOIN aif_product_variants v ON v.id=sl.variant_id
      WHERE cp.location_id=$1 AND (cp.paid_at AT TIME ZONE 'Europe/Bucharest')::date=$2::date
      ORDER BY cp.paid_at,s.sale_number,sl.line_no`,[id,date]),
    client.query(`SELECT cp.* FROM aif_shop_customer_payments cp
      WHERE cp.location_id=$1 AND (cp.paid_at AT TIME ZONE 'Europe/Bucharest')::date=$2::date ORDER BY cp.paid_at`,[id,date]),
    client.query(`SELECT p.*,COALESCE(NULLIF(btrim(p.actor),''),s.actor) AS receipt_actor,s.sale_number
      FROM aif_shop_sale_payments p JOIN aif_shop_sales s ON s.id=p.sale_id
      WHERE s.location_id=$1 AND s.status='completed' AND p.customer_payment_id IS NULL AND p.method<>'credit'
      AND (p.paid_at AT TIME ZONE 'Europe/Bucharest')::date=$2::date ORDER BY p.paid_at`,[id,date]),
    client.query(`SELECT es.*,e.actor,e.exchange_number FROM aif_shop_exchange_settlements es
      JOIN aif_shop_exchanges e ON e.id=es.exchange_id AND e.status='completed'
      WHERE es.location_id=$1 AND (es.created_at AT TIME ZONE 'Europe/Bucharest')::date=$2::date
      ORDER BY es.created_at`,[id,date]),
    client.query(`SELECT * FROM aif_shop_shift_handovers WHERE location_id=$1 AND work_date=$2::date ORDER BY cutoff_at`,[id,date]),
    client.query(`SELECT * FROM aif_shop_day_closures WHERE location_id=$1 AND work_date=$2::date LIMIT 1`,[id,date]),
    client.query(`SELECT * FROM aif_shop_daily_financial_notes WHERE location_id=$1 AND work_date=$2::date ORDER BY created_at`,[id,date]),
    client.query(`SELECT * FROM aif_shop_cash_movements WHERE location_id=$1
      AND (
        (requested_at AT TIME ZONE 'Europe/Bucharest')::date=$2::date
        OR (confirmed_at AT TIME ZONE 'Europe/Bucharest')::date=$2::date
        OR (effective_at AT TIME ZONE 'Europe/Bucharest')::date=$2::date
        OR (rejected_at AT TIME ZONE 'Europe/Bucharest')::date=$2::date
        OR (cancelled_at AT TIME ZONE 'Europe/Bucharest')::date=$2::date
      ) ORDER BY requested_at`,[id,date]),
    client.query(`SELECT ev.*,s.sale_number,s.sold_at,s.actor AS sale_actor FROM aif_shop_sale_events ev JOIN aif_shop_sales s ON s.id=ev.sale_id
      WHERE s.location_id=$1 AND (s.sold_at AT TIME ZONE 'Europe/Bucharest')::date=$2::date
      AND NULLIF(btrim(COALESCE(ev.note,'')),'') IS NOT NULL ORDER BY ev.created_at`,[id,date]),
    client.query(`SELECT s.sale_number,s.sold_at,s.actor,s.note FROM aif_shop_sales s
      WHERE s.location_id=$1 AND (s.sold_at AT TIME ZONE 'Europe/Bucharest')::date=$2::date
      AND NULLIF(btrim(COALESCE(s.note,'')),'') IS NOT NULL ORDER BY s.sold_at`,[id,date]),
    client.query(`SELECT e.id,e.exchange_number,e.actor,e.created_at,e.returned_qty,e.return_credit,
      s.sale_number,s.customer_name,sl.product_title,
      COALESCE(NULLIF(sl.product_code,''),NULLIF(v.internal_sku,'')) AS product_code,
      COALESCE(NULLIF(sl.barcode,''),NULLIF(v.barcode,'')) AS barcode,
      COALESCE(NULLIF(sl.color_name,''),NULLIF(v.color_name,'')) AS color_name,
      sl.size, NULLIF(v.sn_cod,'') AS sn_cod
      FROM aif_shop_exchanges e JOIN aif_shop_sales s ON s.id=e.source_sale_id
      JOIN aif_shop_sale_lines sl ON sl.id=e.source_sale_line_id
      LEFT JOIN aif_product_variants v ON v.id=sl.variant_id
      WHERE e.location_id=$1 AND e.status='completed'
      AND (e.created_at AT TIME ZONE 'Europe/Bucharest')::date=$2::date ORDER BY e.created_at`,[id,date]),
  ]);
  const handover=handoverId?handovers.rows.find(r=>String(r.id)===handoverId):null;
  if(handoverId&&!handover){const e=new Error('A műszakátadás nem található ezen a napon.');e.statusCode=404;throw e;}
  const selected = employee ? actorKey(employee):null;
  if(handover && selected && actorKey(handover.from_actor)!==selected){const e=new Error('Ez a műszakátadás nem ehhez az eladóhoz tartozik.');e.statusCode=403;throw e;}
  const productNotes = await readProductNotes(client,id,date);
  const allNotes=[];
  const push=(type,actor,at,note,reference='',productInfo=null,lineId=null)=>{if(String(note||'').trim())allNotes.push({type,actor:actor||'–',at,reference,productInfo,lineId,note:String(note).trim()});};
  for(const n of dailyNotes.rows)push('Napi megjegyzés',n.actor,n.created_at,n.note);
  for(const n of saleNotes.rows)push('Bizonylat megjegyzés',n.actor,n.sold_at,n.note,n.sale_number);
  for(const n of saleEvents.rows){
    if(n.event_type==='completed'&&saleNotes.rows.some(s=>s.sale_number===n.sale_number&&String(s.note||'').trim()===String(n.note||'').trim()))continue;
    push('Eladási esemény',n.actor||n.sale_actor,n.created_at,n.note,n.sale_number);
  }
  for(const n of productNotes)push(n.type,n.actor,n.at,n.note,n.reference,n.productInfo,n.lineId);
  for(const h of handovers.rows){push('Műszakátadás',h.from_actor,h.cutoff_at,h.note,`${h.from_actor} → ${h.to_actor}`);push('Átvételi megjegyzés',h.accepted_by||h.to_actor,h.accepted_at||h.created_at,h.acceptance_note,`${h.from_actor} → ${h.to_actor}`);}
  for(const n of closings.rows)push('Napzárási megjegyzés',n.actor,n.closed_at,n.note);
  // A készpénzmozgás megjegyzése a kezdeményezés napján kerül be.
  // A későbbi átvétel az eseménynaplóban külön sor, nem újabb kiadás.
  for(const n of cashMoves.rows)if(dateInZone(n.requested_at)===date)
    push(n.movement_type==='manager_handover'?'Készpénzátadási megjegyzés':'Bankbefizetési megjegyzés',
      n.requested_by,n.requested_at,n.note,`${n.movement_type} • ${amount(n.amount)}`);
  for(const n of customerReceipts.rows)push('Tartozásrendezési megjegyzés',n.actor,n.paid_at,n.note);
  const actors=new Set();
  if(employee)actors.add(employee);
  else {
    for(const r of [...original.rows,...customerReceipts.rows,...handovers.rows,...closings.rows,...dailyNotes.rows]){
      const v=r.actor||r.from_actor;
      if(v)actors.add(v);
      if(r.to_actor)actors.add(r.to_actor);
    }
    for(const r of normalReceipts.rows)if(r.receipt_actor)actors.add(r.receipt_actor);
    for(const r of cashMoves.rows)if(r.requested_by)actors.add(r.requested_by);
    for(const n of allNotes)if(n.actor&&n.actor!=='–')actors.add(n.actor);
  }
  const sections=[];
  for(const actor of Array.from(actors).sort((a,b)=>a.localeCompare(b,'hu'))){
    const matches=v=>actorKey(v)===actorKey(actor);
    let credits=[];
    if(!handover){
      const creditHistory=await loadCreditHistory(client,{locationId:id,date,employee:actor});
      credits=creditHistory.productLines;
    } else {
      // Historical credit needs to remain correct in a time-limited export as well.
      const creditHistory=await loadCreditHistory(client,{locationId:id,date,employee:actor});
      credits=creditHistory.productLines.filter(r=>withinShift({at:r.sold_at},handover));
    }
    // Credit history is reconstructed first, but its line snapshots do not include a barcode.
    // Enrich the printable identity without altering any sale or credit-history math.
    if (credits.length) {
      const ids=credits.map(c=>c.line_id).filter(Boolean);
      const details=await client.query(`SELECT sl.id AS line_id,
          COALESCE(NULLIF(sl.product_code,''),NULLIF(v.internal_sku,'')) AS product_code,
          COALESCE(NULLIF(sl.barcode,''),NULLIF(v.barcode,'')) AS barcode,
          COALESCE(NULLIF(sl.color_name,''),NULLIF(v.color_name,'')) AS color_name,
          sl.size, NULLIF(v.sn_cod,'') AS sn_cod
        FROM aif_shop_sale_lines sl
        LEFT JOIN aif_product_variants v ON v.id=sl.variant_id
        WHERE sl.id=ANY($1::uuid[])`,[ids]);
      const lookup=new Map(details.rows.map(d=>[String(d.line_id),d]));
      credits=credits.map(c=>({...c,...(lookup.get(String(c.line_id))||{})}));
    }
    const normal=original.rows.filter(r=>matches(r.actor) && withinShift({at:r.sold_at},handover)).map(r=>({...r,gross:moneyNumber(moneyNumber(r.list_price)*moneyNumber(r.quantity))}));
    const settlement=receiptLines.rows.filter(r=>matches(r.actor)&&withinShift({at:r.paid_at},handover)).map(r=>{
      const net=moneyNumber(moneyNumber(r.line_total)*moneyNumber(r.quantity)/Math.max(1,moneyNumber(r.original_qty)));
      const fullGross=moneyNumber(moneyNumber(r.list_price)*moneyNumber(r.quantity));
      const discount=net>0?moneyNumber(Math.max(0,fullGross-net)*Math.min(1,moneyNumber(r.amount)/net)):0;
      return {...r,gross:moneyNumber(moneyNumber(r.amount)+discount),discount};
    });
    // Legacy receipts without per-line allocations. Keep them visible, but do
    // NOT allocate amounts to made-up products.
    const allocatedPaymentIds=new Set(receiptLines.rows.map(r=>String(r.payment_id)));
    const fallback=customerReceipts.rows.filter(r=>matches(r.actor)&&!allocatedPaymentIds.has(String(r.id))&&withinShift({at:r.paid_at},handover));
    for(const cp of fallback)settlement.push({paid_at:cp.paid_at,sale_number:'Nincs sor-hozzárendelés',product_title:'Tartozás rendezése',customer_name:'',quantity:0,amount:moneyNumber(cp.amount),gross:moneyNumber(cp.amount),discount:0});
    // Display meaningful product/customer descriptions, not internal sale numbers or UUIDs.
    // Payment IDs remain in the database for audit traceability, but waste no paper.
    const describeNormalPayment=(receipt)=>{
      const lines=original.rows.filter(r=>r.sale_number===receipt.sale_number);
      const customer=lines.find(r=>String(r.customer_name||'').trim())?.customer_name;
      const items=lines.reduce((sum,r)=>sum+moneyNumber(r.quantity),0);
      const titles=Array.from(new Set(lines.map(r=>String(r.product_title||r.product_code||'').trim()).filter(Boolean)));
      const product= titles.length>1
        ? `${titles[0]} + ${titles.length-1} másik termék`
        : titles[0]||'Eladás';
      const item=lines.length===1?lines[0]:null;
      const codes=item?aifAuditIdentity(item):'';
      return [product,items>1?`(${items} db)`:'',customer?`• ${customer}`:'',codes].filter(Boolean).join(' ');
    };
    const describeCustomerPayment=(receipt)=>{
      const allocations=receiptLines.rows.filter(r=>String(r.payment_id)===String(receipt.id));
      const customer=allocations.find(r=>String(r.customer_name||'').trim())?.customer_name;
      const titles=Array.from(new Set(allocations.map(r=>String(r.product_title||r.product_code||'').trim()).filter(Boolean)));
      const product=titles.length>1?`${titles[0]} + ${titles.length-1} másik termék`:titles[0]||'Korábbi tartozás';
      const item=allocations.length===1?allocations[0]:null;
      const codes=item?aifAuditIdentity(item):'';
      return ['Korábbi tartozás',customer?`• ${customer}`:'',product?`• ${product}`:'',codes].filter(Boolean).join(' ');
    };
    const payments=[
      ...normalReceipts.rows.filter(r=>matches(r.receipt_actor)&&withinShift({at:r.paid_at},handover)).map(r=>({paid_at:r.paid_at,at:r.paid_at,amount:moneyNumber(r.amount),type:'Eladás',description:describeNormalPayment(r),method:r.method})),
      ...customerReceipts.rows.filter(r=>matches(r.actor)&&withinShift({at:r.paid_at},handover)).map(r=>({paid_at:r.paid_at,at:r.paid_at,amount:moneyNumber(r.amount),type:'Régi tartozás',description:describeCustomerPayment(r),method:r.method})),
      ...exchangePayments.rows.filter(r=>matches(r.actor)&&withinShift({at:r.created_at},handover)).map(r=>({paid_at:r.created_at,at:r.created_at,amount:moneyNumber(r.amount)*(r.direction==='out'?-1:1),type:'Csere különbözet',description:'Csere / visszáru pénzügyi különbözete',method:r.method})),
    ].sort((a,b)=>eventTime(a)-eventTime(b));
    const shiftEvents=[];
    const moves=[];
    for(const h of handovers.rows){
      if(!withinShift({at:h.cutoff_at},handover))continue;
      if(matches(h.from_actor)){
        if(h.snapshot?.openingCash != null) shiftEvents.push({label:'Nyitó kassza',period:hasRealStartTime(h.shift_start_at)?bucharest(h.shift_start_at):'',person:h.from_actor,cash:amount(h.snapshot.openingCash),status:'Nyitó összeg'});
        shiftEvents.push({label:'Műszakátadás',period:`${hasRealStartTime(h.shift_start_at)?bucharest(h.shift_start_at)+' → ':''}${bucharest(h.cutoff_at)}`,person:h.to_actor,cash:amount(h.counted_cash??h.expected_cash),status:`${h.status==='accepted'?'Átvéve':h.status}  •  eltérés: ${amount(h.cash_difference)}`});
        moves.push({at:h.cutoff_at,type:'Műszakátadás',people:`${h.from_actor} → ${h.to_actor}`,status:h.status,amount:h.counted_cash??h.expected_cash});
      }
      if(matches(h.to_actor))shiftEvents.push({label:'Műszak átvétele',period:bucharest(h.accepted_at||h.cutoff_at),person:h.from_actor,cash:amount(h.counted_cash??h.expected_cash),status:h.status==='accepted'?'Átvéve':h.status});
    }
    for(const c of closings.rows)if(matches(c.actor)&&withinShift({at:c.closed_at},handover)){
      const alreadyHasStart=shiftEvents.some(r=>r.label==='Műszak átvétele'||r.label==='Nyitó kassza');
      const openingCash=c.snapshot?.openingCash ?? c.snapshot?.cashBalance?.baselineCash ?? null;
      if(!alreadyHasStart && openingCash != null)shiftEvents.push({label:'Nyitó kassza',period:'',person:c.actor,cash:amount(openingCash),status:'Nyitó összeg'});
      shiftEvents.push({label:'Napzárás',period:bucharest(c.closed_at),person:c.actor,cash:amount(c.counted_cash),status:`Eltérés ${amount(c.cash_difference)}`});
      moves.push({at:c.closed_at,type:'Napzárás',people:c.actor,status:'Lezárva',amount:c.counted_cash});
    }
    for(const m of cashMoves.rows)if(matches(m.requested_by))
      for(const ev of aifDailyAuditCashEvents(m,date))
        if(withinShift(ev,handover))moves.push(ev);
    for(const e of returnEvents.rows)if(matches(e.actor)&&withinShift({at:e.created_at},handover))moves.push({at:e.created_at,type:'Visszáru',people:[e.product_title,aifAuditIdentity(e)].filter(Boolean).join(' • '),status:'Visszavett',amount:moneyNumber(e.return_credit)*-1});
    const productsBySale=new Map();
    for (const line of [...normal,...credits]) {
      const key=String(line.sale_number||'');
      if (!key) continue;
      if(!productsBySale.has(key))productsBySale.set(key,[]);
      productsBySale.get(key).push(line);
    }
    const notes=allNotes.filter(r=>matches(r.actor)&&(!handover || withinShift(r,handover)))
      .map(n=>{
        const bySale=productsBySale.get(String(n.reference||''))||[];
        // When a sale-event note names one returned item, never print ALL items
        // from the original sale under it. If the name identifies several sizes,
        // keep all of those variants; never guess which one was returned.
        const normalizedNote=String(n.note||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('hu-HU');
        const matched=bySale.filter(p=>{
          const title=String(p.product_title||p.title||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('hu-HU');
          return title.length>=5 && normalizedNote.includes(title);
        });
        return {...n,products:n.productInfo?[n.productInfo]:(matched.length?matched:bySale)};
      })
      .sort((a,b)=>eventTime(a)-eventTime(b));
    const section={actor,normal,credits,settlements:settlement,payments,notes,moves: moves.sort((a,b)=>eventTime(a)-eventTime(b)),shifts:shiftEvents,
      creditReceipts:new Set(credits.map(r=>r.sale_number))};
    section.totals=buildTotals(section);sections.push(section);
  }
  const allCovered = new Set(sections.flatMap(s=>s.notes));
  const miscNotes=scope==='all' ? allNotes.filter(n=>!allCovered.has(n)) : [];
  const totals=Object.fromEntries(['received','gross','discount','newSales','creditReceived','creditIssued','cash','card','bank']
    .map(key=>[key,moneyNumber(sections.reduce((sum,s)=>sum+moneyNumber(s.totals[key]),0))]));
  return {location,date,scope,handover,sections,totals,closure:closings.rows[0]||null,miscNotes};
}

export default function createAifShopDailyAuditPdfRouter({pool,requireAuthed,requireAdminOrSecret,ensureAifShopSalesSchema,aifResolveShopLocation,actorFrom,aifLoadDailyCreditHistory}){
  const router=express.Router();
  async function handle(req,res,scope){
    try{
      // No schema migrations or database writes are allowed during an audit export.
      const date=String(req.query.date||'');
      const pdfMode=String(req.query.mode || 'full').toLowerCase();
      if(!['full','summary'].includes(pdfMode))return res.status(400).json({error:'Ismeretlen PDF-változat.'});
      if(!validDay(date))return res.status(400).json({error:'Érvénytelen napi dátum.'});
      const location=await aifResolveShopLocation(req,pool,req.query.location);
      let employee=scope==='mine'?String(actorFrom(req)||'').trim():String(req.query.employee||'').trim()||null;
      if(scope==='mine' && (!employee || ['system','shop'].includes(actorKey(employee))))return res.status(403).json({error:'A saját eladói munkamenet nem azonosítható.'});
      const handoverId=String(req.query.handoverId||'').trim();
      if(handoverId&&!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(handoverId))return res.status(400).json({error:'Érvénytelen műszakazonosító.'});
      if(handoverId&&scope==='all')return res.status(400).json({error:'Műszak PDF csak eladóhoz.'});
      const client=await pool.connect();let report;
      try{
        await client.query('BEGIN TRANSACTION READ ONLY');
        await client.query("SET LOCAL statement_timeout = '60000ms'");
        report=await loadShopDailyAudit({client,location,date,employee,handoverId:handoverId||null,loadCreditHistory:aifLoadDailyCreditHistory,scope:handoverId?'handover':employee&&scope==='all'?'employee':scope});
        await client.query('ROLLBACK');
      }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
      if(handoverId&&!report.handover)return res.status(404).json({error:'A műszakátadás nem található.'});
      const fn=aifAuditExportFilename({date,location,employee:employee || (scope==='mine' ? String(actorFrom(req)||'').trim() : null),handoverId,mode:pdfMode});
      // RFC 5987: Unicode city names are preserved in modern browser downloads.
      const asciiFallback=fn.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'_');
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition',`attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fn)}`);
      res.setHeader('Cache-Control','private, no-store, max-age=0');
      const doc=new PDFDocument({autoFirstPage:false,bufferPages:true,compress:true,info:{Title:`AllInFashion napi audit ${date}`,Author:'AllInFashion'}});
      doc.pipe(res);
      if(pdfMode==='summary')writeShopDailySummaryPdf(doc,report);
      else writeShopDailyAuditPdf(doc,report);
      doc.end();
    }catch(e){console.error('AIF daily audit PDF failed',e);if(!res.headersSent)res.status(e.statusCode||500).json({error:e.message||'A PDF nem készíthető el.'});else res.destroy(e);}
  }
  router.get('/mine.pdf',requireAuthed,(req,res)=>handle(req,res,'mine'));
  router.get('/all.pdf',requireAdminOrSecret,(req,res)=>handle(req,res,'all'));
  return router;
}
