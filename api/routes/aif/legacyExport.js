import express from 'express';
import { inspectForitXlsx, writeForitXlsx } from './legacyExportXlsx.js';
import { chooseBarcode, collectBarcodeCandidates, parseForitCode } from './legacyExportMatch.js';

// Isolated, read-only ForIT barcode bridge.
// No product, barcode, inventory, import, or migration tables are ever modified.
export default function createAifLegacyExportRouter({ pool, requireAdminOrSecret }) {
  const router = express.Router();
  router.post('/convert', requireAdminOrSecret,
    express.raw({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'], limit: '12mb' }),
    async (req, res) => {
      let db;
      const push = event => {
        if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(event)}\n`);
      };
      try {
        if (!Buffer.isBuffer(req.body) || !req.body.length) {
          return res.status(400).json({ error: 'Válassz egy .xlsx ForIT-fájlt.' });
        }
        const nameHeader = String(req.get('X-Forit-Filename') || 'ForIT.xlsx').slice(0, 500);
        let sourceName = 'ForIT.xlsx';
        try { sourceName = decodeURIComponent(nameHeader); } catch { sourceName = nameHeader; }
        sourceName = sourceName.replace(/[\\/\x00-\x1f:*?"<>|]/g, '_').replace(/\.xlsx$/i, '').slice(0, 110) || 'ForIT';
        const workbook = inspectForitXlsx(req.body); // validate BEFORE beginning a streamed response
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();
        push({ type: 'progress', percent: 9, step: 'Excel ellenőrizve', done: 0, total: workbook.data.length });
        db = await pool.connect();
        await db.query('BEGIN READ ONLY');
        await db.query("SET LOCAL statement_timeout='45000ms'");
        push({ type: 'progress', percent: 16, step: 'Vonalkódok keresése az AllInFashion adatbázisban', done: 0, total: workbook.data.length });
        const candidates = await collectBarcodeCandidates(db, workbook.data);
        await db.query('ROLLBACK');
        db.release();
        db = null;
        push({ type: 'progress', percent: 34, step: 'Termékek párosítása', done: 0, total: workbook.data.length });
        const grouped = new Map();
        for (const candidate of candidates) {
          const key = String(candidate.productCode || '').toLowerCase();
          if (key) {
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(candidate);
          }
        }
        const legacyByCode = new Map();
        for (const candidate of candidates.filter(c => c.origin === 'legacy')) {
          for (const value of [candidate.legacyCode, candidate.internalSku]) {
            const key = String(value || '').toLowerCase();
            if (!key) continue;
            if (!legacyByCode.has(key)) legacyByCode.set(key, []);
            legacyByCode.get(key).push(candidate);
          }
        }
        const assigned = new Map();
        const problems = [];
        let existed = 0;
        let ambiguous = 0;
        let blank = 0;
        for (let i = 0; i < workbook.data.length; i++) {
          const item = workbook.data[i];
          if (item.barcode) existed++;
          else {
            const parsed = parseForitCode(item);
            const pool = [
              ...(parsed.legacyOnly ? [] : (grouped.get(parsed.supplierCode.toLowerCase()) || [])),
              ...(legacyByCode.get(parsed.code.toLowerCase()) || []),
            ];
            const match = chooseBarcode(item, pool);
            if (match.state === 'matched') assigned.set(item.rowNo, match.barcode);
            else {
              if (match.state === 'ambiguous') ambiguous++;
              else blank++;
              problems.push({ rowNo: item.rowNo, code: item.code, name: item.name.slice(0, 140), reason: match.reason });
            }
          }
          if ((i + 1) % 12 === 0 || i + 1 === workbook.data.length) {
            const done = i + 1;
            push({ type: 'progress', percent: 34 + Math.round(54 * done / workbook.data.length), step: `${done} / ${workbook.data.length} termék ellenőrizve`, done, total: workbook.data.length });
            await new Promise(resolve => setImmediate(resolve));
          }
        }
        if (!assigned.size && !existed) {
          push({ type: 'error', message: 'Egyetlen sorhoz sem találtam biztos AllInFashion-vonalkódot. A feltöltött fájlt nem módosítottam.', problems: problems.slice(0, 100) });
          return res.end();
        }
        push({ type: 'progress', percent: 94, step: 'Eredeti Excel-formátum megőrzése és kitöltése', done: workbook.data.length, total: workbook.data.length });
        const result = writeForitXlsx(workbook, assigned);
        // byte-identical ZIP member contents outside the sole worksheet; no new worksheet/column/format.
        push({ type: 'result', percent: 100, step: 'Letölthető', fileName: `${sourceName}_AIF_BARKODOK.xlsx`,
          base64: result.toString('base64'), count: workbook.data.length, filled: assigned.size,
          existing: existed, missing: blank, ambiguous, problems: problems.slice(0, 200) });
        res.end();
      } catch (error) {
        if (db) { try { await db.query('ROLLBACK'); } catch {} }
        const message = error?.statusCode === 422 ? error.message : 'A ForIT-export nem sikerült. A forrásfájlt nem változtattuk meg.';
        console.error('AIF legacy ForIT export:', error);
        if (!res.headersSent) return res.status(error?.statusCode === 422 ? 422 : 500).json({ error: message });
        push({ type: 'error', message });
        res.end();
      } finally {
        if (db) db.release();
      }
    });
  return router;
}
