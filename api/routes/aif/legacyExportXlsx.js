// ForIT XLSX byte-preserving bridge. No npm Excel/ZIP dependencies.
// Every ZIP member except the chosen worksheet is re-used verbatim (compressed payload);
// within that worksheet only previously empty Codbare cells are inserted/filled.
import zlib from 'node:zlib';
import path from 'node:path';

const FILE_MAX_BYTES = 12 * 1024 * 1024;
const PART_MAX_BYTES = 40 * 1024 * 1024;
const ENTRY_MAX = 1500;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function guard(condition, message) {
  if (!condition) throw Object.assign(new Error(message), { statusCode: 422, code: 'forit_xlsx_invalid' });
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function readZip(buffer) {
  guard(Buffer.isBuffer(buffer) && buffer.length > 30 && buffer.length <= FILE_MAX_BYTES,
    'A fájl túl nagy vagy nem érvényes XLSX. Legfeljebb 12 MB tölthető fel.');
  const start = Math.max(0, buffer.length - 22 - 65535);
  let eocdAt = -1;
  for (let i = buffer.length - 22; i >= start; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocdAt = i; break; }
  }
  guard(eocdAt >= 0, 'Hiányzik az XLSX ZIP lezárása.');
  const entryCount = buffer.readUInt16LE(eocdAt + 10);
  const directorySize = buffer.readUInt32LE(eocdAt + 12);
  const directoryOffset = buffer.readUInt32LE(eocdAt + 16);
  const commentLen = buffer.readUInt16LE(eocdAt + 20);
  guard(buffer.readUInt16LE(eocdAt + 4) === 0 && buffer.readUInt16LE(eocdAt + 6) === 0,
    'A többkötetes XLSX nem támogatott.');
  guard(entryCount <= ENTRY_MAX && entryCount !== 0 && entryCount !== 0xffff && directoryOffset !== 0xffffffff,
    'Túl sok állomány vagy ZIP64 formátum az XLSX-ben.');
  guard(directoryOffset + directorySize <= eocdAt && eocdAt + 22 + commentLen <= buffer.length,
    'Hibás XLSX-könyvtár.');
  const entries = [];
  let at = directoryOffset;
  for (let i = 0; i < entryCount; i++) {
    guard(at + 46 <= buffer.length && buffer.readUInt32LE(at) === 0x02014b50,
      'Sérült ZIP-könyvtárbejegyzés.');
    const flags = buffer.readUInt16LE(at + 8);
    const method = buffer.readUInt16LE(at + 10);
    const crc = buffer.readUInt32LE(at + 16);
    const compressedSize = buffer.readUInt32LE(at + 20);
    const size = buffer.readUInt32LE(at + 24);
    const nameLen = buffer.readUInt16LE(at + 28);
    const extraLen = buffer.readUInt16LE(at + 30);
    const commentLen = buffer.readUInt16LE(at + 32);
    const localAt = buffer.readUInt32LE(at + 42);
    const end = at + 46 + nameLen + extraLen + commentLen;
    guard(end <= buffer.length && !(flags & 1) && [0, 8].includes(method),
      'Titkosított vagy nem támogatott XLSX-állomány.');
    guard(size <= PART_MAX_BYTES && compressedSize <= FILE_MAX_BYTES && localAt + 30 <= buffer.length && buffer.readUInt32LE(localAt) === 0x04034b50,
      'A munkafüzet túl nagy vagy sérült.');
    const localNameLength = buffer.readUInt16LE(localAt + 26);
    const localExtraLength = buffer.readUInt16LE(localAt + 28);
    const dataAt = localAt + 30 + localNameLength + localExtraLength;
    guard(dataAt + compressedSize <= buffer.length, 'Sérült XLSX-kompresszió.');
    const nameBuffer = buffer.subarray(at + 46, at + 46 + nameLen);
    const name = nameBuffer.toString('utf8');
    guard(!name.includes('..') && !name.startsWith('/') && !name.includes('\\'), 'Érvénytelen XLSX-belső útvonal.');
    entries.push({
      name, nameBuffer,
      central: Buffer.from(buffer.subarray(at, end)),
      localExtra: Buffer.from(buffer.subarray(localAt + 30 + localNameLength, dataAt)),
      flags, method, crc, size,
      compressed: Buffer.from(buffer.subarray(dataAt, dataAt + compressedSize)),
    });
    at = end;
  }
  guard(at === directoryOffset + directorySize, 'A ZIP-könyvtár mérete nem egyezik.');
  const byName = new Map(entries.map(e => [e.name, e]));
  guard(byName.has('xl/workbook.xml') && byName.has('[Content_Types].xml'), 'Nem érvényes Excel XLSX-munkafüzet.');
  return { entries, byName, comment: Buffer.from(buffer.subarray(eocdAt + 22, eocdAt + 22 + commentLen)) };
}

