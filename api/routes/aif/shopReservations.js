import express from "express";

export default function createAifShopReservationsRouter({
  pool,
  requireAuthed,
  ensureAifShopSalesSchema,
  aifResolveShopLocation,
  actorFrom,
  text,
  normCode,
  aifNumber,
  aifRoundMoney,
  insertStockMovementSafe,
  aifAssertNoPendingShopShiftHandover,
  aifAllocateShopSaleNumber,
  aifLoadShopSaleResult,
  aifShopSaleResponse,
}) {
  const router = express.Router();
  let schemaPromise = null;

  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await ensureAifShopSalesSchema();
        await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_shop_reservations (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          reservation_number text NOT NULL UNIQUE,
          location_id uuid NOT NULL REFERENCES aif_locations(id) ON DELETE RESTRICT,
          customer_id uuid NOT NULL REFERENCES aif_shop_customers(id) ON DELETE RESTRICT,
          status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','fulfilled','released','cancelled')),
          expires_on date NOT NULL,
          customer_name text NULL,
          customer_phone text NULL,
          created_by text NOT NULL,
          fulfilled_by text NULL,
          released_by text NULL,
          fulfilled_sale_id uuid NULL REFERENCES aif_shop_sales(id) ON DELETE SET NULL,
          note text NULL,
          raw jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          fulfilled_at timestamptz NULL,
          released_at timestamptz NULL
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_shop_reservations_location_status_idx
          ON aif_shop_reservations (location_id,status,expires_on,created_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_shop_reservations_customer_idx
          ON aif_shop_reservations (customer_id,created_at DESC)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_shop_reservation_lines (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          reservation_id uuid NOT NULL REFERENCES aif_shop_reservations(id) ON DELETE CASCADE,
          line_no integer NOT NULL,
          variant_id uuid NOT NULL REFERENCES aif_product_variants(id) ON DELETE RESTRICT,
          quantity integer NOT NULL CHECK (quantity > 0),
          unit_price_snapshot numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_price_snapshot >= 0),
          product_title text NULL,
          product_code text NULL,
          barcode text NULL,
          brand_name text NULL,
          color_name text NULL,
          size text NULL,
          image_url text NULL,
          raw jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (reservation_id,line_no)
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_shop_reservation_lines_variant_idx
          ON aif_shop_reservation_lines (variant_id)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_shop_reservation_events (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          reservation_id uuid NOT NULL REFERENCES aif_shop_reservations(id) ON DELETE CASCADE,
          event_type text NOT NULL,
          actor text NULL,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_shop_reservation_events_reservation_idx
          ON aif_shop_reservation_events (reservation_id,created_at ASC)`);
        return true;
      })().catch((error) => {
        schemaPromise = null;
        throw error;
      });
    }
    return schemaPromise;
  }

  function dateOnlyIso(value) {
    if (!value) return "";

    const raw = String(value).trim();
    const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (direct) return direct[1];

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";

    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Bucharest",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(parsed);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (!values.year || !values.month || !values.day) return "";
    return `${values.year}-${values.month}-${values.day}`;
  }

  function isoDate(value) {
    const raw = text(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
  }

  function paymentMethod(value) {
    const method = normCode(value || "cash");
    return ["cash", "card", "bank_transfer", "credit"].includes(method) ? method : "";
  }

  async function allocateReservationNumber(client, location) {
    const yearResult = await client.query(`SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer AS year`);
    const year = Number(yearResult.rows[0]?.year || new Date().getFullYear());
    const tag = location.code === "main_warehouse" ? "CIUC" : "KEZDI";
    const prefix = `FL/${tag}/${year}/`;
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`aif_shop_reservation:${location.id}:${year}`]);
    const next = await client.query(
      `SELECT COALESCE(max(seq),0)::bigint + 1 AS next_number
       FROM (
         SELECT ((regexp_match(reservation_number, '/([0-9]+)$'))[1])::bigint AS seq
         FROM aif_shop_reservations
         WHERE location_id=$1 AND reservation_number LIKE $2 AND reservation_number ~ '/[0-9]+$'
       ) numbered`,
      [location.id, `${prefix}%`],
    );
    return `${prefix}${String(Math.max(1, Number(next.rows[0]?.next_number || 1))).padStart(6, "0")}`;
  }

  function responseRow(row) {
    const rawLines = Array.isArray(row.lines) ? row.lines : [];
    return {
      id: String(row.id),
      reservationNumber: row.reservation_number,
      status: row.status,
      expiresOn: dateOnlyIso(row.expires_on) || null,
      customer: {
        id: row.customer_id ? String(row.customer_id) : "",
        name: row.customer_name || "",
        phone: row.customer_phone || null,
      },
      createdBy: row.created_by || null,
      fulfilledBy: row.fulfilled_by || null,
      releasedBy: row.released_by || null,
      fulfilledSaleId: row.fulfilled_sale_id ? String(row.fulfilled_sale_id) : null,
      note: row.note || null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      fulfilledAt: row.fulfilled_at ? new Date(row.fulfilled_at).toISOString() : null,
      releasedAt: row.released_at ? new Date(row.released_at).toISOString() : null,
      totalQty: rawLines.reduce((sum, line) => sum + aifNumber(line.quantity), 0),
      totalValue: aifRoundMoney(rawLines.reduce((sum, line) => sum + aifNumber(line.quantity) * aifNumber(line.unitPrice ?? line.unit_price_snapshot), 0)),
      lines: rawLines.map((line) => ({
        id: String(line.id || ""),
        variantId: String(line.variantId || line.variant_id || ""),
        quantity: aifNumber(line.quantity),
        unitPrice: aifRoundMoney(line.unitPrice ?? line.unit_price_snapshot),
        title: line.title || line.product_title || "Ismeretlen termék",
        productCode: line.productCode || line.product_code || null,
        barcode: line.barcode || null,
        brandName: line.brandName || line.brand_name || null,
        colorName: line.colorName || line.color_name || null,
        size: line.size || null,
        imageUrl: line.imageUrl || line.image_url || null,
      })),
    };
  }

  async function listRows(locationId, whereSql = "", args = []) {
    const result = await pool.query(
      `SELECT r.*,
              COALESCE(jsonb_agg(jsonb_build_object(
                'id',rl.id::text,'variantId',rl.variant_id::text,'quantity',rl.quantity,
                'unitPrice',rl.unit_price_snapshot,'title',rl.product_title,'productCode',rl.product_code,
                'barcode',rl.barcode,'brandName',rl.brand_name,'colorName',rl.color_name,
                'size',rl.size,'imageUrl',rl.image_url
              ) ORDER BY rl.line_no) FILTER (WHERE rl.id IS NOT NULL),'[]'::jsonb) AS lines
       FROM aif_shop_reservations r
       LEFT JOIN aif_shop_reservation_lines rl ON rl.reservation_id=r.id
       WHERE r.location_id=$1 ${whereSql}
       GROUP BY r.id
       ORDER BY CASE WHEN r.status='active' THEN 0 ELSE 1 END,
                r.expires_on ASC, r.created_at DESC`,
      [locationId, ...args],
    );
    return result.rows.map(responseRow);
  }

  router.get("/", requireAuthed, async (req, res) => {
    try {
      await ensureSchema();
      const location = await aifResolveShopLocation(req, pool, req.query.location);
      const mode = normCode(req.query.mode || req.query.status || "active");
      const month = text(req.query.month);
      let where = "";
      const args = [];
      if (mode === "active") {
        where += ` AND r.status='active'`;
      } else if (mode === "history") {
        where += ` AND r.status<>'active'`;
        if (/^\d{4}-\d{2}$/.test(month)) {
          args.push(`${month}-01`);
          where += ` AND r.created_at >= $${args.length + 1}::date AND r.created_at < ($${args.length + 1}::date + interval '1 month')`;
        }
      }
      const items = await listRows(location.id, where, args);
      res.json({ ok: true, location: { id: String(location.id), code: location.code, name: location.name }, items, count: items.length });
    } catch (error) {
      const status = Number(error?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "A félretett termékek nem tölthetők be.", code: error?.code || null });
    }
  });

  router.post("/", requireAuthed, async (req, res) => {
    const body = req.body || {};
    const customerId = text(body.customerId || body.customer_id);
    const expiresOn = isoDate(body.expiresOn || body.expires_on || body.expiryDate || body.expiry_date);
    const linesInput = Array.isArray(body.lines) ? body.lines : [];
    if (!customerId) return res.status(400).json({ error: "Kliens kiválasztása kötelező." });
    if (!expiresOn) return res.status(400).json({ error: "Érvényes lejárati dátum szükséges." });
    if (!linesInput.length) return res.status(400).json({ error: "Nincs félreteendő termék." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSchema();
      const location = await aifResolveShopLocation(req, client, body.location);
      const actor = actorFrom(req);
      const customerResult = await client.query(
        `SELECT * FROM aif_shop_customers WHERE id::text=$1 AND location_id=$2 AND is_active=true FOR UPDATE`,
        [customerId, location.id],
      );
      if (!customerResult.rowCount) throw Object.assign(new Error("A kliens ebben az üzletben nem található vagy inaktív."), { statusCode: 400 });
      const customer = customerResult.rows[0];

      const grouped = new Map();
      for (const input of linesInput) {
        const variantId = text(input.variantId || input.variant_id);
        const qty = Math.max(0, Number.parseInt(String(input.quantity ?? input.qty ?? 0), 10) || 0);
        if (!variantId || qty <= 0) throw Object.assign(new Error("Minden félretett sornál termék és pozitív darabszám szükséges."), { statusCode: 400 });
        grouped.set(variantId, (grouped.get(variantId) || 0) + qty);
      }

      const variantIds = [...grouped.keys()].sort();
      const stockResult = await client.query(
        `SELECT s.location_id,s.variant_id,s.qty,s.reserved_qty,
                v.barcode,v.sell_price,v.size,v.color_name,v.image_url,v.internal_sku,
                COALESCE(NULLIF(m.title_ro,''),NULLIF(m.shopify_title,''),m.model_code,v.internal_sku) AS title,
                m.model_code,b.name AS brand_name,
                sc.supplier_product_code
         FROM aif_stock s
         JOIN aif_product_variants v ON v.id=s.variant_id
         JOIN aif_product_models m ON m.id=v.model_id
         LEFT JOIN aif_brands b ON b.id=m.brand_id
         LEFT JOIN LATERAL (
           SELECT supplier_product_code FROM aif_variant_supplier_codes
           WHERE variant_id=v.id AND COALESCE(is_active,true)=true
           ORDER BY updated_at DESC NULLS LAST,created_at DESC NULLS LAST LIMIT 1
         ) sc ON true
         WHERE s.location_id=$1 AND s.variant_id=ANY($2::uuid[])
           AND COALESCE(v.status,'active')='active' AND COALESCE(m.status,'active')='active'
         ORDER BY s.variant_id FOR UPDATE OF s`,
        [location.id, variantIds],
      );
      const byId = new Map(stockResult.rows.map((row) => [String(row.variant_id), row]));
      if (byId.size !== variantIds.length) throw Object.assign(new Error("Az egyik termék nem található az üzlet aktív készletében."), { statusCode: 409 });

      for (const variantId of variantIds) {
        const row = byId.get(variantId);
        const qty = grouped.get(variantId);
        const available = Number(row.qty || 0) - Number(row.reserved_qty || 0);
        if (available < qty) throw Object.assign(new Error(`${row.title || "Termék"}: csak ${Math.max(0, available)} db szabad készlet van.`), { statusCode: 409, code: "reservation_insufficient_stock" });
      }

      const reservationNumber = await allocateReservationNumber(client, location);
      const header = await client.query(
        `INSERT INTO aif_shop_reservations (
           reservation_number,location_id,customer_id,status,expires_on,customer_name,customer_phone,created_by,note,raw
         ) VALUES ($1,$2,$3,'active',$4,$5,$6,$7,$8,$9::jsonb) RETURNING *`,
        [reservationNumber, location.id, customer.id, expiresOn, customer.full_name, customer.phone, actor, text(body.note) || null, JSON.stringify({ source: "shop_reserved_module" })],
      );
      const reservation = header.rows[0];
      let lineNo = 1;
      for (const variantId of variantIds) {
        const row = byId.get(variantId);
        const qty = grouped.get(variantId);
        const unitPrice = aifRoundMoney(row.sell_price);
        await client.query(
          `UPDATE aif_stock SET reserved_qty=reserved_qty+$3,updated_at=now() WHERE location_id=$1 AND variant_id=$2`,
          [location.id, variantId, qty],
        );
        await client.query(
          `INSERT INTO aif_shop_reservation_lines (
             reservation_id,line_no,variant_id,quantity,unit_price_snapshot,product_title,product_code,barcode,brand_name,color_name,size,image_url,raw
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
          [reservation.id, lineNo++, variantId, qty, unitPrice, row.title, row.supplier_product_code || row.model_code || row.internal_sku || null, row.barcode || null, row.brand_name || null, row.color_name || null, row.size || null, row.image_url || null, JSON.stringify({ availableBefore: Number(row.qty || 0) - Number(row.reserved_qty || 0) })],
        );
      }
      await client.query(
        `INSERT INTO aif_shop_reservation_events (reservation_id,event_type,actor,payload) VALUES ($1,'created',$2,$3::jsonb)`,
        [reservation.id, actor, JSON.stringify({ expiresOn, customerId: String(customer.id), lineCount: variantIds.length })],
      );
      await client.query("COMMIT");
      const items = await listRows(location.id, ` AND r.id=$2`, [reservation.id]);
      res.json({ ok: true, item: items[0] || null });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      const status = Number(error?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "A félretétel mentése nem sikerült.", code: error?.code || null });
    } finally {
      client.release();
    }
  });

  router.patch("/:id/expires-on", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const expiresOn = isoDate(
      req.body?.expiresOn || req.body?.expires_on || req.body?.expiryDate || req.body?.expiry_date,
    );
    if (!expiresOn) {
      return res.status(400).json({ error: "Érvényes lejárati dátum szükséges." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSchema();

      const location = await aifResolveShopLocation(req, client, req.body?.location);
      const actor = actorFrom(req);
      const current = await client.query(
        `SELECT *
         FROM aif_shop_reservations
         WHERE id::text=$1
           AND location_id=$2
         FOR UPDATE`,
        [id, location.id],
      );

      if (!current.rowCount) {
        throw Object.assign(new Error("A félretétel nem található."), { statusCode: 404 });
      }

      const reservation = current.rows[0];
      if (reservation.status !== "active") {
        throw Object.assign(
          new Error("Csak aktív félretétel lejárati dátuma módosítható."),
          { statusCode: 409, code: "reservation_not_active" },
        );
      }

      const previousExpiresOn = dateOnlyIso(reservation.expires_on) || null;

      await client.query(
        `UPDATE aif_shop_reservations
         SET expires_on=$2,
             updated_at=now()
         WHERE id=$1`,
        [reservation.id, expiresOn],
      );

      await client.query(
        `INSERT INTO aif_shop_reservation_events (
           reservation_id,event_type,actor,payload
         ) VALUES ($1,'expiry_changed',$2,$3::jsonb)`,
        [
          reservation.id,
          actor,
          JSON.stringify({
            previousExpiresOn,
            expiresOn,
            note: text(req.body?.note) || null,
          }),
        ],
      );

      await client.query("COMMIT");

      const items = await listRows(location.id, ` AND r.id=$2`, [reservation.id]);
      return res.json({
        ok: true,
        item: items[0] || null,
        previousExpiresOn,
        expiresOn,
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A lejárati dátum módosítása nem sikerült.",
        code: error?.code || null,
      });
    } finally {
      client.release();
    }
  });

  router.post("/:id/release", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSchema();
      const location = await aifResolveShopLocation(req, client, req.body?.location);
      const actor = actorFrom(req);
      const header = await client.query(`SELECT * FROM aif_shop_reservations WHERE id::text=$1 AND location_id=$2 FOR UPDATE`, [id, location.id]);
      if (!header.rowCount) throw Object.assign(new Error("A félretétel nem található."), { statusCode: 404 });
      const reservation = header.rows[0];
      if (reservation.status !== "active") throw Object.assign(new Error("Csak aktív félretétel tehető vissza készletre."), { statusCode: 409 });
      const lines = await client.query(`SELECT * FROM aif_shop_reservation_lines WHERE reservation_id=$1 ORDER BY line_no FOR UPDATE`, [reservation.id]);
      for (const line of lines.rows) {
        const stock = await client.query(`SELECT qty,reserved_qty FROM aif_stock WHERE location_id=$1 AND variant_id=$2 FOR UPDATE`, [location.id, line.variant_id]);
        const currentReserved = Number(stock.rows[0]?.reserved_qty || 0);
        if (currentReserved < Number(line.quantity || 0)) throw Object.assign(new Error("A félretett készlet állapota nem egyezik a nyilvántartással."), { statusCode: 409, code: "reservation_stock_mismatch" });
        await client.query(`UPDATE aif_stock SET reserved_qty=reserved_qty-$3,updated_at=now() WHERE location_id=$1 AND variant_id=$2`, [location.id, line.variant_id, line.quantity]);
      }
      await client.query(`UPDATE aif_shop_reservations SET status='released',released_by=$2,released_at=now(),updated_at=now() WHERE id=$1`, [reservation.id, actor]);
      await client.query(`INSERT INTO aif_shop_reservation_events (reservation_id,event_type,actor,payload) VALUES ($1,'released',$2,$3::jsonb)`, [reservation.id, actor, JSON.stringify({ note: text(req.body?.note) || null })]);
      await client.query("COMMIT");
      res.json({ ok: true, id: String(reservation.id), status: "released" });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      const status = Number(error?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "A félretétel feloldása nem sikerült.", code: error?.code || null });
    } finally {
      client.release();
    }
  });

  router.post("/:id/fulfill", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const body = req.body || {};
    const method = paymentMethod(body.paymentMethod || body.payment_method);
    const idempotencyKey = text(req.get("Idempotency-Key") || body.idempotencyKey || body.idempotency_key).slice(0, 200);
    if (!method) return res.status(400).json({ error: "Érvénytelen fizetési mód." });
    if (!idempotencyKey) return res.status(400).json({ error: "Hiányzik a biztonsági azonosító." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSchema();
      const location = await aifResolveShopLocation(req, client, body.location);
      const cashier = actorFrom(req);
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`aif_shop_shift:${location.id}`]);
      await aifAssertNoPendingShopShiftHandover(client, location.id, cashier);

      const duplicate = await client.query(`SELECT id FROM aif_shop_sales WHERE client_request_id=$1 LIMIT 1`, [idempotencyKey]);
      if (duplicate.rowCount) {
        const previous = await aifLoadShopSaleResult(client, duplicate.rows[0].id);
        await client.query("COMMIT");
        return res.json({ ...aifShopSaleResponse(previous, location, true), reservationId: id });
      }

      const header = await client.query(`SELECT * FROM aif_shop_reservations WHERE id::text=$1 AND location_id=$2 FOR UPDATE`, [id, location.id]);
      if (!header.rowCount) throw Object.assign(new Error("A félretétel nem található."), { statusCode: 404 });
      const reservation = header.rows[0];
      if (reservation.status !== "active") throw Object.assign(new Error("Ez a félretétel már nem aktív."), { statusCode: 409 });
      const linesResult = await client.query(`SELECT * FROM aif_shop_reservation_lines WHERE reservation_id=$1 ORDER BY line_no FOR UPDATE`, [reservation.id]);
      if (!linesResult.rowCount) throw Object.assign(new Error("A félretételhez nincs termék."), { statusCode: 409 });

      const variantIds = linesResult.rows.map((line) => String(line.variant_id)).sort();
      const stocks = await client.query(
        `SELECT s.location_id,s.variant_id,s.qty,s.reserved_qty,v.buy_price
         FROM aif_stock s JOIN aif_product_variants v ON v.id=s.variant_id
         WHERE s.location_id=$1 AND s.variant_id=ANY($2::uuid[]) ORDER BY s.variant_id FOR UPDATE OF s`,
        [location.id, variantIds],
      );
      const stockById = new Map(stocks.rows.map((row) => [String(row.variant_id), row]));
      let subtotal = 0;
      let totalQty = 0;
      for (const line of linesResult.rows) {
        const stock = stockById.get(String(line.variant_id));
        const qty = Number(line.quantity || 0);
        if (!stock || Number(stock.qty || 0) < qty || Number(stock.reserved_qty || 0) < qty) {
          throw Object.assign(new Error(`${line.product_title || "Termék"}: a félretett készlet már nem áll rendelkezésre.`), { statusCode: 409, code: "reservation_stock_mismatch" });
        }
        subtotal = aifRoundMoney(subtotal + aifRoundMoney(line.unit_price_snapshot) * qty);
        totalQty += qty;
      }

      const saleActor = text(reservation.created_by) || cashier;
      const isCredit = method === "credit";
      const saleNumber = await aifAllocateShopSaleNumber(client, location);
      const saleInsert = await client.query(
        `INSERT INTO aif_shop_sales (
           sale_number,location_id,customer_id,status,sale_type,payment_status,actor,sold_at,
           subtotal,discount_total,total,paid_total,balance_due,currency_code,customer_name,customer_phone,note,client_request_id,raw
         ) VALUES ($1,$2,$3,'completed',$4,$5,$6,now(),$7,0,$7,$8,$9,'RON',$10,$11,$12,$13,$14::jsonb) RETURNING *`,
        [saleNumber, location.id, reservation.customer_id, isCredit ? "credit" : "sale", isCredit ? "credit" : "paid", saleActor, subtotal, isCredit ? 0 : subtotal, isCredit ? subtotal : 0, reservation.customer_name, reservation.customer_phone, text(body.note) || reservation.note || null, idempotencyKey, JSON.stringify({ source: "shop_reservation", reservationId: String(reservation.id), reservationNumber: reservation.reservation_number, attributedTo: saleActor, fulfilledBy: cashier, paymentMethod: method })],
      );
      const sale = saleInsert.rows[0];

      let lineNo = 1;
      for (const line of linesResult.rows) {
        const stock = stockById.get(String(line.variant_id));
        const qty = Number(line.quantity || 0);
        const before = Number(stock.qty || 0);
        const after = before - qty;
        const reservedBefore = Number(stock.reserved_qty || 0);
        const reservedAfter = reservedBefore - qty;
        const unitPrice = aifRoundMoney(line.unit_price_snapshot);
        const lineTotal = aifRoundMoney(unitPrice * qty);
        await client.query(
          `INSERT INTO aif_shop_sale_lines (
             sale_id,line_no,variant_id,quantity,list_price,unit_price,discount_amount,discount_percent,line_total,buy_price_snapshot,
             product_title,product_code,barcode,brand_name,color_name,size,image_url,raw
           ) VALUES ($1,$2,$3,$4,$5,$5,0,0,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
          [sale.id, lineNo++, line.variant_id, qty, unitPrice, lineTotal, stock.buy_price, line.product_title, line.product_code, line.barcode, line.brand_name, line.color_name, line.size, line.image_url, JSON.stringify({ reservationId: String(reservation.id), reservedBefore, reservedAfter, fulfilledBy: cashier })],
        );
        await client.query(`UPDATE aif_stock SET qty=$3,reserved_qty=$4,updated_at=now() WHERE location_id=$1 AND variant_id=$2`, [location.id, line.variant_id, after, reservedAfter]);
        const logged = await insertStockMovementSafe(client, {
          movementType: "sale",
          sourceType: "shop_sale",
          sourcePrefix: "reservation_sale",
          fallbackSourceType: "manual_stock_edit",
          sourceId: String(sale.id),
          locationId: location.id,
          variantId: line.variant_id,
          qtyDelta: -qty,
          qtyBefore: before,
          qtyAfter: after,
          actor: saleActor,
          raw: { reason: "shop_reservation_sale", saleId: String(sale.id), saleNumber, reservationId: String(reservation.id), reservationNumber: reservation.reservation_number, fulfilledBy: cashier, paymentMethod: method },
        });
        if (!logged) throw Object.assign(new Error("A félretett termék eladási készletmozgása nem naplózható."), { statusCode: 500 });
      }

      if (subtotal > 0 && !isCredit) {
        await client.query(
          `INSERT INTO aif_shop_sale_payments (sale_id,method,amount,paid_at,actor,note,raw)
           VALUES ($1,$2,$3,now(),$4,$5,$6::jsonb)`,
          [sale.id, method, subtotal, cashier, `Félretett termék átvétele • ${reservation.reservation_number}`, JSON.stringify({ reservationId: String(reservation.id), saleAttributedTo: saleActor, cashier })],
        );
      }
      await client.query(
        `INSERT INTO aif_shop_sale_events (sale_id,event_type,actor,note,payload)
         VALUES ($1,'completed',$2,$3,$4::jsonb)`,
        [sale.id, saleActor, text(body.note) || reservation.note || null, JSON.stringify({ reservationId: String(reservation.id), reservationNumber: reservation.reservation_number, fulfilledBy: cashier, paymentMethod: method, total: subtotal, itemCount: totalQty })],
      );
      await client.query(
        `UPDATE aif_shop_reservations SET status='fulfilled',fulfilled_by=$2,fulfilled_sale_id=$3,fulfilled_at=now(),updated_at=now() WHERE id=$1`,
        [reservation.id, cashier, sale.id],
      );
      await client.query(
        `INSERT INTO aif_shop_reservation_events (reservation_id,event_type,actor,payload) VALUES ($1,'fulfilled',$2,$3::jsonb)`,
        [reservation.id, cashier, JSON.stringify({ saleId: String(sale.id), saleNumber, saleAttributedTo: saleActor, paymentMethod: method, total: subtotal })],
      );
      const completed = await aifLoadShopSaleResult(client, sale.id);
      await client.query("COMMIT");
      res.json({ ...aifShopSaleResponse(completed, location, false), reservationId: String(reservation.id), reservationNumber: reservation.reservation_number, attributedTo: saleActor, fulfilledBy: cashier });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      const status = Number(error?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "A félretett termék eladása nem sikerült.", code: error?.code || null });
    } finally {
      client.release();
    }
  });

  return router;
}
