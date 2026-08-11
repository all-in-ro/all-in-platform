import express from "express";
import { createHash, randomInt, randomUUID } from "node:crypto";

export default function createAifShopReturnsRouter({
  pool,
  requireAuthed,
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
         COALESCE(NULLIF(sl.product_title,''), NULLIF(m.title_ro,''), NULLIF(m.shopify_title,''), NULLIF(sl.product_code,''), 'Ismeretlen termék') AS product_title,
         COALESCE(NULLIF(sl.product_code,''), NULLIF(sc.supplier_product_code,''), NULLIF(m.model_code,''), NULLIF(v.internal_sku,'')) AS product_code,
         COALESCE(NULLIF(sl.barcode,''), NULLIF(v.barcode,'')) AS barcode,
         COALESCE(NULLIF(sl.brand_name,''), NULLIF(b.name,'')) AS brand_name,
         COALESCE(NULLIF(sl.color_name,''), NULLIF(v.color_name,''), NULLIF(v.color_code,'')) AS color_name,
         COALESCE(NULLIF(sl.size,''), NULLIF(v.size,'')) AS size,
         COALESCE(NULLIF(sl.image_url,''), NULLIF(v.image_url,'')) AS image_url,
         s.sale_number, s.sold_at, s.actor, s.customer_name, s.customer_phone, s.status AS sale_status,
         s.payment_status, s.balance_due,
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
      const limit = Math.min(150, Math.max(1, Number(req.query.limit || 80)));
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
           )
         ORDER BY
           CASE WHEN lower(btrim(COALESCE(sl.barcode,'')))=lower(btrim($1)) OR lower(btrim(COALESCE(v.barcode,'')))=lower(btrim($1)) THEN 0 ELSE 1 END,
           s.sold_at DESC,
           sl.line_no ASC
         LIMIT $3`,
        [exact, pattern, limit]
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
           sl.color_name AS source_color_name,
           sl.size AS source_size,
           sl.image_url AS source_image_url
         FROM aif_shop_exchanges e
         JOIN aif_locations src ON src.id=e.source_location_id
         JOIN aif_shop_sale_lines sl ON sl.id=e.source_sale_line_id
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
          note: row.note || null,
          sourceProduct: {
            title: row.source_product_title || "Ismeretlen termék",
            productCode: row.source_product_code || null,
            barcode: row.source_barcode || null,
            colorName: row.source_color_name || null,
            size: row.source_size || null,
            imageUrl: row.source_image_url || null,
          },
        })),
      });
    } catch (error) {
      console.error("AIF shop return history failed", error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "A visszáru előzmények nem tölthetők be.", code: error?.code || null });
    }
  });

  router.post("/exchanges", requireAuthed, async (req, res) => {
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
           v.id AS variant_id, v.internal_sku, v.barcode, v.sell_price, v.size, v.color_name, v.color_code, v.image_url,
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
          }),
          JSON.stringify(replacements.map((item) => ({ variantId: item.variantId, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal }))),
          idempotencyKey,
        ]
      );
      const exchange = exchangeInsert.rows[0];

      let lineNo = 1;
      for (const item of replacements) {
        const stock = item.stock;
        await client.query(
          `INSERT INTO aif_shop_exchange_lines (
             exchange_id, line_no, variant_id, quantity, unit_price, line_total,
             product_title, product_code, barcode, brand_name, color_name, size, image_url, raw
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)`,
          [
            exchange.id,
            lineNo++,
            item.variantId,
            item.quantity,
            item.unitPrice,
            item.lineTotal,
            stock.title || null,
            stock.supplier_product_code || stock.model_code || stock.internal_sku || null,
            stock.barcode || null,
            stock.brand_name || null,
            stock.color_name || stock.color_code || null,
            stock.size || null,
            stock.image_url || null,
            JSON.stringify({ source: "shop_exchange", availableBefore: aifNumber(stock.qty) - aifNumber(stock.reserved_qty) }),
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

  return router;
}
