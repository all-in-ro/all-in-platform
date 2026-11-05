// AllInFashion ajandekutalvany - valodi XLSX export, fuggetlen a napi audit sablonjatol.
// Csak memoriaban epit allomanyt; adatbazishoz, keszlethez es penztarhoz nem nyul.
import { deflateRawSync } from 'node:zlib';

const str = value => String(value ?? '');
const xml = value => str(value)
  .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
function col(index) {
  let result='';
  while (index > 0) { index -= 1; result=String.fromCharCode(65 + index % 26) + result; index = Math.floor(index / 26); }
  return result;
}
function cell(index, row, value, style = 0) {
  if (value === null || value === undefined || value === '') return '';
  const ref=`${col(index)}${row}`;
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  // A kodok, vevonevek, referenciaszamok szovegesek maradnak. Kepletre sem hajtjuk vegre.
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}
function stylesXml() {
  const fonts=[
    '<font><sz val="10"/><name val="Calibri"/><color rgb="FF223247"/></font>',
    '<font><sz val="10"/><name val="Calibri"/><b/><color rgb="FFFFFFFF"/></font>',
    '<font><sz val="17"/><name val="Calibri"/><b/><color rgb="FF155D5B"/></font>',
    '<font><sz val="9"/><name val="Calibri"/><color rgb="FF667889"/></font>',
    '<font><sz val="10"/><name val="Calibri"/><b/><color rgb="FF155D5B"/></font>',
  ];
  const fills=[
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF354153"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF1F7F7"/><bgColor indexed="64"/></patternFill></fill>',
  ];
  const border='<border><left/><right/><top/><bottom/><diagonal/></border>';
  const xf=(fontId,fillId,format,alignment='left') => `<xf numFmtId="${format}" fontId="${fontId}" fillId="${fillId}" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="${alignment}" vertical="center"/></xf>`;
  const xfs=[
    xf(0,0,0),xf(2,0,0),xf(3,0,0),xf(1,2,0),xf(0,0,164,'right'),
    xf(0,0,1,'right'),xf(0,0,49),xf(4,3,0),xf(4,3,164,'right'),
  ];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="1">${border}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}
function sheetXml({ title, description, headers, widths, rows, moneyColumns, summary }) {
  const numCols=headers.length;
  const lastCol=col(numCols);
  const lines=[];
  const data = (row, values, formats=[],height=22) => `<row r="${row}" ht="${height}" customHeight="1">${values.map((value,j)=>cell(j+1,row,value,formats[j] || 0)).join('')}</row>`;
  lines.push(data(1,[title],[1],34));
  lines.push(data(2,['AllInFashion · belső nyilvántartási kimutatás'],[2],19));
  lines.push(data(3,[description],[2],19));
  const metrics=(summary||[]).slice(0,Math.floor(numCols/2));
  const summaryValues=Array(numCols).fill('');const summaryFormats=Array(numCols).fill(0);
  metrics.forEach((item,i) => { const idx=i*2;summaryValues[idx]=item.label;summaryFormats[idx]=7; summaryValues[idx+1]=Number(item.value)||0;summaryFormats[idx+1]=item.money?8:5; });
  lines.push(data(5,summaryValues,summaryFormats,25));
  lines.push(data(7,headers,headers.map(()=>3),29));
  for(const [index, values] of rows.entries()) {
    const format=values.map((v,j)=>moneyColumns.includes(j)?4:typeof v==='number'?5:0);
    lines.push(data(index+8, values, format,21));
  }
  const lastRow=Math.max(7,rows.length+7);
  const columns=widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastCol}${lastRow}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="7" topLeftCell="A8" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="19"/><cols>${columns}</cols><sheetData>${lines.join('')}</sheetData><mergeCells count="3"><mergeCell ref="A1:${lastCol}1"/><mergeCell ref="A2:${lastCol}2"/><mergeCell ref="A3:${lastCol}3"/></mergeCells><autoFilter ref="A7:${lastCol}${lastRow}"/><pageMargins left="0.25" right="0.25" top="0.45" bottom="0.45" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9"/></worksheet>`;
}
let crcTable;
function crc32(buf) {
  if(!crcTable)crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);return c>>>0;});
  let sum=0xFFFFFFFF;
  for(const byte of buf)sum=crcTable[(sum^byte)&255]^(sum>>>8);
  return (sum^0xFFFFFFFF)>>>0;
}
function zip(entries) {
  const localParts=[];const directoryParts=[];let offset=0;
  for(const [name,data] of entries) {
    const filename=Buffer.from(name,'utf8');const source=Buffer.from(data,'utf8');
    const compressed=deflateRawSync(source,{level:6});const check=crc32(source);
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x0800,6);header.writeUInt16LE(8,8);header.writeUInt32LE(check,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(source.length,22);header.writeUInt16LE(filename.length,26);
    localParts.push(header,filename,compressed);
    const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);dir.writeUInt16LE(0x0800,8);dir.writeUInt16LE(8,10);dir.writeUInt32LE(check,16);dir.writeUInt32LE(compressed.length,20);dir.writeUInt32LE(source.length,24);dir.writeUInt16LE(filename.length,28);dir.writeUInt32LE(offset,42);
    directoryParts.push(dir,filename);offset+=header.length+filename.length+compressed.length;
  }
  const center=Buffer.concat(directoryParts);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(center.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...localParts,center,end]);
}

export function buildVoucherXlsx({ title, description='', headers, widths, rows, moneyColumns=[], summary=[] }) {
  if(!Array.isArray(headers)||!headers.length||headers.length>16||!Array.isArray(rows)||!Array.isArray(widths)||headers.length!==widths.length)throw new Error('Hibas XLSX export adatok.');
  const sheet=sheetXml({title,description,headers,widths,rows,moneyColumns,summary});
  return zip([
    ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Kimutatas" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml',stylesXml()],
    ['xl/worksheets/sheet1.xml',sheet],
  ]);
}
