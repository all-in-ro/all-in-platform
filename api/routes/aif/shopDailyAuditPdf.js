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

/** PDF drawing, A4 landscape. Every table row may wrap and is never clipped. */
/**
 * Compact, print-first A4 landscape daily audit.
 * A single employee starts on page 1 (no decorative cover page).
 * Empty sections never render. Tables always include their own totals.
 * Receipt/Sale identifiers remain in the database but are not printed.
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
  const bottom = H - 46;
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
  function reserve(h) { if (y + h > bottom) newPage(`${pageTitle} (folytatás)`); }
  function heading(title, heightAfter=0) {
    reserve(31 + heightAfter);
    doc.fillColor(palette.teal).font(B).fontSize(10.3);
    paragraph(title,margin,y,contentWidth);
    y += 19;
    doc.moveTo(margin,y).lineTo(W-margin,y).strokeColor(palette.line).lineWidth(0.6).stroke();
    y += 7;
  }
  function statCells(cells) {
    if (!cells.length) return;
    reserve(53);
    const gap = 6, cw = (contentWidth - gap*(cells.length-1))/cells.length;
    for (let i=0;i<cells.length;i++) {
      const x = margin + i*(cw+gap);
      doc.roundedRect(x,y,cw,43,5).fillAndStroke(palette.light,palette.line);
      doc.font(F).fontSize(7).fillColor(palette.muted);
      paragraph(cells[i][0],x+7,y+6,cw-14,{lineBreak:false});
      doc.font(B).fontSize(10).fillColor(cells[i][2]===true?palette.red:palette.ink);
      paragraph(cells[i][1],x+7,y+22,cw-14,{lineBreak:false});
    }
    y += 49;
  }
  function infoLine(key,value) {
    reserve(17);
    doc.font(F).fontSize(7.7).fillColor(palette.muted);
    paragraph(key,margin,y,152,{lineBreak:false});
    doc.font(B).fontSize(8).fillColor(palette.ink);
    paragraph(value,margin+157,y,contentWidth-157,{lineBreak:false});
    y += 17;
  }
  function sectionTable(label, headers, rows, widths, sums, footnote='') {
    if (!rows.length) return;
    const numeric = new Set(sums?.numeric ?? []);
    const positions = [margin];
    widths.forEach(w=>positions.push(positions[positions.length-1]+w));
    const headerHeight=23, footerHeight=28;
    const fontSize=7.5;
    const rowHeight = vals => {
      doc.font(F).fontSize(fontSize);
      const measured = vals.map((value,i) => doc.heightOfString(clean(value),{
        width: Math.max(15,widths[i]-12),lineGap:0
      }));
      return Math.max(23,Math.ceil(Math.max(...measured,12)+9));
    };
    function tableHeader() {
      if (y + headerHeight > bottom) newPage(`${pageTitle} (folytatás)`);
      doc.rect(margin,y,contentWidth,headerHeight).fill(palette.ink);
      doc.font(B).fontSize(7.1).fillColor('#FFFFFF');
      headers.forEach((h,i)=>paragraph(h,positions[i]+5,y+6,widths[i]-10,{
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
        newPage(`${pageTitle} (folytatás)`);
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
    sums.cells.forEach(([column,val])=>paragraph(clean(val),positions[column]+5,y+7,widths[column]-10,{
      align:numeric.has(column)?'right':'left',lineBreak:false
    }));
    y += footerHeight+7;
    if(footnote){
      doc.font(F).fontSize(7).fillColor(palette.muted);
      const h=doc.heightOfString(clean(footnote),{width:contentWidth});
      reserve(h+8);paragraph(footnote,margin,y,contentWidth);y+=h+7;
    }
  }
  function sanitizeReference(v) {
    const s=String(v||'').trim()
      .replace(/^EL\/[A-Z0-9_-]+\/\d{4}\/\d+\s*(?:\/\s*)?/i,'')
      .replace(/^CS\/[A-Z0-9_-]+\/\d{4}\/\d+\s*(?:\/\s*)?/i,'');
    if (/^(?:[0-9a-f]{8}-){1,}/i.test(s)) return '';
    return s;
  }
  function employeeNotes(actor,entries){
    if(!entries?.length)return;
    const list=[];const dedup=new Map();
    for(const n of entries){
      const ref=sanitizeReference(n.reference);
      const t=bucharest(n.at);
      const id=[actorKey(n.actor),String(n.note||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('hu-HU'),t,ref].join('|');
      if(dedup.has(id)){
        const existing=dedup.get(id);
        if(!existing.types.includes(n.type))existing.types.push(n.type);
      }else{
        const item={...n,reference:ref,types:[n.type]};
        dedup.set(id,item);list.push(item);
      }
    }
    heading(`${actor} · megjegyzések (${list.length})`,38);
    for(const n of list){
      const titleText=`${bucharest(n.at)}  •  ${n.actor || '–'}  •  ${n.types.join(' / ')}${n.reference ? '  •  '+n.reference:''}`;
      doc.font(F).fontSize(7.7);
      const labelH=doc.heightOfString(clean(titleText),{width:contentWidth-20});
      const textH=doc.heightOfString(clean(n.note),{width:contentWidth-20});
      const blockH=Math.ceil(10+labelH+5+textH+9);
      if(y+blockH>bottom)newPage(`${actor} · megjegyzések (folytatás)`);
      doc.roundedRect(margin,y,contentWidth,blockH,4).fillAndStroke(palette.light,palette.line);
      doc.font(B).fontSize(7.7).fillColor(palette.ink);
      paragraph(titleText,margin+10,y+6,contentWidth-20);
      doc.font(F).fontSize(8).fillColor(palette.ink);
      paragraph(n.note,margin+10,y+6+labelH+5,contentWidth-20);
      y+=blockH+5;
    }
  }
  const receiptMethod=m=>({cash:'Készpénz',card:'Bankkártya',bank_transfer:'Átutalás'})[String(m||'').toLowerCase()]||m||'–';
  const productText=(name,size)=>[name||'Ismeretlen termék',size?`Méret: ${size}`:''].filter(Boolean).join('\n');
  function employeeSection(s, first=false) {
    if(!first)newPage(s.actor);
    else newPage(s.actor, report.scope==='handover' && report.handover
      ? `Műszak: ${bucharest(report.handover.shift_start_at)} → ${bucharest(report.handover.cutoff_at)}  •  Kiállítva: ${bucharest(new Date().toISOString())}`
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
      for(const h of s.shifts)infoLine(h.label,`${h.period}  •  ${h.person}  •  ${h.cash}${h.status?`  •  ${h.status}`:''}`);
    }
    sectionTable('Eladott termékek · időrendben',
      ['Idő','Termék / méret','Kliens','Db','Rendes ár','Kedvezmény','Fizetendő'],
      s.normal.map(r=>[bucharest(r.sold_at,'time'),productText(r.product_title||r.product_code,r.size),r.customer_name||'',String(r.quantity),fmt(moneyNumber(r.list_price)*moneyNumber(r.quantity)),fmt(moneyNumber(r.list_price)*moneyNumber(r.quantity)-moneyNumber(r.line_total)),fmt(r.line_total)]),
      [55,318,112,37,87,82,90],
      {numeric:[3,4,5,6],cells:[[1,'ÖSSZESEN'],[3,qty(total(s.normal,r=>r.quantity))],[4,fmt(total(s.normal,r=>moneyNumber(r.list_price)*moneyNumber(r.quantity)))],[5,fmt(total(s.normal,r=>moneyNumber(r.list_price)*moneyNumber(r.quantity)-moneyNumber(r.line_total)))],[6,fmt(total(s.normal,r=>r.line_total))]]});
    sectionTable('Hitelre kiadott termékek · nem napi bevétel',
      ['Idő','Termék / méret','Kliens','Db','Rendes ár','Kedvezmény','Hitel összege'],
      s.credits.map(r=>[bucharest(r.sold_at,'time'),productText(r.title,r.size),r.customer_name||'',String(r.qty),fmt(r.list_total),fmt(r.discount_total),fmt(r.net_total)]),
      [55,318,112,37,87,82,90],
      {numeric:[3,4,5,6],cells:[[1,'ÖSSZESEN'],[3,qty(total(s.credits,r=>r.qty))],[4,fmt(total(s.credits,r=>r.list_total))],[5,fmt(total(s.credits,r=>r.discount_total))],[6,fmt(total(s.credits,r=>r.net_total))]]});
    sectionTable('Korábbi hitel rendezése · fizetés napján',
      ['Idő','Termék','Kliens','Db','Eredeti ár','Kedvezmény','Fizetve'],
      s.settlements.map(r=>[bucharest(r.paid_at,'time'),productText(r.product_title,r.size),r.customer_name||'',String(r.quantity||''),fmt(r.gross),fmt(r.discount),fmt(r.amount)]),
      [55,318,112,37,87,82,90],
      {numeric:[3,4,5,6],cells:[[1,'ÖSSZESEN'],[3,qty(total(s.settlements,r=>r.quantity))],[4,fmt(total(s.settlements,r=>r.gross))],[5,fmt(total(s.settlements,r=>r.discount))],[6,fmt(total(s.settlements,r=>r.amount))]]});
    sectionTable('Tételes fizetési események',
      ['Idő','Mit fizettek ki?','Fizetési mód','Összeg'],
      s.payments.map(r=>[bucharest(r.paid_at,'time'),r.description||r.type||'Fizetés',receiptMethod(r.method),fmt(r.amount)]),
      [63,477,132,109],
      {numeric:[3],cells:[[1,'ÖSSZESEN'],[2,`${s.payments.length} fizetés`],[3,fmt(total(s.payments,r=>r.amount))]]},
      `Készpénz: ${amount(a.cash)}  •  Bankkártya: ${amount(a.card)}${a.bank?`  •  Átutalás: ${amount(a.bank)}`:''}`);
    const shifts=s.moves;
    const balanceEvent=shifts.filter(x=>x.type==='Napzárás'||x.type==='Műszakátadás').at(-1);
    sectionTable('Műszakátadások / pénzmozgások',
      ['Idő','Művelet','Kinek / kitől','Állapot','Összeg / kassza'],
      shifts.map(r=>[bucharest(r.at,'time'),r.type,r.people||'',r.status||'',fmt(r.amount)]),
      [63,203,232,142,141],
      {numeric:[4],cells:[[1,'ÖSSZESEN'],[2,`${shifts.length} esemény`], ...(balanceEvent?[[4,`Záró: ${fmt(balanceEvent.amount)}`]]:[])]},
      'A műszakátadás és napzárás a kassza állapota, nem bevétel; ezeket nem összegezzük.');
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
    sl.product_title, ${actorCol?`n.${quote(actorCol)}::text`:'s.actor'} AS note_actor,
    n.${quote(noteCol)}::text AS note,
    ${whenCol?`n.${quote(whenCol)}`:'s.sold_at'} AS note_at
    FROM ${quote(name)} n JOIN aif_shop_sale_lines sl ON sl.id=n.${quote(lineCol)}
    JOIN aif_shop_sales s ON s.id=sl.sale_id
    WHERE s.location_id=$1 AND (s.sold_at AT TIME ZONE 'Europe/Bucharest')::date=$2::date ${activeNoteFilter}
    ORDER BY note_at, s.sale_number`;
  const result=await client.query(sql,[locationId,date]);
  return result.rows.map(r=>({type:'Termékmegjegyzés',actor:r.note_actor||r.sale_actor,at:r.note_at,reference:`${r.sale_number} / ${r.product_title||'–'}`,note:r.note}));
}

export async function loadShopDailyAudit({client,location,date,employee=null,handoverId=null,loadCreditHistory,scope='mine'}){
  const id=location.id;
  const [original,receiptLines,customerReceipts,normalReceipts,exchangePayments,handovers,closings,dailyNotes,cashMoves,saleEvents,saleNotes,returnEvents]=await Promise.all([
    client.query(`SELECT s.id AS sale_id,s.sale_number,s.sold_at,s.actor,s.customer_name,s.customer_phone,s.sale_type,s.status,s.note AS sale_note,
      sl.id AS line_id,sl.product_title,sl.product_code,sl.size,sl.quantity,sl.list_price,sl.discount_amount,sl.discount_percent,sl.line_total
      FROM aif_shop_sales s JOIN aif_shop_sale_lines sl ON sl.sale_id=s.id
      WHERE s.location_id=$1 AND s.status='completed' AND s.sale_type<>'credit'
        AND (s.sold_at AT TIME ZONE 'Europe/Bucharest')::date=$2::date
      ORDER BY s.sold_at,s.sale_number,sl.line_no`,[id,date]),
    client.query(`SELECT cp.id AS payment_id,cp.paid_at,cp.actor,cp.method,cp.amount AS payment_total,cp.note,
      s.sale_number,s.customer_name,s.sold_at AS original_sold_at,
      sl.product_title,sl.product_code,sl.size,
      sl.list_price,sl.line_total,sl.quantity AS original_qty,la.quantity,la.amount
      FROM aif_shop_customer_payments cp
      JOIN aif_shop_customer_payment_line_allocations la ON la.customer_payment_id=cp.id
      JOIN aif_shop_sales s ON s.id=la.sale_id
      JOIN aif_shop_sale_lines sl ON sl.id=la.sale_line_id
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
      AND (requested_at AT TIME ZONE 'Europe/Bucharest')::date=$2::date ORDER BY requested_at`,[id,date]),
    client.query(`SELECT ev.*,s.sale_number,s.sold_at,s.actor AS sale_actor FROM aif_shop_sale_events ev JOIN aif_shop_sales s ON s.id=ev.sale_id
      WHERE s.location_id=$1 AND (s.sold_at AT TIME ZONE 'Europe/Bucharest')::date=$2::date
      AND NULLIF(btrim(COALESCE(ev.note,'')),'') IS NOT NULL ORDER BY ev.created_at`,[id,date]),
    client.query(`SELECT s.sale_number,s.sold_at,s.actor,s.note FROM aif_shop_sales s
      WHERE s.location_id=$1 AND (s.sold_at AT TIME ZONE 'Europe/Bucharest')::date=$2::date
      AND NULLIF(btrim(COALESCE(s.note,'')),'') IS NOT NULL ORDER BY s.sold_at`,[id,date]),
    client.query(`SELECT e.id,e.exchange_number,e.actor,e.created_at,e.returned_qty,e.return_credit,
      s.sale_number,s.customer_name,sl.product_title
      FROM aif_shop_exchanges e JOIN aif_shop_sales s ON s.id=e.source_sale_id
      JOIN aif_shop_sale_lines sl ON sl.id=e.source_sale_line_id
      WHERE e.location_id=$1 AND e.status='completed'
      AND (e.created_at AT TIME ZONE 'Europe/Bucharest')::date=$2::date ORDER BY e.created_at`,[id,date]),
  ]);
  const handover=handoverId?handovers.rows.find(r=>String(r.id)===handoverId):null;
  if(handoverId&&!handover){const e=new Error('A műszakátadás nem található ezen a napon.');e.statusCode=404;throw e;}
  const selected = employee ? actorKey(employee):null;
  if(handover && selected && actorKey(handover.from_actor)!==selected){const e=new Error('Ez a műszakátadás nem ehhez az eladóhoz tartozik.');e.statusCode=403;throw e;}
  const productNotes = await readProductNotes(client,id,date);
  const allNotes=[];
  const push=(type,actor,at,note,reference='')=>{if(String(note||'').trim())allNotes.push({type,actor:actor||'–',at,reference,note:String(note).trim()});};
  for(const n of dailyNotes.rows)push('Napi megjegyzés',n.actor,n.created_at,n.note);
  for(const n of saleNotes.rows)push('Bizonylat megjegyzés',n.actor,n.sold_at,n.note,n.sale_number);
  for(const n of saleEvents.rows){
    if(n.event_type==='completed'&&saleNotes.rows.some(s=>s.sale_number===n.sale_number&&String(s.note||'').trim()===String(n.note||'').trim()))continue;
    push('Eladási esemény',n.actor||n.sale_actor,n.created_at,n.note,n.sale_number);
  }
  for(const n of productNotes)push(n.type,n.actor,n.at,n.note,n.reference);
  for(const h of handovers.rows){push('Műszakátadás',h.from_actor,h.cutoff_at,h.note,`${h.from_actor} → ${h.to_actor}`);push('Átvételi megjegyzés',h.accepted_by||h.to_actor,h.accepted_at||h.created_at,h.acceptance_note,`${h.from_actor} → ${h.to_actor}`);}
  for(const n of closings.rows)push('Napzárási megjegyzés',n.actor,n.closed_at,n.note);
  for(const n of cashMoves.rows)push('Készpénzátadás / bankbefizetés',n.requested_by,n.requested_at,n.note,`${n.movement_type} • ${amount(n.amount)}`);
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
      return [product,items>1?`(${items} db)`:'',customer?`• ${customer}`:''].filter(Boolean).join(' ');
    };
    const describeCustomerPayment=(receipt)=>{
      const allocations=receiptLines.rows.filter(r=>String(r.payment_id)===String(receipt.id));
      const customer=allocations.find(r=>String(r.customer_name||'').trim())?.customer_name;
      const titles=Array.from(new Set(allocations.map(r=>String(r.product_title||r.product_code||'').trim()).filter(Boolean)));
      const product=titles.length>1?`${titles[0]} + ${titles.length-1} másik termék`:titles[0]||'Korábbi tartozás';
      return ['Korábbi tartozás',customer?`• ${customer}`:'',product?`• ${product}`:''].filter(Boolean).join(' ');
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
        if(h.snapshot?.openingCash != null) shiftEvents.push({label:'Műszak kezdő kassza',period:bucharest(h.shift_start_at),person:h.from_actor,cash:amount(h.snapshot.openingCash),status:'Átvett / nyitó'});
        shiftEvents.push({label:'Műszakátadás',period:`${bucharest(h.shift_start_at)} → ${bucharest(h.cutoff_at)}`,person:h.to_actor,cash:amount(h.counted_cash??h.expected_cash),status:`${h.status==='accepted'?'Átvéve':h.status}  •  eltérés: ${amount(h.cash_difference)}`});
        moves.push({at:h.cutoff_at,type:'Műszakátadás',people:`${h.from_actor} → ${h.to_actor}`,status:h.status,amount:h.counted_cash??h.expected_cash});
      }
      if(matches(h.to_actor))shiftEvents.push({label:'Műszak átvétele',period:bucharest(h.accepted_at||h.cutoff_at),person:h.from_actor,cash:amount(h.counted_cash??h.expected_cash),status:h.status==='accepted'?'Átvéve':h.status});
    }
    for(const c of closings.rows)if(matches(c.actor)&&withinShift({at:c.closed_at},handover)){
      const alreadyHasStart=shiftEvents.some(r=>r.label==='Műszak átvétele'||r.label==='Műszak kezdő kassza');
      const openingCash=c.snapshot?.openingCash ?? c.snapshot?.cashBalance?.baselineCash ?? null;
      if(!alreadyHasStart && openingCash != null)shiftEvents.push({label:'Műszak kezdő kassza',period:date,person:c.actor,cash:amount(openingCash),status:'Nyitó / átvett'});
      shiftEvents.push({label:'Napzárás',period:bucharest(c.closed_at),person:c.actor,cash:amount(c.counted_cash),status:`Eltérés ${amount(c.cash_difference)}`});
      moves.push({at:c.closed_at,type:'Napzárás',people:c.actor,status:'Lezárva',amount:c.counted_cash});
    }
    for(const m of cashMoves.rows)if(matches(m.requested_by)&&withinShift({at:m.requested_at},handover))moves.push({at:m.requested_at,type:m.movement_type==='manager_handover'?'Készpénzátadás':'Bankbefizetés',people:m.requested_by,status:m.status,amount:m.amount});
    for(const e of returnEvents.rows)if(matches(e.actor)&&withinShift({at:e.created_at},handover))moves.push({at:e.created_at,type:'Visszáru',people:`${e.sale_number} • ${e.product_title}`,status:'Visszavett',amount:moneyNumber(e.return_credit)*-1});
    const notes=allNotes.filter(r=>matches(r.actor)&&(!handover || withinShift(r,handover))).sort((a,b)=>eventTime(a)-eventTime(b));
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
      const name=(employee||'teljes-uzlet').replace(/[^\w\d-]+/g,'_').slice(0,55);
      const fn=`AllInFashion_napi_audit_${date}_${name}${handoverId?'_muszak':''}.pdf`;
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition',`attachment; filename="${fn}"`);
      res.setHeader('Cache-Control','private, no-store, max-age=0');
      const doc=new PDFDocument({autoFirstPage:false,bufferPages:true,compress:true,info:{Title:`AllInFashion napi audit ${date}`,Author:'AllInFashion'}});
      doc.pipe(res);
      writeShopDailyAuditPdf(doc,report);
      doc.end();
    }catch(e){console.error('AIF daily audit PDF failed',e);if(!res.headersSent)res.status(e.statusCode||500).json({error:e.message||'A PDF nem készíthető el.'});else res.destroy(e);}
  }
  router.get('/mine.pdf',requireAuthed,(req,res)=>handle(req,res,'mine'));
  router.get('/all.pdf',requireAdminOrSecret,(req,res)=>handle(req,res,'all'));
  return router;
}
