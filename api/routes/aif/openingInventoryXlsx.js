// ALLINFASHION_LELTAR_XLSX_20261103
// Standalone, dependency-free, read-only XLSX report from an existing inventory detail.
// No stock writes, movements, approvals, sessions, or other financial operations.
import { deflateRawSync } from 'node:zlib';

const HEADER = [
  ['#',8],['Bárkód',21],['Terméknév',41],['Márka',20],['Kategória',24],
  ['Alkategória',24],['Szín',18],['Méret',12],['S/N kód',20],['Termékkód',21],
  ['Rendszer induláskor (db)',18],['Rendszer most (db)',16],['Foglalt most (db)',16],
  ['Fizikailag számolt (db)',20],['Számolás utáni mozgás (db)',22],
  ['Leltár szerint most (db)',20],['Eltérés (db)',14],['Bruttó egységár (RON)',20],
  ['Fizikai készletérték (RON)',23],['Leltárérték most (RON)',22],
  ['Eltérés értéke (RON)',21],['Leltárállapot',27],
  ['Számolás közbeni mozgás (db)',22],['Számolás közbeni esemény',21],
  ['Utolsó beolvasás',21],['Beolvasta',19],['Megjegyzés',40],
];
const FIRST_DATA_ROW=8;
const MONEY='#,##0.00 "RON";[Red](#,##0.00 "RON")';
const INT='#,##0;[Red](#,##0)';
const xmlEscape=(v)=>String(v??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;').slice(0,32767);
const clean=(v)=>String(v??'').trim();
const num=(v)=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const nz=(v)=>num(v)??0;
const sum=(a)=>a.reduce((x,y)=>x+nz(y),0);
const upper=(s)=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleUpperCase('hu-HU');
const columnName=(n)=>{let v=n+1,out='';while(v){v--;out=String.fromCharCode(65+v%26)+out;v=Math.floor(v/26);}return out;};
const colRef=(i,r)=>`${columnName(i)}${r}`;
const safeName=(v)=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9_-]+/g,'_').slice(0,80)||'leltar';
function dateText(value){
  if(!value) return '';
  const date=new Date(value);if(!Number.isFinite(date.getTime())) return clean(value);
  return new Intl.DateTimeFormat('hu-HU',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
}
function excelDate(value){
  if(!value) return null;
  const date=new Date(value);if(!Number.isFinite(date.getTime())) return null;
  const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const part=(k)=>Number(p.find(v=>v.type===k)?.value||0);
  const utc=Date.UTC(part('year'),part('month')-1,part('day'),part('hour'),part('minute'),part('second'));
  return Math.round((utc/86400000+25569)*100000000)/100000000;
}
function lineState(line){
  if(nz(line.movement_during_count_count)>0) return 'ÚJRASZÁMOLANDÓ';
  if(line.physical_counted_qty===null||line.physical_counted_qty===undefined) return 'NEM SZÁMOLT';
  if(line.status==='missing') return 'HIÁNY';
  if(line.status==='awaiting_known') return 'MÉG NEM TALÁLTÁK';
  if(line.status==='untracked') return 'TÖBBLET';
  if(line.status==='ok') return 'RENDBEN';
  return 'ELLENŐRZENDŐ';
}
function productRows(detail){
  const collator=new Intl.Collator('hu-HU',{numeric:true,sensitivity:'base'});
  const rows=(detail.lines||[]).map((line)=>{
    const p=line.product||{};
    const physical=num(line.physical_counted_qty);
    const effective=num(line.counted_qty);
    const current=num(line.current_system_qty)??nz(line.system_qty_start);
    const price=num(line.sell_price);
    const delta=effective===null?null:effective-current;
    return {
      barcode:clean(p.barcode),title:clean(p.title)||'Névtelen termék',brand:clean(p.brandName),
      category:clean(p.categoryName),subcategory:clean(p.subcategoryName),
      color:clean(p.colorName||p.colorCode),size:clean(p.size),sn:clean(p.snCod),
      productCode:clean(p.productCode||p.modelCode||p.internalSku),
      baseline:nz(line.system_qty_start),current,reserved:nz(line.current_reserved_qty??line.system_reserved_start),
      physical,afterMovement:physical===null?null:nz(line.movement_after_count_qty),
      effective,delta,price,physicalValue:physical===null||price===null?null:physical*price,
      effectiveValue:effective===null||price===null?null:effective*price,
      deltaValue:delta===null||price===null?null:delta*price,
      state:lineState(line),duringQty:nz(line.movement_during_count_qty),
      duringEvents:nz(line.movement_during_count_count),date:excelDate(line.last_scanned_at),
      scannedBy:clean(line.last_scanned_by),note:clean(line.note),
    };
  });
  rows.sort((a,b)=>{
    for(const key of ['category','subcategory','brand','title','color','size','barcode']){
      const v=collator.compare(a[key]||'',b[key]||'');if(v) return v;
    }
    return 0;
  });
  return rows;
}

// Excel styles: 0 base, 1 title, 2 subtitle, 3 header, 4/5 text, 6/7 int,
// 8/9 money, 10 negative, 11 positive, 12 warning, 13 success, 14 KPI,
// 15/16 datetime, 17 muted/note, 18 section header.
function stylesXml(){
  const fonts=[
    '<font><sz val="10"/><color rgb="FF243449"/><name val="Aptos"/></font>',
    '<font><b/><sz val="19"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font>',
    '<font><sz val="10"/><color rgb="FFDCFDF9"/><name val="Aptos"/></font>',
    '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font>',
    '<font><b/><sz val="11"/><color rgb="FF184D4C"/><name val="Aptos"/></font>',
    '<font><b/><sz val="10"/><color rgb="FFB91C1C"/><name val="Aptos"/></font>',
    '<font><b/><sz val="10"/><color rgb="FF047857"/><name val="Aptos"/></font>',
    '<font><b/><sz val="10"/><color rgb="FF92400E"/><name val="Aptos"/></font>',
    '<font><sz val="10"/><color rgb="FF64748B"/><name val="Aptos"/></font>',
  ];
  const fills=[
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF233246"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF354153"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF108D8B"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF3F7F9"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFE7E5"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF1D6"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE4F7F5"/><bgColor indexed="64"/></patternFill></fill>',
  ];
  const border='<border><left style="hair"><color rgb="FFE0E7EE"/></left><right style="hair"><color rgb="FFE0E7EE"/></right><top style="hair"><color rgb="FFE0E7EE"/></top><bottom style="hair"><color rgb="FFE0E7EE"/></bottom><diagonal/></border>';
  const xs=[
    [0,5,0,0,0], [1,2,0,0,0], [2,3,0,0,0], [3,4,0,1,1],
    [0,5,0,1,0], [0,6,0,1,0], [0,5,165,1,2], [0,6,165,1,2],
    [0,5,164,1,2], [0,6,164,1,2], [5,7,165,1,2], [6,8,165,1,2],
    [7,9,0,1,1], [6,8,0,1,1], [4,10,164,1,2], [0,5,166,1,1],
    [0,6,166,1,1], [8,6,0,1,0], [3,3,0,1,0], [4,10,165,1,2],
    [5,7,164,1,2], [6,8,164,1,2],
  ];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
   `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`+
   `<numFmts count="3"><numFmt numFmtId="164" formatCode="${xmlEscape(MONEY)}"/><numFmt numFmtId="165" formatCode="${xmlEscape(INT)}"/><numFmt numFmtId="166" formatCode="yyyy.mm.dd hh:mm"/></numFmts>`+
   `<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills>`+
   `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${border}</borders>`+
   `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`+
   `<cellXfs count="${xs.length}">${xs.map(([f,fill,numFmt,br,align])=>`<xf numFmtId="${numFmt}" fontId="${f}" fillId="${fill}" borderId="${br}" xfId="0" applyFill="1" applyFont="1" applyAlignment="1" applyNumberFormat="1"><alignment horizontal="${align===2?'right':align===1?'center':'left'}" vertical="center" ${align===0?'wrapText="0"':'wrapText="1"'}/></xf>`).join('')}</cellXfs>`+
   `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}
function cell(ref,value,style=4,formula=null){
  if(formula){const cached=(num(value)??0);return `<c r="${ref}" s="${style}"><f>${xmlEscape(formula)}</f><v>${cached}</v></c>`;}
  if(value===null||value===undefined) return '';
  if(typeof value==='number'&&Number.isFinite(value)) return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  const str=String(value);if(!str) return '';
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(str)}</t></is></c>`;
}
function rowXml(number,cells,{height}={}){
  const attr=height?` ht="${height}" customHeight="1"`:'';
  return `<row r="${number}"${attr}>${cells.map(({c,v,s,f})=>cell(`${c}${number}`,v,s,f)).join('')}</row>`;
}
function txt(c,v,s=4){return {c,v,s};}
function numCell(c,v,s=6,f){return {c,v,s,f};}
function worksheetXml({columnWidths,rows,merges=[],autoFilter=null,freeze=0,printLandscape=true}){
  const end=Math.max(...rows.map(r=>r.row),1);
  const maxCol=columnName(columnWidths.length-1);
  const cols=columnWidths.map((width,i)=>`<col min="${i+1}" max="${i+1}" width="${width}" customWidth="1"/>`).join('');
  const freezePane=freeze?`<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${freeze}" topLeftCell="A${freeze+1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${freeze+1}" sqref="A${freeze+1}"/></sheetView></sheetViews>`:'<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>';
  const mergeXml=merges.length?`<mergeCells count="${merges.length}">${merges.map(m=>`<mergeCell ref="${m}"/>`).join('')}</mergeCells>`:'';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${maxCol}${end}"/>${freezePane}<sheetFormatPr defaultRowHeight="19"/><cols>${cols}</cols><sheetData>${rows.map(r=>rowXml(r.row,r.cells,{height:r.height})).join('')}</sheetData>${autoFilter?`<autoFilter ref="${autoFilter}"/>`:''}${mergeXml}<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="${printLandscape?'landscape':'portrait'}"/></worksheet>`;
}
function itemSheet(detail,data){
  const s=detail.session||{};
  const rows=[
    {row:1,height:35,cells:[txt('A','ALLINFASHION  /  TELJES ÜZLETI LELTÁR',1)]},
    {row:3,height:27,cells:[txt('A',`${s.location_name||s.location?.name||'Üzlet'}   •   ${s.code||''}   •   ${s.inventory_mode==='standard'?'RENDES LELTÁR':'HELYREÁLLÍTÓ LELTÁR'}`,2)]},
    {row:4,height:24,cells:[txt('A',`Indítva: ${dateText(s.started_at||s.created_at)}   |   Állapot: ${s.status||'-'}   |   Export: ${dateText(new Date())}`,2)]},
    {row:5,height:24,cells:[txt('A','FONTOS: az üres számolt darabszám NEM 0. A táblázat csak jelentés; nem módosít készletet. A pénzértékek az adatbázisban rögzített eladási ár alapján készülnek.',17)]},
    {row:7,height:42,cells:HEADER.map(([name],i)=>txt(columnName(i),name,3))},
  ];
  data.forEach((x,i)=>{
    const r=FIRST_DATA_ROW+i;
    const alt=i%2===1;
    const st=(v)=>alt?5:4;
    const nstyle=(v)=>alt?7:6;
    const moneyStyle=alt?9:8;
    let statusStyle=x.state==='RENDBEN'?13:x.state==='NEM SZÁMOLT'||x.state==='ÚJRASZÁMOLANDÓ'?12:x.state==='HIÁNY'?10:x.state==='TÖBBLET'?11:st();
    const cells=[txt('A',i+1,nstyle()),txt('B',x.barcode,st()),txt('C',x.title,st()),txt('D',x.brand,st()),txt('E',x.category,st()),txt('F',x.subcategory,st()),txt('G',x.color,st()),txt('H',x.size,st()),txt('I',x.sn,st()),txt('J',x.productCode,st()),
      numCell('K',x.baseline,nstyle()),numCell('L',x.current,nstyle()),numCell('M',x.reserved,nstyle()),numCell('N',x.physical,nstyle()),numCell('O',x.afterMovement,nstyle()),numCell('P',x.effective,nstyle()),
      numCell('Q',x.delta,x.delta===null?nstyle():x.delta<0?10:x.delta>0?11:nstyle(),x.delta===null?null:`P${r}-L${r}`),
      numCell('R',x.price,moneyStyle),numCell('S',x.physicalValue,moneyStyle,x.physicalValue===null?null:`N${r}*R${r}`),
      numCell('T',x.effectiveValue,moneyStyle,x.effectiveValue===null?null:`P${r}*R${r}`),
      numCell('U',x.deltaValue,x.deltaValue===null?moneyStyle:x.deltaValue<0?20:x.deltaValue>0?21:moneyStyle,x.deltaValue===null?null:`Q${r}*R${r}`),
      txt('V',x.state,statusStyle),numCell('W',x.duringQty,nstyle()),numCell('X',x.duringEvents,nstyle()),numCell('Y',x.date,x.date===null?st():alt?16:15),txt('Z',x.scannedBy,st()),txt('AA',x.note,st()),
    ];
    rows.push({row:r,height:24,cells});
  });
  return worksheetXml({columnWidths:HEADER.map(([,w])=>w),rows,merges:['A1:AA2','A3:AA3','A4:AA4','A5:AA5'],autoFilter:`A7:AA${Math.max(7,FIRST_DATA_ROW+data.length-1)}`,freeze:7});
}
function summarySheet(detail,data){
  const s=detail.session||{};
  const start=FIRST_DATA_ROW,last=Math.max(start,FIRST_DATA_ROW+data.length-1);
  const table=`'Leltár tételek'!`;
  const rg=(col)=>`${table}$${col}$${start}:$${col}$${last}`;
  const totalEffective=sum(data.map(x=>x.effective));
  const totalValue=Math.round(sum(data.map(x=>x.effectiveValue))*100)/100;
  const categories=new Map();
  for(const item of data){const cat=item.category||'(Nincs kategória)';const found=categories.get(cat)||{lines:0,qty:0,value:0};found.lines++;found.qty+=nz(item.effective);found.value+=nz(item.effectiveValue);categories.set(cat,found);}
  const counted=data.filter(x=>x.physical!==null).length;
  const unresolved=(detail.unknown||[]).filter(x=>!x.resolved_at && nz(x.qty)>0);
  const rows=[
    {row:1,height:36,cells:[txt('A','ALLINFASHION  /  LELTÁR ÖSSZESÍTÉS',1)]},
    {row:3,height:27,cells:[txt('A',`${s.location_name||s.location?.name||'Üzlet'} • ${s.code||''} • ${s.inventory_mode==='standard'?'RENDES LELTÁR':'HELYREÁLLÍTÓ LELTÁR'}`,2)]},
    {row:4,height:24,cells:[txt('A',`Indítás: ${dateText(s.started_at||s.created_at)}   |   Export: ${dateText(new Date())}   |   Állapot: ${s.status||'-'}`,2)]},
    {row:6,height:26,cells:[txt('A','Termékváltozat',18),txt('D','Megszámolt változat',18),txt('G','Leltár szerinti db',18),txt('J','Bruttó leltárérték',18)]},
    {row:7,height:38,cells:[numCell('A',data.length,19,`COUNTA(${rg('C')})`),numCell('D',counted,19,`COUNT(${rg('N')})`),numCell('G',totalEffective,19,`SUM(${rg('P')})`),numCell('J',totalValue,14,`SUM(${rg('T')})`)]},
    {row:10,height:30,cells:[txt('A','ELLENŐRZÉSI MUTATÓK',18)]},
    {row:11,cells:[txt('A','Nem számolt termék',4),numCell('D',data.length-counted,6,`COUNTBLANK(${rg('N')})`),txt('G','Újraszámolandó',4),numCell('J',data.filter(x=>x.state==='ÚJRASZÁMOLANDÓ').length,6,`COUNTIF(${rg('V')},"ÚJRASZÁMOLANDÓ")`)]},
    {row:12,cells:[txt('A','Ismeretlen kódok',4),numCell('D',unresolved.length,6),txt('G','Eltérés összesen (db)',4),numCell('J',sum(data.map(x=>x.delta)),6,`SUM(${rg('Q')})`)]},
    {row:13,cells:[txt('A','Fizikai érték (RON)',4),numCell('D',Math.round(sum(data.map(x=>x.physicalValue))*100)/100,8,`SUM(${rg('S')})`),txt('G','Eltérés érték (RON)',4),numCell('J',Math.round(sum(data.map(x=>x.deltaValue))*100)/100,8,`SUM(${rg('U')})`)]},
    {row:16,height:30,cells:[txt('A','KATEGÓRIÁNKÉNTI KIMUTATÁS',18)]},
    {row:17,height:29,cells:[txt('A','Kategória',3),txt('D','Terméksor',3),txt('G','Leltár szerinti db',3),txt('J','Bruttó érték (RON)',3)]},
  ];
  [...categories.entries()].sort((a,b)=>a[0].localeCompare(b[0],'hu',{numeric:true})).forEach(([category,totals],i)=>{
    const row=18+i,crit=category==='(Nincs kategória)'?'"="':`A${row}`;
    rows.push({row,height:24,cells:[txt('A',category,4),numCell('D',totals.lines,6,`COUNTIF(${rg('E')},${crit})`),numCell('G',totals.qty,6,`SUMIF(${rg('E')},${crit},${rg('P')})`),numCell('J',Math.round(totals.value*100)/100,8,`SUMIF(${rg('E')},${crit},${rg('T')})`)]});
  });
  const endRow=18+categories.size;
  rows.push({row:endRow+2,height:32,cells:[txt('A','A leltár kintlévőségeket és a hitelben elvitt ruhák pénzügyi követeléseit nem könyveli át. Ezeket külön, a bolti rendszerben kell ellenőrizni.',17)]});
  rows.push({row:endRow+3,height:32,cells:[txt('A','A nem számolt sorok mennyisége üres, nem 0. Az eltérés és az érték csak a valóban megszámolt termékekhez számolódik.',17)]});
  const merges=['A1:L2','A3:L3','A4:L4','A6:C6','D6:F6','G6:I6','J6:L6','A7:C8','D7:F8','G7:I8','J7:L8','A10:L10','A16:L16','A17:C17','D17:F17','G17:I17','J17:L17',`A${endRow+2}:L${endRow+2}`,`A${endRow+3}:L${endRow+3}`];
  for(let r=11;r<=13;r++){merges.push(`A${r}:C${r}`,`D${r}:F${r}`,`G${r}:I${r}`,`J${r}:L${r}`);}
  for(let r=18;r<18+categories.size;r++){merges.push(`A${r}:C${r}`,`D${r}:F${r}`,`G${r}:I${r}`,`J${r}:L${r}`);}
  return worksheetXml({columnWidths:Array(12).fill(14),rows,merges,freeze:4});
}
function unknownSheet(detail){
  const data=(detail.unknown||[]).filter(x=>nz(x.qty)>0);
  const rows=[
    {row:1,height:35,cells:[txt('A','ALLINFASHION  /  ISMERETLEN VONALKÓDOK',1)]},
    {row:3,height:27,cells:[txt('A',`${detail.session?.location_name||detail.session?.location?.name||'Üzlet'} • ${detail.session?.code||''}`,2)]},
    {row:4,height:25,cells:[txt('A','Az itt szereplő tételek NEM kerülnek automatikusan a készletbe. Előbb kézzel azonosítani és rendezni kell őket.',17)]},
    {row:7,height:30,cells:[txt('A','Sorszám',3),txt('B','Beolvasott kód',3),txt('C','Darab',3),txt('D','Állapot',3),txt('E','Utolsó beolvasás',3),txt('F','Beolvasta',3)]},
  ];
  for(let i=0;i<data.length;i++){
    const x=data[i],r=8+i;
    rows.push({row:r,height:23,cells:[numCell('A',i+1,6),txt('B',clean(x.scan_code),4),numCell('C',nz(x.qty),6),txt('D',x.resolved_at?'Azonosítva':'ELLENŐRZENDŐ',x.resolved_at?13:12),numCell('E',excelDate(x.last_scanned_at),15),txt('F',clean(x.last_scanned_by),4)]});
  }
  return worksheetXml({columnWidths:[12,31,13,23,24,22],rows,merges:['A1:F2','A3:F3','A4:F4'],autoFilter:`A7:F${Math.max(7,7+data.length)}`,freeze:7});
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
export function buildOpeningInventoryXlsx(detail){
  if(!detail?.session||!Array.isArray(detail.lines)) throw new Error('Hiányos leltáradatok az XLSX exporthoz.');
  const data=productRows(detail);
  const files={
    '[Content_Types].xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    '_rels/.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    'xl/workbook.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Összesítés" sheetId="1" r:id="rId1"/><sheet name="Leltár tételek" sheetId="2" r:id="rId2"/><sheet name="Ismeretlen kódok" sheetId="3" r:id="rId3"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    'xl/_rels/workbook.xml.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml':summarySheet(detail,data),
    'xl/worksheets/sheet2.xml':itemSheet(detail,data),
    'xl/worksheets/sheet3.xml':unknownSheet(detail),
    'xl/styles.xml':stylesXml(),
    'docProps/core.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>AllInFashion</dc:creator><cp:lastModifiedBy>AllInFashion</cp:lastModifiedBy></cp:coreProperties>`,
    'docProps/app.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>AllInFashion</Application></Properties>`,
  };
  return zip(files);
}
export function openingInventoryXlsxFilename(session){
  const date=clean(session?.started_at||session?.created_at).slice(0,10)||new Date().toISOString().slice(0,10);
  return `AllInFashion_Leltar_${safeName(session?.location_name||session?.location?.name)}_${date}_${safeName(session?.code)}.xlsx`;
}