function inflated(entry) {
  guard(Boolean(entry), 'Hiányzó Excel-állomány.');
  const contents = entry.method === 0 ? entry.compressed : zlib.inflateRawSync(entry.compressed, { maxOutputLength: PART_MAX_BYTES });
  guard(contents.length === entry.size && crc32(contents) === entry.crc, 'Az XLSX belső állománya sérült.');
  return contents;
}

function decodedXmlText(text) {
  return String(text || '').replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_all, v) => {
    if (v[0] === '#') {
      const code = v[1]?.toLowerCase() === 'x' ? parseInt(v.slice(2), 16) : parseInt(v.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[v] || '';
  });
}

function escXml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function sharedStrings(archive) {
  const entry = archive.byName.get('xl/sharedStrings.xml');
  if (!entry) return [];
  const xml = inflated(entry).toString('utf8');
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(([, body]) =>
    [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(([, text]) => decodedXmlText(text)).join(''));
}

function getFirstWorksheetName(archive) {
  const workbook = inflated(archive.byName.get('xl/workbook.xml')).toString('utf8');
  const relation = inflated(archive.byName.get('xl/_rels/workbook.xml.rels')).toString('utf8');
  const sheetTag = workbook.match(/<sheet\b[^>]*\br:id="([^"]+)"[^>]*\/?\s*>/);
  guard(Boolean(sheetTag), 'A ForIT XLSX nem tartalmaz megnyitható munkalapot.');
  const sheetId = sheetTag[1];
  const relTags = [...relation.matchAll(/<Relationship\b[^>]*\/?\s*>/g)].map(x => x[0]);
  const targetTag = relTags.find(tag => new RegExp(`\\bId="${sheetId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(tag));
  guard(Boolean(targetTag), 'Nem található a ForIT munkalap kapcsolata.');
  const target = targetTag.match(/\bTarget="([^"]+)"/);
  guard(Boolean(target), 'Hiányzik a munkalap célútvonala.');
  const name = target[1].startsWith('/') ? target[1].slice(1) : path.posix.normalize(path.posix.join('xl', target[1]));
  guard(archive.byName.has(name), `Hiányzó XLSX munkalap: ${name}`);
  return name;
}

function extractCellTokens(body) {
  return [...body.matchAll(/<c\b[^>]*\br="([A-Z]+)([1-9]\d*)"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g)]
    .map(match => ({ raw: match[0], col: match[1], row: Number(match[2]), index: match.index ?? 0 }));
}

function valueForCell(token, strings) {
  if (!token) return '';
  const type = token.raw.match(/\bt="([^"]+)"/)?.[1] || '';
  const rawValue = token.raw.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1] ?? '';
  if (type === 's') return strings[Number(rawValue)] || '';
  if (type === 'inlineStr') return decodedXmlText([...token.raw.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
  return decodedXmlText(rawValue);
}

function cleanHeader(raw) {
  return String(raw || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function colNumber(col) {
  return [...col].reduce((a, letter) => a * 26 + letter.charCodeAt(0) - 64, 0);
}

export function inspectForitXlsx(buffer) {
  const archive = readZip(buffer);
  const sheetPath = getFirstWorksheetName(archive);
  const xml = inflated(archive.byName.get(sheetPath)).toString('utf8');
  const strings = sharedStrings(archive);
  const rows = [...xml.matchAll(/<row\b[^>]*\br="([1-9]\d*)"[^>]*>([\s\S]*?)<\/row>/g)]
    .map(match => ({ rowNo: Number(match[1]), tokens: extractCellTokens(match[2]) }));
  guard(rows.length > 1 && rows.length <= 40001, 'Az XLSX üres vagy túl sok terméksort tartalmaz.');
  const headers = rows[0].tokens.map(token => ({ col: token.col, header: cleanHeader(valueForCell(token, strings)) }));
  const findCol = names => headers.find(h => names.includes(h.header))?.col;
  const barcodeCol = findCol(['codbare', 'coddebare', 'barcode', 'ean', 'vonalkod']);
  const codeCol = findCol(['cod', 'codprodus', 'productcode']);
  const nameCol = findCol(['denumire', 'denumireprodus', 'nev', 'productname']);
  guard(Boolean(barcodeCol && codeCol), 'Nem találom a ForIT „Codbare” és „Cod” oszlopait. A fájl formátumát nem módosítom.');
  guard(barcodeCol !== codeCol, 'A vonalkód és termékkód ugyanazon oszlopban található.');
  const data = rows.slice(1).map(row => {
    const get = col => valueForCell(row.tokens.find(token => token.col === col), strings).trim();
    return { rowNo: row.rowNo, code: get(codeCol), name: nameCol ? get(nameCol) : '', barcode: get(barcodeCol) };
  }).filter(row => row.code || row.barcode);
  guard(data.length > 0, 'Nem található termékadat a ForIT-fájlban.');
  return { archive, sheetPath, xml, barcodeCol, data };
}

function setBarcodeCell(rowBody, cellCol, rowNo, barcode) {
  const tokens = extractCellTokens(rowBody);
  const target = tokens.find(t => t.col === cellCol);
  const content = `<is><t>${escXml(barcode)}</t></is>`;
  if (target) {
    const tag = target.raw.match(/^<c\b[^>]*>/)?.[0] || target.raw.match(/^<c\b[^>]*\/>/)?.[0];
    guard(Boolean(tag), 'Nem olvasható a ForIT vonalkódcellája.');
    const attrs = tag.replace(/^<c\b/, '').replace(/\/?\s*>$/, '').replace(/\s+t="[^"]*"/g, '');
    const updated = `<c${attrs} t="inlineStr">${content}</c>`;
    return rowBody.slice(0, target.index) + updated + rowBody.slice(target.index + target.raw.length);
  }
  const replacement = `<c r="${cellCol}${rowNo}" t="inlineStr">${content}</c>`;
  const at = tokens.find(t => colNumber(t.col) > colNumber(cellCol));
  if (at) return rowBody.slice(0, at.index) + replacement + rowBody.slice(at.index);
  return rowBody + replacement;
}

export function writeForitXlsx(inspected, assigned) {
  guard(inspected?.archive && inspected?.sheetPath && inspected?.xml, 'Hiányzó Excel-előnézet.');
  const replacements = assigned instanceof Map ? assigned : new Map(Object.entries(assigned || {}).map(([k, v]) => [Number(k), v]));
  const rowLookup = new Map(inspected.data.map(item => [item.rowNo, item]));
  for (const [rowNo, code] of replacements) {
    guard(Boolean(rowLookup.get(rowNo)) && !rowLookup.get(rowNo).barcode,
      `A(z) ${rowNo}. sorban már szerepel vonalkód, ezért nem írom felül.`);
    guard(/^[A-Za-z0-9._-]{1,90}$/.test(String(code)),
      `Érvénytelen AllInFashion-vonalkód a(z) ${rowNo}. sorhoz.`);
  }
  let count = 0;
  const updatedXml = inspected.xml.replace(/(<row\b[^>]*\br="([1-9]\d*)"[^>]*>)([\s\S]*?)(<\/row>)/g,
    (full, start, rowRaw, body, end) => {
      const rowNo = Number(rowRaw);
      const barcode = replacements.get(rowNo);
      if (!barcode) return full;
      count++;
      return start + setBarcodeCell(body, inspected.barcodeCol, rowNo, barcode) + end;
    });
  guard(count === replacements.size, 'Nem sikerült minden megfelelő Excel-cellát megtalálni.');
  return packZip(inspected.archive, new Map([[inspected.sheetPath, Buffer.from(updatedXml, 'utf8')]]));
}

function packZip(archive, replacements) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const item of archive.entries) {
    const changed = replacements.get(item.name);
    const data = changed ? zlib.deflateRawSync(changed, { level: 6 }) : item.compressed;
    const raw = changed || null;
    const crc = raw ? crc32(raw) : item.crc;
    const uncompSize = raw ? raw.length : item.size;
    const flags = item.flags & ~0x0008;
    guard(offset + 30 + item.nameBuffer.length + item.localExtra.length + data.length < 0xffffffff,
      'A kész Excel-fájl ZIP64 méretet igényelne.');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(item.central.readUInt16LE(6), 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(changed ? 8 : item.method, 8);
    local.writeUInt16LE(item.central.readUInt16LE(12), 10);
    local.writeUInt16LE(item.central.readUInt16LE(14), 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(uncompSize, 22);
    local.writeUInt16LE(item.nameBuffer.length, 26);
    local.writeUInt16LE(item.localExtra.length, 28);
    localParts.push(local, item.nameBuffer, item.localExtra, data);
    const central = Buffer.from(item.central);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(changed ? 8 : item.method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(uncompSize, 24);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central);
    offset += local.length + item.nameBuffer.length + item.localExtra.length + data.length;
  }
  const centralLength = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(archive.entries.length, 8);
  end.writeUInt16LE(archive.entries.length, 10);
  end.writeUInt32LE(centralLength, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(archive.comment.length, 20);
  return Buffer.concat([...localParts, ...centralParts, end, archive.comment]);
}

export { XLSX_MIME };
