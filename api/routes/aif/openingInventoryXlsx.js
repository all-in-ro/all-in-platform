// ALLINFASHION_LELTAR_XLSX_20261103
// Standalone, dependency-free, read-only XLSX report from an existing inventory detail.
// No stock writes, movements, approvals, sessions, or other financial operations.
import { deflateRawSync } from 'node:zlib';

// Egyetlen egyszerű munkalap, a felhasználó "leltar minta.xlsx" táblázatához igazítva.
const HEADER = [
  ['NR.',8], ['BRAND',19], ['S/N KÓD',19], ['TERMÉK KÓD',21],
  ['BARCODE',22], ['TERMÉKNÉV',42], ['KATEGÓRIA',21], ['ALKATEGÓRIA',24],
  ['SZÍN',16], ['MÉRET',11], ['DB (LELTÁR)',15], ['DB (RENDSZER)',18],
  ['ELTÉRÉS DB',15], ['BRUTTÓ ÁR',18], ['BRUTTÓ ÉRTÉK',22], ['ÁLLAPOT',25],
];
const FIRST_DATA_ROW=3;
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
  const session=detail.session||{};
  const unknown=(detail.unknown||[]).filter(x=>nz(x.qty)>0);
  const place=clean(session.location_name||session.location?.name)||'Üzlet';
  const title=`ALLINFASHION  |  LELTÁR  |  ${place}  |  ${clean(session.code)}  |  ${dateText(session.started_at||session.created_at)}`;
  const rows=[
    {row:1,height:29,cells:[txt('A',title,1)]},
    {row:2,height:34,cells:HEADER.map(([name],i)=>txt(columnName(i),name,3))},
  ];
  data.forEach((x,i)=>{
    const r=FIRST_DATA_ROW+i;
    const alternate=i%2===1;
    const t=alternate?5:4;
    const n=alternate?7:6;
    const money=alternate?9:8;
    const hasCount=x.effective!==null;
    const status=x.price===null&&hasCount?`${x.state} / ÁR HIÁNYZIK`:x.state;
    const stateStyle=x.state==='RENDBEN'?13:
      x.state==='NEM SZÁMOLT'||x.state==='ÚJRASZÁMOLANDÓ'?12:
      x.state==='HIÁNY'?10:x.state==='TÖBBLET'?11:t;
    rows.push({row:r,height:23,cells:[
      numCell('A',i+1,n),txt('B',x.brand,t),txt('C',x.sn,t),
      txt('D',x.productCode,t),txt('E',x.barcode,t),txt('F',x.title,t),
      txt('G',x.category,t),txt('H',x.subcategory,t),txt('I',x.color,t),
      txt('J',x.size,t),numCell('K',x.effective,n),numCell('L',x.current,n),
      numCell('M',x.delta,x.delta===null?n:x.delta<0?10:x.delta>0?11:n,
        x.delta===null?null:`K${r}-L${r}`),
      numCell('N',x.price,money),
      numCell('O',x.effectiveValue,money,
        x.effectiveValue===null?null:`K${r}*N${r}`),
      txt('P',status,stateStyle),
    ]});
  });
  const end=FIRST_DATA_ROW+data.length-1;
  const totalRow=Math.max(FIRST_DATA_ROW, end+1);
  // A teljesítés képlettel számol, a még nem számolt mező üres marad.
  rows.push({row:totalRow,height:27,cells:[
    txt('F','ÖSSZESEN',18),
    numCell('K',sum(data.map(x=>x.effective)),19,data.length?`SUM(K${FIRST_DATA_ROW}:K${end})`:null),
    numCell('L',sum(data.map(x=>x.current)),19,data.length?`SUM(L${FIRST_DATA_ROW}:L${end})`:null),
    numCell('M',sum(data.map(x=>x.delta)),19,data.length?`SUM(M${FIRST_DATA_ROW}:M${end})`:null),
    numCell('O',Math.round(sum(data.map(x=>x.effectiveValue))*100)/100,14,
      data.length?`SUM(O${FIRST_DATA_ROW}:O${end})`:null),
  ]});
  rows.push({row:totalRow+2,height:26,cells:[
    txt('A','A DB (LELTÁR) a leltár utáni készletmozgásokat is figyelembe veszi. A NEM SZÁMOLT termék nem nulla: a DB és az eltérés üres.',17),
  ]});
  if(unknown.length){
    const head=totalRow+4;
    rows.push({row:head,height:26,cells:[txt('A','AZONOSÍTANDÓ BÁRKÓDOK (NEM SZÁMÍTANAK BELE AZ ÖSSZESEN SORBA)',18)]});
    rows.push({row:head+1,height:26,cells:[txt('A','NR.',3),txt('B','BARCODE',3),txt('E','DB',3),txt('F','ÁLLAPOT',3)]});
    unknown.forEach((x,i)=>{
      rows.push({row:head+2+i,height:22,cells:[
        numCell('A',i+1,i%2?7:6),txt('B',clean(x.scan_code),i%2?5:4),
        numCell('E',nz(x.qty),i%2?7:6),
        txt('F',x.resolved_at?'Azonosítva':'ELLENŐRZENDŐ',x.resolved_at?13:12),
      ]});
    });
  }
  return worksheetXml({columnWidths:HEADER.map(([,w])=>w),rows,
    merges:['A1:P1',`A${totalRow+2}:P${totalRow+2}`,
      ...(unknown.length?[`A${totalRow+4}:P${totalRow+4}`]:[])],
    autoFilter:`A2:P${Math.max(2,end)}`,freeze:2});
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
    '[Content_Types].xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    '_rels/.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    'xl/workbook.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Leltár" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    'xl/_rels/workbook.xml.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml':itemSheet(detail,data),
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
