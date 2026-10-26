// ALLINFASHION_AUDIT_XLSX_20261026
// Dependency-free OpenXML XLSX writer for the 15-column AUDITNAPLO ADATOK MINTA.
// The first fifteen columns follow the customer's workbook exactly.
import { deflateRawSync } from 'node:zlib';

const HEADERS = [
  'NR.', 'DATUM / ORA', 'BRAND', 'S/N KOD', 'TERMEK KOD', 'BARCOD',
  'SZIN', 'MERET', 'VASARLO', 'DB', 'RENDES AR', 'KEDVEZMENY %',
  'KEDVEZMENY ERTEK', 'FIZETENDO', 'PENZ / KARTYA ',
  'BIZONYLAT', 'ELADO', 'ESEMENY', 'BEFOLYT OSSZEG',
  'EREDETI ELADAS', 'KESZLETHATAS DB', 'MEGJEGYZES',
];
const WIDTHS = [8, 22, 19, 20, 21, 23, 15, 11, 29, 9, 16, 16, 19, 18, 19, 26, 24, 24, 20, 22, 17, 45];
const NUMBER_COLUMNS = new Set([10, 11, 12, 13, 14, 19, 21]);
const MONEY_COLUMNS = new Set([11, 13, 14, 19]);
const TEXT_CODE_COLUMNS = new Set([4, 5, 6, 16]);

function xmlEscape(value) {
  return String(value ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function colName(i) {
  let n = i; let name = '';
  while (n > 0) { n -= 1; name = String.fromCharCode(65 + n % 26) + name; n = Math.floor(n / 26); }
  return name;
}
function cell(col, row, value, style = 0) {
  if (value === undefined || value === null || value === '') return '';
  const ref = `${colName(col)}${row}`;
  if (typeof value === 'object' && value && typeof value.formula === 'string') {
    return `<c r="${ref}" s="${style}"><f>${xmlEscape(value.formula.replace(/^=/, ''))}</f></c>`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}" s="${style}"><v>${Object.is(value,-0) ? 0 : value}</v></c>`;
  }
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}
function rowXml(rowNumber, values, defaultStyle = 3, height = 22, rowStyle = null) {
  const cols = values.map((value, index) => {
    let style = rowStyle === null ? defaultStyle : rowStyle;
    if (rowNumber > 2 && rowStyle === null && NUMBER_COLUMNS.has(index + 1)) {
      style = MONEY_COLUMNS.has(index + 1) ? (defaultStyle === 7 ? 12 : 5) : index === 11 ? 6 : 4;
    } else if (rowNumber > 2 && rowStyle === null && TEXT_CODE_COLUMNS.has(index + 1)) {
      style = 13; // Excel TEXT format protects leading zeros in SKU and barcode.
    }
    return cell(index + 1, rowNumber, value, style);
  }).join('');
  return `<row r="${rowNumber}" ht="${height}" customHeight="1">${cols}</row>`;
}
function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00 &quot;RON&quot;"/><numFmt numFmtId="165" formatCode="0.00&quot;%&quot;"/></numFmts>
<fonts count="5"><font><sz val="10"/><name val="Aptos"/></font><font><b/><sz val="15"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font><font><b/><sz val="10"/><color rgb="FF183A40"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts>
<fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF234C55"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2A8D8B"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F7F9"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF1D5"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDF4ED"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD9E1E6"/></left><right style="thin"><color rgb="FFD9E1E6"/></right><top style="thin"><color rgb="FFD9E1E6"/></top><bottom style="thin"><color rgb="FFD9E1E6"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="14">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="6" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center" horizontal="left"/></xf>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}
function sheetXml(rows, widths, { filter = false, freeze = false, title = false } = {}) {
  const maxRow = Math.max(1, rows.length);
  const ncols = widths.length;
  const cols = widths.map((width, i) => `<col min="${i+1}" max="${i+1}" width="${width}" customWidth="1"/>`).join('');
  let body = '';
  for (let i=0; i<rows.length; i++) {
    const values = rows[i] || [];
    const idx = i+1;
    if (title && idx === 1) body += rowXml(idx, values, 1, 40, 1);
    else if (title && idx === 2) body += rowXml(idx, values, 2, 44, 2);
    else if (idx === rows.length && title) body += rowXml(idx, values, 10, 32, 10);
    else if (!title && idx>=6 && idx<=18) {
      const cells=values.map((value,index) => cell(index+1,idx,value,index===1 ? 5 : (idx%2?7:3))).join('');
      body += `<row r="${idx}" ht="24" customHeight="1">${cells}</row>`;
    }
    else body += rowXml(idx, values, idx % 2 ? 7 : 3, 23);
  }
  const lastDataRow = title ? Math.max(2, rows.length-1) : maxRow;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${colName(ncols)}${maxRow}"/>
<sheetViews><sheetView workbookViewId="0" showGridLines="0">${freeze ? '<pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/>' : ''}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="20"/><cols>${cols}</cols>
<sheetData>${body}</sheetData>
${title ? `<mergeCells count="2"><mergeCell ref="A1:${colName(ncols)}1"/><mergeCell ref="A${maxRow}:R${maxRow}"/></mergeCells>` : ''}
${filter ? `<autoFilter ref="A2:${colName(ncols)}${lastDataRow}"/>` : ''}
<pageMargins left="0.25" right="0.25" top="0.45" bottom="0.45" header="0.2" footer="0.2"/>
<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

let CRC_TABLE = null;
function crc32(buffer) {
  if (!CRC_TABLE) CRC_TABLE = Array.from({length:256}, (_,i)=> {
    let c=i;
    for(let j=0;j<8;j++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
    return c>>>0;
  });
  let crc=0xFFFFFFFF;
  for(const byte of buffer) crc=CRC_TABLE[(crc^byte)&255]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}
function zipFiles(files) {
  const local=[]; const central=[];
  let offset=0;
  for(const [name,content] of files) {
    const filename=Buffer.from(name,'utf8');
    const source=Buffer.isBuffer(content)?content:Buffer.from(content,'utf8');
    const compressed=deflateRawSync(source,{level:6});
    const checksum=crc32(source);
    const loc=Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50,0); loc.writeUInt16LE(20,4); loc.writeUInt16LE(0x0800,6);
    loc.writeUInt16LE(8,8); loc.writeUInt32LE(checksum,14);
    loc.writeUInt32LE(compressed.length,18);loc.writeUInt32LE(source.length,22);loc.writeUInt16LE(filename.length,26);
    local.push(loc,filename,compressed);
    const dir=Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50,0); dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);
    dir.writeUInt16LE(0x0800,8);dir.writeUInt16LE(8,10);dir.writeUInt32LE(checksum,16);
    dir.writeUInt32LE(compressed.length,20);dir.writeUInt32LE(source.length,24);
    dir.writeUInt16LE(filename.length,28);dir.writeUInt32LE(offset,42);
    central.push(dir,filename);
    offset+=loc.length+filename.length+compressed.length;
  }
  const cd=Buffer.concat(central);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);
  end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,cd,end]);
}
function num(v) { const value=Number(v);return Number.isFinite(value)?Math.round(value*100)/100:0; }

