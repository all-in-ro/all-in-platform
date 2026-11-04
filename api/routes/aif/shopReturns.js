import express from "express";
import { createHash, randomInt, randomUUID } from "node:crypto";

export default function createAifShopReturnsRouter({
  pool,
  requireAuthed,
  requireAdminOrSecret,
  ensureAifShopSalesSchema,
  aifResolveShopLocation,
  actorFrom,
  text,
  normCode,
  aifNumber,
  aifRoundMoney,
  isUuidText,
  insertStockMovementSafe,
  aifAssertNoPendingShopShiftHandover,
  readSalesTvaSettings,
}) {
  const router = express.Router();

  const normalizeSearch = (value) => text(value).slice(0, 160);
  const tokenHash = (value) => createHash("sha256").update(String(value || "")).digest("hex");
  const oneTimeCode = () => String(randomInt(1000, 10000));

  function locationPayload(row, prefix = "sale") {
    const id = row?.[`${prefix}_location_id`];
    const code = row?.[`${prefix}_location_code`];
    const name = row?.[`${prefix}_location_name`];
    return {
      id: id ? String(id) : "",
      code: code || "",
      name: name || "",
    };
  }

  function returnSaleRow(row, currentLocation, canSeeCrossStorePrice = false) {
    const sameStore = String(row.sale_location_id || "") === String(currentLocation.id || "");
    const priceVisible = sameStore || canSeeCrossStorePrice;
    const quantity = aifNumber(row.quantity);
    const returnedQty = aifNumber(row.returned_qty);
    return {
      saleLineId: String(row.sale_line_id),
      saleId: String(row.sale_id),
      saleNumber: row.sale_number,
      soldAt: row.sold_at ? new Date(row.sold_at).toISOString() : null,
      saleLocation: locationPayload(row, "sale"),
      sameStore,
      priceVisible,
      actor: row.actor || null,
      customerName: row.customer_name || null,
      customerPhone: null,
      paymentStatus: priceVisible ? (row.payment_status || null) : null,
      balanceDue: priceVisible ? aifNumber(row.balance_due) : null,
      eligible: aifNumber(row.balance_due) <= 0.005,
      quantity,
      returnedQty,
      remainingQty: Math.max(0, quantity - returnedQty),
      product: {
        variantId: row.variant_id ? String(row.variant_id) : null,
        title: row.product_title || "Ismeretlen termék",
        productCode: row.product_code || null,
        barcode: row.barcode || null,
        brandName: row.brand_name || null,
        colorName: row.color_name || null,
        size: row.size || null,
        imageUrl: row.image_url || null,
      },
      listPrice: priceVisible ? aifNumber(row.list_price) : null,
      unitPrice: priceVisible ? aifNumber(row.unit_price) : null,
      discountAmount: priceVisible ? aifNumber(row.discount_amount) : null,
      discountPercent: priceVisible ? aifNumber(row.discount_percent) : null,
      lineTotal: priceVisible ? aifNumber(row.line_total) : null,
      // Az egesz eredeti vasarlas osszege segit a datumhoz tartozo nyugta azonositásaban.
      // Masik uzlet vegosszege sem jelenhet meg feloldas nelkul.
      saleTotal: priceVisible ? aifNumber(row.sale_total) : null,
    };
  }

  async function loadSaleLine(client, saleLineId, { lock = false } = {}) {
    const result = await client.query(
      `SELECT
         sl.id AS sale_line_id,
         sl.sale_id,
         sl.variant_id,
         sl.quantity,
         sl.list_price,
         sl.unit_price,
         sl.discount_amount,
         sl.discount_percent,
         sl.line_total,
         sl.buy_price_snapshot,
         COALESCE(sl.buy_price_snapshot, v.buy_price) AS source_buy_price,
         COALESCE(NULLIF(sl.product_title,''), NULLIF(m.title_ro,''), NULLIF(m.shopify_title,''), NULLIF(sl.product_code,''), 'Ismeretlen termék') AS product_title,
         COALESCE(NULLIF(sl.product_code,''), NULLIF(sc.supplier_product_code,''), NULLIF(m.model_code,''), NULLIF(v.internal_sku,'')) AS product_code,
         COALESCE(NULLIF(sl.barcode,''), NULLIF(v.barcode,'')) AS barcode,
         COALESCE(NULLIF(sl.brand_name,''), NULLIF(b.name,'')) AS brand_name,
         COALESCE(NULLIF(sl.color_name,''), NULLIF(v.color_name,''), NULLIF(v.color_code,'')) AS color_name,
         COALESCE(NULLIF(sl.size,''), NULLIF(v.size,'')) AS size,
         COALESCE(NULLIF(sl.image_url,''), NULLIF(v.image_url,'')) AS image_url,
         s.sale_number, s.sold_at, s.actor, s.customer_id, s.customer_name, s.customer_phone, s.status AS sale_status,
         s.sale_type, s.payment_status, s.subtotal, s.discount_total, s.total, s.total AS sale_total, s.paid_total, s.balance_due,
         s.location_id AS sale_location_id,
         l.code AS sale_location_code,
         l.name AS sale_location_name,
         COALESCE(ex.returned_qty,0)::int AS returned_qty
       FROM aif_shop_sale_lines sl
       JOIN aif_shop_sales s ON s.id=sl.sale_id
       JOIN aif_locations l ON l.id=s.location_id
       LEFT JOIN aif_product_variants v ON v.id=sl.variant_id
       LEFT JOIN aif_product_models m ON m.id=v.model_id
       LEFT JOIN aif_brands b ON b.id=m.brand_id
       LEFT JOIN LATERAL (
         SELECT supplier_product_code
         FROM aif_variant_supplier_codes sc
         WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
         ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST
         LIMIT 1
       ) sc ON true
       LEFT JOIN LATERAL (
         SELECT COALESCE(sum(e.returned_qty),0)::int AS returned_qty
         FROM aif_shop_exchanges e
         WHERE e.source_sale_line_id=sl.id
           AND e.status='completed'
       ) ex ON true
       WHERE sl.id::text=$1
       LIMIT 1
       ${lock ? "FOR UPDATE OF sl, s" : ""}`,
      [saleLineId]
    );
    return result.rows[0] || null;
  }

  async function allocateExchangeNumber(client, location) {
    const yearResult = await client.query(`SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer AS year`);
    const year = Number(yearResult.rows[0]?.year || new Date().getFullYear());
    const tag = location.code === "main_warehouse" ? "CIUC" : "KEZDI";
    const prefix = `VC/${tag}/${year}/`;
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`aif_shop_exchange:${location.id}:${year}`]);
    const next = await client.query(
      `SELECT COALESCE(max(seq),0)::bigint + 1 AS next_number
       FROM (
         SELECT ((regexp_match(exchange_number, '/([0-9]+)$'))[1])::bigint AS seq
         FROM aif_shop_exchanges
         WHERE location_id=$1
           AND exchange_number LIKE $2
           AND exchange_number ~ '/[0-9]+$'
       ) numbered`,
      [location.id, `${prefix}%`]
    );
    return `${prefix}${String(Math.max(1, Number(next.rows[0]?.next_number || 1))).padStart(6, "0")}`;
  }

  async function findActiveAuthorization(client, { saleLineId, requestingLocationId }) {
    await client.query(
      `UPDATE aif_shop_return_authorizations
       SET status='expired', access_code=NULL, updated_at=now()
       WHERE status='pending' AND expires_at <= now()`
    );
    const result = await client.query(
      `SELECT *
       FROM aif_shop_return_authorizations
       WHERE sale_line_id=$1
         AND requesting_location_id=$2
         AND status='pending'
         AND expires_at > now()
       ORDER BY created_at DESC
       LIMIT 1`,
      [saleLineId, requestingLocationId]
    );
    return result.rows[0] || null;
  }

  router.get("/sales", requireAuthed, async (req, res) => {
    try {
      await ensureAifShopSalesSchema();
      const currentLocation = await aifResolveShopLocation(req, pool, req.query.location);
      const search = normalizeSearch(req.query.q || req.query.search || req.query.code);
      const limit = Math.min(400, Math.max(1, Number(req.query.limit || 80) || 80));
      // Datum nelkul is mukodik a regi vonalkodos kereses. Ha a vevo csak
      // hozzaVETŐleges napot mond, az uzlet helyi idozonajaban keressunk.
      const saleDate = text(req.query.saleDate || req.query.sale_date || "");
      const windowDays = Number(req.query.windowDays ?? req.query.window_days ?? 0);
      const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(saleDate)
        ? new Date(`${saleDate}T12:00:00Z`) : null;
      if (saleDate && (!parsedDate || !Number.isFinite(parsedDate.getTime()) ||
                       parsedDate.toISOString().slice(0, 10) !== saleDate ||
                       !Number.isInteger(windowDays) || ![0,3,7,30].includes(windowDays))) {
        return res.status(400).json({ error: "Ervenytelen vasarlasi datum vagy idointervallum." });
      }
      if (!search) return res.json({ ok: true, location: currentLocation, items: [], count: 0 });
      const exact = search;
      const pattern = `%${search}%`;
      const result = await pool.query(
        `SELECT
           sl.id AS sale_line_id,
           sl.sale_id,
           sl.variant_id,
           sl.quantity,
           sl.list_price,
           sl.unit_price,
           sl.discount_amount,
           sl.discount_percent,
           sl.line_total,
           COALESCE(NULLIF(sl.product_title,''), NULLIF(m.title_ro,''), NULLIF(m.shopify_title,''), NULLIF(sl.product_code,''), 'Ismeretlen termék') AS product_title,
           COALESCE(NULLIF(sl.product_code,''), NULLIF(sc.supplier_product_code,''), NULLIF(m.model_code,''), NULLIF(v.internal_sku,'')) AS product_code,
           COALESCE(NULLIF(sl.barcode,''), NULLIF(v.barcode,'')) AS barcode,
           COALESCE(NULLIF(sl.brand_name,''), NULLIF(b.name,'')) AS brand_name,
           COALESCE(NULLIF(sl.color_name,''), NULLIF(v.color_name,''), NULLIF(v.color_code,'')) AS color_name,
           COALESCE(NULLIF(sl.size,''), NULLIF(v.size,'')) AS size,
           COALESCE(NULLIF(sl.image_url,''), NULLIF(v.image_url,'')) AS image_url,
           s.id AS sale_id,
           s.sale_number, s.sold_at, s.actor, s.customer_name, s.customer_phone, s.payment_status, s.balance_due,
           s.total AS sale_total,
           s.location_id AS sale_location_id,
           l.code AS sale_location_code,
           l.name AS sale_location_name,
           COALESCE(ex.returned_qty,0)::int AS returned_qty
         FROM aif_shop_sale_lines sl
         JOIN aif_shop_sales s ON s.id=sl.sale_id
         JOIN aif_locations l ON l.id=s.location_id
         LEFT JOIN aif_product_variants v ON v.id=sl.variant_id
         LEFT JOIN aif_product_models m ON m.id=v.model_id
         LEFT JOIN aif_brands b ON b.id=m.brand_id
         LEFT JOIN LATERAL (
           SELECT supplier_product_code
           FROM aif_variant_supplier_codes sc
           WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
           ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST
           LIMIT 1
         ) sc ON true
         LEFT JOIN LATERAL (
           SELECT COALESCE(sum(e.returned_qty),0)::int AS returned_qty
           FROM aif_shop_exchanges e
           WHERE e.source_sale_line_id=sl.id AND e.status='completed'
         ) ex ON true
         WHERE s.status='completed'
           AND COALESCE(ex.returned_qty,0) < sl.quantity
           AND (
             lower(btrim(COALESCE(sl.barcode,'')))=lower(btrim($1))
             OR lower(btrim(COALESCE(v.barcode,'')))=lower(btrim($1))
             OR lower(btrim(COALESCE(sl.product_code,'')))=lower(btrim($1))
             OR lower(btrim(COALESCE(v.internal_sku,'')))=lower(btrim($1))
             OR lower(btrim(COALESCE(sc.supplier_product_code,'')))=lower(btrim($1))
             OR COALESCE(sl.product_title,'') ILIKE $2
             OR COALESCE(sl.product_code,'') ILIKE $2
             OR COALESCE(sl.barcode,'') ILIKE $2
             OR s.sale_number ILIKE $2
           )
           AND (
             $4::date IS NULL
             OR (s.sold_at AT TIME ZONE 'Europe/Bucharest')::date
                BETWEEN $4::date - $5::int AND $4::date + $5::int
           )
         ORDER BY
           CASE WHEN lower(btrim(COALESCE(sl.barcode,'')))=lower(btrim($1)) OR lower(btrim(COALESCE(v.barcode,'')))=lower(btrim($1)) THEN 0 ELSE 1 END,
           s.sold_at DESC,
           sl.line_no ASC
         LIMIT $3`,
        [exact, pattern, limit, saleDate || null, saleDate ? windowDays : 0]
      );
      const canSeeCrossStorePrice = normCode(req.session?.role) === "admin";
      const items = result.rows.map((row) => returnSaleRow(row, currentLocation, canSeeCrossStorePrice));
      return res.json({
        ok: true,
        location: { id: String(currentLocation.id), code: currentLocation.code, name: currentLocation.name },
        items,
        count: items.length,
      });
    } catch (error) {
      console.error("AIF shop return sale search failed", error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "A korábbi eladások nem tölthetők be.", code: error?.code || null });
    }
  });

  // A bizonylat osszes eredeti termeksora. A masik uzlet arai itt is vedettek.
  // A termek vonalkodjanak beolvasasa utan csak a hiteles saleId alapjan kerdezunk.
  router.get("/sales/:saleId/lines", requireAuthed, async (req, res) => {
    const saleId = text(req.params.saleId);
    if (!isUuidText(saleId)) return res.status(400).json({ error: "Ervenytelen bizonylatazonosito." });
    try {
      await ensureAifShopSalesSchema();
      const location = await aifResolveShopLocation(req, pool, req.query.location);
      const sale = await pool.query(
        `SELECT id, sale_number, status FROM aif_shop_sales WHERE id=$1::uuid LIMIT 1`, [saleId]
      );
      if (!sale.rowCount || sale.rows[0].status !== "completed") {
        return res.status(404).json({ error: "A bizonylat nem talalhato, vagy nem ervenyes." });
      }
      const lines = await pool.query(
        `SELECT sl.id::text AS sale_line_id FROM aif_shop_sale_lines sl
         WHERE sl.sale_id=$1::uuid ORDER BY sl.line_no ASC, sl.id ASC`, [saleId]
      );
      const items = [];
      for (const line of lines.rows) {
        const loaded = await loadSaleLine(pool, line.sale_line_id);
        if (loaded) items.push(returnSaleRow(loaded, location, normCode(req.session?.role) === "admin"));
      }
      return res.json({
        ok: true, saleId, saleNumber: sale.rows[0].sale_number,
        items, count: items.length,
      });
    } catch (error) {
      const status = Number(error?.statusCode || 500);
      console.error("AIF return receipt lines failed", error);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A bizonylat termeksorai nem tolthetok be.", code: error?.code || null,
      });
    }
  });

  router.post("/authorizations", requireAuthed, async (req, res) => {
    const saleLineId = text(req.body?.saleLineId || req.body?.sale_line_id);
    if (!isUuidText(saleLineId)) return res.status(400).json({ error: "Érvénytelen eladási tétel." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureAifShopSalesSchema();
      const requestingLocation = await aifResolveShopLocation(req, client, req.body?.location);
      const saleLine = await loadSaleLine(client, saleLineId, { lock: true });
      if (!saleLine || saleLine.sale_status !== "completed") {
        const error = new Error("Az eladási tétel nem található vagy már nem érvényes.");
        error.statusCode = 404;
        throw error;
      }
      if (aifNumber(saleLine.returned_qty) >= aifNumber(saleLine.quantity)) {
        const error = new Error("Ezt a tételt már teljes mennyiségben visszavették.");
        error.statusCode = 409;
        throw error;
      }
      if (aifNumber(saleLine.balance_due) > 0.005) {
        const error = new Error("Ehhez az eredeti eladáshoz még nyitott tartozás tartozik. A csere előtt előbb rendezni kell a tartozást.");
        error.statusCode = 409;
        error.code = "return_source_open_balance";
        throw error;
      }
      if (String(saleLine.sale_location_id) === String(requestingLocation.id)) {
        await client.query("COMMIT");
        return res.json({ ok: true, required: false, message: "Az eladás ebben az üzletben történt, külön feloldás nem szükséges." });
      }

      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [
        `aif_return_auth:${saleLine.sale_line_id}:${requestingLocation.id}`,
      ]);
      const existing = await findActiveAuthorization(client, {
        saleLineId: saleLine.sale_line_id,
        requestingLocationId: requestingLocation.id,
      });
      let authorization = existing;
      if (!authorization) {
        const code = oneTimeCode();
        const inserted = await client.query(
          `INSERT INTO aif_shop_return_authorizations (
             sale_line_id, source_location_id, requesting_location_id, requested_by,
             status, access_code, attempt_count, expires_at, created_at, updated_at
           ) VALUES ($1,$2,$3,$4,'pending',$5,0,now() + interval '5 minutes',now(),now())
           RETURNING *`,
          [saleLine.sale_line_id, saleLine.sale_location_id, requestingLocation.id, actorFrom(req), code]
        );
        authorization = inserted.rows[0];
      }
      await client.query("COMMIT");
      return res.json({
        ok: true,
        required: true,
        item: {
          id: String(authorization.id),
          status: authorization.status,
          expiresAt: authorization.expires_at ? new Date(authorization.expires_at).toISOString() : null,
          sourceLocation: {
            id: String(saleLine.sale_location_id),
            code: saleLine.sale_location_code,
            name: saleLine.sale_location_name,
          },
          requestingLocation: { id: String(requestingLocation.id), code: requestingLocation.code, name: requestingLocation.name },
        },
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF shop return authorization request failed", error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "Az árlekérés nem indítható el.", code: error?.code || null });
    } finally {
      client.release();
    }
  });

  router.get("/authorizations/inbox", requireAuthed, async (req, res) => {
    try {
      await ensureAifShopSalesSchema();
      const location = await aifResolveShopLocation(req, pool, req.query.location);
      await pool.query(
        `UPDATE aif_shop_return_authorizations
         SET status='expired', access_code=NULL, updated_at=now()
         WHERE status='pending' AND expires_at <= now()`
      );
      const result = await pool.query(
        `SELECT
           a.id, a.status, a.access_code, a.requested_by, a.expires_at, a.created_at,
           req.id AS requesting_location_id, req.code AS requesting_location_code, req.name AS requesting_location_name,
           src.id AS source_location_id, src.code AS source_location_code, src.name AS source_location_name,
           sl.id AS sale_line_id,
           s.sale_number, s.sold_at, s.customer_name,
           COALESCE(NULLIF(sl.product_title,''), NULLIF(m.title_ro,''), NULLIF(m.shopify_title,''), NULLIF(sl.product_code,''), 'Ismeretlen termék') AS product_title,
           COALESCE(NULLIF(sl.product_code,''), NULLIF(sc.supplier_product_code,''), NULLIF(m.model_code,''), NULLIF(v.internal_sku,'')) AS product_code,
           COALESCE(NULLIF(sl.barcode,''), NULLIF(v.barcode,'')) AS barcode,
           COALESCE(NULLIF(sl.brand_name,''), NULLIF(b.name,'')) AS brand_name,
           COALESCE(NULLIF(sl.color_name,''), NULLIF(v.color_name,''), NULLIF(v.color_code,'')) AS color_name,
           COALESCE(NULLIF(sl.size,''), NULLIF(v.size,'')) AS size,
           COALESCE(NULLIF(sl.image_url,''), NULLIF(v.image_url,'')) AS image_url
         FROM aif_shop_return_authorizations a
         JOIN aif_locations req ON req.id=a.requesting_location_id
         JOIN aif_locations src ON src.id=a.source_location_id
         JOIN aif_shop_sale_lines sl ON sl.id=a.sale_line_id
         JOIN aif_shop_sales s ON s.id=sl.sale_id
         LEFT JOIN aif_product_variants v ON v.id=sl.variant_id
         LEFT JOIN aif_product_models m ON m.id=v.model_id
         LEFT JOIN aif_brands b ON b.id=m.brand_id
         LEFT JOIN LATERAL (
           SELECT supplier_product_code
           FROM aif_variant_supplier_codes sc
           WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
           ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST
           LIMIT 1
         ) sc ON true
         WHERE a.source_location_id=$1
           AND a.status='pending'
           AND a.expires_at > now()
         ORDER BY a.created_at ASC`,
        [location.id]
      );
      return res.json({
        ok: true,
        location: { id: String(location.id), code: location.code, name: location.name },
        items: result.rows.map((row) => ({
          id: String(row.id),
          status: row.status,
          code: row.access_code,
          requestedBy: row.requested_by || null,
          expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
          requestingLocation: {
            id: String(row.requesting_location_id),
            code: row.requesting_location_code,
            name: row.requesting_location_name,
          },
          sourceLocation: {
            id: String(row.source_location_id),
            code: row.source_location_code,
            name: row.source_location_name,
          },
          saleLineId: String(row.sale_line_id),
          saleNumber: row.sale_number,
          soldAt: row.sold_at ? new Date(row.sold_at).toISOString() : null,
          customerName: row.customer_name || null,
          product: {
            title: row.product_title,
            productCode: row.product_code || null,
            barcode: row.barcode || null,
            brandName: row.brand_name || null,
            colorName: row.color_name || null,
            size: row.size || null,
            imageUrl: row.image_url || null,
          },
        })),
      });
    } catch (error) {
      console.error("AIF shop return authorization inbox failed", error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "Az árlekérési kérések nem tölthetők be.", code: error?.code || null });
    }
  });

  router.get("/authorizations/:id/status", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    try {
      await ensureAifShopSalesSchema();
      const location = await aifResolveShopLocation(req, pool, req.query.location);
      await pool.query(
        `UPDATE aif_shop_return_authorizations
         SET status='expired', access_code=NULL, updated_at=now()
         WHERE id::text=$1 AND status='pending' AND expires_at <= now()`,
        [id]
      );
      const result = await pool.query(
        `SELECT id, status, expires_at, unlock_expires_at
         FROM aif_shop_return_authorizations
         WHERE id::text=$1 AND requesting_location_id=$2
         LIMIT 1`,
        [id, location.id]
      );
      if (!result.rowCount) return res.status(404).json({ error: "Az árlekérés nem található." });
      const row = result.rows[0];
      return res.json({
        ok: true,
        id: String(row.id),
        status: row.status,
        expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
        unlockExpiresAt: row.unlock_expires_at ? new Date(row.unlock_expires_at).toISOString() : null,
      });
    } catch (error) {
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "Az árlekérés állapota nem tölthető be.", code: error?.code || null });
    }
  });

  router.post("/authorizations/:id/unlock", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const code = text(req.body?.code).replace(/\D+/g, "").slice(0, 4);
    if (!/^\d{4}$/.test(code)) return res.status(400).json({ error: "4 számjegyű feloldókód szükséges." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureAifShopSalesSchema();
      const location = await aifResolveShopLocation(req, client, req.body?.location);
      const result = await client.query(
        `SELECT a.*, src.code AS source_location_code, src.name AS source_location_name
         FROM aif_shop_return_authorizations a
         JOIN aif_locations src ON src.id=a.source_location_id
         WHERE a.id::text=$1
         FOR UPDATE OF a`,
        [id]
      );
      if (!result.rowCount) {
        const error = new Error("Az árlekérés nem található.");
        error.statusCode = 404;
        throw error;
      }
      const auth = result.rows[0];
      if (String(auth.requesting_location_id) !== String(location.id)) {
        const error = new Error("Ez a feloldókód nem ehhez az üzlethez tartozik.");
        error.statusCode = 403;
        throw error;
      }
      if (auth.status !== "pending") {
        const error = new Error(auth.status === "rejected" ? "A másik üzlet elutasította az árlekérést." : "Ez a feloldókód már nem használható.");
        error.statusCode = 409;
        throw error;
      }
      if (!auth.expires_at || new Date(auth.expires_at).getTime() <= Date.now()) {
        await client.query(`UPDATE aif_shop_return_authorizations SET status='expired', access_code=NULL, updated_at=now() WHERE id=$1`, [auth.id]);
        await client.query("COMMIT");
        return res.status(410).json({ error: "A feloldókód lejárt. Kérj új kódot.", code: "return_authorization_expired" });
      }
      if (text(auth.access_code) !== code) {
        const attempts = Number(auth.attempt_count || 0) + 1;
        const lockOut = attempts >= 5;
        await client.query(
          `UPDATE aif_shop_return_authorizations
           SET attempt_count=$2,
               status=CASE WHEN $3 THEN 'expired' ELSE status END,
               access_code=CASE WHEN $3 THEN NULL ELSE access_code END,
               updated_at=now()
           WHERE id=$1`,
          [auth.id, attempts, lockOut]
        );
        await client.query("COMMIT");
        return res.status(403).json({
          error: lockOut ? "Túl sok hibás próbálkozás. Kérj új feloldókódot." : `Hibás feloldókód. Még ${5 - attempts} próbálkozás maradt.`,
          code: lockOut ? "return_authorization_locked" : "return_authorization_code_invalid",
        });
      }

      const token = randomUUID();
      const unlockExpiresAt = new Date(Date.now() + 20 * 60 * 1000);
      await client.query(
        `UPDATE aif_shop_return_authorizations
         SET status='unlocked', access_code=NULL, unlock_token_hash=$2,
             unlock_expires_at=$3, unlocked_at=now(), unlocked_by=$4, updated_at=now()
         WHERE id=$1`,
        [auth.id, tokenHash(token), unlockExpiresAt, actorFrom(req)]
      );
      const saleLine = await loadSaleLine(client, auth.sale_line_id, { lock: false });
      await client.query("COMMIT");
      if (!saleLine) return res.status(404).json({ error: "Az eladási tétel már nem található." });
      return res.json({
        ok: true,
        unlockToken: token,
        unlockExpiresAt: unlockExpiresAt.toISOString(),
        item: returnSaleRow(saleLine, location, true),
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF shop return authorization unlock failed", error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "A feloldás nem sikerült.", code: error?.code || null });
    } finally {
      client.release();
    }
  });

  router.post("/authorizations/:id/reject", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureAifShopSalesSchema();
      const location = await aifResolveShopLocation(req, client, req.body?.location);
      const result = await client.query(
        `SELECT * FROM aif_shop_return_authorizations WHERE id::text=$1 FOR UPDATE`,
        [id]
      );
      if (!result.rowCount) {
        const error = new Error("Az árlekérés nem található.");
        error.statusCode = 404;
        throw error;
      }
      const auth = result.rows[0];
      if (String(auth.source_location_id) !== String(location.id)) {
        const error = new Error("Ezt az árlekérést csak az eladást végző üzlet kezelheti.");
        error.statusCode = 403;
        throw error;
      }
      if (auth.status !== "pending") {
        const error = new Error("Csak függő árlekérés utasítható el.");
        error.statusCode = 409;
        throw error;
      }
      await client.query(
        `UPDATE aif_shop_return_authorizations
         SET status='rejected', access_code=NULL, rejected_at=now(), rejected_by=$2, updated_at=now()
         WHERE id=$1`,
        [auth.id, actorFrom(req)]
      );
      await client.query("COMMIT");
      return res.json({ ok: true, id: String(auth.id), status: "rejected" });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "Az árlekérés elutasítása nem sikerült.", code: error?.code || null });
    } finally {
      client.release();
    }
  });

  router.get("/history", requireAuthed, async (req, res) => {
    try {
      await ensureAifShopSalesSchema();
      const location = await aifResolveShopLocation(req, pool, req.query.location);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit || 60)));
      const result = await pool.query(
        `SELECT
           e.*, src.code AS source_location_code, src.name AS source_location_name,
           sl.product_title AS source_product_title,
           sl.product_code AS source_product_code,
           sl.barcode AS source_barcode,
           sl.brand_name AS source_brand_name,
           sl.color_name AS source_color_name,
           sl.size AS source_size,
           sl.image_url AS source_image_url,
           COALESCE(repl.lines, '[]'::jsonb) AS replacement_lines
         FROM aif_shop_exchanges e
         JOIN aif_locations src ON src.id=e.source_location_id
         JOIN aif_shop_sale_lines sl ON sl.id=e.source_sale_line_id
         LEFT JOIN LATERAL (
           SELECT jsonb_agg(
             jsonb_build_object(
               'id', el.id::text,
               'lineNo', el.line_no,
               'variantId', el.variant_id::text,
               'quantity', el.quantity,
               'unitPrice', el.unit_price,
               'lineTotal', el.line_total,
               'title', COALESCE(NULLIF(el.product_title,''), NULLIF(m.title_ro,''), NULLIF(m.shopify_title,''), NULLIF(el.product_code,''), 'Ismeretlen termék'),
               'productCode', COALESCE(NULLIF(el.product_code,''), NULLIF(sc.supplier_product_code,''), NULLIF(m.model_code,''), NULLIF(v.internal_sku,'')),
               'barcode', COALESCE(NULLIF(el.barcode,''), NULLIF(v.barcode,'')),
               'brandName', COALESCE(NULLIF(el.brand_name,''), NULLIF(b.name,'')),
               'colorName', COALESCE(NULLIF(el.color_name,''), NULLIF(v.color_name,''), NULLIF(v.color_code,'')),
               'size', COALESCE(NULLIF(el.size,''), NULLIF(v.size,'')),
               'imageUrl', COALESCE(NULLIF(el.image_url,''), NULLIF(v.image_url,''))
             )
             ORDER BY el.line_no ASC
           ) AS lines
           FROM aif_shop_exchange_lines el
           LEFT JOIN aif_product_variants v ON v.id=el.variant_id
           LEFT JOIN aif_product_models m ON m.id=v.model_id
           LEFT JOIN aif_brands b ON b.id=m.brand_id
           LEFT JOIN LATERAL (
             SELECT supplier_product_code
             FROM aif_variant_supplier_codes sc
             WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
             ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST
             LIMIT 1
           ) sc ON true
           WHERE el.exchange_id=e.id
         ) repl ON true
         WHERE e.location_id=$1 AND e.status='completed'
         ORDER BY e.created_at DESC
         LIMIT $2`,
        [location.id, limit]
      );
      return res.json({
        ok: true,
        location: { id: String(location.id), code: location.code, name: location.name },
        items: result.rows.map((row) => ({
          id: String(row.id),
          exchangeNumber: row.exchange_number,
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
          actor: row.actor || null,
          customerName: row.customer_name || null,
          sourceLocation: { id: String(row.source_location_id), code: row.source_location_code, name: row.source_location_name },
          sourceSaleId: String(row.source_sale_id),
          sourceSaleLineId: String(row.source_sale_line_id),
          returnedQty: aifNumber(row.returned_qty),
          returnCredit: aifNumber(row.return_credit),
          replacementTotal: aifNumber(row.replacement_total),
          difference: aifNumber(row.difference),
          settlementDirection: row.settlement_direction,
          settlementMethod: row.settlement_method || null,
          settlementAmount: aifNumber(row.settlement_amount),
          returnBatchId: row.original_snapshot?.returnBatchId || null,
          returnBatchPrimary: row.original_snapshot?.returnBatchPrimary === true,
          returnBatchCount: aifNumber(row.original_snapshot?.returnBatchCount) || 1,
          note: row.note || null,
          sourceProduct: {
            title: row.source_product_title || "Ismeretlen termék",
            productCode: row.source_product_code || null,
            barcode: row.source_barcode || null,
            brandName: row.source_brand_name || null,
            colorName: row.source_color_name || null,
            size: row.source_size || null,
            imageUrl: row.source_image_url || null,
          },
          replacementLines: (Array.isArray(row.replacement_lines) ? row.replacement_lines : []).map((line) => ({
            id: String(line.id || ""),
            lineNo: aifNumber(line.lineNo),
            variantId: String(line.variantId || ""),
            quantity: aifNumber(line.quantity),
            unitPrice: aifNumber(line.unitPrice),
            lineTotal: aifNumber(line.lineTotal),
            title: line.title || "Ismeretlen termék",
            productCode: line.productCode || null,
            barcode: line.barcode || null,
            brandName: line.brandName || null,
            colorName: line.colorName || null,
            size: line.size || null,
            imageUrl: line.imageUrl || null,
          })),
        })),
      });
    } catch (error) {
      console.error("AIF shop return history failed", error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "A visszáru előzmények nem tölthetők be.", code: error?.code || null });
    }
  });



  router.post("/customer-credit-return", requireAuthed, async (req, res) => {
    const body = req.body || {};
    const customerId = text(body.customerId || body.customer_id);
    const saleLineId = text(body.saleLineId || body.sale_line_id);
    const returnedQty = Math.max(0, Number.parseInt(String(body.returnedQty ?? body.returned_qty ?? 1), 10) || 0);
    const idempotencyKey = text(req.get("Idempotency-Key") || body.idempotencyKey || body.idempotency_key).slice(0, 200);
    const note = text(body.note) || null;

    if (!isUuidText(customerId)) return res.status(400).json({ error: "Érvénytelen kliensazonosító." });
    if (!isUuidText(saleLineId)) return res.status(400).json({ error: "Érvénytelen eladási tétel." });
    if (!returnedQty) return res.status(400).json({ error: "Legalább 1 db visszahozott termék szükséges." });
    if (!idempotencyKey) return res.status(400).json({ error: "Hiányzik a visszavétel biztonsági azonosítója." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureAifShopSalesSchema();
      const location = await aifResolveShopLocation(req, client, body.location);

      const duplicate = await client.query(
        `SELECT e.*, s.balance_due, s.total
         FROM aif_shop_exchanges e
         JOIN aif_shop_sales s ON s.id=e.source_sale_id
         WHERE e.client_request_id=$1
         LIMIT 1`,
        [idempotencyKey]
      );
      if (duplicate.rowCount) {
        const row = duplicate.rows[0];
        const snapshot = row.original_snapshot && typeof row.original_snapshot === "object"
          ? row.original_snapshot
          : {};
        if (
          String(row.source_sale_line_id) !== saleLineId
          || String(snapshot.customerId || "") !== customerId
          || String(snapshot.source || "") !== "shop_customer_credit_return"
        ) {
          const collision = new Error("Ez a visszavételi azonosító már egy másik művelethez tartozik.");
          collision.statusCode = 409;
          collision.code = "customer_credit_return_idempotency_collision";
          throw collision;
        }
        await client.query("COMMIT");
        return res.json({
          ok: true,
          duplicate: true,
          exchangeId: String(row.id),
          exchangeNumber: row.exchange_number,
          saleId: String(row.source_sale_id),
          saleLineId: String(row.source_sale_line_id),
          customerId,
          returnedQty: aifNumber(row.returned_qty),
          returnCredit: aifNumber(row.return_credit),
          openBalance: aifNumber(row.balance_due),
          saleTotal: aifNumber(row.total),
        });
      }

      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`aif_shop_shift:${location.id}`]);
      await aifAssertNoPendingShopShiftHandover(client, location.id, actorFrom(req));
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`aif_customer_credit_return:${saleLineId}`]);

      const customerResult = await client.query(
        `SELECT id, full_name, phone
         FROM aif_shop_customers
         WHERE id::text=$1
           AND location_id=$2
           AND is_active=true
         FOR UPDATE`,
        [customerId, location.id]
      );
      if (!customerResult.rowCount) {
        const error = new Error("A kliens nem található ebben az üzletben vagy inaktív.");
        error.statusCode = 404;
        throw error;
      }
      const customer = customerResult.rows[0];

      const source = await loadSaleLine(client, saleLineId, { lock: true });
      if (!source || source.sale_status !== "completed") {
        const error = new Error("Az eladási tétel nem található vagy már nem érvényes.");
        error.statusCode = 404;
        throw error;
      }
      if (String(source.sale_location_id) !== String(location.id)) {
        const error = new Error("A próbára elvitt terméket annál az üzletnél kell visszavenni, ahol az eladás történt.");
        error.statusCode = 409;
        error.code = "customer_credit_return_wrong_location";
        throw error;
      }
      if (String(source.customer_id || "") !== String(customer.id)) {
        const error = new Error("Ez a termék nem ehhez a klienshez tartozik.");
        error.statusCode = 409;
        error.code = "customer_credit_return_wrong_customer";
        throw error;
      }
      if (!source.variant_id) {
        const error = new Error("A termékvariáns nem azonosítható biztonságosan, ezért nem tehető vissza automatikusan készletre.");
        error.statusCode = 409;
        error.code = "customer_credit_return_variant_missing";
        throw error;
      }

      const balanceBefore = aifRoundMoney(source.balance_due);
      if (balanceBefore <= 0.005) {
        const error = new Error("Ehhez a vásárláshoz már nincs nyitott tartozás. Használd a normál visszáru/csere folyamatot.");
        error.statusCode = 409;
        error.code = "customer_credit_return_no_open_balance";
        throw error;
      }

      const remainingQty = Math.max(0, aifNumber(source.quantity) - aifNumber(source.returned_qty));
      if (returnedQty > remainingQty) {
        const error = new Error(`Ebből a tételből legfeljebb ${remainingQty} db vehető vissza.`);
        error.statusCode = 409;
        error.code = "customer_credit_return_quantity_exceeded";
        throw error;
      }

      const unitPrice = aifRoundMoney(source.unit_price);
      const listPrice = aifRoundMoney(source.list_price);
      const returnCredit = aifRoundMoney(unitPrice * returnedQty);
      if (returnCredit <= 0) {
        const error = new Error("A visszahozott termék jóváírási értéke nem állapítható meg.");
        error.statusCode = 409;
        error.code = "customer_credit_return_value_missing";
        throw error;
      }
      if (returnCredit > balanceBefore + 0.005) {
        const error = new Error(
          `Ezt a terméket innen nem lehet egyszerű tartozáscsökkentéssel visszavenni, mert ${returnCredit.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON jóváírás több a jelenlegi ${balanceBefore.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON tartozásnál. Ehhez normál visszáru/pénzvisszatérítés szükséges.`
        );
        error.statusCode = 409;
        error.code = "customer_credit_return_requires_refund";
        throw error;
      }

      const paidBefore = aifRoundMoney(source.paid_total);
      const totalBefore = aifRoundMoney(source.total);
      const subtotalBefore = aifRoundMoney(source.subtotal);
      const discountBefore = aifRoundMoney(source.discount_total);
      const returnSubtotal = aifRoundMoney(listPrice * returnedQty);
      const returnDiscount = aifRoundMoney(Math.max(0, (listPrice - unitPrice) * returnedQty));
      const subtotalAfter = aifRoundMoney(Math.max(0, subtotalBefore - returnSubtotal));
      const discountAfter = aifRoundMoney(Math.max(0, discountBefore - returnDiscount));
      const totalAfter = aifRoundMoney(Math.max(0, totalBefore - returnCredit));
      const balanceAfter = aifRoundMoney(Math.max(0, balanceBefore - returnCredit));

      if (paidBefore > totalAfter + 0.005) {
        const error = new Error("A visszavétel pénzvisszatérítést is igényelne, ezért ezt a normál visszáru felületen kell kezelni.");
        error.statusCode = 409;
        error.code = "customer_credit_return_paid_amount_conflict";
        throw error;
      }

      const stockResult = await client.query(
        `SELECT qty, reserved_qty
         FROM aif_stock
         WHERE location_id=$1 AND variant_id=$2
         FOR UPDATE`,
        [location.id, source.variant_id]
      );
      const qtyBefore = stockResult.rowCount ? aifNumber(stockResult.rows[0].qty) : 0;
      const reservedQty = stockResult.rowCount ? aifNumber(stockResult.rows[0].reserved_qty) : 0;
      const qtyAfter = qtyBefore + returnedQty;

      const exchangeNumber = await allocateExchangeNumber(client, location);
      const actor = actorFrom(req);
      const originalSnapshot = {
        source: "shop_customer_credit_return",
        mode: "trial_return",
        customerId: String(customer.id),
        customerName: customer.full_name || source.customer_name || null,
        customerPhone: customer.phone || source.customer_phone || null,
        saleNumber: source.sale_number,
        soldAt: source.sold_at,
        product: {
          variantId: String(source.variant_id),
          title: source.product_title,
          productCode: source.product_code,
          barcode: source.barcode,
          brandName: source.brand_name,
          colorName: source.color_name,
          size: source.size,
        },
        returnedQty,
        unitPrice,
        listPrice,
        returnCredit,
        balanceBefore,
        balanceAfter,
        subtotalBefore,
        subtotalAfter,
        discountBefore,
        discountAfter,
        totalBefore,
        totalAfter,
        paidBefore,
        processedAtLocation: {
          id: String(location.id),
          code: location.code,
          name: location.name,
        },
      };

      const exchangeInsert = await client.query(
        `INSERT INTO aif_shop_exchanges (
           exchange_number, location_id, source_location_id, source_sale_id, source_sale_line_id, source_variant_id,
           returned_qty, return_unit_credit, return_credit, replacement_total, difference,
           settlement_direction, settlement_method, settlement_amount,
           customer_name, customer_phone, actor, note, authorization_id,
           original_snapshot, replacement_snapshot, client_request_id, status, created_at, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,0,0,
           'none',NULL,0,$10,$11,$12,$13,NULL,$14::jsonb,'[]'::jsonb,$15,'completed',now(),now()
         ) RETURNING *`,
        [
          exchangeNumber,
          location.id,
          source.sale_location_id,
          source.sale_id,
          source.sale_line_id,
          source.variant_id,
          returnedQty,
          unitPrice,
          returnCredit,
          customer.full_name || source.customer_name || null,
          customer.phone || source.customer_phone || null,
          actor,
          note,
          JSON.stringify(originalSnapshot),
          idempotencyKey,
        ]
      );
      const exchange = exchangeInsert.rows[0];

      await client.query(
        `INSERT INTO aif_stock (location_id, variant_id, qty, reserved_qty, updated_at)
         VALUES ($1,$2,$3,$4,now())
         ON CONFLICT (location_id, variant_id)
         DO UPDATE SET qty=$3, reserved_qty=$4, updated_at=now()`,
        [location.id, source.variant_id, qtyAfter, reservedQty]
      );

      const movementLogged = await insertStockMovementSafe(client, {
        movementType: "incoming",
        sourceType: "shop_customer_credit_return",
        sourcePrefix: "credit_ret",
        fallbackSourceType: "manual_stock_edit",
        sourceId: String(exchange.id),
        locationId: location.id,
        variantId: source.variant_id,
        qtyDelta: returnedQty,
        qtyBefore,
        qtyAfter,
        actor,
        raw: {
          reason: "shop_customer_credit_return",
          mode: "trial_return",
          exchangeId: String(exchange.id),
          exchangeNumber,
          customerId: String(customer.id),
          customerName: customer.full_name || null,
          sourceSaleId: String(source.sale_id),
          sourceSaleLineId: String(source.sale_line_id),
          saleNumber: source.sale_number,
          returnedQty,
          returnCredit,
          balanceBefore,
          balanceAfter,
        },
      });
      if (!movementLogged) {
        const error = new Error("A visszahozott termék készletmozgásának naplózása nem sikerült.");
        error.statusCode = 500;
        throw error;
      }

      const paymentStatusAfter = balanceAfter <= 0.005
        ? "paid"
        : paidBefore > 0.005
          ? "partial"
          : "credit";

      await client.query(
        `UPDATE aif_shop_sales
         SET subtotal=$2,
             discount_total=$3,
             total=$4,
             balance_due=$5,
             payment_status=$6,
             raw=COALESCE(raw,'{}'::jsonb) || jsonb_build_object(
               'lastCustomerCreditReturn',
               $7::jsonb
             ),
             updated_at=now()
         WHERE id=$1`,
        [
          source.sale_id,
          subtotalAfter,
          discountAfter,
          totalAfter,
          balanceAfter,
          paymentStatusAfter,
          JSON.stringify({
            exchangeId: String(exchange.id),
            exchangeNumber,
            customerId: String(customer.id),
            returnedQty,
            returnCredit,
            balanceBefore,
            balanceAfter,
            totalBefore,
            totalAfter,
            actor,
            at: new Date().toISOString(),
          }),
        ]
      );

      await client.query(
        `INSERT INTO aif_shop_sale_events (sale_id, event_type, actor, note, payload)
         VALUES ($1,'customer_credit_return',$2,$3,$4::jsonb)`,
        [
          source.sale_id,
          actor,
          note || `Próbára elvitt termék visszahozva: ${source.product_title || source.product_code || source.sale_line_id}`,
          JSON.stringify({
            exchangeId: String(exchange.id),
            exchangeNumber,
            customerId: String(customer.id),
            customerName: customer.full_name || null,
            sourceSaleLineId: String(source.sale_line_id),
            variantId: String(source.variant_id),
            productTitle: source.product_title || null,
            returnedQty,
            returnCredit,
            balanceBefore,
            balanceAfter,
            stockBefore: qtyBefore,
            stockAfter: qtyAfter,
            locationId: String(location.id),
            locationCode: location.code,
            locationName: location.name,
          }),
        ]
      );

      await client.query(
        `UPDATE aif_shop_customers
         SET updated_by=$2, updated_at=now()
         WHERE id=$1 AND location_id=$3`,
        [customer.id, actor, location.id]
      );

      await client.query("COMMIT");
      return res.json({
        ok: true,
        duplicate: false,
        exchangeId: String(exchange.id),
        exchangeNumber,
        saleId: String(source.sale_id),
        saleLineId: String(source.sale_line_id),
        customerId: String(customer.id),
        returnedQty,
        returnCredit,
        openBalance: balanceAfter,
        saleTotal: totalAfter,
        stock: {
          variantId: String(source.variant_id),
          qtyBefore,
          qtyAfter,
          qtyDelta: returnedQty,
        },
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF customer credit return failed", error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A visszahozott termék rögzítése nem sikerült.",
        code: error?.code || null,
        openBalance: error?.openBalance ?? null,
      });
    } finally {
      client.release();
    }
  });


  // Egy bizonylat tobb visszahozott sora egyetlen PostgreSQL tranzakcioban.
  // Minden forrassor sajat exchange-fejlecet kap (igy a meglevo osszesitok es
  // visszavetel-szamitasok is helyesek maradnak), a penzugy es a csere csak
  // egyszer, az elso fejlechez tartozik. returnBatchId csoportositja oket.
  async function completeReceiptReturnBatch(req, res) {
    const body = req.body || {};
    const input = Array.isArray(body.returns) ? body.returns : [];
    const replacementsInput = Array.isArray(body.replacements) ? body.replacements : [];
    const key = text(req.get("Idempotency-Key") || body.idempotencyKey || body.idempotency_key).slice(0, 200);
    const settlementMethod = normCode(body.settlementMethod || body.settlement_method || "");
    const allowedMethods = new Set(["cash", "card", "bank_transfer"]);
    const errorResponse = (message, code, status = 409) => Object.assign(new Error(message), { code, statusCode: status });
    if (input.length < 2 || input.length > 40 || replacementsInput.length > 100 || !key) {
      return res.status(400).json({ error: "A bizonylatos visszaru adatai ervenytelenek (2-40 sor, legfeljebb 100 csere-termek)." });
    }
    const wanted = [];
    const seenLines = new Set();
    for (const line of input) {
      const id = text(line.saleLineId || line.sale_line_id);
      const qty = Number(line.returnedQty ?? line.returned_qty);
      if (!isUuidText(id) || !Number.isSafeInteger(qty) || qty <= 0 || seenLines.has(id)) {
        return res.status(400).json({ error: "Duplikalt vagy ervenytelen visszaru sor/darabszam." });
      }
      seenLines.add(id);
      wanted.push({
        saleLineId: id, returnedQty: qty,
        authorizationId: text(line.authorizationId || line.authorization_id),
        unlockToken: text(line.unlockToken || line.unlock_token),
      });
    }
    wanted.sort((a, b) => a.saleLineId.localeCompare(b.saleLineId));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureAifShopSalesSchema();
      const location = await aifResolveShopLocation(req, client, body.location);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [`aif_shop_return_batch_request:${key}`]);
      const duplicate = await client.query(`SELECT * FROM aif_shop_exchanges WHERE client_request_id=$1 LIMIT 1`, [key]);
      if (duplicate.rowCount) {
        const prior = duplicate.rows[0];
        const snap = prior.original_snapshot || {};
        const priorLines = Array.isArray(snap.returnBatchLines) ? snap.returnBatchLines : [];
        const sameLines = JSON.stringify(priorLines.map(x => [String(x.saleLineId), Number(x.returnedQty)]).sort())
          === JSON.stringify(wanted.map(x => [x.saleLineId, x.returnedQty]).sort());
        if (!snap.returnBatchPrimary || !sameLines || String(prior.location_id) !== String(location.id)) {
          throw errorResponse("Ez a visszaru-azonosito mar masik muvelethez tartozik.", "return_batch_idempotency_collision");
        }
        const members = await client.query(
          `SELECT id::text, exchange_number, status FROM aif_shop_exchanges
           WHERE original_snapshot->>'returnBatchId'=$1 ORDER BY exchange_number`, [String(snap.returnBatchId)]
        );
        if (members.rows.length !== Number(snap.returnBatchCount) || members.rows.some(x => x.status !== "completed")) {
          throw errorResponse("Ez a tobbteteles visszaru mar vissza lett vonva vagy nem teljes. Nem indithato ujra.", "return_batch_incomplete_or_cancelled");
        }
        await client.query("COMMIT");
        return res.json({
          ok: true, duplicate: true,
          exchangeId: String(prior.id), exchangeNumber: prior.exchange_number,
          exchangeIds: members.rows.map(x => x.id), exchangeNumbers: members.rows.map(x => x.exchange_number),
          returnedLines: priorLines,
          returnedQty: priorLines.reduce((sum, x) => sum + Number(x.returnedQty || 0), 0),
          returnCredit: aifNumber(snap.returnBatchCredit),
          replacementTotal: aifNumber(prior.replacement_total), difference: aifNumber(prior.difference),
          settlementDirection: prior.settlement_direction,
          settlementMethod: prior.settlement_method || null,
          settlementAmount: aifNumber(prior.settlement_amount),
        });
      }

      await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [`aif_shop_shift:${location.id}`]);
      await aifAssertNoPendingShopShiftHandover(client, location.id, actorFrom(req));
      // A regi, egy-soros visszaru is ugyanazt a forrassor-zarat hasznalja.
      for (const ret of wanted) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [`aif_shop_return_line:${ret.saleLineId}`]);
      }
      const isAdmin = normCode(req.session?.role) === "admin";
      const sourceLines = [];
      const authRows = [];
      let saleId = null;
      let saleLocationId = null;
      for (const ret of wanted) {
        const source = await loadSaleLine(client, ret.saleLineId, { lock: true });
        if (!source || source.sale_status !== "completed" || !source.variant_id) {
          throw errorResponse("Az egyik eredeti termeksor nem ervenyes vagy nem azonosithato.", "return_batch_source_invalid");
        }
        if (saleId && String(source.sale_id) !== saleId) {
          throw errorResponse("Csak ugyanannak a bizonylatnak a termekei vehetoek vissza egyutt.", "return_batch_mixed_receipts", 400);
        }
        if (saleLocationId && String(source.sale_location_id) !== saleLocationId) {
          throw errorResponse("A visszahozott sorok nem ugyanahhoz az uzlethez tartoznak.", "return_batch_mixed_location", 400);
        }
        saleId = String(source.sale_id);
        saleLocationId = String(source.sale_location_id);
        if (aifNumber(source.balance_due) > 0.005) {
          throw errorResponse("Az eredeti bizonylaton meg nyitott tartozas van.", "return_source_open_balance");
        }
        const remaining = Math.max(0, aifNumber(source.quantity) - aifNumber(source.returned_qty));
        if (ret.returnedQty > remaining) {
          throw errorResponse(`${source.product_title}: legfeljebb ${remaining} db veheto vissza.`, "return_quantity_exceeded");
        }
        let auth = null;
        if (String(source.sale_location_id) !== String(location.id) && !isAdmin) {
          if (!isUuidText(ret.authorizationId) || !ret.unlockToken) {
            throw errorResponse(`${source.product_title}: a masik uzlet ar-feloldasa kotelezo.`, "return_price_authorization_required", 403);
          }
          const authResult = await client.query(`SELECT * FROM aif_shop_return_authorizations WHERE id=$1::uuid FOR UPDATE`, [ret.authorizationId]);
          auth = authResult.rows[0] || null;
          if (!auth || auth.status !== "unlocked" ||
              String(auth.sale_line_id) !== String(source.sale_line_id) ||
              String(auth.source_location_id) !== String(source.sale_location_id) ||
              String(auth.requesting_location_id) !== String(location.id) ||
              !auth.unlock_expires_at || new Date(auth.unlock_expires_at).getTime() <= Date.now() ||
              text(auth.unlock_token_hash) !== tokenHash(ret.unlockToken)) {
            throw errorResponse("A masik uzlet ar-feloldasa ervenytelen vagy lejart.", "return_price_authorization_invalid", 403);
          }
          authRows.push(auth);
        }
        const unitCredit = aifRoundMoney(source.unit_price);
        if (unitCredit < 0 || !Number.isFinite(unitCredit)) {
          throw errorResponse(`${source.product_title}: ervenytelen eredeti fizetett ar.`, "return_source_price_invalid");
        }
        sourceLines.push({ ...ret, source, auth, unitCredit, credit: aifRoundMoney(unitCredit * ret.returnedQty) });
      }

      const replacements = [];
      const seenVariants = new Set();
      for (const inputRow of replacementsInput) {
        const variantId = text(inputRow.variantId || inputRow.variant_id);
        const quantity = Number(inputRow.quantity ?? inputRow.qty ?? 1);
        if (!isUuidText(variantId) || !Number.isSafeInteger(quantity) || quantity <= 0 || seenVariants.has(variantId)) {
          throw errorResponse("Duplikalt vagy ervenytelen csere-termek.", "return_batch_replacement_invalid", 400);
        }
        seenVariants.add(variantId);
        replacements.push({ variantId, quantity });
      }

      const returnQtyByVariant = new Map();
      for (const line of sourceLines) {
        const id = String(line.source.variant_id);
        returnQtyByVariant.set(id, aifNumber(returnQtyByVariant.get(id)) + line.returnedQty);
      }
      const variantsToLock = Array.from(new Set([...returnQtyByVariant.keys(), ...replacements.map(x => x.variantId)])).sort();
      const variantRows = await client.query(
        `SELECT v.id AS variant_id, v.internal_sku, v.barcode, v.sell_price, v.buy_price,
                v.size, v.color_name, v.color_code, v.image_url, v.status AS variant_status,
                m.status AS model_status, m.model_code,
                COALESCE(NULLIF(m.title_ro,''), NULLIF(m.shopify_title,''), m.model_code, v.internal_sku) AS title,
                b.name AS brand_name,
                sc.supplier_product_code
         FROM aif_product_variants v
         JOIN aif_product_models m ON m.id=v.model_id
         LEFT JOIN aif_brands b ON b.id=m.brand_id
         LEFT JOIN LATERAL (
           SELECT supplier_product_code FROM aif_variant_supplier_codes sc
           WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
           ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST LIMIT 1
         ) sc ON true
         WHERE v.id=ANY($1::uuid[]) ORDER BY v.id FOR UPDATE OF v`, [variantsToLock]
      );
      const stocks = await client.query(
        `SELECT variant_id, qty, reserved_qty FROM aif_stock
         WHERE location_id=$1 AND variant_id=ANY($2::uuid[])
         ORDER BY variant_id FOR UPDATE`, [location.id, variantsToLock]
      );
      const stocksById = new Map(stocks.rows.map(x => [String(x.variant_id), x]));
      const variantMap = new Map(variantRows.rows.map(row => {
        const stock = stocksById.get(String(row.variant_id));
        return [String(row.variant_id), {
          ...row, qty: stock ? aifNumber(stock.qty) : 0,
          reserved_qty: stock ? aifNumber(stock.reserved_qty) : 0,
        }];
      }));
      for (const source of sourceLines) {
        if (!variantMap.has(String(source.source.variant_id))) {
          throw errorResponse("Az egyik visszahozott termek nem talalhato a termektorzsben.", "return_batch_source_variant_missing");
        }
      }
      for (const item of replacements) {
        const product = variantMap.get(item.variantId);
        if (!product || String(product.variant_status) !== "active" || String(product.model_status) !== "active") {
          throw errorResponse("Az egyik csere-termek inaktiv vagy nem talalhato.", "return_batch_replacement_inactive");
        }
        const available = aifNumber(product.qty) - aifNumber(product.reserved_qty) + aifNumber(returnQtyByVariant.get(item.variantId));
        if (available < item.quantity) {
          throw errorResponse(`${product.title}: csak ${Math.max(0, available)} db all rendelkezesre.`, "insufficient_stock");
        }
        const price = Number(product.sell_price);
        if (!Number.isFinite(price) || price < 0) {
          throw errorResponse(`${product.title}: ervenytelen eladasi ar.`, "return_batch_replacement_price", 400);
        }
        item.unitPrice = aifRoundMoney(price);
        item.lineTotal = aifRoundMoney(item.unitPrice * item.quantity);
        item.buyPrice = product.buy_price == null ? null : aifRoundMoney(product.buy_price);
        item.product = product;
      }
      const totalCredit = aifRoundMoney(sourceLines.reduce((sum, x) => sum + x.credit, 0));
      const replacementTotal = aifRoundMoney(replacements.reduce((sum, x) => sum + x.lineTotal, 0));
      const difference = aifRoundMoney(replacementTotal - totalCredit);
      const direction = difference > 0.005 ? "in" : difference < -0.005 ? "out" : "none";
      const settle = direction === "none" ? 0 : aifRoundMoney(Math.abs(difference));
      if (direction !== "none" && !allowedMethods.has(settlementMethod)) {
        throw errorResponse("Valaszd ki a kulonbozet fizetesi modjat.", "return_batch_settlement_required", 400);
      }
      const batchId = randomUUID();
      const actor = actorFrom(req);
      const summary = sourceLines.map(x => ({
        saleLineId: String(x.source.sale_line_id), variantId: String(x.source.variant_id),
        title: x.source.product_title, returnedQty: x.returnedQty,
        unitPrice: x.unitCredit, returnCredit: x.credit,
      }));
      const exchangeRows = [];
      // Az elso fejlechez tartozik a teljes penzugy es az uj csere-termekek.
      for (let index = 0; index < sourceLines.length; index++) {
        const row = sourceLines[index];
        const primary = index === 0;
        const exchangeNumber = await allocateExchangeNumber(client, location);
        const source = row.source;
        const requestId = primary ? key : `rb:${tokenHash(key).slice(0,40)}:${index}`;
        const snapshot = {
          returnBatchId: batchId,
          returnBatchPrimary: primary,
          returnBatchCount: sourceLines.length,
          returnBatchLines: primary ? summary : undefined,
          returnBatchCredit: primary ? totalCredit : undefined,
          saleNumber: source.sale_number, soldAt: source.sold_at,
          sourceLocation: { id: String(source.sale_location_id), code: source.sale_location_code, name: source.sale_location_name },
          product: {
            variantId: String(source.variant_id), title: source.product_title,
            productCode: source.product_code, barcode: source.barcode,
            brandName: source.brand_name, colorName: source.color_name, size: source.size,
          },
          originalQuantity: aifNumber(source.quantity), returnedQty: row.returnedQty,
          listPrice: aifRoundMoney(source.list_price), unitPrice: row.unitCredit,
          discountPercent: aifRoundMoney(source.discount_percent),
          sourceBuyPrice: source.source_buy_price == null ? null : aifRoundMoney(source.source_buy_price),
          sourceBuyPriceSource: source.buy_price_snapshot == null ? "current_variant_fallback" : "sale_snapshot",
        };
        const inserted = await client.query(
          `INSERT INTO aif_shop_exchanges (
             exchange_number, location_id, source_location_id, source_sale_id, source_sale_line_id, source_variant_id,
             returned_qty, return_unit_credit, return_credit, replacement_total, difference,
             settlement_direction, settlement_method, settlement_amount,
             customer_name, customer_phone, actor, note, authorization_id,
             original_snapshot, replacement_snapshot, client_request_id, status, created_at, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21::jsonb,$22,'completed',now(),now()) RETURNING *`,
          [
            exchangeNumber, location.id, source.sale_location_id, source.sale_id, source.sale_line_id, source.variant_id,
            row.returnedQty, row.unitCredit, row.credit, primary ? replacementTotal : 0,
            primary ? difference : 0, primary ? direction : "none",
            primary && direction !== "none" ? settlementMethod : null, primary ? settle : 0,
            source.customer_name || null, source.customer_phone || null, actor,
            text(body.note) || null, row.auth?.id || null, JSON.stringify(snapshot),
            JSON.stringify(primary ? replacements.map(x => ({
              variantId: x.variantId, quantity: x.quantity, unitPrice: x.unitPrice,
              lineTotal: x.lineTotal, buyPrice: x.buyPrice,
            })) : []), requestId,
          ]
        );
        exchangeRows.push({ header: inserted.rows[0], line: row });
      }
      const main = exchangeRows[0].header;
      let itemNo = 1;
      for (const item of replacements) {
        const p = item.product;
        await client.query(
          `INSERT INTO aif_shop_exchange_lines (
             exchange_id, line_no, variant_id, quantity, unit_price, line_total, buy_price_snapshot,
             product_title, product_code, barcode, brand_name, color_name, size, image_url, raw
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
          [main.id, itemNo++, item.variantId, item.quantity, item.unitPrice, item.lineTotal, item.buyPrice,
           p.title || null, p.supplier_product_code || p.model_code || p.internal_sku || null,
           p.barcode || null, p.brand_name || null, p.color_name || p.color_code || null,
           p.size || null, p.image_url || null,
           JSON.stringify({ source: "shop_exchange_batch", returnBatchId: batchId })]
        );
      }
      const runningQty = new Map(variantMap.entries().map(([variantId, row]) => [variantId, aifNumber(row.qty)]));
      // A bizonylat valamennyi visszavett tetelet egyenkent es pontosan egyszer
      // naplozzuk. Az egesz blokk tranzakcios: reszsiker nem fordulhat elo.
      for (const { header, line } of exchangeRows) {
        const variantId = String(line.source.variant_id);
        const before = runningQty.get(variantId);
        const after = before + line.returnedQty;
        const stock = variantMap.get(variantId);
        await client.query(
          `INSERT INTO aif_stock (location_id, variant_id, qty, reserved_qty, updated_at)
           VALUES ($1,$2,$3,$4,now())
           ON CONFLICT (location_id,variant_id)
           DO UPDATE SET qty=$3, reserved_qty=$4, updated_at=now()`,
          [location.id, variantId, after, aifNumber(stock.reserved_qty)]
        );
        runningQty.set(variantId, after);
        const logged = await insertStockMovementSafe(client, {
          movementType: "manual_adjustment", sourceType: "shop_exchange_return", sourcePrefix: "ex_return",
          fallbackSourceType: "manual_stock_edit", sourceId: String(header.id),
          locationId: location.id, variantId, qtyDelta: line.returnedQty,
          qtyBefore: before, qtyAfter: after, actor,
          raw: {
            reason: "shop_exchange_return", exchangeId: String(header.id), exchangeNumber: header.exchange_number,
            returnBatchId: batchId, sourceSaleId: saleId,
            sourceSaleLineId: String(line.source.sale_line_id),
            sourceLocationCode: line.source.sale_location_code,
            returnCredit: line.credit, returnedQty: line.returnedQty,
          },
        });
        if (!logged) throw errorResponse("Az egyik visszaru keszletnaploja nem mentheto.", "return_batch_stock_log_error", 500);
      }
      for (const item of replacements) {
        const before = runningQty.get(item.variantId);
        const after = before - item.quantity;
        const stock = variantMap.get(item.variantId);
        if (after < aifNumber(stock.reserved_qty)) {
          throw errorResponse(`${stock.title}: a csere kozben nem eleg a keszlet.`, "insufficient_stock");
        }
        await client.query(
          `INSERT INTO aif_stock (location_id,variant_id,qty,reserved_qty,updated_at)
           VALUES ($1,$2,$3,$4,now()) ON CONFLICT (location_id,variant_id)
           DO UPDATE SET qty=$3,reserved_qty=$4,updated_at=now()`,
          [location.id, item.variantId, after, aifNumber(stock.reserved_qty)]
        );
        runningQty.set(item.variantId, after);
        const logged = await insertStockMovementSafe(client, {
          movementType: "sale", sourceType: "shop_exchange_out", sourcePrefix: "ex_out",
          fallbackSourceType: "manual_stock_edit", sourceId: String(main.id),
          locationId: location.id, variantId: item.variantId, qtyDelta: -item.quantity,
          qtyBefore: before, qtyAfter: after, actor,
          raw: {
            reason: "shop_exchange_out", exchangeId: String(main.id), exchangeNumber: main.exchange_number,
            returnBatchId: batchId, sourceSaleId: saleId,
            unitPrice: item.unitPrice, lineTotal: item.lineTotal, quantity: item.quantity,
          },
        });
        if (!logged) throw errorResponse("A csere-termek keszletnaploja nem mentheto.", "return_batch_stock_log_error", 500);
      }
      if (direction !== "none") {
        await client.query(
          `INSERT INTO aif_shop_exchange_settlements (
             exchange_id,location_id,method,direction,amount,actor,note,raw,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now())`,
          [main.id, location.id, settlementMethod, direction, settle, actor,
           text(body.note) || null,
           JSON.stringify({ returnBatchId: batchId, difference, returnCredit: totalCredit, replacementTotal })]
        );
      }
      await client.query(
        `INSERT INTO aif_shop_sale_events (sale_id,event_type,actor,note,payload)
         VALUES ($1,'exchange_return',$2,$3,$4::jsonb)`,
        [saleId, actor, text(body.note) || null, JSON.stringify({
          returnBatchId: batchId, exchangeId: String(main.id), exchangeNumber: main.exchange_number,
          exchangeIds: exchangeRows.map(x => String(x.header.id)), returns: summary,
          returnCredit: totalCredit, replacementTotal, difference, direction, settlementMethod: direction === "none" ? null : settlementMethod,
          processedAtLocation: { id: String(location.id), code: location.code, name: location.name },
        })]
      );
      for (const auth of authRows) {
        await client.query(
          `UPDATE aif_shop_return_authorizations
           SET status='used',used_at=now(),used_by=$2,unlock_token_hash=NULL,updated_at=now()
           WHERE id=$1`, [auth.id, actor]
        );
      }
      await client.query("COMMIT");
      return res.json({
        ok: true, duplicate: false,
        exchangeId: String(main.id), exchangeNumber: main.exchange_number,
        exchangeIds: exchangeRows.map(x => String(x.header.id)),
        exchangeNumbers: exchangeRows.map(x => x.header.exchange_number),
        returnedLines: summary, returnedQty: summary.reduce((sum, x) => sum + x.returnedQty, 0),
        returnCredit: totalCredit, replacementTotal, difference,
        settlementDirection: direction, settlementMethod: direction === "none" ? null : settlementMethod,
        settlementAmount: settle,
        createdAt: main.created_at ? new Date(main.created_at).toISOString() : new Date().toISOString(),
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF shop receipt multi-return failed", error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A bizonylat tobb termekes visszaruja nem sikerult.", code: error?.code || null,
      });
    } finally {
      client.release();
    }
  }

  router.post("/exchanges", requireAuthed, async (req, res) => {
    if (Array.isArray(req.body?.returns) && req.body.returns.length > 1) {
      return completeReceiptReturnBatch(req, res);
    }
    const body = req.body || {};
    const saleLineId = text(body.saleLineId || body.sale_line_id);
    const returnedQty = Math.max(0, Number.parseInt(String(body.returnedQty ?? body.returned_qty ?? 1), 10) || 0);
    const replacementsInput = Array.isArray(body.replacements) ? body.replacements : [];
    const settlementMethod = normCode(body.settlementMethod || body.settlement_method || "");
    const allowedSettlementMethods = new Set(["cash", "card", "bank_transfer"]);
    const idempotencyKey = text(req.get("Idempotency-Key") || body.idempotencyKey || body.idempotency_key).slice(0, 200);
    const authorizationId = text(body.authorizationId || body.authorization_id);
    const unlockToken = text(body.unlockToken || body.unlock_token);

    if (!isUuidText(saleLineId)) return res.status(400).json({ error: "Érvénytelen visszáru tétel." });
    if (!returnedQty) return res.status(400).json({ error: "Legalább 1 db visszavett termék szükséges." });
    if (replacementsInput.length > 100) return res.status(400).json({ error: "Egy cserében legfeljebb 100 csere-tétel lehet." });
    if (!idempotencyKey) return res.status(400).json({ error: "Hiányzik a csere biztonsági azonosítója." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureAifShopSalesSchema();
      const location = await aifResolveShopLocation(req, client, body.location);

      const duplicate = await client.query(`SELECT * FROM aif_shop_exchanges WHERE client_request_id=$1 LIMIT 1`, [idempotencyKey]);
      if (duplicate.rowCount) {
        const row = duplicate.rows[0];
        await client.query("COMMIT");
        return res.json({
          ok: true,
          duplicate: true,
          exchangeId: String(row.id),
          exchangeNumber: row.exchange_number,
          returnedQty: aifNumber(row.returned_qty),
          returnCredit: aifNumber(row.return_credit),
          replacementTotal: aifNumber(row.replacement_total),
          difference: aifNumber(row.difference),
          settlementDirection: row.settlement_direction,
          settlementMethod: row.settlement_method || null,
          settlementAmount: aifNumber(row.settlement_amount),
        });
      }

      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`aif_shop_shift:${location.id}`]);
      await aifAssertNoPendingShopShiftHandover(client, location.id, actorFrom(req));
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`aif_shop_return_line:${saleLineId}`]);

      const source = await loadSaleLine(client, saleLineId, { lock: true });
      if (!source || source.sale_status !== "completed") {
        const error = new Error("A visszáru alapjául szolgáló eladás nem található.");
        error.statusCode = 404;
        throw error;
      }
      if (aifNumber(source.balance_due) > 0.005) {
        const error = new Error("Ehhez az eredeti eladáshoz még nyitott tartozás tartozik. Visszáru vagy csere előtt a tartozást rendezni kell, különben a pénzügyi egyenleg hibás lenne.");
        error.statusCode = 409;
        error.code = "return_source_open_balance";
        throw error;
      }
      const remainingQty = Math.max(0, aifNumber(source.quantity) - aifNumber(source.returned_qty));
      if (returnedQty > remainingQty) {
        const error = new Error(`Ebből a tételből legfeljebb ${remainingQty} db vehető vissza.`);
        error.statusCode = 409;
        error.code = "return_quantity_exceeded";
        throw error;
      }
      if (!source.variant_id) {
        const error = new Error("A régi eladás termékvariánsa nem azonosítható biztonságosan, ezért a készlet nem módosítható automatikusan.");
        error.statusCode = 409;
        error.code = "return_source_variant_missing";
        throw error;
      }

      let authorizationRow = null;
      const isCrossStore = String(source.sale_location_id) !== String(location.id);
      const isAdmin = normCode(req.session?.role) === "admin";
      if (isCrossStore && !isAdmin) {
        if (!isUuidText(authorizationId) || !unlockToken) {
          const error = new Error("A másik üzletben történt eladás árához érvényes feloldás szükséges.");
          error.statusCode = 403;
          error.code = "return_price_authorization_required";
          throw error;
        }
        const authResult = await client.query(
          `SELECT * FROM aif_shop_return_authorizations WHERE id::text=$1 FOR UPDATE`,
          [authorizationId]
        );
        if (!authResult.rowCount) {
          const error = new Error("A feloldás nem található.");
          error.statusCode = 403;
          throw error;
        }
        authorizationRow = authResult.rows[0];
        if (
          authorizationRow.status !== "unlocked"
          || String(authorizationRow.sale_line_id) !== String(source.sale_line_id)
          || String(authorizationRow.source_location_id) !== String(source.sale_location_id)
          || String(authorizationRow.requesting_location_id) !== String(location.id)
          || !authorizationRow.unlock_expires_at
          || new Date(authorizationRow.unlock_expires_at).getTime() <= Date.now()
          || text(authorizationRow.unlock_token_hash) !== tokenHash(unlockToken)
        ) {
          const error = new Error("A feloldás lejárt, már felhasználták vagy nem ehhez a cseréhez tartozik.");
          error.statusCode = 403;
          error.code = "return_price_authorization_invalid";
          throw error;
        }
      }

      const replacements = [];
      const seen = new Set();
      for (const input of replacementsInput) {
        const variantId = text(input.variantId || input.variant_id);
        const quantity = Math.max(0, Number.parseInt(String(input.quantity ?? input.qty ?? 1), 10) || 0);
        if (!isUuidText(variantId) || !quantity) {
          const error = new Error("Az egyik csere-termék azonosítója vagy darabszáma érvénytelen.");
          error.statusCode = 400;
          throw error;
        }
        if (seen.has(variantId)) {
          const error = new Error("Ugyanaz a csere-termék kétszer szerepel. Egy sorban állítsd be a darabszámot.");
          error.statusCode = 400;
          throw error;
        }
        seen.add(variantId);
        replacements.push({ variantId, quantity });
      }

      const variantIdsToLock = Array.from(new Set([String(source.variant_id), ...replacements.map((item) => item.variantId)])).sort();
      const variantRows = await client.query(
        `SELECT
           v.id AS variant_id, v.internal_sku, v.barcode, v.sell_price, v.buy_price, v.size, v.color_name, v.color_code, v.image_url,
           v.status AS variant_status, m.status AS model_status,
           m.model_code, COALESCE(NULLIF(m.title_ro,''), NULLIF(m.shopify_title,''), m.model_code, v.internal_sku) AS title,
           b.name AS brand_name,
           COALESCE(NULLIF(subc.name_hu,''), NULLIF(subc.name_ro,'')) AS subcategory_name,
           sc.supplier_product_code
         FROM aif_product_variants v
         JOIN aif_product_models m ON m.id=v.model_id
         LEFT JOIN aif_brands b ON b.id=m.brand_id
         LEFT JOIN aif_categories subc ON subc.id=m.subcategory_id
         LEFT JOIN LATERAL (
           SELECT supplier_product_code
           FROM aif_variant_supplier_codes sc
           WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
           ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST
           LIMIT 1
         ) sc ON true
         WHERE v.id = ANY($1::uuid[])
         ORDER BY v.id
         FOR UPDATE OF v`,
        [variantIdsToLock]
      );
      const lockedStocks = await client.query(
        `SELECT variant_id, qty, reserved_qty
         FROM aif_stock
         WHERE location_id=$1 AND variant_id = ANY($2::uuid[])
         ORDER BY variant_id
         FOR UPDATE`,
        [location.id, variantIdsToLock]
      );
      const lockedStockMap = new Map(lockedStocks.rows.map((row) => [String(row.variant_id), row]));
      const stockByVariant = new Map(variantRows.rows.map((row) => {
        const locked = lockedStockMap.get(String(row.variant_id));
        return [String(row.variant_id), {
          ...row,
          qty: locked ? aifNumber(locked.qty) : 0,
          reserved_qty: locked ? aifNumber(locked.reserved_qty) : 0,
        }];
      }));
      if (!stockByVariant.has(String(source.variant_id))) {
        const error = new Error("A visszavett termék már nem aktív a törzsadatban.");
        error.statusCode = 409;
        throw error;
      }
      for (const replacement of replacements) {
        const stock = stockByVariant.get(replacement.variantId);
        if (!stock || String(stock.variant_status || "active") !== "active" || String(stock.model_status || "active") !== "active") {
          const error = new Error("Az egyik csere-termék nem található az aktív terméktörzsben.");
          error.statusCode = 409;
          throw error;
        }
        const extraFromReturn = replacement.variantId === String(source.variant_id) ? returnedQty : 0;
        const available = aifNumber(stock.qty) - aifNumber(stock.reserved_qty) + extraFromReturn;
        if (available < replacement.quantity) {
          const error = new Error(`${stock.title || "A csere-termék"}: csak ${Math.max(0, available)} db elérhető a visszavétellel együtt.`);
          error.statusCode = 409;
          error.code = "insufficient_stock";
          throw error;
        }
        const unitPrice = Number(stock.sell_price);
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          const error = new Error(`${stock.title || "A csere-termék"}: nincs érvényes eladási ár.`);
          error.statusCode = 400;
          throw error;
        }
        replacement.unitPrice = aifRoundMoney(unitPrice);
        replacement.lineTotal = aifRoundMoney(unitPrice * replacement.quantity);
        replacement.buyPrice = stock.buy_price === null || stock.buy_price === undefined || stock.buy_price === ""
          ? null
          : aifRoundMoney(stock.buy_price);
        replacement.stock = stock;
      }

      const returnUnitCredit = aifRoundMoney(source.unit_price);
      const returnCredit = aifRoundMoney(returnUnitCredit * returnedQty);
      const replacementTotal = aifRoundMoney(replacements.reduce((sum, item) => sum + item.lineTotal, 0));
      const difference = aifRoundMoney(replacementTotal - returnCredit);
      const settlementDirection = difference > 0.005 ? "in" : difference < -0.005 ? "out" : "none";
      const settlementAmount = settlementDirection === "none" ? 0 : aifRoundMoney(Math.abs(difference));
      if (settlementDirection !== "none" && !allowedSettlementMethods.has(settlementMethod)) {
        const error = new Error(settlementDirection === "in" ? "Válaszd ki, hogyan fizeti a kliens a különbözetet." : "Válaszd ki, hogyan kapja vissza a kliens a különbözetet.");
        error.statusCode = 400;
        throw error;
      }

      const exchangeNumber = await allocateExchangeNumber(client, location);
      const exchangeTvaSettings = typeof readSalesTvaSettings === "function"
        ? await readSalesTvaSettings(client)
        : { salesTvaRate: 21, sellPriceIncludesTva: true, salesPriceIncludesTva: true };
      const exchangeInsert = await client.query(
        `INSERT INTO aif_shop_exchanges (
           exchange_number, location_id, source_location_id, source_sale_id, source_sale_line_id, source_variant_id,
           returned_qty, return_unit_credit, return_credit, replacement_total, difference,
           settlement_direction, settlement_method, settlement_amount,
           customer_name, customer_phone, actor, note, authorization_id,
           original_snapshot, replacement_snapshot, client_request_id, status, created_at, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21::jsonb,$22,'completed',now(),now()
         ) RETURNING *`,
        [
          exchangeNumber,
          location.id,
          source.sale_location_id,
          source.sale_id,
          source.sale_line_id,
          source.variant_id,
          returnedQty,
          returnUnitCredit,
          returnCredit,
          replacementTotal,
          difference,
          settlementDirection,
          settlementDirection === "none" ? null : settlementMethod,
          settlementAmount,
          source.customer_name || null,
          source.customer_phone || null,
          actorFrom(req),
          text(body.note) || null,
          authorizationRow?.id || null,
          JSON.stringify({
            saleNumber: source.sale_number,
            soldAt: source.sold_at,
            sourceLocation: { id: String(source.sale_location_id), code: source.sale_location_code, name: source.sale_location_name },
            product: {
              variantId: String(source.variant_id),
              title: source.product_title,
              productCode: source.product_code,
              barcode: source.barcode,
              brandName: source.brand_name,
              colorName: source.color_name,
              size: source.size,
            },
            originalQuantity: aifNumber(source.quantity),
            returnedQty,
            listPrice: aifRoundMoney(source.list_price),
            unitPrice: returnUnitCredit,
            discountPercent: aifRoundMoney(source.discount_percent),
            sourceBuyPrice: source.source_buy_price === null || source.source_buy_price === undefined || source.source_buy_price === ""
              ? null
              : aifRoundMoney(source.source_buy_price),
            sourceBuyPriceSource: source.buy_price_snapshot === null || source.buy_price_snapshot === undefined
              ? "current_variant_fallback"
              : "sale_snapshot",
            salesTvaRate: Number(exchangeTvaSettings?.salesTvaRate ?? 21),
            sellPriceIncludesTva: exchangeTvaSettings?.sellPriceIncludesTva !== false,
            salesPriceIncludesTva: exchangeTvaSettings?.sellPriceIncludesTva !== false,
          }),
          JSON.stringify(replacements.map((item) => ({
            variantId: item.variantId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            buyPrice: item.buyPrice,
          }))),
          idempotencyKey,
        ]
      );
      const exchange = exchangeInsert.rows[0];

      let lineNo = 1;
      for (const item of replacements) {
        const stock = item.stock;
        await client.query(
          `INSERT INTO aif_shop_exchange_lines (
             exchange_id, line_no, variant_id, quantity, unit_price, line_total, buy_price_snapshot,
             product_title, product_code, barcode, brand_name, color_name, size, image_url, raw
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
          [
            exchange.id,
            lineNo++,
            item.variantId,
            item.quantity,
            item.unitPrice,
            item.lineTotal,
            item.buyPrice,
            stock.title || null,
            stock.supplier_product_code || stock.model_code || stock.internal_sku || null,
            stock.barcode || null,
            stock.brand_name || null,
            stock.color_name || stock.color_code || null,
            stock.size || null,
            stock.image_url || null,
            JSON.stringify({
              source: "shop_exchange",
              availableBefore: aifNumber(stock.qty) - aifNumber(stock.reserved_qty),
              buyPriceSource: item.buyPrice === null ? "missing" : "exchange_time_variant",
            }),
          ]
        );
      }

      // Készlet: a visszahozott termék fizikailag abba az üzletbe kerül vissza, ahol a csere történik.
      // Ha ugyanazt a variánst adjuk is ki cserére, a két mozgást külön naplózzuk, hogy az audit olvasható maradjon.
      const sourceStock = stockByVariant.get(String(source.variant_id));
      const sourceBefore = aifNumber(sourceStock.qty);
      const sourceAfterReturn = sourceBefore + returnedQty;
      await client.query(
        `INSERT INTO aif_stock (location_id, variant_id, qty, reserved_qty, updated_at)
         VALUES ($1,$2,$3,0,now())
         ON CONFLICT (location_id, variant_id)
         DO UPDATE SET qty=$3, updated_at=now()`,
        [location.id, source.variant_id, sourceAfterReturn]
      );
      const returnLogged = await insertStockMovementSafe(client, {
        movementType: "manual_adjustment",
        sourceType: "shop_exchange_return",
        sourcePrefix: "ex_return",
        fallbackSourceType: "manual_stock_edit",
        sourceId: String(exchange.id),
        locationId: location.id,
        variantId: source.variant_id,
        qtyDelta: returnedQty,
        qtyBefore: sourceBefore,
        qtyAfter: sourceAfterReturn,
        actor: actorFrom(req),
        raw: {
          reason: "shop_exchange_return",
          exchangeId: String(exchange.id),
          exchangeNumber,
          sourceSaleId: String(source.sale_id),
          sourceSaleLineId: String(source.sale_line_id),
          sourceLocationCode: source.sale_location_code,
          returnCredit,
          returnedQty,
        },
      });
      if (!returnLogged) throw Object.assign(new Error("A visszáru készletmozgásának naplózása nem sikerült."), { statusCode: 500 });

      const runningQty = new Map();
      runningQty.set(String(source.variant_id), sourceAfterReturn);
      for (const item of replacements) {
        const stock = stockByVariant.get(item.variantId);
        const before = runningQty.has(item.variantId) ? runningQty.get(item.variantId) : aifNumber(stock.qty);
        const after = before - item.quantity;
        if (after < aifNumber(stock.reserved_qty)) {
          const error = new Error(`${stock.title || "A csere-termék"}: a készlet a csere közben már nem elegendő.`);
          error.statusCode = 409;
          throw error;
        }
        await client.query(
          `INSERT INTO aif_stock (location_id, variant_id, qty, reserved_qty, updated_at)
           VALUES ($1,$2,$3,$4,now())
           ON CONFLICT (location_id, variant_id)
           DO UPDATE SET qty=$3, reserved_qty=$4, updated_at=now()`,
          [location.id, item.variantId, after, aifNumber(stock.reserved_qty)]
        );
        runningQty.set(item.variantId, after);
        const outLogged = await insertStockMovementSafe(client, {
          movementType: "sale",
          sourceType: "shop_exchange_out",
          sourcePrefix: "ex_out",
          fallbackSourceType: "manual_stock_edit",
          sourceId: String(exchange.id),
          locationId: location.id,
          variantId: item.variantId,
          qtyDelta: -item.quantity,
          qtyBefore: before,
          qtyAfter: after,
          actor: actorFrom(req),
          raw: {
            reason: "shop_exchange_out",
            exchangeId: String(exchange.id),
            exchangeNumber,
            sourceSaleId: String(source.sale_id),
            sourceSaleLineId: String(source.sale_line_id),
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            quantity: item.quantity,
          },
        });
        if (!outLogged) throw Object.assign(new Error("A csere-termék készletmozgásának naplózása nem sikerült."), { statusCode: 500 });
      }

      if (settlementDirection !== "none") {
        await client.query(
          `INSERT INTO aif_shop_exchange_settlements (
             exchange_id, location_id, method, direction, amount, actor, note, raw, created_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now())`,
          [
            exchange.id,
            location.id,
            settlementMethod,
            settlementDirection,
            settlementAmount,
            actorFrom(req),
            text(body.note) || null,
            JSON.stringify({ exchangeNumber, difference, returnCredit, replacementTotal }),
          ]
        );
      }

      await client.query(
        `INSERT INTO aif_shop_sale_events (sale_id, event_type, actor, note, payload)
         VALUES ($1,'exchange_return',$2,$3,$4::jsonb)`,
        [
          source.sale_id,
          actorFrom(req),
          text(body.note) || null,
          JSON.stringify({
            exchangeId: String(exchange.id),
            exchangeNumber,
            processedAtLocation: { id: String(location.id), code: location.code, name: location.name },
            returnedQty,
            returnCredit,
            replacementTotal,
            difference,
            settlementDirection,
            settlementMethod: settlementDirection === "none" ? null : settlementMethod,
          }),
        ]
      );

      if (authorizationRow) {
        await client.query(
          `UPDATE aif_shop_return_authorizations
           SET status='used', used_at=now(), used_by=$2, unlock_token_hash=NULL, updated_at=now()
           WHERE id=$1`,
          [authorizationRow.id, actorFrom(req)]
        );
      }

      await client.query("COMMIT");
      return res.json({
        ok: true,
        duplicate: false,
        exchangeId: String(exchange.id),
        exchangeNumber,
        returnedQty,
        returnCredit,
        replacementTotal,
        difference,
        settlementDirection,
        settlementMethod: settlementDirection === "none" ? null : settlementMethod,
        settlementAmount,
        createdAt: exchange.created_at ? new Date(exchange.created_at).toISOString() : new Date().toISOString(),
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF complete shop exchange failed", error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "A visszáru/csere lezárása nem sikerült.", code: error?.code || null });
    } finally {
      client.release();
    }
  });


  async function cancelReceiptReturnBatch(client, req, res, location, requested) {
    const fail = (message, code, status = 409) => Object.assign(new Error(message), { code, statusCode: status });
    const batchId = String(requested.original_snapshot?.returnBatchId || "");
    const group = await client.query(
      `SELECT * FROM aif_shop_exchanges
       WHERE original_snapshot->>'returnBatchId'=$1 AND location_id=$2
       ORDER BY id FOR UPDATE`, [batchId, location.id]
    );
    const members = group.rows;
    if (members.length < 2 || !members.some(x => String(x.id) === String(requested.id))) {
      throw fail("A kapcsolt visszaru csoportja nem teljes. Adminisztratori ellenorzes szukseges.", "return_batch_group_invalid");
    }
    const main = members.find(x => x.original_snapshot?.returnBatchPrimary === true);
    if (main && members.length !== Number(main.original_snapshot?.returnBatchCount)) {
      throw fail("A visszaruhoz tartozo termeksorok szama elter. Nem vonjuk vissza.", "return_batch_group_count_mismatch");
    }
    if (!main || members.filter(x => x.original_snapshot?.returnBatchPrimary === true).length !== 1 ||
        members.some(x => String(x.source_sale_id) !== String(main.source_sale_id))) {
      throw fail("A tobbteteles visszaru adatai nem egyeznek. Nem toroljuk reszlegesen.", "return_batch_group_mismatch");
    }
    if (members.every(x => x.status === "cancelled")) {
      await client.query("COMMIT");
      return res.json({
        ok: true, duplicate: true,
        exchangeId: String(main.id), exchangeNumber: main.exchange_number,
        exchangeIds: members.map(x => String(x.id)), status: "cancelled",
        cancelledAt: main.cancelled_at ? new Date(main.cancelled_at).toISOString() : new Date().toISOString(),
        cancelledBy: main.cancelled_by || actorFrom(req), stockAdjusted: [],
      });
    }
    if (members.some(x => x.status !== "completed")) {
      throw fail("A tobbteteles visszaru reszben mar vissza van vonva. Nem modositjuk a keszletet.", "return_batch_partial_cancelled");
    }
    const replacementRows = await client.query(
      `SELECT variant_id,quantity FROM aif_shop_exchange_lines
       WHERE exchange_id=$1 ORDER BY line_no FOR UPDATE`, [main.id]
    );
    // Ha masodlagos fejlecen is csere-sort talalunk, a csoport serult.
    const extraLines = await client.query(
      `SELECT count(*)::int AS n FROM aif_shop_exchange_lines
       WHERE exchange_id=ANY($1::uuid[]) AND exchange_id<>$2::uuid`,
      [members.map(x => x.id), main.id]
    );
    if (Number(extraLines.rows[0]?.n || 0) !== 0) {
      throw fail("A visszaru tovabbi csere-sorokat is tartalmaz. Kezi egyeztetes kell.", "return_batch_extra_replacements");
    }
    const deltaByVariant = new Map();
    for (const row of members) {
      const variantId = String(row.source_variant_id);
      deltaByVariant.set(variantId, (deltaByVariant.get(variantId) || 0) - aifNumber(row.returned_qty));
    }
    for (const row of replacementRows.rows) {
      const variantId = String(row.variant_id);
      deltaByVariant.set(variantId, (deltaByVariant.get(variantId) || 0) + aifNumber(row.quantity));
    }
    const variantIds = Array.from(deltaByVariant.keys()).sort();
    const stocks = await client.query(
      `SELECT variant_id,qty,reserved_qty FROM aif_stock
       WHERE location_id=$1 AND variant_id=ANY($2::uuid[])
       ORDER BY variant_id FOR UPDATE`, [location.id, variantIds]
    );
    const stockMap = new Map(stocks.rows.map(x => [String(x.variant_id), x]));
    const adjustments = [];
    const actor = actorFrom(req);
    for (const variantId of variantIds) {
      const delta = aifNumber(deltaByVariant.get(variantId));
      if (Math.abs(delta) < 0.0001) continue;
      const stock = stockMap.get(variantId);
      const before = aifNumber(stock?.qty);
      const reserved = aifNumber(stock?.reserved_qty);
      const after = before + delta;
      if (after < 0 || after < reserved) {
        throw fail("A tobbteteles visszaru keszlete azota valtozott, automatikusan nem vonhato vissza.", "return_batch_cancel_stock_conflict");
      }
      await client.query(
        `INSERT INTO aif_stock (location_id,variant_id,qty,reserved_qty,updated_at)
         VALUES ($1,$2,$3,$4,now()) ON CONFLICT (location_id,variant_id)
         DO UPDATE SET qty=$3,reserved_qty=$4,updated_at=now()`,
        [location.id, variantId, after, reserved]
      );
      const logged = await insertStockMovementSafe(client, {
        movementType: "manual_adjustment", sourceType: "shop_exchange_cancel",
        sourcePrefix: "ex_cancel", fallbackSourceType: "manual_stock_edit",
        sourceId: String(main.id), locationId: location.id, variantId,
        qtyDelta: delta, qtyBefore: before, qtyAfter: after, actor,
        raw: {
          reason: "shop_exchange_cancel", returnBatchId: batchId,
          exchangeId: String(main.id), exchangeNumber: main.exchange_number,
          exchangeIds: members.map(x => String(x.id)), sourceSaleId: String(main.source_sale_id), cancelledBy: actor,
        },
      });
      if (!logged) throw fail("A visszavonas keszletnaploja nem sikerult.", "return_batch_cancel_log_failed", 500);
      adjustments.push({ variantId, qtyBefore: before, qtyAfter: after, qtyDelta: delta });
    }
    const note = text(req.body?.note) || null;
    await client.query(
      `UPDATE aif_shop_exchanges
       SET status='cancelled', cancelled_at=now(),cancelled_by=$2,cancellation_note=$3,updated_at=now()
       WHERE id=ANY($1::uuid[]) AND status='completed'`,
      [members.map(x => x.id), actor, note]
    );
    await client.query(
      `INSERT INTO aif_shop_sale_events (sale_id,event_type,actor,note,payload)
       VALUES ($1,'exchange_cancelled',$2,$3,$4::jsonb)`,
      [main.source_sale_id, actor, note || "Tobbteteles visszaru adminisztratori visszavonasa.",
       JSON.stringify({ returnBatchId: batchId, exchangeId: String(main.id),
         exchangeIds: members.map(x => String(x.id)), reversedStock: adjustments,
         returnCredit: members.reduce((n,x) => n + aifNumber(x.return_credit), 0),
         replacementTotal: aifNumber(main.replacement_total), difference: aifNumber(main.difference) })]
    );
    await client.query("COMMIT");
    return res.json({
      ok: true, exchangeId: String(main.id), exchangeNumber: main.exchange_number,
      exchangeIds: members.map(x => String(x.id)), status: "cancelled",
      cancelledAt: new Date().toISOString(), cancelledBy: actor, stockAdjusted: adjustments,
    });
  }

  router.delete("/exchanges/:id", requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    if (!isUuidText(id)) return res.status(400).json({ error: "Érvénytelen csereazonosító." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureAifShopSalesSchema();
      const location = await aifResolveShopLocation(req, client, req.body?.location || req.query?.location);
      // Keresett elem helyett a teljes tobbteteles csoportot zaroljuk eloszor,
      // hogy masik resztetelre kuldott parhuzamos torles se okozzon holtpontot.
      const groupLookup = await client.query(
        `SELECT original_snapshot->>'returnBatchId' AS batch_id
         FROM aif_shop_exchanges WHERE id::text=$1 AND location_id=$2`, [id, location.id]
      );
      const batchId = text(groupLookup.rows[0]?.batch_id);
      if (batchId) {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`aif_shop_return_batch_cancel:${batchId}`]);
      }
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`aif_shop_exchange_cancel:${id}`]);

      const exchangeResult = await client.query(
        `SELECT e.*
         FROM aif_shop_exchanges e
         WHERE e.id::text=$1
           AND e.location_id=$2
         FOR UPDATE`,
        [id, location.id]
      );
      if (!exchangeResult.rowCount) {
        const error = new Error("A csere nem található ebben az üzletben.");
        error.statusCode = 404;
        throw error;
      }

      const exchange = exchangeResult.rows[0];
      if (exchange.original_snapshot?.returnBatchId) {
        return cancelReceiptReturnBatch(client, req, res, location, exchange);
      }
      if (exchange.status === "cancelled") {
        await client.query("COMMIT");
        return res.json({
          ok: true,
          duplicate: true,
          exchangeId: String(exchange.id),
          exchangeNumber: exchange.exchange_number,
          status: "cancelled",
          cancelledAt: exchange.cancelled_at ? new Date(exchange.cancelled_at).toISOString() : new Date().toISOString(),
          cancelledBy: exchange.cancelled_by || actorFrom(req),
          stockAdjusted: [],
        });
      }
      if (exchange.status !== "completed") {
        const error = new Error("Csak lezárt csere vonható vissza.");
        error.statusCode = 409;
        error.code = "exchange_not_completed";
        throw error;
      }

      const linesResult = await client.query(
        `SELECT id, variant_id, quantity, product_title
         FROM aif_shop_exchange_lines
         WHERE exchange_id=$1
         ORDER BY line_no ASC
         FOR UPDATE`,
        [exchange.id]
      );

      // A teljes csere készlethatását egyetlen nettó delta/variáns művelettel fordítjuk vissza.
      // Így ugyanaz a variáns visszahozott + csereként kiadott esetben sem számolódik kétszer rosszul.
      const deltaByVariant = new Map();
      const sourceVariantId = String(exchange.source_variant_id);
      deltaByVariant.set(sourceVariantId, -aifNumber(exchange.returned_qty));
      for (const line of linesResult.rows) {
        const variantId = String(line.variant_id);
        deltaByVariant.set(
          variantId,
          aifNumber(deltaByVariant.get(variantId)) + aifNumber(line.quantity),
        );
      }

      const variantIds = Array.from(deltaByVariant.keys()).sort();
      const stocksResult = variantIds.length
        ? await client.query(
            `SELECT variant_id, qty, reserved_qty
             FROM aif_stock
             WHERE location_id=$1
               AND variant_id = ANY($2::uuid[])
             ORDER BY variant_id
             FOR UPDATE`,
            [location.id, variantIds]
          )
        : { rows: [] };
      const stockMap = new Map(stocksResult.rows.map((row) => [String(row.variant_id), row]));
      const stockAdjusted = [];

      for (const variantId of variantIds) {
        const qtyDelta = aifNumber(deltaByVariant.get(variantId));
        if (Math.abs(qtyDelta) < 0.0001) continue;

        const current = stockMap.get(variantId);
        const qtyBefore = current ? aifNumber(current.qty) : 0;
        const reservedQty = current ? aifNumber(current.reserved_qty) : 0;
        const qtyAfter = qtyBefore + qtyDelta;
        if (qtyAfter < 0 || qtyAfter < reservedQty) {
          const error = new Error(
            "A csere már nem vonható vissza automatikusan, mert az érintett készletből időközben eladtak vagy lefoglaltak. Előbb rendezd a készletet."
          );
          error.statusCode = 409;
          error.code = "exchange_cancel_stock_conflict";
          error.variantId = variantId;
          throw error;
        }

        await client.query(
          `INSERT INTO aif_stock (location_id, variant_id, qty, reserved_qty, updated_at)
           VALUES ($1,$2,$3,$4,now())
           ON CONFLICT (location_id, variant_id)
           DO UPDATE SET qty=$3, reserved_qty=$4, updated_at=now()`,
          [location.id, variantId, qtyAfter, reservedQty]
        );

        const logged = await insertStockMovementSafe(client, {
          movementType: "manual_adjustment",
          sourceType: "shop_exchange_cancel",
          sourcePrefix: "ex_cancel",
          fallbackSourceType: "manual_stock_edit",
          sourceId: String(exchange.id),
          locationId: location.id,
          variantId,
          qtyDelta,
          qtyBefore,
          qtyAfter,
          actor: actorFrom(req),
          raw: {
            reason: "shop_exchange_cancel",
            exchangeId: String(exchange.id),
            exchangeNumber: exchange.exchange_number,
            cancelledBy: actorFrom(req),
            sourceSaleId: String(exchange.source_sale_id),
            sourceSaleLineId: String(exchange.source_sale_line_id),
          },
        });
        if (!logged) {
          const error = new Error("A csere visszavonásának készletmozgása nem naplózható.");
          error.statusCode = 500;
          throw error;
        }
        stockAdjusted.push({ variantId, qtyBefore, qtyAfter, qtyDelta });
      }

      const cancelNote = text(req.body?.note) || null;
      const cancelledBy = actorFrom(req);
      const cancelledResult = await client.query(
        `UPDATE aif_shop_exchanges
         SET status='cancelled',
             cancelled_at=now(),
             cancelled_by=$2,
             cancellation_note=$3,
             updated_at=now()
         WHERE id=$1
         RETURNING cancelled_at`,
        [exchange.id, cancelledBy, cancelNote]
      );

      await client.query(
        `INSERT INTO aif_shop_sale_events (sale_id, event_type, actor, note, payload)
         VALUES ($1,'exchange_cancelled',$2,$3,$4::jsonb)`,
        [
          exchange.source_sale_id,
          cancelledBy,
          cancelNote || "Csere adminisztrátori visszavonása.",
          JSON.stringify({
            exchangeId: String(exchange.id),
            exchangeNumber: exchange.exchange_number,
            reversedStock: stockAdjusted,
            returnCredit: aifNumber(exchange.return_credit),
            replacementTotal: aifNumber(exchange.replacement_total),
            difference: aifNumber(exchange.difference),
            settlementDirection: exchange.settlement_direction,
            settlementMethod: exchange.settlement_method || null,
            settlementAmount: aifNumber(exchange.settlement_amount),
          }),
        ]
      );

      await client.query("COMMIT");
      return res.json({
        ok: true,
        exchangeId: String(exchange.id),
        exchangeNumber: exchange.exchange_number,
        status: "cancelled",
        cancelledAt: new Date(cancelledResult.rows[0]?.cancelled_at || Date.now()).toISOString(),
        cancelledBy,
        stockAdjusted,
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF shop exchange cancel failed", error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A csere visszavonása nem sikerült.",
        code: error?.code || null,
      });
    } finally {
      client.release();
    }
  });

  return router;
}
