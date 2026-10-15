import express from 'express';
import { inspectForitXlsx, writeForitXlsx, verifyForitXlsx } from './legacyExportXlsx.js';
import {
  FORIT_EXPORT_VERSION, chooseBarcode, collectBarcodeCandidates,
  indexBarcodeCandidates, findBarcodeConflicts,
} from './legacyExportMatch.js';

// Only SELECTs inside a read-only transaction. No product/import/inventory writes.
export default function createAifLegacyExportRouter({ pool, requireAdminOrSecret }) {
  const router = express.Router();
  router.post('/convert', requireAdminOrSecret,
    express.raw({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'], limit: '12mb' }),
    async (req, res) => {
      let db;
      const push = event => {
        if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify({ version: FORIT_EXPORT_VERSION, ...event })}\n`);
      };
      try {
        if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Válassz egy .xlsx ForIT-fájlt.' });
        const nameHeader = String(req.get('X-Forit-Filename') || 'ForIT.xlsx').slice(0, 500);
        let sourceName;
        try { sourceName = decodeURIComponent(nameHeader); } catch { sourceName = nameHeader; }
        sourceName = sourceName.replace(/[\\/\x00-\x1f:*?"<>|]/g, '_').replace(/\.xlsx$/i, '')
          .replace(/_AIF_BARKODOK(?:_\d+)?$/i, '').slice(0, 100) || 'ForIT';
        const workbook = inspectForitXlsx(req.body);
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('X-Forit-Export-Version', FORIT_EXPORT_VERSION);
        res.flushHeaders?.();
        push({ type: 'progress', percent: 9, step: 'Excel ellenőrizve', done: 0, total: workbook.data.length });
        db = await pool.connect();
        await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await db.query("SET LOCAL statement_timeout='45000ms'");
        push({ type: 'progress', percent: 16, step: 'Teljes terméknév, cikkszám, szín, méret és mentett árak beolvasása', done: 0, total: workbook.data.length });
        const candidates = await collectBarcodeCandidates(db, workbook.data);
        const candidatesFor = indexBarcodeCandidates(candidates);
        const matches = new Map(), failed = new Map();
        let existing = 0;
        for (let i = 0; i < workbook.data.length; i++) {
          if (res.destroyed) throw Object.assign(new Error('Client disconnected'), { code: 'client_closed' });
          const item = workbook.data[i];
          if (item.barcode) existing++;
          else if (item.barcodeFormula) failed.set(item.rowNo, {
            state: 'missing', reasonCode: 'formula_protected', reason: 'A Codbare-cella képletet tartalmaz. A képletet nem írom felül.',
          });
          else {
            const match = chooseBarcode(item, candidatesFor(item));
            if (match.state === 'matched') matches.set(item.rowNo, match);
            else failed.set(item.rowNo, match);
          }
          if ((i + 1) % 12 === 0 || i + 1 === workbook.data.length) {
            const done = i + 1;
            push({ type: 'progress', percent: 32 + Math.round(49 * done / workbook.data.length),
              step: `${done} / ${workbook.data.length} termék ellenőrizve`, done, total: workbook.data.length });
            await new Promise(resolve => setImmediate(resolve));
          }
        }
        push({ type: 'progress', percent: 85, step: 'Vonalkód-ütközések ellenőrzése', done: workbook.data.length, total: workbook.data.length });
        const conflicts = await findBarcodeConflicts(db, matches);
        for (const [rowNo, problem] of conflicts) { matches.delete(rowNo); failed.set(rowNo, problem); }
        await db.query('ROLLBACK');
        db.release();
        db = null;
        const assigned = new Map([...matches].map(([rowNo, match]) => [rowNo, match.barcode]));
        const problems = [], filledRows = [];
        const sourceCounts = { variant: 0, supplier: 0, import: 0 };
        let missing = 0, ambiguous = 0;
        for (const item of workbook.data) {
          const match = matches.get(item.rowNo), problem = failed.get(item.rowNo);
          if (match) {
            sourceCounts[match.barcodeSource]++;
            filledRows.push({ rowNo: item.rowNo, cell: `${workbook.barcodeCol}${item.rowNo}`,
              code: item.code, name: item.name, barcode: match.barcode, source: match.barcodeSource,
              variantId: match.variantId, matchMethod: match.matchMethod, matchFields: match.matchFields,
              resolvedAmbiguity: match.resolvedAmbiguity, candidateCount: match.candidateCount,
              sellPrice: item.sellPrice, buyPrice: item.buyPrice });
          }
          if (problem) {
            if (problem.state === 'ambiguous') ambiguous++; else missing++;
            problems.push({ rowNo: item.rowNo, cell: `${workbook.barcodeCol}${item.rowNo}`,
              code: item.code, name: item.name, reasonCode: problem.reasonCode, reason: problem.reason,
              sellPrice: item.sellPrice, buyPrice: item.buyPrice, category: item.category,
              gender: item.gender, material: item.material, candidates: problem.candidates || [] });
          }
        }
        if (assigned.size + existing + missing + ambiguous !== workbook.data.length) throw new Error('ForIT row totals mismatch');
        const summary = { count: workbook.data.length, filled: assigned.size, existing, missing, ambiguous,
          barcodeColumn: workbook.barcodeCol, sourceCounts,
          resolved: filledRows.filter(row => row.resolvedAmbiguity).length,
          matchColumns: workbook.matchColumns,
          problems: problems.slice(0, 200),
          filledRows: filledRows.slice(0, 200), detailsLimit: 200 };
        if (!assigned.size) {
          // A renamed copy of the input is not a successful conversion.
          push({ type: 'result', ...summary, changed: false, verified: false, downloadable: false,
            message: existing === workbook.data.length ? 'Minden Codbare-cella már ki volt töltve. Új fájl nem készült.' :
              'Nem került új vonalkód a fájlba. A kimaradás okát soronként lent találod; változatlan másolatot nem adok letöltésre.' });
          return res.end();
        }
        push({ type: 'progress', percent: 92, step: 'Codbare-cellák kitöltése az eredeti Excelben', done: workbook.data.length, total: workbook.data.length });
        const output = writeForitXlsx(workbook, assigned);
        push({ type: 'progress', percent: 97, step: 'A kész Excel visszaolvasása és ellenőrzése', done: workbook.data.length, total: workbook.data.length });
        const verified = verifyForitXlsx(workbook, output, assigned);
        const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
        push({ type: 'result', ...summary, ...verified, changed: true, downloadable: true,
          fileName: `${sourceName}_AIF_BARKODOK_${stamp}.xlsx`, base64: output.toString('base64'),
          message: `${assigned.size} új vonalkód valóban bekerült a ${workbook.barcodeCol} (Codbare) oszlopba.` });
        res.end();
      } catch (error) {
        if (db) { try { await db.query('ROLLBACK'); } catch {} }
        if (error?.code === 'client_closed' || res.destroyed) return;
        const message = error?.statusCode === 422 ? error.message : 'A ForIT-export nem sikerült. A forrásfájlt nem változtattuk meg.';
        console.error('AIF legacy ForIT export:', error);
        if (!res.headersSent) return res.status(error?.statusCode === 422 ? 422 : 500).json({ error: message, version: FORIT_EXPORT_VERSION });
        push({ type: 'error', message });
        res.end();
      } finally {
        if (db) db.release();
      }
    });
  return router;
}
