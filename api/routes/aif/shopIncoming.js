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

  router.get("/history", requireAuthed, async (req, res) => {
    try {
      await ensureSchema();
      const location = await aifResolveShopLocation(req, pool, req.query.location);
      const month = text(req.query.month);
      const args = [location.id];
      let monthWhere = "";
      if (/^\d{4}-\d{2}$/.test(month)) {
        args.push(`${month}-01`);
        monthWhere = ` AND r.received_at >= $2::date AND r.received_at < ($2::date + interval '1 month')`;
      }
      const result = await pool.query(
        `SELECT r.id,r.received_at,r.actor,r.qty,r.stock_applied,
                d.id AS document_id,d.document_number,d.from_location_summary,d.to_location_summary,d.created_at AS document_created_at,d.raw AS document_raw,
                dl.id AS line_id,dl.variant_id,dl.line_no,dl.product_title,dl.product_code,dl.barcode,dl.brand_name,dl.color_name,dl.size,dl.image_url
         FROM aif_shop_transfer_receipts r
         JOIN aif_stock_transfer_documents d ON d.id=r.document_id
         JOIN aif_stock_transfer_document_lines dl ON dl.id=r.document_line_id
         WHERE r.target_location_id=$1 ${monthWhere}
         ORDER BY r.received_at DESC,d.document_number,dl.line_no`,
        args,
      );
      const items = result.rows.map((row) => ({
        id: String(row.id),
        receivedAt: row.received_at ? new Date(row.received_at).toISOString() : null,
        receivedBy: row.actor || null,
        qty: aifNumber(row.qty),
        stockApplied: row.stock_applied === true,
        document: {
          id: String(row.document_id),
          documentNumber: row.document_number,
          sourceName: row.from_location_summary || "–",
          targetName: row.to_location_summary || "–",
          createdAt: row.document_created_at ? new Date(row.document_created_at).toISOString() : null,
          inventoryMode: inventoryMode(row.document_raw),
        },
        product: {
          lineId: String(row.line_id),
          variantId: String(row.variant_id || ""),
          lineNo: aifNumber(row.line_no),
          title: row.product_title || "Ismeretlen termék",
          productCode: row.product_code || null,
          barcode: row.barcode || null,
          brandName: row.brand_name || null,
          colorName: row.color_name || null,
          size: row.size || null,
          imageUrl: row.image_url || null,
        },
      }));
      res.json({ ok: true, location: { id: String(location.id), code: location.code, name: location.name }, month: /^\d{4}-\d{2}$/.test(month) ? month : null, items, count: items.length });
    } catch (error) {
      const status = Number(error?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "A beérkezési előzmény nem tölthető be.", code: error?.code || null });
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
