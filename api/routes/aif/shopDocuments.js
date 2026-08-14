import express from "express";
import { createAifShopProofPdf } from "../../lib/aifShopDocumentPdf.js";

export default function createAifShopDocumentsRouter({
  pool,
  requireAuthed,
  ensureAifShopSalesSchema,
  aifResolveShopLocation,
  actorFrom,
  text,
  normCode,
  aifNumber,
  aifRoundMoney,
  aifBucharestIsoDate,
  aifValidIsoDate,
  aifInclusiveDayCount,
}) {
  const router = express.Router();
  let schemaPromise = null;

  const employeeKey = (value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("hu-HU");
  const iso = (value, fallback = "") => aifValidIsoDate(value, fallback);

  async function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await ensureAifShopSalesSchema();
        await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_shop_document_settings (
          id smallint PRIMARY KEY DEFAULT 1 CHECK (id=1),
          series text NOT NULL DEFAULT 'BIZ',
          next_number bigint NOT NULL DEFAULT 1 CHECK (next_number > 0),
          digits integer NOT NULL DEFAULT 6 CHECK (digits BETWEEN 3 AND 10),
          include_year boolean NOT NULL DEFAULT true,
          yearly_reset boolean NOT NULL DEFAULT true,
          sequence_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer,
          updated_at timestamptz NOT NULL DEFAULT now()
        )`);
        await pool.query(`INSERT INTO aif_shop_document_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_shop_proof_documents (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          source_type text NOT NULL CHECK (source_type IN ('cash_movement','shift_handover','day_closure')),
          source_id uuid NOT NULL,
          document_number text NOT NULL UNIQUE,
          location_id uuid NOT NULL REFERENCES aif_locations(id) ON DELETE RESTRICT,
          employee_name text NULL,
          snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          created_by text NULL,
          UNIQUE (source_type, source_id)
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_shop_proof_documents_location_created_idx
          ON aif_shop_proof_documents (location_id, created_at DESC)`);
        return true;
      })().catch((error) => {
        schemaPromise = null;
        throw error;
      });
    }
    return schemaPromise;
  }

  async function resolveEmployee(req) {
    const role = normCode(req.session?.role);
    if (role === "shop") return actorFrom(req);
    return text(req.query.employee || req.query.actor || actorFrom(req));
  }

  function validPeriod(req) {
    const today = aifBucharestIsoDate();
    const defaultFrom = `${today.slice(0, 7)}-01`;
    const from = iso(req.query.from, defaultFrom);
    const to = iso(req.query.to, today);
    if (!from || !to || from > to) {
      const error = new Error("Érvénytelen időszak.");
      error.statusCode = 400;
      throw error;
    }
    const days = aifInclusiveDayCount(from, to);
    if (days > 370) {
      const error = new Error("Egyszerre legfeljebb 370 nap kérhető le.");
      error.statusCode = 400;
      throw error;
    }
    return { from, to, days };
  }

  function amount(row, key) {
    return aifRoundMoney(row?.[key] || 0);
  }

  async function relationExists(name) {
    const result = await pool.query(`SELECT to_regclass($1) AS name`, [`public.${name}`]);
    return Boolean(result.rows[0]?.name);
  }

  router.get("/overview", requireAuthed, async (req, res) => {
    try {
      await ensureSchema();
      const location = await aifResolveShopLocation(req, pool, req.query.location);
      const employee = await resolveEmployee(req);
      if (!employee) return res.status(400).json({ error: "Az eladó nem azonosítható." });
      const period = validPeriod(req);
      const actorPattern = employeeKey(employee);

      const salesResult = await pool.query(
        `SELECT
           s.id, s.sale_number, s.sold_at, s.status, s.sale_type, s.payment_status,
           s.subtotal, s.discount_total, s.total, s.paid_total, s.balance_due,
           s.customer_name, s.customer_phone, s.note,
           COALESCE(lines.items, '[]'::jsonb) AS lines,
           COALESCE(lines.item_count,0)::numeric AS item_count
         FROM aif_shop_sales s
         LEFT JOIN LATERAL (
           SELECT
             COALESCE(sum(sl.quantity),0)::numeric AS item_count,
             jsonb_agg(
               jsonb_build_object(
                 'id', sl.id::text,
                 'lineNo', sl.line_no,
                 'variantId', sl.variant_id::text,
                 'title', sl.product_title,
                 'productCode', sl.product_code,
                 'barcode', sl.barcode,
                 'brandName', sl.brand_name,
                 'subcategoryName', sl.subcategory_name,
                 'colorName', sl.color_name,
                 'size', sl.size,
                 'imageUrl', sl.image_url,
                 'quantity', sl.quantity,
                 'unitPrice', sl.unit_price,
                 'lineTotal', sl.line_total,
                 'discountAmount', sl.discount_amount
               )
               ORDER BY sl.line_no
             ) AS items
           FROM aif_shop_sale_lines sl
           WHERE sl.sale_id=s.id
         ) lines ON true
         WHERE s.location_id=$1
           AND s.status='completed'
           AND lower(regexp_replace(btrim(s.actor),'[[:space:]]+',' ','g'))=$2
           AND (s.sold_at AT TIME ZONE 'Europe/Bucharest')::date BETWEEN $3::date AND $4::date
         ORDER BY s.sold_at DESC`,
        [location.id, actorPattern, period.from, period.to]
      );

      const exchangesResult = await pool.query(
        `SELECT
           e.id, e.exchange_number, e.created_at, e.returned_qty, e.return_credit,
           e.replacement_total, e.difference, e.settlement_direction, e.settlement_method,
           e.settlement_amount, e.customer_name, e.note,
           COALESCE(lines.items,'[]'::jsonb) AS replacement_lines,
           COALESCE(lines.qty,0)::numeric AS replacement_qty
         FROM aif_shop_exchanges e
         LEFT JOIN LATERAL (
           SELECT
             COALESCE(sum(el.quantity),0)::numeric AS qty,
             jsonb_agg(
               jsonb_build_object(
                 'id',el.id::text,
                 'title',el.product_title,
                 'productCode',el.product_code,
                 'barcode',el.barcode,
                 'brandName',el.brand_name,
                 'colorName',el.color_name,
                 'size',el.size,
                 'imageUrl',el.image_url,
                 'quantity',el.quantity,
                 'unitPrice',el.unit_price,
                 'lineTotal',el.line_total
               ) ORDER BY el.line_no
             ) AS items
           FROM aif_shop_exchange_lines el
           WHERE el.exchange_id=e.id
         ) lines ON true
         WHERE e.location_id=$1
           AND e.status='completed'
           AND lower(regexp_replace(btrim(e.actor),'[[:space:]]+',' ','g'))=$2
           AND (e.created_at AT TIME ZONE 'Europe/Bucharest')::date BETWEEN $3::date AND $4::date
         ORDER BY e.created_at DESC`,
        [location.id, actorPattern, period.from, period.to]
      );

      const cashResult = await pool.query(
        `SELECT m.*
         FROM aif_shop_cash_movements m
         WHERE m.location_id=$1
           AND (
             lower(regexp_replace(btrim(COALESCE(m.requested_by,'')),'[[:space:]]+',' ','g'))=$2
             OR lower(regexp_replace(btrim(COALESCE(m.confirmed_by,'')),'[[:space:]]+',' ','g'))=$2
           )
           AND (m.requested_at AT TIME ZONE 'Europe/Bucharest')::date BETWEEN $3::date AND $4::date
         ORDER BY m.requested_at DESC`,
        [location.id, actorPattern, period.from, period.to]
      );

      const shiftsResult = await pool.query(
        `SELECT h.*, h.work_date::text AS work_date_text
         FROM aif_shop_shift_handovers h
         WHERE h.location_id=$1
           AND (
             lower(regexp_replace(btrim(h.from_actor),'[[:space:]]+',' ','g'))=$2
             OR lower(regexp_replace(btrim(h.to_actor),'[[:space:]]+',' ','g'))=$2
           )
           AND h.work_date BETWEEN $3::date AND $4::date
         ORDER BY h.work_date DESC, h.created_at DESC`,
        [location.id, actorPattern, period.from, period.to]
      );

      const closuresResult = await pool.query(
        `SELECT c.*, c.work_date::text AS work_date_text
         FROM aif_shop_day_closures c
         WHERE c.location_id=$1
           AND lower(regexp_replace(btrim(c.actor),'[[:space:]]+',' ','g'))=$2
           AND c.work_date BETWEEN $3::date AND $4::date
         ORDER BY c.work_date DESC, c.closed_at DESC`,
        [location.id, actorPattern, period.from, period.to]
      );

      let incoming = [];
      if (await relationExists("aif_shop_transfer_receipts")) {
        const incomingResult = await pool.query(
          `SELECT
             r.id, r.received_at, r.actor, r.qty, r.stock_applied,
             d.document_number,
             d.from_location_summary, d.to_location_summary,
             dl.product_title, dl.product_code, dl.barcode, dl.brand_name, dl.color_name, dl.size, dl.image_url
           FROM aif_shop_transfer_receipts r
           JOIN aif_stock_transfer_documents d ON d.id=r.document_id
           JOIN aif_stock_transfer_document_lines dl ON dl.id=r.document_line_id
           WHERE r.target_location_id=$1
             AND lower(regexp_replace(btrim(COALESCE(r.actor,'')),'[[:space:]]+',' ','g'))=$2
             AND (r.received_at AT TIME ZONE 'Europe/Bucharest')::date BETWEEN $3::date AND $4::date
           ORDER BY r.received_at DESC`,
          [location.id, actorPattern, period.from, period.to]
        );
        incoming = incomingResult.rows.map((row) => ({
          id: String(row.id),
          receivedAt: row.received_at ? new Date(row.received_at).toISOString() : null,
          qty: aifNumber(row.qty),
          stockApplied: row.stock_applied === true,
          documentNumber: row.document_number,
          sourceName: row.from_location_summary || "-",
          targetName: row.to_location_summary || "-",
          product: {
            title: row.product_title || "Ismeretlen termék",
            productCode: row.product_code || null,
            barcode: row.barcode || null,
            brandName: row.brand_name || null,
            colorName: row.color_name || null,
            size: row.size || null,
            imageUrl: row.image_url || null,
          },
        }));
      }

      let vacations = [];
      if (await relationExists("allin_time_off_requests")) {
        const vacationResult = await pool.query(
          `SELECT
             id, kind, day_from::text AS day_from, day_to::text AS day_to,
             hours_off, note, status, requested_at, decided_at, decided_by, decision_note
           FROM allin_time_off_requests
           WHERE lower(regexp_replace(btrim(employee_name),'[[:space:]]+',' ','g'))=$1
             AND (requested_at AT TIME ZONE 'Europe/Bucharest')::date BETWEEN $2::date AND $3::date
           ORDER BY requested_at DESC`,
          [actorPattern, period.from, period.to]
        );
        vacations = vacationResult.rows.map((row) => ({
          id: String(row.id),
          kind: row.kind,
          dayFrom: row.day_from,
          dayTo: row.day_to,
          hoursOff: row.hours_off === null ? null : aifNumber(row.hours_off),
          note: row.note || null,
          status: row.status,
          requestedAt: row.requested_at ? new Date(row.requested_at).toISOString() : null,
          decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : null,
          decidedBy: row.decided_by || null,
          decisionNote: row.decision_note || null,
        }));
      }

      const sales = salesResult.rows.map((row) => ({
        id: String(row.id),
        saleNumber: row.sale_number,
        soldAt: row.sold_at ? new Date(row.sold_at).toISOString() : null,
        saleType: row.sale_type,
        paymentStatus: row.payment_status,
        subtotal: amount(row, "subtotal"),
        discountTotal: amount(row, "discount_total"),
        total: amount(row, "total"),
        paidTotal: amount(row, "paid_total"),
        balanceDue: amount(row, "balance_due"),
        customerName: row.customer_name || null,
        customerPhone: row.customer_phone || null,
        note: row.note || null,
        itemCount: aifNumber(row.item_count),
        lines: Array.isArray(row.lines) ? row.lines : [],
      }));

      const exchanges = exchangesResult.rows.map((row) => ({
        id: String(row.id),
        exchangeNumber: row.exchange_number,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        returnedQty: aifNumber(row.returned_qty),
        returnCredit: amount(row, "return_credit"),
        replacementTotal: amount(row, "replacement_total"),
        difference: amount(row, "difference"),
        settlementDirection: row.settlement_direction,
        settlementMethod: row.settlement_method || null,
        settlementAmount: amount(row, "settlement_amount"),
        customerName: row.customer_name || null,
        note: row.note || null,
        replacementQty: aifNumber(row.replacement_qty),
        replacementLines: Array.isArray(row.replacement_lines) ? row.replacement_lines : [],
      }));

      const cashMovements = cashResult.rows.map((row) => ({
        id: String(row.id),
        type: row.movement_type,
        status: row.status,
        amount: amount(row, "amount"),
        requestedBy: row.requested_by,
        requestedAt: row.requested_at ? new Date(row.requested_at).toISOString() : null,
        reference: row.reference || null,
        note: row.note || null,
        confirmedBy: row.confirmed_by || null,
        confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
        effectiveAt: row.effective_at ? new Date(row.effective_at).toISOString() : null,
        pdfAvailable: row.status === "confirmed",
      }));

      const shiftHandovers = shiftsResult.rows.map((row) => ({
        id: String(row.id),
        date: row.work_date_text || null,
        status: row.status,
        fromActor: row.from_actor,
        toActor: row.to_actor,
        shiftStartAt: row.shift_start_at ? new Date(row.shift_start_at).toISOString() : null,
        cutoffAt: row.cutoff_at ? new Date(row.cutoff_at).toISOString() : null,
        expectedCash: amount(row, "expected_cash"),
        countedCash: row.counted_cash == null ? null : amount(row, "counted_cash"),
        cashDifference: row.cash_difference == null ? null : amount(row, "cash_difference"),
        note: row.note || null,
        acceptanceNote: row.acceptance_note || null,
        snapshot: row.snapshot || {},
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        acceptedAt: row.accepted_at ? new Date(row.accepted_at).toISOString() : null,
        acceptedBy: row.accepted_by || null,
        pdfAvailable: row.status === "accepted",
      }));

      const dayClosures = closuresResult.rows.map((row) => ({
        id: String(row.id),
        date: row.work_date_text || null,
        actor: row.actor,
        expectedCash: amount(row, "expected_cash"),
        countedCash: amount(row, "counted_cash"),
        cashDifference: amount(row, "cash_difference"),
        note: row.note || null,
        closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : null,
        pdfAvailable: true,
      }));

      const normalRevenue = sales.reduce((sum, item) => sum + item.total, 0);
      const exchangeNet = exchanges.reduce((sum, item) => {
        if (item.settlementDirection === "in") return sum + item.settlementAmount;
        if (item.settlementDirection === "out") return sum - item.settlementAmount;
        return sum;
      }, 0);
      const salesItems = sales.reduce((sum, item) => sum + item.itemCount, 0);
      const exchangeItems = exchanges.reduce((sum, item) => sum + item.replacementQty - item.returnedQty, 0);
      const discountTotal = sales.reduce((sum, item) => sum + item.discountTotal, 0);

      const trendResult = await pool.query(
        `WITH days AS (
           SELECT generate_series($3::date,$4::date,interval '1 day')::date AS day
         ),
         sales AS (
           SELECT
             (s.sold_at AT TIME ZONE 'Europe/Bucharest')::date AS day,
             COALESCE(sum(s.total),0)::numeric AS revenue,
             count(*)::int AS transactions,
             COALESCE(sum(lines.qty),0)::numeric AS items
           FROM aif_shop_sales s
           LEFT JOIN LATERAL (
             SELECT COALESCE(sum(sl.quantity),0)::numeric AS qty
             FROM aif_shop_sale_lines sl
             WHERE sl.sale_id=s.id
           ) lines ON true
           WHERE s.location_id=$1 AND s.status='completed'
             AND lower(regexp_replace(btrim(s.actor),'[[:space:]]+',' ','g'))=$2
             AND (s.sold_at AT TIME ZONE 'Europe/Bucharest')::date BETWEEN $3::date AND $4::date
           GROUP BY 1
         ),
         exchanges AS (
           SELECT
             (e.created_at AT TIME ZONE 'Europe/Bucharest')::date AS day,
             COALESCE(sum(CASE
               WHEN e.settlement_direction='in' THEN e.settlement_amount
               WHEN e.settlement_direction='out' THEN -e.settlement_amount
               ELSE 0 END),0)::numeric AS revenue,
             count(*)::int AS transactions,
             COALESCE(sum(COALESCE(lines.qty,0)-e.returned_qty),0)::numeric AS items
           FROM aif_shop_exchanges e
           LEFT JOIN LATERAL (
             SELECT COALESCE(sum(el.quantity),0)::numeric AS qty
             FROM aif_shop_exchange_lines el
             WHERE el.exchange_id=e.id
           ) lines ON true
           WHERE e.location_id=$1 AND e.status='completed'
             AND lower(regexp_replace(btrim(e.actor),'[[:space:]]+',' ','g'))=$2
             AND (e.created_at AT TIME ZONE 'Europe/Bucharest')::date BETWEEN $3::date AND $4::date
           GROUP BY 1
         )
         SELECT
           d.day::text AS day,
           COALESCE(s.revenue,0)+COALESCE(e.revenue,0) AS revenue,
           COALESCE(s.transactions,0)+COALESCE(e.transactions,0) AS transactions,
           COALESCE(s.items,0)+COALESCE(e.items,0) AS items
         FROM days d
         LEFT JOIN sales s ON s.day=d.day
         LEFT JOIN exchanges e ON e.day=d.day
         ORDER BY d.day`,
        [location.id, actorPattern, period.from, period.to]
      );

      const evidenceCount =
        sales.length + exchanges.length + cashMovements.length + shiftHandovers.length +
        dayClosures.length + incoming.length + vacations.length;

      return res.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        employee,
        location: { id: String(location.id), code: location.code, name: location.name },
        period,
        summary: {
          revenue: aifRoundMoney(normalRevenue + exchangeNet),
          normalRevenue: aifRoundMoney(normalRevenue),
          exchangeNet: aifRoundMoney(exchangeNet),
          transactions: sales.length + exchanges.length,
          itemsSold: aifNumber(salesItems + exchangeItems),
          discountTotal: aifRoundMoney(discountTotal),
          evidenceCount,
          cashHandedOver: aifRoundMoney(cashMovements
            .filter((item) => item.type === "manager_handover" && item.status === "confirmed" && employeeKey(item.requestedBy) === actorPattern)
            .reduce((sum, item) => sum + item.amount, 0)),
          incomingQty: aifNumber(incoming.reduce((sum, item) => sum + item.qty, 0)),
        },
        trend: trendResult.rows.map((row) => ({
          date: row.day,
          revenue: amount(row, "revenue"),
          transactions: aifNumber(row.transactions),
          itemsSold: aifNumber(row.items),
        })),
        sales,
        exchanges,
        cashMovements,
        shiftHandovers,
        dayClosures,
        incoming,
        vacations,
      });
    } catch (error) {
      console.error("AIF shop documents overview failed", error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A bizonylati központ nem tölthető be.",
        code: error?.code || null,
      });
    }
  });

  async function allocateDocumentNumber(client) {
    const yearResult = await client.query(`SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer AS year`);
    const year = Number(yearResult.rows[0]?.year || new Date().getFullYear());
    const locked = await client.query(`SELECT * FROM aif_shop_document_settings WHERE id=1 FOR UPDATE`);
    const row = locked.rows[0] || {};
    let next = Math.max(1, Number(row.next_number || 1));
    let sequenceYear = Number(row.sequence_year || year);
    if (row.yearly_reset !== false && sequenceYear !== year) {
      next = 1;
      sequenceYear = year;
    }
    const digits = Math.min(10, Math.max(3, Number(row.digits || 6)));
    const series = text(row.series || "BIZ").toUpperCase().replace(/[^A-Z0-9_-]+/g, "") || "BIZ";
    const number = row.include_year === false
      ? `${series}/${String(next).padStart(digits, "0")}`
      : `${series}/${sequenceYear}/${String(next).padStart(digits, "0")}`;
    await client.query(
      `UPDATE aif_shop_document_settings
       SET next_number=$1,sequence_year=$2,updated_at=now()
       WHERE id=1`,
      [next + 1, sequenceYear]
    );
    return number;
  }

  async function getOrCreateProof(client, { sourceType, sourceId, locationId, employee, snapshot, createdBy }) {
    const existing = await client.query(
      `SELECT * FROM aif_shop_proof_documents WHERE source_type=$1 AND source_id=$2::uuid LIMIT 1`,
      [sourceType, sourceId]
    );
    if (existing.rowCount) return existing.rows[0];
    const number = await allocateDocumentNumber(client);
    const inserted = await client.query(
      `INSERT INTO aif_shop_proof_documents (
         source_type,source_id,document_number,location_id,employee_name,snapshot,created_by
       ) VALUES ($1,$2::uuid,$3,$4,$5,$6::jsonb,$7)
       RETURNING *`,
      [sourceType, sourceId, number, locationId, employee || null, JSON.stringify(snapshot || {}), createdBy || null]
    );
    return inserted.rows[0];
  }

  async function proofSource(req, kind, id, location, employee) {
    if (kind === "cash_movement") {
      const result = await pool.query(
        `SELECT m.*, l.name AS location_name
         FROM aif_shop_cash_movements m
         JOIN aif_locations l ON l.id=m.location_id
         WHERE m.id::text=$1 AND m.location_id=$2 LIMIT 1`,
        [id, location.id]
      );
      if (!result.rowCount) return null;
      const row = result.rows[0];
      if (row.status !== "confirmed") {
        const error = new Error("PDF csak visszaigazolt pénzmozgásról készíthető.");
        error.statusCode = 409;
        throw error;
      }
      if (normCode(req.session?.role) === "shop" && employeeKey(row.requested_by) !== employeeKey(employee) && employeeKey(row.confirmed_by) !== employeeKey(employee)) {
        const error = new Error("Ez a pénzmozgás nem a te bizonylatod.");
        error.statusCode = 403;
        throw error;
      }
      return {
        sourceType: "cash_movement",
        locationId: row.location_id,
        employee: row.requested_by,
        snapshot: {
          movementType: row.movement_type,
          status: row.status,
          amount: aifRoundMoney(row.amount),
          requestedBy: row.requested_by,
          requestedAt: row.requested_at ? new Date(row.requested_at).toISOString() : null,
          confirmedBy: row.confirmed_by || null,
          confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
          effectiveAt: row.effective_at ? new Date(row.effective_at).toISOString() : null,
          reference: row.reference || null,
          note: row.note || null,
          locationName: row.location_name,
        },
      };
    }

    if (kind === "shift_handover") {
      const result = await pool.query(
        `SELECT h.*, h.work_date::text AS work_date_text, l.name AS location_name
         FROM aif_shop_shift_handovers h
         JOIN aif_locations l ON l.id=h.location_id
         WHERE h.id::text=$1 AND h.location_id=$2 LIMIT 1`,
        [id, location.id]
      );
      if (!result.rowCount) return null;
      const row = result.rows[0];
      if (row.status !== "accepted") {
        const error = new Error("PDF csak elfogadott műszakátadásról készíthető.");
        error.statusCode = 409;
        throw error;
      }
      if (normCode(req.session?.role) === "shop" && employeeKey(row.from_actor) !== employeeKey(employee) && employeeKey(row.to_actor) !== employeeKey(employee)) {
        const error = new Error("Ez a műszakátadás nem a te bizonylatod.");
        error.statusCode = 403;
        throw error;
      }
      return {
        sourceType: "shift_handover",
        locationId: row.location_id,
        employee: employee,
        snapshot: {
          status: row.status,
          workDate: row.work_date_text || null,
          fromActor: row.from_actor,
          toActor: row.to_actor,
          shiftStartAt: row.shift_start_at ? new Date(row.shift_start_at).toISOString() : null,
          cutoffAt: row.cutoff_at ? new Date(row.cutoff_at).toISOString() : null,
          expectedCash: aifRoundMoney(row.expected_cash),
          countedCash: aifRoundMoney(row.counted_cash),
          cashDifference: aifRoundMoney(row.cash_difference),
          acceptedAt: row.accepted_at ? new Date(row.accepted_at).toISOString() : null,
          acceptedBy: row.accepted_by || null,
          note: row.note || null,
          acceptanceNote: row.acceptance_note || null,
          snapshot: row.snapshot || {},
          locationName: row.location_name,
        },
      };
    }

    if (kind === "day_closure") {
      const result = await pool.query(
        `SELECT c.*, c.work_date::text AS work_date_text, l.name AS location_name
         FROM aif_shop_day_closures c
         JOIN aif_locations l ON l.id=c.location_id
         WHERE c.id::text=$1 AND c.location_id=$2 LIMIT 1`,
        [id, location.id]
      );
      if (!result.rowCount) return null;
      const row = result.rows[0];
      if (normCode(req.session?.role) === "shop" && employeeKey(row.actor) !== employeeKey(employee)) {
        const error = new Error("Ez a napi zárás nem a te bizonylatod.");
        error.statusCode = 403;
        throw error;
      }
      return {
        sourceType: "day_closure",
        locationId: row.location_id,
        employee: row.actor,
        snapshot: {
          workDate: row.work_date_text || null,
          actor: row.actor,
          expectedCash: aifRoundMoney(row.expected_cash),
          countedCash: aifRoundMoney(row.counted_cash),
          cashDifference: aifRoundMoney(row.cash_difference),
          note: row.note || null,
          closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : null,
          locationName: row.location_name,
        },
      };
    }

    const error = new Error("Ismeretlen bizonylattípus.");
    error.statusCode = 400;
    throw error;
  }

  router.get("/proof/:kind/:id.pdf", requireAuthed, async (req, res) => {
    const kind = text(req.params.kind);
    const id = text(req.params.id);
    const allowed = new Set(["cash_movement", "shift_handover", "day_closure"]);
    if (!allowed.has(kind) || !/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({ error: "Érvénytelen bizonylat." });
    }

    const client = await pool.connect();
    try {
      await ensureSchema();
      const location = await aifResolveShopLocation(req, client, req.query.location);
      const employee = await resolveEmployee(req);
      const source = await proofSource(req, kind, id, location, employee);
      if (!source) return res.status(404).json({ error: "A bizonylat alapjául szolgáló rekord nem található." });

      await client.query("BEGIN");
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`aif_shop_proof:${kind}:${id}`]);
      const proof = await getOrCreateProof(client, {
        sourceType: source.sourceType,
        sourceId: id,
        locationId: source.locationId,
        employee: source.employee,
        snapshot: source.snapshot,
        createdBy: actorFrom(req),
      });
      await client.query("COMMIT");

      const safeNumber = String(proof.document_number || "BIZ").replace(/[^A-Za-z0-9_-]+/g, "-");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename=${safeNumber}.pdf`);
      res.setHeader("Cache-Control", "no-store");

      const doc = await createAifShopProofPdf({
        kind,
        documentNumber: proof.document_number,
        data: proof.snapshot || source.snapshot,
      });
      doc.pipe(res);
      doc.end();
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF shop proof PDF failed", error);
      if (!res.headersSent) {
        const status = Number(error?.statusCode || 500);
        return res.status(status >= 400 && status < 600 ? status : 500).json({
          error: error?.message || "A PDF bizonylat nem készíthető el.",
          code: error?.code || null,
        });
      }
      try { res.end(); } catch {}
    } finally {
      client.release();
    }
  });

  return router;
}
