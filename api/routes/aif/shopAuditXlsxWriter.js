// ALLINFASHION_AUDIT_TEMPLATE_EXACT_20261027
// The client's original AUDITNAPLO ADATOK MINTA.xlsx is the specification:
// Updated client template: subcategory in G, between barcode and color.
// One worksheet, yellow row-2 headers A:P, 16 columns in the requested order,
// Calibri 10pt everywhere. NO extra design sheets, titles or totals.
// Uses only node:zlib, and NEVER writes to the database.
import { deflateRawSync } from 'node:zlib';

const HEADERS = [
  'NR.', 'DATUM / ORA', 'BRAND', 'S/N KOD', 'TERMEK KOD', 'BARCOD',
  'TERMEK / ALKATEGORIA', 'SZIN', 'MERET', 'VASARLO', 'DB', 'RENDES AR', 'KEDVEZMENY %',
  'KEDVEZMENY ERTEK', 'FIZETENDO', 'PENZ / KARTYA ',
];
// Column widths are limited for daily use, not enlarged to fit giant notes.
const WIDTHS = [7, 21, 18, 24, 26, 20, 24, 17, 11, 24, 7, 15, 17, 21, 16, 24];
const number = (value) => {
  const v = Number(value);
  return Number.isFinite(v) ? v : 0;
};
const money = (value) => Math.round((number(value) + Number.EPSILON) * 100) / 100;
const str = (v) => String(v ?? '');
// The data layer resolves the product code. Write it verbatim: the XLSX
// serializer must not reinterpret supplier identifiers, prefixes or punctuation.
function escapeXml(value) {
  return str(value).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function colName(n) {
  let s = '';
  while (n > 0) { n -= 1; s = String.fromCharCode(65 + n % 26) + s; n = Math.floor(n / 26); }
  return s;
}
// 0 = text, 1 = yellow template header, 2 = integer,
// 3 = currency, 4 = numeric discount percentage, 5 = plain code text.
function cell(col, row, value, style = 0) {
  if (value === undefined || value === null || value === '') return '';
  const ref = `${colName(col)}${row}`;
  if (typeof value === 'number' && Number.isFinite(value))
    return `<c r="${ref}" s="${style}"><v>${Object.is(value, -0) ? 0 : value}</v></c>`;
  // Explicit inline TEXT protects leading zeros, GTINs, barcodes and SKU strings.
  // It also prevents spreadsheet formula injection from product/customer names.
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}
function xmlStyles() {
  // User requirement: Calibri 10pt in every cell. No Aptos, large titles or colored cards.
  const font = `<font><sz val="10"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>`;
  const fillNone = '<fill><patternFill patternType="none"/></fill>';
  const fillGray = '<fill><patternFill patternType="gray125"/></fill>';
  const fillYellow = '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill>';
  const plainBorder = '<border><left/><right/><top/><bottom/><diagonal/></border>';
  const thinBorder = '<border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border>';
  const softBorder = '<border><left/><right/><top/><bottom style="hair"><color rgb="FFE3E3E3"/></bottom><diagonal/></border>';
  const xfs = [
    // text, header, integer, money, percent, code
    [0,2,0,0,'left'],[2,1,0,0,'left'],[0,2,1,1,'right'],
    [0,2,1,164,'right'],[0,2,1,165,'right'],[0,2,1,49,'left'],
  ].map(([fill,border,fontId,format,alignment]) =>
    `<xf numFmtId="${format}" fontId="0" fillId="${fill}" borderId="${border}" xfId="0" applyNumberFormat="1" applyAlignment="1"${format === 49 ? ' quotePrefix="1"' : ''}><alignment horizontal="${alignment}" vertical="center"/></xf>`
  );
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="0.00&quot;%&quot;"/></numFmts>
<fonts count="1">${font}</fonts><fills count="3">${fillNone}${fillGray}${fillYellow}</fills>
<borders count="3">${plainBorder}${thinBorder}${softBorder}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}
function sheetXml(entries) {
  const sorted = [...entries].sort((a,b) => str(a.at || a.dateTime).localeCompare(str(b.at || b.dateTime)) || str(a.id).localeCompare(str(b.id)));
  const rows = [];
  // Keep the template's first, almost empty row. Original contains a space in C1.
  rows.push('<row r="1" ht="15" customHeight="1"></row>');
  rows.push('<row r="2" ht="23" customHeight="1">' + HEADERS.map((value,i) => cell(i+1,2,value,1)).join('') + '</row>');
  for (const [i, item] of sorted.entries()) {
    const rowNumber = i + 3;
    const values = [
      i+1,
      str(item.dateTime || ''),
      str(item.brand || ''),
      str(item.sn || ''),
      str(item.productCode || ''),
      str(item.barcode || ''),
      str(item.subcategory || ''),
      str(item.color || ''),
      str(item.size || ''),
      str(item.customer || ''),
      number(item.qty),
      money(item.listPrice),
      number(item.discountPercent),
      money(item.discount),
      money(item.lineTotal),
      str(item.method || ''),
    ];
    const format = [2,0,0,5,5,5,0,0,0,0,2,3,4,3,3,0];
    rows.push(`<row r="${rowNumber}" ht="18" customHeight="1">`+
      values.map((value,j)=>cell(j+1,rowNumber,value,format[j])).join('')+'</row>');
  }
  const last = Math.max(2, sorted.length + 2);
  const lastCol = colName(HEADERS.length);
  const cols = WIDTHS.map((width,i)=>`<col min="${i+1}" max="${i+1}" width="${width}" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${lastCol}${last}"/><sheetViews><sheetView workbookViewId="0" showGridLines="1"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${rows.join('')}</sheetData>
<autoFilter ref="A2:${lastCol}${last}"/>
<pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.25" footer="0.25"/>
<pageSetup orientation="landscape" paperSize="9"/>
</worksheet>`;
}
let CRC_TABLE = null;
function crc32(data) {
  if (!CRC_TABLE) CRC_TABLE=Array.from({length:256}, (_,i)=>{
    let c=i;for(let k=0;k<8;k++)c=(c&1)?0xEDB88320^(c>>>1):c>>>1;
    return c>>>0;
  });
  let crc=0xFFFFFFFF;
  for(const n of data)crc=CRC_TABLE[(crc^n)&255]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}
function zipFiles(files) {
  const entries=[],directory=[];
  let offset=0;
  for(const [name,contents] of files) {
    const filename=Buffer.from(name,'utf8');
    const source=Buffer.isBuffer(contents)?contents:Buffer.from(contents,'utf8');
    const compressed=deflateRawSync(source,{level:6}),checksum=crc32(source);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
    local.writeUInt16LE(0x0800,6);local.writeUInt16LE(8,8);
    local.writeUInt32LE(checksum,14);local.writeUInt32LE(compressed.length,18);
    local.writeUInt32LE(source.length,22);local.writeUInt16LE(filename.length,26);
    entries.push(local,filename,compressed);
    const dir=Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);
    dir.writeUInt16LE(0x0800,8);dir.writeUInt16LE(8,10);
    dir.writeUInt32LE(checksum,16);dir.writeUInt32LE(compressed.length,20);
    dir.writeUInt32LE(source.length,24);dir.writeUInt16LE(filename.length,28);
    dir.writeUInt32LE(offset,42);directory.push(dir,filename);
    offset+=local.length+filename.length+compressed.length;
  }
  const cd=Buffer.concat(directory),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);
  end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...entries,cd,end]);
}
export function buildAifDailyAuditXlsx({entries=[]}={}) {
  if (!Array.isArray(entries)) throw new Error('Hiányzik az auditnapló tétellistája.');
  const files = [
    ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml',xmlStyles()],
    ['xl/worksheets/sheet1.xml',sheetXml(entries)],
  ];
  return zipFiles(files);
}
