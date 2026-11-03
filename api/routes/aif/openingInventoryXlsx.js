// ALLINFASHION_LELTAR_XLSX_20261103
// Standalone, dependency-free, read-only XLSX report from an existing inventory detail.
// No stock writes, movements, approvals, sessions, or other financial operations.
import { deflateRawSync } from 'node:zlib';

// Rövid fejléc és üzletileg értelmezhető, külön kezelt állományok.
// A fizikai beolvasást soha nem mossuk össze a későbbi visszáruval.
const HEADER = [
  ['#',6], ['MÁRKA',18], ['S/N KÓD',23], ['TERMÉKKÓD',32],
  ['VONALKÓD',23], ['TERMÉK',48], ['SZÍN',20], ['MÉRET',13],
  ['BEOLVASOTT',15], ['KÖZBENI MOZGÁS',18], ['EGYEZTETETT DB',18],
  ['RENDSZER MOST',17], ['ELTÉRÉS',13], ['ELADÁSI ÁR',17], ['ÁLLAPOT',22],
];
const FIRST_DATA_ROW=3;
const MONEY='#,##0.00 "RON";[Red](#,##0.00 "RON")';
const INT='#,##0;[Red](#,##0)';
const xmlEscape=(v)=>String(v??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;').slice(0,32767);
const clean=(v)=>String(v??'').trim();
// Csak a régi Excel-ből átvett, numerikus kódok elé írt szövegesítő
// aposztrófot távolítjuk el. Minden azonosító valódi szöveg marad.
const identifier=(v)=>clean(v).replace(/^['\u2019](?=[0-9])/, '');
const syntheticModelCode=(v)=>/^[a-z0-9_]+:[^\s:]+$/i.test(clean(v));
const readableProductCode=(p)=>{
  const direct=identifier(p.productCode);
  if(direct&&!syntheticModelCode(direct)) return direct;
  const sn=identifier(p.snCod);
  if(sn) return sn;
  const model=identifier(p.modelCode);
  if(model) return syntheticModelCode(model)?model.split(':').pop():model;
  return identifier(p.internalSku);
};
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
      barcode:identifier(p.barcode),title:clean(p.title)||'Névtelen termék',brand:clean(p.brandName),
      category:clean(p.categoryName),subcategory:clean(p.subcategoryName),
      color:identifier(p.colorName||p.colorCode),size:identifier(p.size),sn:identifier(p.snCod),
      productCode:readableProductCode(p),
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
    '<font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font>',
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
    // Minden kód szövegként és középre igazítva; mennyiségek szintén középen.
    // Kizárólag pénzösszegek jobbra igazítva. A fejlécek mindenütt középen.
    [0,5,49,1,1], [0,6,49,1,1], [0,5,165,1,1], [0,6,165,1,1],
    [0,5,164,1,2], [0,6,164,1,2], [5,7,165,1,1], [6,8,165,1,1],
    [7,9,49,1,1], [6,8,49,1,1], [4,10,164,1,2], [0,5,166,1,1],
    [0,6,166,1,1], [8,6,0,1,0], [3,3,0,1,0], [4,10,165,1,1],
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
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${maxCol}${end}"/>${freezePane}<sheetFormatPr defaultRowHeight="19"/><cols>${cols}</cols><sheetData>${rows.map(r=>rowXml(r.row,r.cells,{height:r.height})).join('')}</sheetData>${autoFilter?`<autoFilter ref="${autoFilter}"/>`:''}${mergeXml}<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="${printLandscape?'landscape':'portrait'}"/><ignoredErrors><ignoredError sqref="A3:${maxCol}${end}" numberStoredAsText="1"/></ignoredErrors></worksheet>`;
}
function commonTitle(detail, label) {
  const s=detail.session||{};
  const loc=clean(s.location_name||s.location?.name)||'Üzlet';
  return `${label}  •  ${loc}  •  ${clean(s.code)}`;
}
function basicRows(title,head) {
  return [
    {row:1,height:24,cells:[txt('A',title,1)]},
    {row:2,height:26,cells:head.map(([name],i)=>txt(columnName(i),name,3))},
  ];
}
function itemSheet(detail,data){
  const header=HEADER;
  const rows=basicRows(commonTitle(detail,'LELTÁR'),header);
  data.forEach((x,i)=>{
    const r=FIRST_DATA_ROW+i, alt=i%2===1;
    const t=alt?5:4, n=alt?7:6, m=alt?9:8;
    const stateStyle=x.state==='RENDBEN'?13:
      x.state==='NEM SZÁMOLT'||x.state==='ÚJRASZÁMOLANDÓ'?12:
      x.state==='HIÁNY'?10:x.state==='TÖBBLET'?11:t;
    rows.push({row:r,height:23,cells:[
      numCell('A',i+1,n),txt('B',x.brand,t),txt('C',x.sn,t),
      txt('D',x.productCode,t),txt('E',x.barcode,t),txt('F',x.title,t),
      txt('G',x.color,t),txt('H',x.size,t),
      numCell('I',x.physical,n),numCell('J',x.afterMovement,n),
      numCell('K',x.effective,n),numCell('L',x.current,n),
      numCell('M',x.delta,x.delta===null?n:x.delta<0?10:x.delta>0?11:n,
        x.delta===null?null:`K${r}-L${r}`),numCell('N',x.price,m),
      txt('O',x.state,stateStyle),
    ]});
  });
  const end=FIRST_DATA_ROW+data.length-1, totalRow=Math.max(FIRST_DATA_ROW,end+1);
  rows.push({row:totalRow,height:25,cells:[
    txt('F','ÖSSZESEN',18),
    numCell('I',sum(data.map(x=>x.physical)),19,data.length?`SUM(I${FIRST_DATA_ROW}:I${end})`:null),
    numCell('J',sum(data.map(x=>x.afterMovement)),19,data.length?`SUM(J${FIRST_DATA_ROW}:J${end})`:null),
    numCell('K',sum(data.map(x=>x.effective)),19,data.length?`SUM(K${FIRST_DATA_ROW}:K${end})`:null),
    numCell('L',sum(data.map(x=>x.current)),19,data.length?`SUM(L${FIRST_DATA_ROW}:L${end})`:null),
    numCell('M',sum(data.map(x=>x.delta)),19,data.length?`SUM(M${FIRST_DATA_ROW}:M${end})`:null),
  ]});
  rows.push({row:totalRow+1,height:23,cells:[txt('A',
    'BEOLVASOTT: tényleges fizikai számolás • KÖZBENI MOZGÁS: későbbi eladás/visszáru • EGYEZTETETT DB: csak a mozgásokkal korrigált összehasonlítás. A nem számolt sor nem 0.',17)]});
  const unknown=(detail.unknown||[]).filter(x=>nz(x.qty)>0 && !x.resolved_at);
  if(unknown.length){
    const start=totalRow+3;
    rows.push({row:start,height:24,cells:[txt('A','ELLENŐRZENDŐ BEOLVASÁSOK (NEM SZÁMÍTANAK A LELTÁR ÖSSZESENBE)',18)]});
    rows.push({row:start+1,height:23,cells:[txt('A','#',3),txt('B','Vonalkód',3),txt('E','DB',3)]});
    unknown.forEach((x,i)=>rows.push({row:start+2+i,height:22,cells:[numCell('A',i+1,i%2?7:6),txt('B',identifier(x.scan_code),i%2?5:4),numCell('E',nz(x.qty),i%2?7:6)]}));
  }
  const merges=[`A1:O1`,`A${totalRow+1}:O${totalRow+1}`,...(unknown.length?[`A${totalRow+3}:O${totalRow+3}`]:[])];
  return worksheetXml({columnWidths:header.map(([,w])=>w),rows,merges,autoFilter:`A2:O${Math.max(2,end)}`,freeze:2});
}
const CREDIT_HEADER=[
  ['#',6],['HITEL BIZONYLAT',23],['KLIENS',30],['ELADÁS',18],
  ['TERMÉK',43],['VONALKÓD',20],['MÉRET',12],['ELVITT DB',13],
  ['VISSZAHOZTA',17],['KLIENSNÉL DB',18],['EGYSÉGÁR',17],
  ['TERMÉKÉRTÉK',20],['BIZONYLAT TARTOZÁS',23],['MEGJEGYZÉS',45],
];
function creditSheet(detail,custody){
  const data=custody.credit?.items||[],head=CREDIT_HEADER;
  const rows=basicRows(commonTitle(detail,'HITELES • NYITOTT'),head);
  data.forEach((x,i)=>{
    const r=FIRST_DATA_ROW+i, alt=i%2===1,t=alt?5:4,n=alt?7:6,m=alt?9:8;
    rows.push({row:r,height:25,cells:[
      numCell('A',i+1,n),txt('B',x.saleNumber,t),txt('C',x.customerName,t),
      numCell('D',excelDate(x.soldAt),15),txt('E',x.productTitle,t),
      txt('F',identifier(x.barcode),t),txt('G',identifier(x.size),t),numCell('H',x.originalQty,n),
      numCell('I',x.returnedQty,n),numCell('J',x.outsideQty,n,`H${r}-I${r}`),
      numCell('K',x.unitPrice,m),numCell('L',x.lineTotal,m),
      numCell('M',x.saleBalanceDisplay,m),txt('N',x.note,t),
    ]});
  });
  const end=FIRST_DATA_ROW+data.length-1,total=Math.max(FIRST_DATA_ROW,end+1);
  rows.push({row:total,height:25,cells:[txt('E','ÖSSZESEN',18),
    numCell('J',custody.credit?.totalQtyOutside||0,19,data.length?`SUM(J${FIRST_DATA_ROW}:J${end})`:null),
    numCell('M',custody.credit?.totalDue||0,14,data.length?`SUM(M${FIRST_DATA_ROW}:M${end})`:null)]});
  rows.push({row:total+1,height:24,cells:[txt('A',
    'A hiteles áru nincs a bolt polckészletében. A tartozás bizonylatonként egyszer szerepel; pénzügyi összeg NEM készletérték.',17)]});
  return worksheetXml({columnWidths:head.map(([,w])=>w),rows,
    merges:[`A1:N1`,`A${total+1}:N${total+1}`],autoFilter:`A2:N${Math.max(2,end)}`,freeze:2});
}
const RESERVED_HEADER=[
  ['#',6],['FOGLALÁS',22],['KLIENS',30],['LEJÁRAT',17],
  ['TERMÉK',43],['VONALKÓD',20],['MÉRET',12],['FOGLALT DB',15],
  ['EGYSÉGÁR',17],['ÉRTÉK',19],['FÉLRETETTE',22],['BOLT DB',13],
  ['RENDSZER FOGLALT',20],['MEGJEGYZÉS',52],
];
function reservedSheet(detail,custody){
  const data=custody.reserved?.items||[],head=RESERVED_HEADER;
  const rows=basicRows(commonTitle(detail,'FÉLRETETT • AKTÍV'),head);
  data.forEach((x,i)=>{
    const r=FIRST_DATA_ROW+i, alt=i%2===1,t=alt?5:4,n=alt?7:6,m=alt?9:8;
    const expires=clean(x.expiresOn).slice(0,10);
    rows.push({row:r,height:24,cells:[
      numCell('A',i+1,n),txt('B',x.reservationNumber,t),txt('C',x.customerName,t),
      txt('D',expires,t),txt('E',x.productTitle,t),txt('F',identifier(x.barcode),t),
      txt('G',identifier(x.size),t),numCell('H',x.qty,n),numCell('I',x.unitPrice,m),
      numCell('J',(nz(x.qty)*nz(x.unitPrice)),m,`H${r}*I${r}`),
      txt('K',x.createdBy,t),numCell('L',x.stockQty,n),numCell('M',x.stockReservedQty,n),
      txt('N',x.note,t),
    ]});
  });
  const end=FIRST_DATA_ROW+data.length-1,total=Math.max(FIRST_DATA_ROW,end+1);
  rows.push({row:total,height:25,cells:[txt('E','ÖSSZESEN',18),
    numCell('H',custody.reserved?.totalQty||0,19,data.length?`SUM(H${FIRST_DATA_ROW}:H${end})`:null),
    numCell('J',sum(data.map(x=>nz(x.qty)*nz(x.unitPrice))),14,data.length?`SUM(J${FIRST_DATA_ROW}:J${end})`:null)]});
  rows.push({row:total+1,height:23,cells:[txt('A',
    'A félretett termék a boltban fizikailag jelen van, ezért a LELTÁR munkalap készletében MÁR szerepel. Kétszer hozzáadni tilos.',17)]});
  return worksheetXml({columnWidths:head.map(([,w])=>w),rows,
    merges:[`A1:N1`,`A${total+1}:N${total+1}`],autoFilter:`A2:N${Math.max(2,end)}`,freeze:2});
}
function warningsSheet(detail,custody){
  const warnings=[...(custody.credit?.warnings||[]),...(custody.reserved?.warnings||[])];
  const rows=basicRows(commonTitle(detail,'EGYEZTETENDŐ'),[['#',6],['FIGYELMEZTETÉS',100]]);
  warnings.forEach((warning,index)=>rows.push({row:index+3,height:26,cells:[numCell('A',index+1,6),txt('B',warning,12)]}));
  return worksheetXml({columnWidths:[6,100],rows,merges:['A1:B1'],autoFilter:`A2:B${Math.max(2,2+warnings.length)}`,freeze:2});
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
export function buildOpeningInventoryXlsx(detail, options={}){
  if(!detail?.session) throw new Error('Hiányos leltáradatok az XLSX exporthoz.');
  const sections=Array.isArray(options.sections)&&options.sections.length
    ? options.sections.filter(item=>['inventory','credit','reserved'].includes(item)) : ['inventory'];
  const custody=options.custody||{};
  const selected=[...new Set(sections)];
  const sheets=[];
  if(selected.includes('inventory')) {
    if(!Array.isArray(detail.lines)) throw new Error('Hiányoznak a fizikai leltársorok.');
    sheets.push({name:'Leltár',xml:itemSheet(detail,productRows(detail))});
  }
  if(selected.includes('credit')) sheets.push({name:'Hiteles',xml:creditSheet(detail,custody)});
  if(selected.includes('reserved')) sheets.push({name:'Félretett',xml:reservedSheet(detail,custody)});
  if([...(custody.credit?.warnings||[]),...(custody.reserved?.warnings||[])].length)
    sheets.push({name:'Ellenőrizendő',xml:warningsSheet(detail,custody)});
  if(!sheets.length) throw new Error('Nincs kiválasztott exportadat.');
  const types=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  const files={
    '[Content_Types].xml':types,
    '_rels/.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    'xl/workbook.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((sheet,i)=>`<sheet name="${xmlEscape(sheet.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    'xl/_rels/workbook.xml.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml':stylesXml(),
    'docProps/core.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>AllInFashion</dc:creator></cp:coreProperties>`,
    'docProps/app.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>AllInFashion</Application></Properties>`,
  };
  sheets.forEach((sheet,i)=>{files[`xl/worksheets/sheet${i+1}.xml`]=sheet.xml;});
  return zip(files);
}
export function openingInventoryXlsxFilename(session, sections=['inventory']){
  const date=clean(session?.started_at||session?.created_at).slice(0,10)||new Date().toISOString().slice(0,10);
  const modes=Array.isArray(sections)?sections:['inventory'];
  const suffix=modes.map(s=>({inventory:'Leltar',credit:'Hiteles',reserved:'Felretett'}[s]||s)).join('_');
  return `AllInFashion_${suffix}_${safeName(session?.location_name||session?.location?.name)}_${date}_${safeName(session?.code)}.xlsx`;
}
