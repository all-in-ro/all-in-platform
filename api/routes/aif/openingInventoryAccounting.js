// Read-only accountant exports. Both formats consume the same finalAudit snapshot.
// No stock writes; no live prices/quantities substituted for missing snapshots.
import { deflateRawSync } from 'node:zlib';
const text = v => String(v ?? '').trim();
const esc = v => text(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const fail = message => { throw Object.assign(new Error(message), {statusCode:409}); };
const numeric = (v, label) => {
  if (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) fail(`Hiányzó vagy hibás lezárási adat: ${label}.`);
  return Number(v);
};
const cents = v => Math.round((v + Number.EPSILON) * 100);
const money = v => (v / 100).toLocaleString('ro-RO', {minimumFractionDigits:2,maximumFractionDigits:2});
const qty = v => v.toLocaleString('ro-RO', {maximumFractionDigits:3});
const date = v => {
  const d = new Date(v);
  if (!v || !Number.isFinite(d.getTime())) fail('Hiányzó leltári dátum.');
  return new Intl.DateTimeFormat('ro-RO',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
};
export const ACCOUNTING_HEADERS = ['Nr. crt.','Denumirea bunurilor inventariate','Cod de bare','U.M.','Cantitatea scriptica','Cantitatea faptica','Pret unitar (RON)','Valoarea contabila (RON)','Valoarea de inventar (RON)','Deprecierea (RON)','Motivul deprecierii'];
const WIDTHS = [5,34,13,4,7,7,8,9,9,7,9];
const NOTE = 'Evaluare la pretul de vanzare inregistrat la inchiderea inventarului. Cantitatea faptica include miscarile reconciliate pana la aplicare. Deprecierea nu este evaluata; rubricile raman necompletate.';
const SIGNATURES = ['Comisia de inventariere','Gestionar','Gestionar primitor','Administrator','Contabilitate'];
export function buildAccountingReport(detail) {
  const s = detail?.session;
  if (!s || s.status !== 'applied' || !s.applied_at) fail('A könyvelői export csak a készletre alkalmazott, lezárt leltárból készíthető.');
  if (!Array.isArray(detail.lines) || !detail.lines.length) fail('A lezárt leltárnak nincs exportálható sora.');
  const rows = detail.lines.map(line => {
    const a = line.raw?.finalAudit;
    if (!a || a.finalStatus !== 'applied' || !a.product) fail(`Hiányzó lezárási pillanatkép: ${line.variant_id || line.id}.`);
    const p = a.product;
    const system = numeric(a.currentSystemQtyAtFinal,'rendszer szerinti mennyiség');
    const actual = numeric(a.effectiveCountedQty,'leltári mennyiség');
    const price = numeric(a.sellPriceSnapshot,'egységár');
    if (actual < 0 || price < 0) fail('Negatív leltári mennyiség vagy egységár.');
    const title = text(p.title);
    if (!title) fail(`Hiányzó lezárt terméknév: ${line.variant_id || line.id}.`);
    return { id:text(line.variant_id || line.id), name:[title,text(p.colorName || p.colorCode),text(p.size)].filter(Boolean).join(' / '), barcode:text(p.barcode), system,actual,price,book:cents(system*price),value:cents(actual*price) };
  });
  const collator = new Intl.Collator('ro-RO',{numeric:true,sensitivity:'base'});
  rows.sort((a,b)=>collator.compare(a.name,b.name)||collator.compare(a.barcode,b.barcode)||a.id.localeCompare(b.id));
  rows.forEach((r,i)=>{r.number=i+1;});
  const totals=rows.reduce((t,r)=>({system:t.system+r.system,actual:t.actual+r.actual,book:t.book+r.book,value:t.value+r.value}),{system:0,actual:0,book:0,value:0});
  return {company:'TITAN EURO-COM SRL',location:text(s.location_name || s.location?.name),code:text(s.code),documentDate:date(s.started_at || s.created_at),appliedDate:date(s.applied_at),rows,totals,note:NOTE};
}
export function accountingFilename(session,extension='xlsx') {
  const safe=text(session.code).replace(/[^a-zA-Z0-9_-]/g,'_');
  return `Lista_inventariere_${safe}.${extension}`;
}
// Conservative wrapping budgets keep complete product names and long internal codes visible.
function estimatedLines(value,limit) {
  return Math.max(1,text(value).split(/\r?\n/).reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/limit)),0));
}
function rowHeight(r) { return Math.max(20, 9*Math.max(estimatedLines(r.name,57),estimatedLines(r.barcode,20))+8); }
function pagesFor(report) {
  const pages=[]; let page=[], height=0;
  for(const row of report.rows) {
    const h=rowHeight(row);
    if(h>300) fail(`Túl hosszú terméknév vagy vonalkód: ${row.barcode || row.id}.`);
    if(page.length && height+h>325) {pages.push(page);page=[];height=0;}
    page.push(row);height+=h;
  }
  if(page.length) pages.push(page);
  // Reserve room for the final total, difference and signatures on the last page.
  const last=pages[pages.length-1];
  if(last && last.reduce((sum,r)=>sum+rowHeight(r),0)>265 && last.length>1) {
    const tail=[];let height=0;
    while(last.length>1 && height+rowHeight(last[last.length-1])<=240) {
      const r=last.pop();tail.unshift(r);height+=rowHeight(r);
    }
    if(tail.length) pages.push(tail);
  }
  return pages;
}
function cells(r) {return [r.number,r.name,r.barcode,'buc.',r.system,r.actual,r.price,r.book/100,r.value/100,'',''];}
export function buildAccountingHtml(report) {
  const pages=pagesFor(report);
  const content=pages.map((rows,index)=>{
    const last=index===pages.length-1;
    const subtotal=rows.reduce((t,r)=>({system:t.system+r.system,actual:t.actual+r.actual,book:t.book+r.book,value:t.value+r.value}),{system:0,actual:0,book:0,value:0});
    const totalRow=(label,t)=>`<tr class="total"><td colspan="4">${label}</td><td class="num">${qty(t.system)}</td><td class="num">${qty(t.actual)}</td><td></td><td class="num">${money(t.book)}</td><td class="num">${money(t.value)}</td><td></td><td></td></tr>`;
    return `<section class="page"><header><div class="meta"><span>${esc(report.company)}</span><span>Gestiunea: ${esc(report.location)}</span></div><h1>LISTA DE INVENTARIERE</h1><div class="meta"><span>Nr. doc.: ${esc(report.code)} &nbsp; | &nbsp; Data doc.: ${esc(report.documentDate)}</span><span>Aplicat: ${esc(report.appliedDate)} &nbsp; | &nbsp; RON</span></div></header><table><colgroup>${WIDTHS.map(w=>`<col style="width:${w/WIDTHS.reduce((a,b)=>a+b)*100}%">`).join('')}</colgroup><thead><tr>${ACCOUNTING_HEADERS.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr style="height:${rowHeight(r)}pt">${cells(r).map((v,i)=>`<td class="${[0,4,5,6,7,8,9].includes(i)?'num':''}">${esc([6,7,8].includes(i)?Number(v).toLocaleString('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:4}):v)}</td>`).join('')}</tr>`).join('')}${totalRow('TOTAL PAGINA',subtotal)}${last?totalRow('TOTAL GENERAL',report.totals):''}</tbody></table><p class="note">${esc(report.note)}</p>${last?`<p class="note">Diferenta valorica (inventar - contabil): ${money(report.totals.value-report.totals.book)} RON</p><div class="signatures">${SIGNATURES.map(s=>`<div>${s}<br><br>__________________</div>`).join('')}</div>`:''}<footer><span>${esc(report.code)} &nbsp; • &nbsp; ${report.rows.length} pozitii</span><span>Pagina ${index+1} / ${pages.length}</span></footer></section>`;
  }).join('');
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>${esc(report.code)} - Lista de inventariere</title><style>
@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{margin:0;color:#111;font:8pt Arial,sans-serif;background:#e8e8e8}.toolbar{padding:16px;text-align:center;font:14px Arial;background:white;position:sticky;top:0}.toolbar button{padding:10px 18px;cursor:pointer}.page{width:277mm;min-height:190mm;margin:8mm auto;background:white;padding:0;position:relative;break-after:page}.page:last-child{break-after:auto}header{padding:0 0 8pt}.meta{display:flex;justify-content:space-between;gap:12pt;font-size:8pt}h1{text-align:center;font-size:14pt;font-weight:normal;letter-spacing:1px;margin:9pt 0}table{width:100%;table-layout:fixed;border-collapse:collapse}th,td{border:0.5pt solid #777;padding:3pt;vertical-align:middle;overflow-wrap:anywhere;line-height:9pt;font-weight:normal}th{height:32pt;background:#f0f0f0;font-size:7.2pt}td{font-size:7.5pt}.num{text-align:right;font-variant-numeric:tabular-nums}.total{height:21pt;background:#f0f0f0}.total td{border-top:1pt solid #222}.note{font-size:7pt;line-height:10pt;margin:7pt 0}.signatures{display:flex;justify-content:space-between;gap:8pt;margin-top:15pt;font-size:8pt}.signatures div{flex:1;text-align:center}footer{display:flex;justify-content:space-between;font-size:7pt;border-top:.5pt solid #999;padding-top:5pt;margin-top:12pt}@media print{body{background:white}.toolbar{display:none}.page{margin:0;min-height:0}tr{break-inside:avoid}thead{display:table-header-group}}
</style></head><body><div class="toolbar"><button onclick="window.print()">Nyomtatás / Mentés PDF-ként</button> &nbsp; A4 fekvő • 100% méret • böngésző fejléc/lábléc kikapcsolva</div>${content}</body></html>`;
}

function crc32(buffer){
  let crc=-1;
  for(let i=0;i<buffer.length;i++){
    crc^=buffer[i];
    for(let j=0;j<8;j++) crc=(crc>>>1)^((crc&1)?0xEDB88320:0);
  }
  return (crc^(-1))>>>0;
}
function zip(files){
  const locals=[],centrals=[];let offset=0;
  for(const [name,contents] of Object.entries(files)){
    const filename=Buffer.from(name,'utf8'),input=Buffer.from(contents,'utf8'),compressed=deflateRawSync(input,{level:6});
    const crc=crc32(input);
    const lh=Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(0x0800,6);lh.writeUInt16LE(8,8);
    lh.writeUInt32LE(crc,14);lh.writeUInt32LE(compressed.length,18);lh.writeUInt32LE(input.length,22);lh.writeUInt16LE(filename.length,26);
    locals.push(lh,filename,compressed);
    const ch=Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(0x0800,8);ch.writeUInt16LE(8,10);
    ch.writeUInt32LE(crc,16);ch.writeUInt32LE(compressed.length,20);ch.writeUInt32LE(input.length,24);ch.writeUInt16LE(filename.length,28);ch.writeUInt32LE(offset,42);
    centrals.push(ch,filename);
    offset+=lh.length+filename.length+compressed.length;
  }
  const centralBuffer=Buffer.concat(centrals);const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);
  end.writeUInt32LE(centralBuffer.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,centralBuffer,end]);
}
export function buildAccountingXlsx(report) {
  const col=i=>String.fromCharCode(65+i);
  const sheetRows=[];const merges=[];let row=0;
  const add=(values,{height=22,style=0,merge=null}={})=>{
    row++;
    const xml=values.map((v,i)=>{
      const number=typeof v==='number';
      const s=style || ([6,7,8,9].includes(i)&&number?3:number?2:0);
      return `<c r="${col(i)}${row}" s="${s}"${number?'':' t="inlineStr"'}>${number?`<v>${v}</v>`:`<is><t xml:space="preserve">${esc(v)}</t></is>`}</c>`;
    }).join('');
    sheetRows.push(`<row r="${row}" ht="${height}" customHeight="1">${xml}</row>`);
    if(merge) merges.push(`${merge[0]}${row}:${merge[1]}${row}`);
  };
  add([report.company],{merge:['A','K']});
  add(['LISTA DE INVENTARIERE'],{style:4,height:28,merge:['A','K']});
  add([`Gestiunea: ${report.location} | Nr. doc.: ${report.code}`],{merge:['A','K']});
  add([`Data doc.: ${report.documentDate} | Aplicat: ${report.appliedDate} | Moneda: RON`],{merge:['A','K']});
  add([report.note],{height:30,merge:['A','K']});
  add(ACCOUNTING_HEADERS,{height:40,style:1});
  for(const r of report.rows) add(cells(r),{height:rowHeight(r)});
  const totalRow=row+1;
  add(['TOTAL GENERAL','','','',report.totals.system,report.totals.actual,'',report.totals.book/100,report.totals.value/100,'',''],{height:26});
  merges.push(`A${totalRow}:D${totalRow}`);
  add(['Diferenta valorica (inventar - contabil):','','','','','','','', (report.totals.value-report.totals.book)/100,'','']);merges.push(`A${row}:H${row}`);
  add(['']);
  add(['Comisia de inventariere','','Gestionar','','Gestionar primitor','','Administrator','','Contabilitate','',''],{height:24});
  for(const [a,b] of [['A','B'],['C','D'],['E','F'],['G','H'],['I','K']]) merges.push(`${a}${row}:${b}${row}`);
  add(['__________________','','__________________','','__________________','','__________________','','__________________','',''],{height:28});
  for(const [a,b] of [['A','B'],['C','D'],['E','F'],['G','H'],['I','K']]) merges.push(`${a}${row}:${b}${row}`);
  const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const relns='http://schemas.openxmlformats.org/package/2006/relationships';
  const office='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const files={
    '[Content_Types].xml':`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    '_rels/.rels':`<Relationships xmlns="${relns}"><Relationship Id="rId1" Type="${office}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml':`<workbook xmlns="${ns}" xmlns:r="${office}"><sheets><sheet name="Lista de inventariere" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">'Lista de inventariere'!$1:$6</definedName><definedName name="_xlnm.Print_Area" localSheetId="0">'Lista de inventariere'!$A$1:$K$${row}</definedName></definedNames></workbook>`,
    'xl/_rels/workbook.xml.rels':`<Relationships xmlns="${relns}"><Relationship Id="rId1" Type="${office}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${office}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml':`<styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00##"/></numFmts><fonts count="2"><font><sz val="9"/><name val="Arial"/></font><font><sz val="14"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F0F0"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    'xl/worksheets/sheet1.xml':`<worksheet xmlns="${ns}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:K${row}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><sheetFormatPr defaultRowHeight="22"/><cols>${WIDTHS.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w*1.5}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetRows.join('')}</sheetData><mergeCells count="${merges.length}">${merges.map(m=>`<mergeCell ref="${m}"/>`).join('')}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.3" bottom="0.4" header="0.1" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;L${esc(report.code)}&amp;RPagina &amp;P / &amp;N</oddFooter></headerFooter></worksheet>`
  };
  return zip(files);
}
