import express from "express";

export default function createAifShopIncomingRouter({
  pool,
  requireAuthed,
  ensureAifShopSalesSchema,
  aifResolveShopLocation,
  actorFrom,
  text,
  aifNumber,
  insertStockMovementSafe,
}) {
  const router = express.Router();
  let schemaPromise = null;

  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await ensureAifShopSalesSchema();
        // Régebbi adatbázisokban a receptióhoz rendelt Aviz szám még hiányozhat.
        await pool.query(`ALTER TABLE IF EXISTS aif_receptions ADD COLUMN IF NOT EXISTS aviz_number text NULL`);
        await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_shop_transfer_receipts (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          document_id uuid NOT NULL REFERENCES aif_stock_transfer_documents(id) ON DELETE CASCADE,
          document_line_id uuid NOT NULL REFERENCES aif_stock_transfer_document_lines(id) ON DELETE CASCADE,
          target_location_id uuid NOT NULL REFERENCES aif_locations(id) ON DELETE RESTRICT,
          variant_id uuid NOT NULL REFERENCES aif_product_variants(id) ON DELETE RESTRICT,
          qty integer NOT NULL CHECK (qty > 0),
          stock_applied boolean NOT NULL DEFAULT false,
          actor text NULL,
          raw jsonb NOT NULL DEFAULT '{}'::jsonb,
          received_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (document_line_id)
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_shop_transfer_receipts_location_date_idx
          ON aif_shop_transfer_receipts (target_location_id,received_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_shop_transfer_receipts_document_idx
          ON aif_shop_transfer_receipts (document_id,received_at ASC)`);
        return true;
      })().catch((error) => {
        schemaPromise = null;
        throw error;
      });
    }
    return schemaPromise;
  }

  function inventoryMode(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    return src.stockTransferInventoryMode === "in_transit_until_received"
      ? "in_transit_until_received"
      : "legacy_immediate_target_stock";
  }

  function documentResponse(row, lines = []) {
    const receivedCount = lines.filter((line) => line.received).length;
    return {
      id: String(row.id),
      documentNumber: row.document_number,
      status: row.status,
      sourceLocation: { id: row.source_location_id ? String(row.source_location_id) : "", name: row.from_location_summary || "–" },
      targetLocation: { id: row.target_location_id ? String(row.target_location_id) : "", name: row.to_location_summary || "–" },
      actor: row.actor || null,
      note: row.note || null,
      uitCode: row.uit_code || null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      closedAt: row.raw?.closedAt || null,
      inventoryMode: inventoryMode(row.raw),
      canReceive: row.status === "issued",
      fullyReceived: lines.length > 0 && receivedCount === lines.length,
      receivedCount,
      lineCount: lines.length,
      totalQty: lines.reduce((sum, line) => sum + aifNumber(line.qty), 0),
      totalValue: Math.round((aifNumber(row.total_value) + Number.EPSILON) * 100) / 100,
      currencyCode: text(row.currency_code || "RON").toUpperCase() || "RON",
      lines,
    };
  }

  function lineResponse(row) {
    return {
      id: String(row.id),
      variantId: String(row.variant_id || ""),
      lineNo: aifNumber(row.line_no),
      qty: aifNumber(row.qty),
      title: row.product_title || "Ismeretlen termék",
      productCode: row.product_code || null,
      barcode: row.barcode || null,
      brandName: row.brand_name || null,
      colorName: row.color_name || null,
      size: row.size || null,
      imageUrl: row.image_url || null,
      received: Boolean(row.receipt_id),
      receivedAt: row.received_at ? new Date(row.received_at).toISOString() : null,
      receivedBy: row.received_by || null,
      stockApplied: row.stock_applied === true,
    };
  }

  async function loadDocuments(locationId, includeReceived = false) {
    const docs = await pool.query(
      `SELECT d.*
       FROM aif_stock_transfer_documents d
       WHERE d.document_type='internal_transfer'
         AND d.target_location_id=$1::text
         AND d.status IN ('preparation','issued')
         AND NOT EXISTS (SELECT 1 FROM aif_stock_transfer_document_deletions del WHERE del.transfer_id=d.transfer_id)
       ORDER BY CASE WHEN d.status='issued' THEN 0 ELSE 1 END,d.updated_at DESC,d.created_at DESC`,
      [String(locationId)],
    );
    if (!docs.rowCount) return [];
    const ids = docs.rows.map((row) => String(row.id));
    const lines = await pool.query(
      `SELECT dl.*,r.id AS receipt_id,r.received_at,r.actor AS received_by,r.stock_applied
       FROM aif_stock_transfer_document_lines dl
       LEFT JOIN aif_shop_transfer_receipts r ON r.document_line_id=dl.id
       WHERE dl.document_id=ANY($1::uuid[])
       ORDER BY dl.document_id,dl.line_no ASC,dl.created_at ASC`,
      [ids],
    );
    const byDoc = new Map();
    for (const row of lines.rows) {
      const key = String(row.document_id);
      const arr = byDoc.get(key) || [];
      arr.push(lineResponse(row));
      byDoc.set(key, arr);
    }
    return docs.rows
      .map((row) => documentResponse(row, byDoc.get(String(row.id)) || []))
      .filter((item) => includeReceived || !item.fullyReceived);
  }

  router.get("/", requireAuthed, async (req, res) => {
    try {
      await ensureSchema();
      const location = await aifResolveShopLocation(req, pool, req.query.location);
      const items = await loadDocuments(location.id, false);
      res.json({ ok: true, location: { id: String(location.id), code: location.code, name: location.name }, items, count: items.length });
    } catch (error) {
      const status = Number(error?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "A beérkező áru nem tölthető be.", code: error?.code || null });
    }
  });

  // A dátumokat az üzlet helyi időzónájában szűrjük. Az átvétel napját
  // használjuk, nem az Aviz kiállítási vagy utólag módosított dátumát.
  function validDate(value) {
    const input = text(value);
    const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    return year >= 2000 && year <= 2100 && date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? input : null;
  }

  function historicalWhere(locationId, query, { requireRange = false } = {}) {
    const params = [String(locationId)];
    const where = [
      `r.target_location_id=$1::uuid`,
      `d.document_type='internal_transfer'`,
      `NOT EXISTS (
        SELECT 1 FROM aif_stock_transfer_document_deletions del
        WHERE del.transfer_id=d.transfer_id
      )`,
    ];
    const suppliedFrom = text(query.from);
    const suppliedTo = text(query.to);
    const month = text(query.month);
    let from = null;
    let to = null;

    if (suppliedFrom || suppliedTo || requireRange) {
      from = validDate(suppliedFrom);
      to = validDate(suppliedTo);
      if (!from || !to || from > to) {
        throw Object.assign(new Error('Érvénytelen dátumintervallum. Add meg a kezdő- és záródátumot.'), { statusCode: 400 });
      }
      params.push(from);
      where.push(`r.received_at >= ($${params.length}::date::timestamp AT TIME ZONE 'Europe/Bucharest')`);
      params.push(to);
      where.push(`r.received_at < (($${params.length}::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Europe/Bucharest')`);
    } else if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      params.push(`${month}-01`);
      where.push(`r.received_at >= ($${params.length}::date::timestamp AT TIME ZONE 'Europe/Bucharest')`);
      where.push(`r.received_at < (($${params.length}::date + INTERVAL '1 month')::timestamp AT TIME ZONE 'Europe/Bucharest')`);
    }
    return { params, where, from, to };
  }

  const historicalBrandSql = `COALESCE(NULLIF(btrim(dl.brand_name),''),NULLIF(btrim(br.name),''),'Márka nélkül')`;
  // A bizonylaton rögzített eladási árat használjuk; aktuális termékárat NEM.
  const historicalValueSql = `CASE
    WHEN dl.line_total IS NOT NULL AND dl.qty > 0 THEN round(dl.line_total::numeric * r.qty::numeric / dl.qty::numeric,2)
    WHEN dl.unit_price IS NOT NULL THEN round(dl.unit_price::numeric * r.qty::numeric,2)
    ELSE NULL END`;
  const historicalCurrencySql = `COALESCE(NULLIF(dl.currency_code,''),NULLIF(d.currency_code,''),'RON')`;

  // Bizonylat + márka szerinti szerveroldali összesítés. Egy nagy időszak
  // sem tölt le több tízezer terméksort pusztán a szűrőlista miatt.
  router.get('/history/report', requireAuthed, async (req, res) => {
    try {
      await ensureSchema();
      const location = await aifResolveShopLocation(req, pool, req.query.location);
      const { params, where, from, to } = historicalWhere(location.id, req.query, { requireRange: true });
      const result = await pool.query(
        `SELECT d.id AS document_id,d.document_number,d.document_date,
                d.from_location_summary,d.to_location_summary,d.created_at AS document_created_at,
                d.total_value AS document_total_value,d.currency_code AS document_currency_code,
                d.reception_id,rec.aviz_number AS reception_aviz_number,
                rec.invoice_number AS reception_invoice_number,rec.reception_date,
                rec.supplier_id AS reception_supplier_id,
                ${historicalBrandSql} AS brand_name,
                ${historicalCurrencySql} AS line_currency_code,
                count(*)::int AS line_count,
                COALESCE(sum(r.qty),0)::numeric AS quantity,
                round(COALESCE(sum(${historicalValueSql}),0)::numeric,2) AS selected_value,
                count(*) FILTER (WHERE dl.line_total IS NULL AND dl.unit_price IS NULL)::int AS unpriced_lines,
                min(r.received_at) AS first_received_at,
                max(r.received_at) AS last_received_at
         FROM aif_shop_transfer_receipts r
         JOIN aif_stock_transfer_documents d ON d.id=r.document_id
         JOIN aif_stock_transfer_document_lines dl ON dl.id=r.document_line_id
         LEFT JOIN aif_receptions rec ON rec.id::text=d.reception_id
         LEFT JOIN aif_product_variants v ON v.id=r.variant_id
         LEFT JOIN aif_product_models m ON m.id=v.model_id
         LEFT JOIN aif_brands br ON br.id=m.brand_id
         WHERE ${where.join(' AND ')}
         GROUP BY d.id,rec.id,${historicalBrandSql},${historicalCurrencySql}
         ORDER BY max(r.received_at) DESC,d.document_number ASC,brand_name ASC`,
        params,
      );
      const groups = result.rows.map((row) => ({
        documentId: String(row.document_id),
        documentNumber: row.document_number,
        documentDate: row.document_date ? String(row.document_date).slice(0, 10) : null,
        documentCreatedAt: row.document_created_at ? new Date(row.document_created_at).toISOString() : null,
        documentTotalValue: aifNumber(row.document_total_value),
        documentCurrencyCode: text(row.document_currency_code || 'RON').toUpperCase() || 'RON',
        sourceName: row.from_location_summary || '–',
        targetName: row.to_location_summary || '–',
        receptionId: row.reception_id ? String(row.reception_id) : null,
        receptionAvizNumber: row.reception_aviz_number || null,
        receptionInvoiceNumber: row.reception_invoice_number || null,
        receptionDate: row.reception_date ? String(row.reception_date).slice(0, 10) : null,
        brandName: row.brand_name,
        currencyCode: text(row.line_currency_code || 'RON').toUpperCase() || 'RON',
        lineCount: Number(row.line_count || 0),
        qty: aifNumber(row.quantity),
        lineValue: aifNumber(row.selected_value),
        unpricedLines: Number(row.unpriced_lines || 0),
        firstReceivedAt: row.first_received_at ? new Date(row.first_received_at).toISOString() : null,
        lastReceivedAt: row.last_received_at ? new Date(row.last_received_at).toISOString() : null,
      }));
      res.json({
        ok: true,
        location: { id: String(location.id), code: location.code, name: location.name },
        from,
        to,
        groups,
        count: groups.length,
      });
    } catch (error) {
      const status = Number(error?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || 'A beérkezési kimutatás nem tölthető be.', code: error?.code || null });
    }
  });

  // Régi klienssel kompatibilis tételes API, plusz dátum-, Aviz- és márkaszűrő.
  // A frontend csak a megnyitott bizonylat sorait kérdezi le.
  router.get('/history', requireAuthed, async (req, res) => {
    try {
      await ensureSchema();
      const location = await aifResolveShopLocation(req, pool, req.query.location);
      const { params, where, from, to } = historicalWhere(location.id, req.query);
      const documentId = text(req.query.documentId || req.query.document);
      if (documentId) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) {
          return res.status(400).json({ error: 'Érvénytelen Aviz-azonosító.' });
        }
        params.push(documentId);
        where.push(`d.id=$${params.length}::uuid`);
      }
      const brand = text(req.query.brand);
      if (brand) {
        params.push(brand);
        where.push(`lower(${historicalBrandSql})=lower($${params.length}::text)`);
      }
      const result = await pool.query(
        `SELECT r.id,r.received_at,r.actor,r.qty,r.stock_applied,
                d.id AS document_id,d.document_number,d.document_date,d.reception_id,
                d.from_location_summary,d.to_location_summary,
                d.created_at AS document_created_at,d.raw AS document_raw,
                d.total_value AS document_total_value,d.currency_code AS document_currency_code,
                rec.aviz_number AS reception_aviz_number,
                rec.invoice_number AS reception_invoice_number,rec.reception_date,
                dl.id AS line_id,dl.variant_id,dl.line_no,dl.product_title,
                dl.product_code,dl.barcode,${historicalBrandSql} AS brand_name,
                dl.color_name,dl.size,dl.image_url,dl.unit_price,
                ${historicalValueSql} AS line_total,
                ${historicalCurrencySql} AS line_currency_code
         FROM aif_shop_transfer_receipts r
         JOIN aif_stock_transfer_documents d ON d.id=r.document_id
         JOIN aif_stock_transfer_document_lines dl ON dl.id=r.document_line_id
         LEFT JOIN aif_receptions rec ON rec.id::text=d.reception_id
         LEFT JOIN aif_product_variants v ON v.id=r.variant_id
         LEFT JOIN aif_product_models m ON m.id=v.model_id
         LEFT JOIN aif_brands br ON br.id=m.brand_id
         WHERE ${where.join(' AND ')}
         ORDER BY r.received_at DESC,d.document_number,dl.line_no`,
        params,
      );
      const items = result.rows.map((row) => ({
        id: String(row.id),
        receivedAt: row.received_at ? new Date(row.received_at).toISOString() : null,
        receivedBy: row.actor || null,
        qty: aifNumber(row.qty),
        lineValue: row.line_total === null ? null : Math.round((aifNumber(row.line_total) + Number.EPSILON) * 100) / 100,
        currencyCode: text(row.line_currency_code || row.document_currency_code || 'RON').toUpperCase() || 'RON',
        stockApplied: row.stock_applied === true,
        document: {
          id: String(row.document_id),
          documentNumber: row.document_number,
          documentDate: row.document_date ? String(row.document_date).slice(0, 10) : null,
          sourceName: row.from_location_summary || '–',
          targetName: row.to_location_summary || '–',
          createdAt: row.document_created_at ? new Date(row.document_created_at).toISOString() : null,
          totalValue: Math.round((aifNumber(row.document_total_value) + Number.EPSILON) * 100) / 100,
          currencyCode: text(row.document_currency_code || 'RON').toUpperCase() || 'RON',
          inventoryMode: inventoryMode(row.document_raw),
          receptionId: row.reception_id ? String(row.reception_id) : null,
          receptionAvizNumber: row.reception_aviz_number || null,
          receptionInvoiceNumber: row.reception_invoice_number || null,
          receptionDate: row.reception_date ? String(row.reception_date).slice(0, 10) : null,
        },
        product: {
          lineId: String(row.line_id),
          variantId: String(row.variant_id || ''),
          lineNo: aifNumber(row.line_no),
          title: row.product_title || 'Ismeretlen termék',
          productCode: row.product_code || null,
          barcode: row.barcode || null,
          brandName: row.brand_name || null,
          colorName: row.color_name || null,
          size: row.size || null,
          imageUrl: row.image_url || null,
        },
      }));
      const month = text(req.query.month);
      res.json({
        ok: true,
        location: { id: String(location.id), code: location.code, name: location.name },
        month: !from && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null,
        from,
        to,
        items,
        count: items.length,
      });
    } catch (error) {
      const status = Number(error?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || 'A beérkezési előzmény nem tölthető be.', code: error?.code || null });
    }
  });

  async function receiveLine(client, { location, lineId, actor }) {
    const lineResult = await client.query(
      `SELECT dl.*,d.status AS document_status,d.document_type,d.document_number,d.transfer_id,d.target_location_id,d.source_location_id,d.from_location_summary,d.to_location_summary,d.raw AS document_raw
       FROM aif_stock_transfer_document_lines dl
       JOIN aif_stock_transfer_documents d ON d.id=dl.document_id
       WHERE dl.id::text=$1
       FOR UPDATE OF dl,d`,
      [lineId],
    );
    if (!lineResult.rowCount) throw Object.assign(new Error("Az Aviz terméksora nem található."), { statusCode: 404 });
    const line = lineResult.rows[0];
    if (line.document_type !== "internal_transfer") throw Object.assign(new Error("Ez nem üzletközi Aviz."), { statusCode: 400 });
    if (String(line.target_location_id || "") !== String(location.id)) throw Object.assign(new Error("Ez az áru nem ennek az üzletnek érkezik."), { statusCode: 403 });
    if (line.document_status !== "issued") throw Object.assign(new Error("A termék csak lezárt Aviz után vehető át."), { statusCode: 409, code: "incoming_aviz_not_closed" });

    const existing = await client.query(`SELECT * FROM aif_shop_transfer_receipts WHERE document_line_id=$1 FOR UPDATE`, [line.id]);
    if (existing.rowCount) return { duplicate: true, receipt: existing.rows[0], line };

    const mode = inventoryMode(line.document_raw);
    const qty = Number(line.qty || 0);
    let stockApplied = false;
    if (mode === "in_transit_until_received") {
      const stock = await client.query(`SELECT qty,reserved_qty FROM aif_stock WHERE location_id=$1 AND variant_id=$2 FOR UPDATE`, [location.id, line.variant_id]);
      const before = Number(stock.rows[0]?.qty || 0);
      const reserved = Number(stock.rows[0]?.reserved_qty || 0);
      const after = before + qty;
      await client.query(
        `INSERT INTO aif_stock (location_id,variant_id,qty,reserved_qty,updated_at)
         VALUES ($1,$2,$3,$4,now())
         ON CONFLICT (location_id,variant_id) DO UPDATE SET qty=$3,reserved_qty=$4,updated_at=now()`,
        [location.id, line.variant_id, after, reserved],
      );
      const logged = await insertStockMovementSafe(client, {
        movementType: "incoming",
        sourceType: "stock_transfer",
        sourcePrefix: "transfer_receive",
        fallbackSourceType: "manual_stock_edit",
        locationId: location.id,
        variantId: line.variant_id,
        qtyDelta: qty,
        qtyBefore: before,
        qtyAfter: after,
        actor,
        raw: {
          reason: "stock_transfer_received",
          transferId: line.transfer_id,
          documentId: String(line.document_id),
          documentNumber: line.document_number,
          documentLineId: String(line.id),
          fromLocationId: line.source_location_id,
          fromLocationName: line.from_location_summary,
          toLocationId: String(location.id),
          toLocationName: location.name,
          qty,
          receivedBy: actor,
        },
      });
      if (!logged) throw Object.assign(new Error("A beérkező készletmozgás naplózása nem sikerült."), { statusCode: 500 });
      stockApplied = true;
    }

    const receipt = await client.query(
      `INSERT INTO aif_shop_transfer_receipts (document_id,document_line_id,target_location_id,variant_id,qty,stock_applied,actor,raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,
      [line.document_id, line.id, location.id, line.variant_id, qty, stockApplied, actor, JSON.stringify({ inventoryMode: mode, documentNumber: line.document_number })],
    );
    return { duplicate: false, receipt: receipt.rows[0], line };
  }

  async function refreshDocumentReceiptMarker(client, documentId, actor) {
    const totals = await client.query(
      `SELECT count(dl.id)::int AS lines,count(r.id)::int AS received
       FROM aif_stock_transfer_document_lines dl
       LEFT JOIN aif_shop_transfer_receipts r ON r.document_line_id=dl.id
       WHERE dl.document_id=$1`,
      [documentId],
    );
    const lines = Number(totals.rows[0]?.lines || 0);
    const received = Number(totals.rows[0]?.received || 0);
    if (lines > 0 && received === lines) {
      await client.query(
        `UPDATE aif_stock_transfer_documents
         SET raw=COALESCE(raw,'{}'::jsonb) || $2::jsonb,updated_at=now()
         WHERE id=$1`,
        [documentId, JSON.stringify({ fullyReceivedAt: new Date().toISOString(), fullyReceivedBy: actor })],
      );
    }
    return { lines, received, fullyReceived: lines > 0 && lines === received };
  }

  router.post("/lines/:id/receive", requireAuthed, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSchema();
      const location = await aifResolveShopLocation(req, client, req.body?.location);
      const actor = actorFrom(req);
      const result = await receiveLine(client, { location, lineId: req.params.id, actor });
      const progress = await refreshDocumentReceiptMarker(client, result.line.document_id, actor);
      await client.query("COMMIT");
      res.json({ ok: true, duplicate: result.duplicate, receiptId: String(result.receipt.id), receivedAt: new Date(result.receipt.received_at).toISOString(), stockApplied: result.receipt.stock_applied === true, progress });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      const status = Number(error?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "A termék átvétele nem sikerült.", code: error?.code || null });
    } finally {
      client.release();
    }
  });

  router.post("/documents/:id/receive-all", requireAuthed, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSchema();
      const location = await aifResolveShopLocation(req, client, req.body?.location);
      const actor = actorFrom(req);
      const doc = await client.query(`SELECT * FROM aif_stock_transfer_documents WHERE id::text=$1 AND target_location_id=$2::text FOR UPDATE`, [req.params.id, String(location.id)]);
      if (!doc.rowCount) throw Object.assign(new Error("Az Aviz nem található ennél az üzletnél."), { statusCode: 404 });
      if (doc.rows[0].status !== "issued") throw Object.assign(new Error("Az összes tétel csak lezárt Aviz után vehető át."), { statusCode: 409, code: "incoming_aviz_not_closed" });
      const lines = await client.query(`SELECT id FROM aif_stock_transfer_document_lines WHERE document_id=$1 ORDER BY line_no FOR UPDATE`, [doc.rows[0].id]);
      let received = 0;
      let duplicates = 0;
      for (const line of lines.rows) {
        const result = await receiveLine(client, { location, lineId: line.id, actor });
        if (result.duplicate) duplicates += 1; else received += 1;
      }
      const progress = await refreshDocumentReceiptMarker(client, doc.rows[0].id, actor);
      await client.query("COMMIT");
      res.json({ ok: true, received, duplicates, progress });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      const status = Number(error?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "Az Aviz átvétele nem sikerült.", code: error?.code || null });
    } finally {
      client.release();
    }
  });

  return router;
}