export function buildAifDailyAuditXlsx({ date, location, employeeLabel, entries, totals, generatedAt = new Date() }) {
  const title = `ALLINFASHION | AUDITNAPLÓ | ${location} | ${date} | ${employeeLabel}`;
  const dataRows = [...entries].sort((a,b) => String(a.at||'').localeCompare(String(b.at||'')) || String(a.id||'').localeCompare(String(b.id||'')));
  const sheet1 = [
    [title], HEADERS,
    ...dataRows.map((item,index)=>[
      index+1, item.dateTime || '', item.brand||'',item.sn||'',item.productCode||'',item.barcode||'',
      item.color||'',item.size||'',item.customer||'',num(item.qty),num(item.listPrice),num(item.discountPercent),
      num(item.discount),num(item.lineTotal),item.method||'',item.document||'',item.actor||'',item.kind||'',
      num(item.collected),item.originalDate||'',num(item.stockQty),item.note||'',
    ]),
    ['ÖSSZES BEFOLYT',null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,
      dataRows.length ? {formula:`SUM(S3:S${dataRows.length+2})`} : 0],
  ];
  const summary = [
    ['ALLINFASHION - NAPI PÉNZÜGYI EGYEZTETÉS','Érték','Megjegyzés'],
    ['Üzlet',location,'A kiválasztott üzlet.'],
    ['Dátum',date,'Romániai helyi nap (Europe/Bucharest).'],
    ['Eladó / kör',employeeLabel,'Admin: minden eladó; eladói hozzáférés: saját nap.'],
    ['Sorok száma',dataRows.length,'Sorszámozott, időrendi tételek a másik munkalapon.'],
    ['Napi pénzbevétel',num(totals.collected),'Készpénz, kártya, utalás, régi tartozások befizetése és csere-különbözet.'],
    ['Napi elszámolási bruttó',num(totals.gross),'A befolyt összeg és az elszámolási kedvezmény összege.'],
    ['Elszámolási kedvezmény',num(totals.discount),'Napi fizetett eladásokra és korábbi tartozásrendezésekre jutó kedvezmény.'],
    ['Korábbi tartozás befolyt',num(totals.settled),'Készletcsökkentés nélkül, a befizetés napján.'],
    ['Napi hiteles elvitelek',num(totals.creditValue),'Az elvitel napjára tartozó érték; nem aznapi pénzbevétel.'],
    ['Csere pénzmozgás',num(totals.exchangeCash),'Pozitív: befizetés, negatív: visszafizetés.'],
    ['Készpénz',num(totals.cash),'Tényleges készpénzes tételek; nem tartalmaz kártyát.'],
    ['Bankkártya',num(totals.card),'Tényleges kártyás tételek.'],
    ['Átutalás',num(totals.transfer),'Tényleges banki átutalások.'],
    ['Egyéb fizetés',num(totals.other),'Egyéb támogatott fizetési módok.'],
    ['Befizetések egyezősége',{formula:'SUM(B12:B15)-B6'},'Ideális esetben nulla, számviteli ellenőrzés.'],
    ['Részletek (Excel) összege',dataRows.length?{formula:`SUM('Auditnapló'!S3:S${dataRows.length+2})`}:0,'A soronként elszámolt pénzbevétel.'],
    ['Sorok / napi pénzbevétel eltérése',{formula:'B17-B6'},'Ideális esetben nulla.'],
    ['Kimutatás készült',generatedAt.toLocaleString('hu-HU',{timeZone:'Europe/Bucharest'}),'Csak olvasó export, az adatbázist nem módosítja.'],
    ['FONTOS','', 'Hitelre elvitt termék eredeti készletcsökkenése és későbbi befizetése külön esemény.'],
    ['FONTOS','', 'A vásárlások és a rendezések sorai külön vannak, ne összesítsd kétszer a termék darabszámát.'],
  ];
  const fileList = [
    ['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Auditnapló" sheetId="1" r:id="rId1"/><sheet name="Összesítés" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`],
    ['xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml',stylesXml()],
    ['xl/worksheets/sheet1.xml',sheetXml(sheet1,WIDTHS,{filter:true,freeze:true,title:true})],
    ['xl/worksheets/sheet2.xml',sheetXml(summary,[35,23,80],{filter:false,freeze:false,title:false})],
  ];
  return zipFiles(fileList);
}
