import express from "express";

export default function createAifRouter({ pool, requireAuthed, requireAdminOrSecret }) {
  const router = express.Router();

  router.use(express.json({ limit: "15mb" }));

  const text = (v) => String(v ?? "").trim();
  const emptyToNull = (v) => {
    const s = text(v);
    return s ? s : null;
  };
  const toInt = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number.parseInt(String(v).replace(",", "."), 10);
    return Number.isFinite(n) ? n : null;
  };
  const toMoney = (v) => {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    const n = Number(String(v).replace(",", ".").trim());
    return Number.isFinite(n) ? n : null;
  };
  const normCode = (v) => text(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  function actorFrom(req) {
    return text(req.session?.actor || req.session?.shopId || req.session?.role || "system") || "system";
  }

  async function findByIdOrCode(client, table, idOrCode) {
    const v = text(idOrCode);
    if (!v) return null;
    const r = await client.query(
      `SELECT id, code, name, is_active FROM ${table} WHERE id::text = $1 OR code = $1 LIMIT 1`,
      [v]
    );
    return r.rows[0] || null;
  }

  async function getDefaultLocationId(client) {
    const r = await client.query(`SELECT id FROM aif_locations WHERE code='main_warehouse' LIMIT 1`);
    return r.rows[0]?.id || null;
  }

  function normalizeRowInput(input, rowNo) {
    const src = input?.normalized && typeof input.normalized === "object" ? input.normalized : input || {};

    const supplierProductCode = emptyToNull(
      src.supplierProductCode || src.supplier_product_code || src.productCode || src.product_code || src.code || input?.product_code
    );
    const supplierVariantCode = emptyToNull(
      src.supplierVariantCode || src.supplier_variant_code || src.variantCode || src.variant_code || input?.variant_code
    );
    const supplierColorCode = emptyToNull(src.supplierColorCode || src.supplier_color_code || src.colorCode || src.color_code);
    const supplierSize = emptyToNull(src.supplierSize || src.supplier_size || src.size);

    const brandRaw = emptyToNull(src.brandCode || src.brand_code || src.brand);
    const categoryRaw = emptyToNull(src.categoryCode || src.category_code || src.category);

    const normalized = {
      brandCode: brandRaw ? normCode(brandRaw) : null,
      brandName: emptyToNull(src.brandName || src.brand_name || src.brand),
      categoryCode: categoryRaw ? normCode(categoryRaw) : null,
      modelCode: emptyToNull(src.modelCode || src.model_code || supplierProductCode),
      titleRo: emptyToNull(src.titleRo || src.title_ro || src.nameRo || src.name_ro || src.productName || src.product_name || src.name || src.title),
      titleHu: emptyToNull(src.titleHu || src.title_hu),
      descriptionRo: emptyToNull(src.descriptionRo || src.description_ro || src.description),
      gender: normCode(src.gender || "unisex") || "unisex",
      productType: emptyToNull(src.productType || src.product_type),
      season: emptyToNull(src.season),
      material: emptyToNull(src.material),
      colorCode: emptyToNull(src.colorCode || src.color_code || supplierColorCode),
      colorName: emptyToNull(src.colorName || src.color_name),
      colorHex: emptyToNull(src.colorHex || src.color_hex),
      size: emptyToNull(src.size || supplierSize),
      barcode: emptyToNull(src.barcode || src.ean || src.ean13 || src.supplierBarcode || src.supplier_barcode),
      buyPrice: toMoney(src.buyPrice ?? src.buy_price),
      sellPrice: toMoney(src.sellPrice ?? src.sell_price),
      compareAtPrice: toMoney(src.compareAtPrice ?? src.compare_at_price),
      weightGrams: toInt(src.weightGrams ?? src.weight_grams),
      imageUrl: emptyToNull(src.imageUrl || src.image_url),
      supplierProductCode,
      supplierVariantCode,
      supplierColorCode,
      supplierSize,
      qty: toInt(src.qty ?? src.quantity ?? input?.qty),
    };

    const errors = [];
    if (!normalized.titleRo) errors.push("product name/title missing");
    if (!normalized.size) errors.push("size missing");
    if (normalized.qty === null || normalized.qty <= 0) errors.push("qty must be > 0");
    if (!normalized.modelCode && !normalized.supplierProductCode) errors.push("model/product code missing");
    if (!["men", "women", "kids", "unisex"].includes(normalized.gender)) normalized.gender = "unisex";

    return {
      rowNo: toInt(input?.rowNo ?? input?.row_no ?? rowNo) || rowNo,
      raw: input?.raw && typeof input.raw === "object" ? input.raw : input,
      normalized,
      status: errors.length ? "error" : "parsed",
      errors,
    };
  }

  async function ensureBrand(client, normalized, fallbackSupplierCode) {
    const rawCode = normalized.brandCode || normCode(fallbackSupplierCode);
    if (!rawCode) return null;

    const name = normalized.brandName || text(rawCode).replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
    const r = await client.query(
      `INSERT INTO aif_brands (code, name)
       VALUES ($1, $2)
       ON CONFLICT (code) DO UPDATE SET name = COALESCE(aif_brands.name, EXCLUDED.name)
       RETURNING id`,
      [rawCode, name]
    );
    return r.rows[0].id;
  }

  async function findCategoryId(client, categoryCode) {
    const code = normCode(categoryCode);
    if (!code) return null;
    const r = await client.query(`SELECT id FROM aif_categories WHERE code=$1 AND is_active=true LIMIT 1`, [code]);
    return r.rows[0]?.id || null;
  }

  async function upsertModel(client, { supplierCode, normalized }) {
    const brandId = await ensureBrand(client, normalized, supplierCode);
    const categoryId = await findCategoryId(client, normalized.categoryCode);
    const baseModelCode = normalized.modelCode || normalized.supplierProductCode || normalized.titleRo;
    const modelCode = `${normCode(supplierCode || "aif")}:${normCode(baseModelCode)}`;

    const r = await client.query(
      `INSERT INTO aif_product_models (
         brand_id, category_id, model_code, title_ro, title_hu, description_ro,
         gender, product_type, season, material, shopify_title, status
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft')
       ON CONFLICT (model_code) WHERE model_code IS NOT NULL AND model_code <> ''
       DO UPDATE SET
         brand_id = COALESCE(EXCLUDED.brand_id, aif_product_models.brand_id),
         category_id = COALESCE(EXCLUDED.category_id, aif_product_models.category_id),
         title_ro = EXCLUDED.title_ro,
         title_hu = COALESCE(EXCLUDED.title_hu, aif_product_models.title_hu),
         description_ro = COALESCE(EXCLUDED.description_ro, aif_product_models.description_ro),
         gender = EXCLUDED.gender,
         product_type = COALESCE(EXCLUDED.product_type, aif_product_models.product_type),
         season = COALESCE(EXCLUDED.season, aif_product_models.season),
         material = COALESCE(EXCLUDED.material, aif_product_models.material),
         shopify_title = COALESCE(EXCLUDED.shopify_title, aif_product_models.shopify_title),
         updated_at = now()
       RETURNING id`,
      [
        brandId,
        categoryId,
        modelCode,
        normalized.titleRo,
        normalized.titleHu,
        normalized.descriptionRo,
        normalized.gender,
        normalized.productType,
        normalized.season,
        normalized.material,
        normalized.titleRo,
      ]
    );
    return r.rows[0].id;
  }

  async function upsertVariant(client, { modelId, normalized }) {
    const colorCode = normalized.colorCode || "";
    const colorName = normalized.colorName || "";
    const size = normalized.size;

    const existing = await client.query(
      `SELECT id FROM aif_product_variants
       WHERE model_id=$1
         AND lower(COALESCE(color_code,'')) = lower($2)
         AND lower(COALESCE(color_name,'')) = lower($3)
         AND lower(size) = lower($4)
       LIMIT 1`,
      [modelId, colorCode, colorName, size]
    );

    if (existing.rowCount) {
      const id = existing.rows[0].id;
      await client.query(
        `UPDATE aif_product_variants SET
           barcode = COALESCE($2, barcode),
           color_code = NULLIF($3, ''),
           color_name = NULLIF($4, ''),
           color_hex = COALESCE($5, color_hex),
           buy_price = COALESCE($6, buy_price),
           sell_price = COALESCE($7, sell_price),
           compare_at_price = COALESCE($8, compare_at_price),
           weight_grams = COALESCE($9, weight_grams),
           image_url = COALESCE($10, image_url),
           status = 'active',
           updated_at = now()
         WHERE id=$1`,
        [
          id,
          normalized.barcode,
          colorCode,
          colorName,
          normalized.colorHex,
          normalized.buyPrice,
          normalized.sellPrice,
          normalized.compareAtPrice,
          normalized.weightGrams,
          normalized.imageUrl,
        ]
      );
      return id;
    }

    const inserted = await client.query(
      `INSERT INTO aif_product_variants (
         model_id, barcode, color_code, color_name, color_hex, size,
         buy_price, sell_price, compare_at_price, weight_grams, image_url, status
       )
       VALUES ($1,$2,NULLIF($3,''),NULLIF($4,''),$5,$6,$7,$8,$9,$10,$11,'active')
       RETURNING id`,
      [
        modelId,
        normalized.barcode,
        colorCode,
        colorName,
        normalized.colorHex,
        size,
        normalized.buyPrice,
        normalized.sellPrice,
        normalized.compareAtPrice,
        normalized.weightGrams,
        normalized.imageUrl,
      ]
    );
    return inserted.rows[0].id;
  }

  async function upsertSupplierCode(client, { variantId, supplierId, normalized }) {
    const keys = [
      normalized.supplierProductCode || "",
      normalized.supplierVariantCode || "",
      normalized.supplierColorCode || "",
      normalized.supplierSize || "",
    ];

    const existing = await client.query(
      `SELECT id FROM aif_variant_supplier_codes
       WHERE supplier_id=$1
         AND COALESCE(supplier_product_code,'')=$2
         AND COALESCE(supplier_variant_code,'')=$3
         AND COALESCE(supplier_color_code,'')=$4
         AND COALESCE(supplier_size,'')=$5
       LIMIT 1`,
      [supplierId, ...keys]
    );

    if (existing.rowCount) {
      await client.query(
        `UPDATE aif_variant_supplier_codes SET
           variant_id=$2,
           supplier_color_name=$3,
           supplier_barcode=$4,
           supplier_sku=$5,
           raw=$6::jsonb,
           is_active=true,
           updated_at=now()
         WHERE id=$1`,
        [
          existing.rows[0].id,
          variantId,
          normalized.colorName,
          normalized.barcode,
          normalized.supplierVariantCode || normalized.supplierProductCode,
          JSON.stringify(normalized),
        ]
      );
      return;
    }

    await client.query(
      `INSERT INTO aif_variant_supplier_codes (
         variant_id, supplier_id, supplier_product_code, supplier_variant_code,
         supplier_color_code, supplier_color_name, supplier_size,
         supplier_barcode, supplier_sku, raw
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [
        variantId,
        supplierId,
        normalized.supplierProductCode,
        normalized.supplierVariantCode,
        normalized.supplierColorCode,
        normalized.colorName,
        normalized.supplierSize,
        normalized.barcode,
        normalized.supplierVariantCode || normalized.supplierProductCode,
        JSON.stringify(normalized),
      ]
    );
  }

  async function addStock(client, { locationId, variantId, qty, actor, sourceId, rowId, raw }) {
    const current = await client.query(
      `SELECT qty, reserved_qty FROM aif_stock WHERE location_id=$1 AND variant_id=$2 FOR UPDATE`,
      [locationId, variantId]
    );
    const before = current.rowCount ? Number(current.rows[0].qty || 0) : 0;
    const after = before + qty;
    if (after < 0) throw new Error("stock cannot go negative");

    await client.query(
      `INSERT INTO aif_stock (location_id, variant_id, qty, reserved_qty, updated_at)
       VALUES ($1,$2,$3,0,now())
       ON CONFLICT (location_id, variant_id)
       DO UPDATE SET qty=$3, updated_at=now()`,
      [locationId, variantId, after]
    );

    await client.query(
      `INSERT INTO aif_stock_movements (
         movement_type, source_type, source_id, location_id, variant_id,
         qty_delta, qty_before, qty_after, actor, raw
       )
       VALUES ('incoming','import_batch',$1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [sourceId, locationId, variantId, qty, before, after, actor, JSON.stringify({ rowId, raw })]
    );
  }

  function periodWhere(req, startIndex = 1) {
    const from = emptyToNull(req.query.from);
    const to = emptyToNull(req.query.to);
    const args = [];
    const parts = [];
    let i = startIndex;
    if (from) {
      args.push(from);
      parts.push(`COALESCE(b.committed_at, b.created_at) >= $${i++}::date`);
    }
    if (to) {
      args.push(to);
      parts.push(`COALESCE(b.committed_at, b.created_at) < ($${i++}::date + interval '1 day')`);
    }
    return { args, parts, nextIndex: i };
  }

  async function locationUsage(client, locationId) {
    const r = await client.query(
      `SELECT
         (SELECT count(*)::int FROM aif_import_batches WHERE target_location_id=$1) AS import_batches,
         (SELECT count(*)::int FROM aif_stock WHERE location_id=$1) AS stock_rows,
         (SELECT count(*)::int FROM aif_stock_movements WHERE location_id=$1) AS stock_movements`,
      [locationId]
    );
    return r.rows[0] || { import_batches: 0, stock_rows: 0, stock_movements: 0 };
  }

  async function locationTypeUsage(client, typeCode) {
    const r = await client.query(
      `SELECT count(*)::int AS locations
       FROM aif_locations
       WHERE location_type=$1`,
      [typeCode]
    );
    return r.rows[0] || { locations: 0 };
  }

  async function activeLocationTypeExists(client, typeCode) {
    const r = await client.query(
      `SELECT 1 FROM aif_location_types WHERE code=$1 AND is_active=true LIMIT 1`,
      [typeCode]
    );
    return r.rowCount > 0;
  }

  async function supplierUsage(client, supplierId) {
    const r = await client.query(
      `SELECT
         (SELECT count(*)::int FROM aif_import_batches WHERE supplier_id=$1) AS import_batches,
         (SELECT count(*)::int FROM aif_variant_supplier_codes WHERE supplier_id=$1) AS supplier_codes,
         (SELECT count(*)::int FROM aif_supplier_import_profiles WHERE supplier_id=$1) AS profiles`,
      [supplierId]
    );
    return r.rows[0] || { import_batches: 0, supplier_codes: 0, profiles: 0 };
  }


  function currencyCode(v) {
    return text(v).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  }

  function tvaMode(v) {
    const raw = text(v);
    if (!raw) return null;
    const mode = normCode(raw);
    if (["without_tva", "with_tva", "no_tva"].includes(mode)) return mode;
    return null;
  }

  async function currencyUsage(client, code) {
    const r = await client.query(
      `SELECT
         (SELECT count(*)::int FROM aif_receptions WHERE currency_code=$1) AS receptions,
         (SELECT count(*)::int FROM aif_exchange_rates WHERE currency_code=$1) AS exchange_rates,
         (SELECT count(*)::int FROM aif_import_batches WHERE currency_code=$1) AS import_batches`,
      [code]
    );
    return r.rows[0] || { receptions: 0, exchange_rates: 0, import_batches: 0 };
  }

  function receptionFromBody(body) {
    const src = body?.reception && typeof body.reception === "object" ? body.reception : {};
    const code = currencyCode(src.currencyCode || src.currency_code || body.currencyCode || body.currency_code);
    const exchangeRate = toMoney(src.exchangeRateToRon ?? src.exchange_rate_to_ron ?? body.exchangeRateToRon ?? body.exchange_rate_to_ron);
    const mode = tvaMode(src.tvaMode || src.tva_mode || body.tvaMode || body.tva_mode);
    return {
      invoiceNumber: emptyToNull(src.invoiceNumber || src.invoice_number || body.invoiceNumber || body.invoice_number),
      invoiceDate: emptyToNull(src.invoiceDate || src.invoice_date || body.invoiceDate || body.invoice_date),
      receptionDate: emptyToNull(src.receptionDate || src.reception_date || body.receptionDate || body.reception_date),
      currencyCode: code || null,
      exchangeRateToRon: exchangeRate && exchangeRate > 0 ? exchangeRate : null,
      tvaMode: mode,
      tvaRate: toMoney(src.tvaRate ?? src.tva_rate ?? body.tvaRate ?? body.tva_rate),
      shippingCost: toMoney(src.shippingCost ?? src.shipping_cost ?? body.shippingCost ?? body.shipping_cost) ?? 0,
      goodsValue: toMoney(src.goodsValue ?? src.goods_value ?? body.goodsValue ?? body.goods_value),
      invoiceNet: toMoney(src.invoiceNet ?? src.invoice_net ?? body.invoiceNet ?? body.invoice_net),
      invoiceVat: toMoney(src.invoiceVat ?? src.invoice_vat ?? body.invoiceVat ?? body.invoice_vat),
      invoiceGross: toMoney(src.invoiceGross ?? src.invoice_gross ?? body.invoiceGross ?? body.invoice_gross),
      lineCount: toInt(src.lineCount ?? src.line_count ?? body.lineCount ?? body.line_count) || 0,
      totalQty: toInt(src.totalQty ?? src.total_qty ?? body.totalQty ?? body.total_qty) || 0,
      note: emptyToNull(src.note || body.note),
      rawMeta: src && typeof src === "object" ? src : {},
    };
  }

  router.get("/suppliers", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const withStats = ["1", "true", "yes"].includes(text(req.query.withStats || req.query.with_stats).toLowerCase());

    if (!withStats) {
      const r = await pool.query(
        `SELECT id, code, name, is_active, notes, created_at, updated_at
         FROM aif_suppliers
         ${includeInactive ? "" : "WHERE is_active=true"}
         ORDER BY is_active DESC, name ASC`
      );
      return res.json({ items: r.rows });
    }

    const r = await pool.query(
      `SELECT
         s.id, s.code, s.name, s.is_active, s.notes, s.created_at, s.updated_at,
         count(DISTINCT b.id)::int AS import_batches,
         count(rw.id)::int AS imported_rows,
         COALESCE(sum(CASE WHEN b.status='committed' THEN COALESCE(rw.qty,0) ELSE 0 END),0)::int AS purchased_qty,
         COALESCE(sum(CASE WHEN b.status='committed' THEN COALESCE(rw.qty,0) * COALESCE(rw.buy_price_ron, rw.buy_price,0) ELSE 0 END),0)::numeric(14,2) AS purchased_value,
         max(CASE WHEN b.status='committed' THEN COALESCE(b.committed_at, b.created_at) END) AS last_purchase_at
       FROM aif_suppliers s
       LEFT JOIN aif_import_batches b ON b.supplier_id=s.id
       LEFT JOIN aif_import_rows rw ON rw.batch_id=b.id AND rw.status <> 'ignored'
       ${includeInactive ? "" : "WHERE s.is_active=true"}
       GROUP BY s.id
       ORDER BY s.is_active DESC, s.name ASC`
    );
    res.json({ items: r.rows });
  });

  router.post("/suppliers", requireAdminOrSecret, async (req, res) => {
    const body = req.body || {};
    const name = text(body.name);
    const code = normCode(body.code || name);
    const notes = emptyToNull(body.notes);
    if (!name) return res.status(400).json({ error: "supplier name required" });
    if (!code) return res.status(400).json({ error: "supplier code required" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const r = await client.query(
        `INSERT INTO aif_suppliers (code, name, notes, is_active)
         VALUES ($1,$2,$3,true)
         ON CONFLICT (code) DO UPDATE SET
           name=EXCLUDED.name,
           notes=COALESCE(EXCLUDED.notes, aif_suppliers.notes),
           is_active=true,
           updated_at=now()
         RETURNING id, code, name, is_active, notes, created_at, updated_at`,
        [code, name, notes]
      );
      await client.query(
        `INSERT INTO aif_supplier_import_profiles (supplier_id, name, source_format, version)
         VALUES ($1, 'Default XLS', 'xls', 1)
         ON CONFLICT (supplier_id, name, version) DO NOTHING`,
        [r.rows[0].id]
      );
      await client.query("COMMIT");
      res.json({ item: r.rows[0] });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF create supplier failed", e);
      res.status(500).json({ error: "failed to save supplier" });
    } finally {
      client.release();
    }
  });

  router.patch("/suppliers/:id", requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    const body = req.body || {};
    const sets = [];
    const args = [];
    let i = 1;

    if (body.name !== undefined) {
      const name = text(body.name);
      if (!name) return res.status(400).json({ error: "supplier name required" });
      sets.push(`name=$${i++}`);
      args.push(name);
    }
    if (body.code !== undefined) {
      const code = normCode(body.code);
      if (!code) return res.status(400).json({ error: "supplier code required" });
      sets.push(`code=$${i++}`);
      args.push(code);
    }
    if (body.notes !== undefined) {
      sets.push(`notes=$${i++}`);
      args.push(emptyToNull(body.notes));
    }
    if (body.is_active !== undefined || body.isActive !== undefined) {
      sets.push(`is_active=$${i++}`);
      args.push(Boolean(body.is_active ?? body.isActive));
    }

    if (!sets.length) return res.json({ ok: true });
    args.push(id);

    try {
      const r = await pool.query(
        `UPDATE aif_suppliers
         SET ${sets.join(", ")}, updated_at=now()
         WHERE id::text=$${i} OR code=$${i}
         RETURNING id, code, name, is_active, notes, created_at, updated_at`,
        args
      );
      if (!r.rowCount) return res.status(404).json({ error: "supplier not found" });
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF update supplier failed", e);
      res.status(500).json({ error: "failed to update supplier" });
    }
  });

  router.delete("/suppliers/:id", requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const supplier = await client.query(
        `SELECT id, code, name FROM aif_suppliers WHERE id::text=$1 OR code=$1 FOR UPDATE`,
        [id]
      );
      if (!supplier.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "supplier not found" });
      }
      const usage = await supplierUsage(client, supplier.rows[0].id);

      if (Number(usage.import_batches || 0) > 0 || Number(usage.supplier_codes || 0) > 0) {
        await client.query(`UPDATE aif_suppliers SET is_active=false, updated_at=now() WHERE id=$1`, [supplier.rows[0].id]);
        await client.query(`UPDATE aif_supplier_import_profiles SET is_active=false, updated_at=now() WHERE supplier_id=$1`, [supplier.rows[0].id]);
        await client.query("COMMIT");
        return res.json({ ok: true, mode: "deactivated", usage });
      }

      await client.query(`DELETE FROM aif_suppliers WHERE id=$1`, [supplier.rows[0].id]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "deleted", usage });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete supplier failed", e);
      res.status(500).json({ error: "failed to delete supplier" });
    } finally {
      client.release();
    }
  });

  router.get("/suppliers/report", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const p = periodWhere(req, 1);
    const whereBatch = [`b.status='committed'`, ...p.parts];
    const args = [...p.args];

    const r = await pool.query(
      `SELECT
         s.id, s.code, s.name, s.is_active,
         count(DISTINCT b.id)::int AS purchase_batches,
         count(rw.id)::int AS purchase_rows,
         COALESCE(sum(COALESCE(rw.qty,0)),0)::int AS purchase_qty,
         COALESCE(sum(COALESCE(rw.qty,0) * COALESCE(rw.buy_price_ron, rw.buy_price,0)),0)::numeric(14,2) AS purchase_value,
         count(rw.id) FILTER (WHERE rw.buy_price IS NULL)::int AS rows_without_buy_price,
         max(COALESCE(b.committed_at, b.created_at)) AS last_purchase_at
       FROM aif_suppliers s
       LEFT JOIN aif_import_batches b ON b.supplier_id=s.id AND ${whereBatch.join(" AND ")}
       LEFT JOIN aif_import_rows rw ON rw.batch_id=b.id AND rw.status <> 'ignored'
       ${includeInactive ? "" : "WHERE s.is_active=true"}
       GROUP BY s.id
       ORDER BY purchase_value DESC, purchase_qty DESC, s.name ASC`,
      args
    );

    const totals = r.rows.reduce((acc, x) => {
      acc.purchase_batches += Number(x.purchase_batches || 0);
      acc.purchase_rows += Number(x.purchase_rows || 0);
      acc.purchase_qty += Number(x.purchase_qty || 0);
      acc.purchase_value += Number(x.purchase_value || 0);
      acc.rows_without_buy_price += Number(x.rows_without_buy_price || 0);
      return acc;
    }, { purchase_batches: 0, purchase_rows: 0, purchase_qty: 0, purchase_value: 0, rows_without_buy_price: 0 });

    res.json({ items: r.rows, totals });
  });

  router.get("/currencies", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const r = await pool.query(
      `SELECT code, name, symbol, sort_order, is_active, created_at, updated_at
       FROM aif_currencies
       ${includeInactive ? "" : "WHERE is_active=true"}
       ORDER BY is_active DESC, sort_order ASC, code ASC`
    );
    res.json({ items: r.rows });
  });

  router.post("/currencies", requireAdminOrSecret, async (req, res) => {
    const body = req.body || {};
    const code = currencyCode(body.code);
    const name = text(body.name);
    const symbol = emptyToNull(body.symbol);
    const sortOrder = toInt(body.sortOrder ?? body.sort_order) || 100;
    if (!code) return res.status(400).json({ error: "currency code required" });
    if (!name) return res.status(400).json({ error: "currency name required" });
    try {
      const r = await pool.query(
        `INSERT INTO aif_currencies (code, name, symbol, sort_order, is_active)
         VALUES ($1,$2,$3,$4,true)
         ON CONFLICT (code) DO UPDATE SET
           name=EXCLUDED.name,
           symbol=EXCLUDED.symbol,
           sort_order=EXCLUDED.sort_order,
           is_active=true,
           updated_at=now()
         RETURNING code, name, symbol, sort_order, is_active, created_at, updated_at`,
        [code, name, symbol, sortOrder]
      );
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF create currency failed", e);
      res.status(500).json({ error: "failed to save currency" });
    }
  });

  router.patch("/currencies/:code", requireAdminOrSecret, async (req, res) => {
    const codeParam = currencyCode(req.params.code);
    const body = req.body || {};
    const sets = [];
    const args = [];
    let i = 1;
    if (body.name !== undefined) {
      const name = text(body.name);
      if (!name) return res.status(400).json({ error: "currency name required" });
      sets.push(`name=$${i++}`);
      args.push(name);
    }
    if (body.symbol !== undefined) {
      sets.push(`symbol=$${i++}`);
      args.push(emptyToNull(body.symbol));
    }
    if (body.sortOrder !== undefined || body.sort_order !== undefined) {
      sets.push(`sort_order=$${i++}`);
      args.push(toInt(body.sortOrder ?? body.sort_order) || 100);
    }
    if (body.is_active !== undefined || body.isActive !== undefined) {
      sets.push(`is_active=$${i++}`);
      args.push(Boolean(body.is_active ?? body.isActive));
    }
    if (!sets.length) return res.json({ ok: true });
    args.push(codeParam);
    try {
      const r = await pool.query(
        `UPDATE aif_currencies SET ${sets.join(", ")}, updated_at=now()
         WHERE code=$${i}
         RETURNING code, name, symbol, sort_order, is_active, created_at, updated_at`,
        args
      );
      if (!r.rowCount) return res.status(404).json({ error: "currency not found" });
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF update currency failed", e);
      res.status(500).json({ error: "failed to update currency" });
    }
  });

  router.delete("/currencies/:code", requireAdminOrSecret, async (req, res) => {
    const codeParam = currencyCode(req.params.code);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const c = await client.query(`SELECT code FROM aif_currencies WHERE code=$1 FOR UPDATE`, [codeParam]);
      if (!c.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "currency not found" });
      }
      const activeCount = await client.query(`SELECT count(*)::int AS c FROM aif_currencies WHERE is_active=true AND code <> $1`, [codeParam]);
      if (Number(activeCount.rows[0]?.c || 0) <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "at least one active currency is required" });
      }
      const usage = await currencyUsage(client, codeParam);
      if (Number(usage.receptions || 0) > 0 || Number(usage.exchange_rates || 0) > 0 || Number(usage.import_batches || 0) > 0) {
        await client.query(`UPDATE aif_currencies SET is_active=false, updated_at=now() WHERE code=$1`, [codeParam]);
        await client.query("COMMIT");
        return res.json({ ok: true, mode: "deactivated", usage });
      }
      await client.query(`DELETE FROM aif_currencies WHERE code=$1`, [codeParam]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "deleted", usage });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete currency failed", e);
      res.status(500).json({ error: "failed to delete currency" });
    } finally {
      client.release();
    }
  });

  router.get("/receptions", requireAuthed, async (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const r = await pool.query(
      `SELECT r.id, r.created_at, r.updated_at, r.status, r.invoice_number, r.invoice_date, r.reception_date,
              r.currency_code, r.exchange_rate_to_ron, r.tva_mode, r.tva_rate, r.goods_value,
              r.invoice_net, r.invoice_vat, r.invoice_gross, r.shipping_cost, r.total_qty, r.line_count,
              s.name AS supplier_name, l.name AS location_name
       FROM aif_receptions r
       LEFT JOIN aif_suppliers s ON s.id=r.supplier_id
       LEFT JOIN aif_locations l ON l.id=r.target_location_id
       ORDER BY r.created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ items: r.rows });
  });

  router.get("/brands", requireAuthed, async (_req, res) => {
    const r = await pool.query(`SELECT id, code, name, is_active FROM aif_brands ORDER BY name ASC`);
    res.json({ items: r.rows });
  });

  router.get("/categories", requireAuthed, async (_req, res) => {
    const r = await pool.query(
      `SELECT id, code, parent_id, name_ro, name_hu, shopify_collection_handle, sort_order, is_active
       FROM aif_categories
       ORDER BY sort_order ASC, name_ro ASC`
    );
    res.json({ items: r.rows });
  });

  router.get("/location-types", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const r = await pool.query(
      `SELECT id, code, name, sort_order, is_active, created_at, updated_at
       FROM aif_location_types
       ${includeInactive ? "" : "WHERE is_active=true"}
       ORDER BY is_active DESC, sort_order ASC, name ASC`
    );
    res.json({ items: r.rows });
  });

  router.post("/location-types", requireAdminOrSecret, async (req, res) => {
    const body = req.body || {};
    const name = text(body.name);
    const code = normCode(body.code || name);
    const sortOrder = toInt(body.sortOrder ?? body.sort_order) || 100;

    if (!name) return res.status(400).json({ error: "location type name required" });
    if (!code) return res.status(400).json({ error: "location type code required" });

    try {
      const r = await pool.query(
        `INSERT INTO aif_location_types (code, name, sort_order, is_active)
         VALUES ($1,$2,$3,true)
         ON CONFLICT (code) DO UPDATE SET
           name=EXCLUDED.name,
           sort_order=EXCLUDED.sort_order,
           is_active=true,
           updated_at=now()
         RETURNING id, code, name, sort_order, is_active, created_at, updated_at`,
        [code, name, sortOrder]
      );
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF create location type failed", e);
      res.status(500).json({ error: "failed to save location type" });
    }
  });

  router.patch("/location-types/:id", requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    const body = req.body || {};
    const sets = [];
    const args = [];
    let i = 1;

    if (body.name !== undefined) {
      const name = text(body.name);
      if (!name) return res.status(400).json({ error: "location type name required" });
      sets.push(`name=$${i++}`);
      args.push(name);
    }
    if (body.code !== undefined) {
      const code = normCode(body.code);
      if (!code) return res.status(400).json({ error: "location type code required" });
      sets.push(`code=$${i++}`);
      args.push(code);
    }
    if (body.sortOrder !== undefined || body.sort_order !== undefined) {
      sets.push(`sort_order=$${i++}`);
      args.push(toInt(body.sortOrder ?? body.sort_order) || 100);
    }
    if (body.is_active !== undefined || body.isActive !== undefined) {
      sets.push(`is_active=$${i++}`);
      args.push(Boolean(body.is_active ?? body.isActive));
    }

    if (!sets.length) return res.json({ ok: true });
    args.push(id);

    try {
      const r = await pool.query(
        `UPDATE aif_location_types
         SET ${sets.join(", ")}, updated_at=now()
         WHERE id::text=$${i} OR code=$${i}
         RETURNING id, code, name, sort_order, is_active, created_at, updated_at`,
        args
      );
      if (!r.rowCount) return res.status(404).json({ error: "location type not found" });
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF update location type failed", e);
      res.status(500).json({ error: "failed to update location type" });
    }
  });

  router.delete("/location-types/:id", requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const typeRes = await client.query(
        `SELECT id, code, name FROM aif_location_types WHERE id::text=$1 OR code=$1 FOR UPDATE`,
        [id]
      );
      if (!typeRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "location type not found" });
      }

      const activeCount = await client.query(
        `SELECT count(*)::int AS c FROM aif_location_types WHERE is_active=true AND id <> $1`,
        [typeRes.rows[0].id]
      );
      if (Number(activeCount.rows[0]?.c || 0) <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "at least one active location type is required" });
      }

      const usage = await locationTypeUsage(client, typeRes.rows[0].code);
      if (Number(usage.locations || 0) > 0) {
        await client.query(`UPDATE aif_location_types SET is_active=false, updated_at=now() WHERE id=$1`, [typeRes.rows[0].id]);
        await client.query("COMMIT");
        return res.json({ ok: true, mode: "deactivated", usage });
      }

      await client.query(`DELETE FROM aif_location_types WHERE id=$1`, [typeRes.rows[0].id]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "deleted", usage });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete location type failed", e);
      res.status(500).json({ error: "failed to delete location type" });
    } finally {
      client.release();
    }
  });

  router.get("/locations", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const r = await pool.query(
      `SELECT id, code, name, location_type, is_active, created_at, updated_at
       FROM aif_locations
       ${includeInactive ? "" : "WHERE is_active=true"}
       ORDER BY is_active DESC, name ASC`
    );
    res.json({ items: r.rows });
  });

  router.post("/locations", requireAdminOrSecret, async (req, res) => {
    const body = req.body || {};
    const name = text(body.name);
    const code = normCode(body.code || name);
    const locationType = normCode(body.locationType || body.location_type || "warehouse") || "warehouse";

    if (!name) return res.status(400).json({ error: "location name required" });
    if (!code) return res.status(400).json({ error: "location code required" });

    try {
      if (!(await activeLocationTypeExists(pool, locationType))) {
        return res.status(400).json({ error: "invalid location type" });
      }
      const r = await pool.query(
        `INSERT INTO aif_locations (code, name, location_type, is_active)
         VALUES ($1,$2,$3,true)
         ON CONFLICT (code) DO UPDATE SET
           name=EXCLUDED.name,
           location_type=EXCLUDED.location_type,
           is_active=true,
           updated_at=now()
         RETURNING id, code, name, location_type, is_active, created_at, updated_at`,
        [code, name, locationType]
      );
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF create location failed", e);
      res.status(500).json({ error: "failed to save location" });
    }
  });

  router.patch("/locations/:id", requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    const body = req.body || {};
    const sets = [];
    const args = [];
    let i = 1;

    if (body.name !== undefined) {
      const name = text(body.name);
      if (!name) return res.status(400).json({ error: "location name required" });
      sets.push(`name=$${i++}`);
      args.push(name);
    }
    if (body.code !== undefined) {
      const code = normCode(body.code);
      if (!code) return res.status(400).json({ error: "location code required" });
      sets.push(`code=$${i++}`);
      args.push(code);
    }
    if (body.locationType !== undefined || body.location_type !== undefined) {
      const locationType = normCode(body.locationType || body.location_type || "warehouse") || "warehouse";
      if (!(await activeLocationTypeExists(pool, locationType))) return res.status(400).json({ error: "invalid location type" });
      sets.push(`location_type=$${i++}`);
      args.push(locationType);
    }
    if (body.is_active !== undefined || body.isActive !== undefined) {
      sets.push(`is_active=$${i++}`);
      args.push(Boolean(body.is_active ?? body.isActive));
    }

    if (!sets.length) return res.json({ ok: true });
    args.push(id);

    try {
      const r = await pool.query(
        `UPDATE aif_locations
         SET ${sets.join(", ")}, updated_at=now()
         WHERE id::text=$${i} OR code=$${i}
         RETURNING id, code, name, location_type, is_active, created_at, updated_at`,
        args
      );
      if (!r.rowCount) return res.status(404).json({ error: "location not found" });
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF update location failed", e);
      res.status(500).json({ error: "failed to update location" });
    }
  });

  router.delete("/locations/:id", requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const location = await client.query(
        `SELECT id, code, name FROM aif_locations WHERE id::text=$1 OR code=$1 FOR UPDATE`,
        [id]
      );
      if (!location.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "location not found" });
      }

      const activeCount = await client.query(
        `SELECT count(*)::int AS c FROM aif_locations WHERE is_active=true AND id <> $1`,
        [location.rows[0].id]
      );
      if (Number(activeCount.rows[0]?.c || 0) <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "at least one active location is required" });
      }

      const usage = await locationUsage(client, location.rows[0].id);
      if (
        Number(usage.import_batches || 0) > 0 ||
        Number(usage.stock_rows || 0) > 0 ||
        Number(usage.stock_movements || 0) > 0
      ) {
        await client.query(`UPDATE aif_locations SET is_active=false, updated_at=now() WHERE id=$1`, [location.rows[0].id]);
        await client.query("COMMIT");
        return res.json({ ok: true, mode: "deactivated", usage });
      }

      await client.query(`DELETE FROM aif_locations WHERE id=$1`, [location.rows[0].id]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "deleted", usage });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete location failed", e);
      res.status(500).json({ error: "failed to delete location" });
    } finally {
      client.release();
    }
  });

  router.get("/meta", requireAuthed, async (_req, res) => {
    const [suppliers, brands, categories, locations, locationTypes, currencies, profiles] = await Promise.all([
      pool.query(`SELECT id, code, name, is_active FROM aif_suppliers WHERE is_active=true ORDER BY name ASC`),
      pool.query(`SELECT id, code, name, is_active FROM aif_brands WHERE is_active=true ORDER BY name ASC`),
      pool.query(`SELECT id, code, name_ro, name_hu, sort_order, is_active FROM aif_categories WHERE is_active=true ORDER BY sort_order ASC, name_ro ASC`),
      pool.query(`SELECT id, code, name, location_type, is_active FROM aif_locations WHERE is_active=true ORDER BY name ASC`),
      pool.query(`SELECT id, code, name, sort_order, is_active FROM aif_location_types WHERE is_active=true ORDER BY sort_order ASC, name ASC`),
      pool.query(`SELECT code, name, symbol, sort_order, is_active FROM aif_currencies WHERE is_active=true ORDER BY sort_order ASC, code ASC`),
      pool.query(`SELECT p.id, p.supplier_id, s.code AS supplier_code, p.name, p.source_format, p.version, p.is_active
                  FROM aif_supplier_import_profiles p
                  JOIN aif_suppliers s ON s.id=p.supplier_id
                  WHERE s.is_active=true AND p.is_active=true
                  ORDER BY s.name ASC, p.name ASC, p.version DESC`),
    ]);
    res.json({
      suppliers: suppliers.rows,
      brands: brands.rows,
      categories: categories.rows,
      locations: locations.rows,
      locationTypes: locationTypes.rows,
      currencies: currencies.rows,
      profiles: profiles.rows,
    });
  });

  router.get("/import-profiles", requireAuthed, async (req, res) => {
    const supplier = text(req.query.supplier || req.query.supplierCode || req.query.supplier_id);
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const args = [];
    const where = [];
    if (!includeInactive) {
      where.push(`s.is_active=true`);
      where.push(`p.is_active=true`);
    }
    if (supplier) {
      args.push(supplier);
      where.push(`(s.code=$${args.length} OR s.id::text=$${args.length})`);
    }
    const r = await pool.query(
      `SELECT p.id, p.supplier_id, s.code AS supplier_code, s.name AS supplier_name,
              p.name, p.source_format, p.version, p.sheet_name_hint, p.header_row_hint, p.is_active, p.settings
       FROM aif_supplier_import_profiles p
       JOIN aif_suppliers s ON s.id=p.supplier_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY s.name ASC, p.name ASC, p.version DESC`,
      args
    );
    res.json({ items: r.rows });
  });

  router.post("/import-batches", requireAuthed, async (req, res) => {
    const body = req.body || {};
    const client = await pool.connect();
    try {
      const supplier = await findByIdOrCode(client, "aif_suppliers", body.supplierId || body.supplier_id || body.supplierCode || body.supplier);
      if (!supplier) return res.status(400).json({ error: "supplier required or unknown" });
      if (supplier.is_active === false) return res.status(400).json({ error: "supplier is inactive" });

      let profileId = emptyToNull(body.profileId || body.profile_id);
      if (!profileId) {
        const pr = await client.query(
          `SELECT id FROM aif_supplier_import_profiles
           WHERE supplier_id=$1 AND is_active=true
           ORDER BY version DESC
           LIMIT 1`,
          [supplier.id]
        );
        profileId = pr.rows[0]?.id || null;
      }

      let location = null;
      const locInput = body.targetLocationId || body.target_location_id || body.locationId || body.location_id || body.locationCode || body.location;
      if (locInput) location = await findByIdOrCode(client, "aif_locations", locInput);
      const targetLocationId = location?.id || await getDefaultLocationId(client);
      if (!targetLocationId) return res.status(400).json({ error: "target location missing" });

      const reception = receptionFromBody(body);
      if (!reception.invoiceNumber) return res.status(400).json({ error: "invoice number required" });
      if (!reception.invoiceDate) return res.status(400).json({ error: "invoice date required" });
      if (!reception.receptionDate) return res.status(400).json({ error: "reception date required" });
      if (!reception.currencyCode) return res.status(400).json({ error: "currency required" });
      if (!reception.exchangeRateToRon || reception.exchangeRateToRon <= 0) return res.status(400).json({ error: "exchange rate required" });
      if (!reception.tvaMode) return res.status(400).json({ error: "TVA mode required" });
      if (reception.tvaMode !== "no_tva" && (reception.tvaRate === null || reception.tvaRate === undefined)) return res.status(400).json({ error: "TVA rate required" });
      if (reception.invoiceGross === null || reception.invoiceGross === undefined) return res.status(400).json({ error: "invoice total required" });

      const curr = await client.query(`SELECT code FROM aif_currencies WHERE code=$1 AND is_active=true LIMIT 1`, [reception.currencyCode]);
      if (!curr.rowCount) return res.status(400).json({ error: "currency is inactive or unknown" });

      await client.query("BEGIN");

      const receptionRes = await client.query(
        `INSERT INTO aif_receptions (
           supplier_id, target_location_id, invoice_number, invoice_date, reception_date,
           currency_code, exchange_rate_to_ron, tva_mode, tva_rate, shipping_cost,
           goods_value, invoice_net, invoice_vat, invoice_gross, total_qty, line_count,
           status, note, raw_meta, created_by, actor
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'draft',$17,$18::jsonb,$19,$20)
         RETURNING id`,
        [
          supplier.id,
          targetLocationId,
          reception.invoiceNumber,
          reception.invoiceDate,
          reception.receptionDate,
          reception.currencyCode,
          reception.exchangeRateToRon,
          reception.tvaMode,
          reception.tvaRate,
          reception.shippingCost,
          reception.goodsValue,
          reception.invoiceNet,
          reception.invoiceVat,
          reception.invoiceGross,
          reception.totalQty,
          reception.lineCount,
          reception.note,
          JSON.stringify(reception.rawMeta || {}),
          req.session?.role || "system",
          actorFrom(req),
        ]
      );

      const r = await client.query(
        `INSERT INTO aif_import_batches (
           supplier_id, profile_id, target_location_id, reception_id, source_file_name,
           source_file_url, source_format, status, created_by, actor, note, raw_meta,
           currency_code, exchange_rate_to_ron, invoice_number
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10,$11::jsonb,$12,$13,$14)
         RETURNING id`,
        [
          supplier.id,
          profileId,
          targetLocationId,
          receptionRes.rows[0].id,
          emptyToNull(body.sourceFileName || body.source_file_name || body.fileName),
          emptyToNull(body.sourceFileUrl || body.source_file_url || body.fileUrl),
          normCode(body.sourceFormat || body.source_format || "xls") || "xls",
          req.session?.role || "system",
          actorFrom(req),
          emptyToNull(body.note),
          JSON.stringify(body.rawMeta || body.raw_meta || {}),
          reception.currencyCode,
          reception.exchangeRateToRon,
          reception.invoiceNumber,
        ]
      );
      await client.query("COMMIT");
      res.json({ id: r.rows[0].id, receptionId: receptionRes.rows[0].id });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF create import batch failed", e);
      res.status(500).json({ error: "failed to create import batch" });
    } finally {
      client.release();
    }
  });

  router.get("/import-batches", requireAuthed, async (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const r = await pool.query(
      `SELECT b.id, b.created_at, b.updated_at, b.status, b.row_count, b.error_count,
              b.source_file_name, b.note, b.committed_at,
              b.reception_id, b.invoice_number, b.currency_code, b.exchange_rate_to_ron,
              r.invoice_gross, r.invoice_date, r.reception_date,
              s.code AS supplier_code, s.name AS supplier_name,
              l.code AS location_code, l.name AS location_name,
              p.name AS profile_name, p.version AS profile_version
       FROM aif_import_batches b
       JOIN aif_suppliers s ON s.id=b.supplier_id
       LEFT JOIN aif_locations l ON l.id=b.target_location_id
       LEFT JOIN aif_supplier_import_profiles p ON p.id=b.profile_id
       LEFT JOIN aif_receptions r ON r.id=b.reception_id
       ORDER BY b.created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ items: r.rows });
  });

  router.get("/import-batches/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const batch = await pool.query(
      `SELECT b.*, s.code AS supplier_code, s.name AS supplier_name,
              l.code AS location_code, l.name AS location_name,
              p.name AS profile_name, p.version AS profile_version,
              to_jsonb(r.*) AS reception
       FROM aif_import_batches b
       JOIN aif_suppliers s ON s.id=b.supplier_id
       LEFT JOIN aif_locations l ON l.id=b.target_location_id
       LEFT JOIN aif_supplier_import_profiles p ON p.id=b.profile_id
       LEFT JOIN aif_receptions r ON r.id=b.reception_id
       WHERE b.id=$1`,
      [id]
    );
    if (!batch.rowCount) return res.status(404).json({ error: "not found" });

    const rows = await pool.query(
      `SELECT id, row_no, raw, normalized, status, error_messages, variant_id,
              supplier_product_code, supplier_variant_code, supplier_color_code, supplier_size,
              qty, buy_price, buy_price_ron, sell_price, sell_price_ron
       FROM aif_import_rows
       WHERE batch_id=$1
       ORDER BY row_no ASC`,
      [id]
    );

    res.json({ batch: batch.rows[0], rows: rows.rows });
  });

  router.post("/import-batches/:id/rows", requireAuthed, async (req, res) => {
    const batchId = text(req.params.id);
    const rowsInput = Array.isArray(req.body?.rows) ? req.body.rows : Array.isArray(req.body?.items) ? req.body.items : [];
    if (!rowsInput.length) return res.status(400).json({ error: "rows required" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const batch = await client.query(
        `SELECT b.id, b.status, b.currency_code, b.exchange_rate_to_ron,
                r.exchange_rate_to_ron AS reception_exchange_rate, r.currency_code AS reception_currency_code
         FROM aif_import_batches b
         LEFT JOIN aif_receptions r ON r.id=b.reception_id
         WHERE b.id=$1
         FOR UPDATE`,
        [batchId]
      );
      if (!batch.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "batch not found" });
      }
      if (!["draft", "parsed", "needs_review", "failed"].includes(batch.rows[0].status)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "batch cannot be edited" });
      }

      const exchangeRate = Number(batch.rows[0].exchange_rate_to_ron || batch.rows[0].reception_exchange_rate || 1);
      const currency = currencyCode(batch.rows[0].currency_code || batch.rows[0].reception_currency_code || "RON") || "RON";

      await client.query(`DELETE FROM aif_import_rows WHERE batch_id=$1`, [batchId]);

      let errorCount = 0;
      let rowNo = 1;
      for (const input of rowsInput) {
        const nr = normalizeRowInput(input, rowNo++);
        if (nr.errors.length) errorCount++;
        const buyPriceRon = nr.normalized.buyPrice == null || !Number.isFinite(exchangeRate)
          ? null
          : Number(nr.normalized.buyPrice) * exchangeRate;
        const sellPriceRon = nr.normalized.sellPrice == null || !Number.isFinite(exchangeRate)
          ? null
          : Number(nr.normalized.sellPrice) * exchangeRate;
        const normalizedForDb = {
          ...nr.normalized,
          currencyCode: currency,
          exchangeRateToRon: exchangeRate,
          buyPriceRon,
          sellPriceRon,
        };

        await client.query(
          `INSERT INTO aif_import_rows (
             batch_id, row_no, raw, normalized, status, error_messages,
             supplier_product_code, supplier_variant_code, supplier_color_code, supplier_size,
             qty, buy_price, buy_price_ron, sell_price, sell_price_ron
           )
           VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6::text[],$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            batchId,
            nr.rowNo,
            JSON.stringify(nr.raw || {}),
            JSON.stringify(normalizedForDb),
            nr.status,
            nr.errors,
            nr.normalized.supplierProductCode,
            nr.normalized.supplierVariantCode,
            nr.normalized.supplierColorCode,
            nr.normalized.supplierSize,
            nr.normalized.qty,
            nr.normalized.buyPrice,
            buyPriceRon,
            nr.normalized.sellPrice,
            sellPriceRon,
          ]
        );
      }

      await client.query(
        `UPDATE aif_import_batches
         SET row_count=$2, error_count=$3, status=$4, updated_at=now()
         WHERE id=$1`,
        [batchId, rowsInput.length, errorCount, errorCount ? "needs_review" : "parsed"]
      );

      await client.query("COMMIT");
      res.json({ ok: true, rowCount: rowsInput.length, errorCount });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF replace import rows failed", e);
      res.status(500).json({ error: "failed to save rows" });
    } finally {
      client.release();
    }
  });

  router.post("/import-batches/:id/commit", requireAuthed, async (req, res) => {
    const batchId = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const batchRes = await client.query(
        `SELECT b.*, s.code AS supplier_code, r.exchange_rate_to_ron AS reception_exchange_rate
         FROM aif_import_batches b
         JOIN aif_suppliers s ON s.id=b.supplier_id
         LEFT JOIN aif_receptions r ON r.id=b.reception_id
         WHERE b.id=$1
         FOR UPDATE`,
        [batchId]
      );
      if (!batchRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "batch not found" });
      }
      const batch = batchRes.rows[0];
      if (batch.status === "committed") {
        await client.query("COMMIT");
        return res.json({ ok: true, already: true });
      }
      if (!["parsed", "needs_review", "draft"].includes(batch.status)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "batch cannot be committed" });
      }
      if (!batch.target_location_id) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "target location missing" });
      }

      const rows = await client.query(
        `SELECT * FROM aif_import_rows
         WHERE batch_id=$1 AND status <> 'ignored'
         ORDER BY row_no ASC
         FOR UPDATE`,
        [batchId]
      );

      const errors = rows.rows.filter((r) => r.status === "error" || (r.error_messages || []).length);
      if (errors.length) {
        await client.query(
          `UPDATE aif_import_batches SET status='needs_review', error_count=$2, updated_at=now() WHERE id=$1`,
          [batchId, errors.length]
        );
        await client.query("COMMIT");
        return res.status(400).json({ error: "batch has row errors", errorCount: errors.length });
      }

      let committed = 0;
      const actor = actorFrom(req);
      for (const row of rows.rows) {
        const normalized = { ...(row.normalized || {}) };
        const qty = Number(row.qty ?? normalized.qty ?? 0);
        if (!Number.isFinite(qty) || qty <= 0) continue;

        if (row.buy_price_ron !== null && row.buy_price_ron !== undefined) {
          normalized.buyPriceOriginal = row.buy_price;
          normalized.buyPrice = Number(row.buy_price_ron);
        }
        if (row.sell_price_ron !== null && row.sell_price_ron !== undefined) {
          normalized.sellPriceOriginal = row.sell_price;
          normalized.sellPrice = Number(row.sell_price_ron);
        }

        const modelId = await upsertModel(client, { supplierCode: batch.supplier_code, normalized });
        const variantId = await upsertVariant(client, { modelId, normalized });
        await upsertSupplierCode(client, { variantId, supplierId: batch.supplier_id, normalized });
        await addStock(client, {
          locationId: batch.target_location_id,
          variantId,
          qty: Math.floor(qty),
          actor,
          sourceId: batchId,
          rowId: row.id,
          raw: row.raw,
        });

        await client.query(
          `UPDATE aif_import_rows SET status='committed', variant_id=$2, updated_at=now() WHERE id=$1`,
          [row.id, variantId]
        );
        committed++;
      }

      await client.query(
        `UPDATE aif_import_batches
         SET status='committed', committed_at=now(), error_count=0, updated_at=now()
         WHERE id=$1`,
        [batchId]
      );

      if (batch.reception_id) {
        await client.query(
          `UPDATE aif_receptions
           SET status='committed', updated_at=now()
           WHERE id=$1`,
          [batch.reception_id]
        );
      }

      await client.query("COMMIT");
      res.json({ ok: true, committed });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF commit import batch failed", e);
      res.status(500).json({ error: "failed to commit import batch" });
    } finally {
      client.release();
    }
  });

  router.get("/variants/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    if (!id) return res.status(400).json({ error: "variant id required" });

    try {
      const variant = await pool.query(
        `SELECT
           v.id, v.model_id, v.internal_sku, v.barcode, v.color_code, v.color_name, v.color_hex,
           v.size, v.buy_price, v.sell_price, v.compare_at_price, v.weight_grams, v.image_url,
           v.images, v.attributes, v.status, v.created_at, v.updated_at,
           m.model_code, m.title_ro, m.title_hu, m.description_ro, m.gender, m.product_type,
           m.season, m.material, m.shopify_title, m.shopify_handle, m.status AS model_status,
           b.id AS brand_id, b.name AS brand_name, b.code AS brand_code,
           c.id AS category_id, c.name_ro AS category_name_ro, c.name_hu AS category_name_hu, c.code AS category_code
         FROM aif_product_variants v
         JOIN aif_product_models m ON m.id = v.model_id
         LEFT JOIN aif_brands b ON b.id = m.brand_id
         LEFT JOIN aif_categories c ON c.id = m.category_id
         WHERE v.id::text=$1 OR v.internal_sku=$1 OR v.barcode=$1
         LIMIT 1`,
        [id]
      );

      if (!variant.rowCount) return res.status(404).json({ error: "variant not found" });

      const variantId = variant.rows[0].id;
      const stock = await pool.query(
        `SELECT l.id AS location_id, l.code AS location_code, l.name AS location_name,
                l.location_type, s.qty, s.reserved_qty, (s.qty - s.reserved_qty) AS available_qty, s.updated_at
         FROM aif_stock s
         JOIN aif_locations l ON l.id=s.location_id
         WHERE s.variant_id=$1
         ORDER BY l.name ASC`,
        [variantId]
      );

      const supplierCodes = await pool.query(
        `SELECT sc.id, sc.supplier_product_code, sc.supplier_variant_code,
                sc.supplier_color_code, sc.supplier_color_name, sc.supplier_size,
                sc.supplier_barcode, sc.supplier_sku, sc.is_active,
                s.name AS supplier_name
         FROM aif_variant_supplier_codes sc
         JOIN aif_suppliers s ON s.id=sc.supplier_id
         WHERE sc.variant_id=$1
         ORDER BY sc.is_active DESC, s.name ASC`,
        [variantId]
      );

      const movements = await pool.query(
        `SELECT sm.id, sm.created_at, sm.movement_type, sm.source_type, sm.source_id,
                sm.qty_delta, sm.qty_before, sm.qty_after, sm.actor,
                l.name AS location_name
         FROM aif_stock_movements sm
         LEFT JOIN aif_locations l ON l.id=sm.location_id
         WHERE sm.variant_id=$1
         ORDER BY sm.created_at DESC
         LIMIT 25`,
        [variantId]
      );

      res.json({
        item: variant.rows[0],
        stock: stock.rows,
        supplierCodes: supplierCodes.rows,
        movements: movements.rows,
      });
    } catch (e) {
      console.error("AIF variant detail failed", e);
      res.status(500).json({ error: "failed to load variant" });
    }
  });

  router.patch("/variants/:id", requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    const body = req.body || {};
    if (!id) return res.status(400).json({ error: "variant id required" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT v.id, v.model_id
         FROM aif_product_variants v
         WHERE v.id::text=$1 OR v.internal_sku=$1 OR v.barcode=$1
         FOR UPDATE`,
        [id]
      );

      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "variant not found" });
      }

      const variantId = current.rows[0].id;
      const modelId = current.rows[0].model_id;

      const variantSets = [];
      const variantArgs = [];
      let vi = 1;
      const addVariant = (column, value) => {
        if (value === undefined) return;
        variantSets.push(`${column}=$${vi++}`);
        variantArgs.push(value);
      };

      if (body.barcode !== undefined) addVariant("barcode", emptyToNull(body.barcode));
      if (body.colorCode !== undefined || body.color_code !== undefined) addVariant("color_code", emptyToNull(body.colorCode ?? body.color_code));
      if (body.colorName !== undefined || body.color_name !== undefined) addVariant("color_name", emptyToNull(body.colorName ?? body.color_name));
      if (body.colorHex !== undefined || body.color_hex !== undefined) addVariant("color_hex", emptyToNull(body.colorHex ?? body.color_hex));
      if (body.size !== undefined) {
        const size = text(body.size);
        if (!size) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "size required" });
        }
        addVariant("size", size);
      }
      if (body.buyPrice !== undefined || body.buy_price !== undefined) addVariant("buy_price", toMoney(body.buyPrice ?? body.buy_price));
      if (body.sellPrice !== undefined || body.sell_price !== undefined) addVariant("sell_price", toMoney(body.sellPrice ?? body.sell_price));
      if (body.compareAtPrice !== undefined || body.compare_at_price !== undefined) addVariant("compare_at_price", toMoney(body.compareAtPrice ?? body.compare_at_price));
      if (body.weightGrams !== undefined || body.weight_grams !== undefined) addVariant("weight_grams", toInt(body.weightGrams ?? body.weight_grams));
      if (body.imageUrl !== undefined || body.image_url !== undefined) addVariant("image_url", emptyToNull(body.imageUrl ?? body.image_url));
      if (body.status !== undefined) {
        const status = text(body.status);
        if (!["active", "inactive", "archived"].includes(status)) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "invalid variant status" });
        }
        addVariant("status", status);
      }

      if (variantSets.length) {
        variantArgs.push(variantId);
        await client.query(
          `UPDATE aif_product_variants
           SET ${variantSets.join(", ")}, updated_at=now()
           WHERE id=$${vi}`,
          variantArgs
        );
      }

      const modelSets = [];
      const modelArgs = [];
      let mi = 1;
      const addModel = (column, value) => {
        if (value === undefined) return;
        modelSets.push(`${column}=$${mi++}`);
        modelArgs.push(value);
      };

      if (body.titleRo !== undefined || body.title_ro !== undefined) {
        const title = text(body.titleRo ?? body.title_ro);
        if (!title) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "product name required" });
        }
        addModel("title_ro", title);
      }
      if (body.titleHu !== undefined || body.title_hu !== undefined) addModel("title_hu", emptyToNull(body.titleHu ?? body.title_hu));
      if (body.descriptionRo !== undefined || body.description_ro !== undefined) addModel("description_ro", emptyToNull(body.descriptionRo ?? body.description_ro));
      if (body.gender !== undefined) {
        const gender = normCode(body.gender || "unisex") || "unisex";
        if (!["men", "women", "kids", "unisex"].includes(gender)) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "invalid gender" });
        }
        addModel("gender", gender);
      }
      if (body.productType !== undefined || body.product_type !== undefined) addModel("product_type", emptyToNull(body.productType ?? body.product_type));
      if (body.season !== undefined) addModel("season", emptyToNull(body.season));
      if (body.material !== undefined) addModel("material", emptyToNull(body.material));
      if (body.shopifyTitle !== undefined || body.shopify_title !== undefined) addModel("shopify_title", emptyToNull(body.shopifyTitle ?? body.shopify_title));
      if (body.modelStatus !== undefined || body.model_status !== undefined) {
        const status = text(body.modelStatus ?? body.model_status);
        if (!["draft", "active", "archived"].includes(status)) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "invalid model status" });
        }
        addModel("status", status);
      }

      const categoryInput = body.categoryId ?? body.category_id ?? body.categoryCode ?? body.category_code;
      if (categoryInput !== undefined) {
        const category = emptyToNull(categoryInput);
        if (!category) {
          addModel("category_id", null);
        } else {
          const cat = await client.query(`SELECT id FROM aif_categories WHERE id::text=$1 OR code=$1 LIMIT 1`, [category]);
          if (!cat.rowCount) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: "category not found" });
          }
          addModel("category_id", cat.rows[0].id);
        }
      }

      const brandInput = body.brandId ?? body.brand_id ?? body.brandCode ?? body.brand_code;
      if (brandInput !== undefined) {
        const brand = emptyToNull(brandInput);
        if (!brand) {
          addModel("brand_id", null);
        } else {
          const br = await client.query(`SELECT id FROM aif_brands WHERE id::text=$1 OR code=$1 LIMIT 1`, [brand]);
          if (!br.rowCount) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: "brand not found" });
          }
          addModel("brand_id", br.rows[0].id);
        }
      }

      if (modelSets.length) {
        modelArgs.push(modelId);
        await client.query(
          `UPDATE aif_product_models
           SET ${modelSets.join(", ")}, updated_at=now()
           WHERE id=$${mi}`,
          modelArgs
        );
      }

      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      if (e && e.code === "23505") {
        return res.status(400).json({ error: "barcode or sku already exists" });
      }
      console.error("AIF update variant failed", e);
      res.status(500).json({ error: "failed to update variant" });
    } finally {
      client.release();
    }
  });


  router.get("/inventory", requireAuthed, async (req, res) => {
    const search = text(req.query.search || req.query.q);
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));
    const args = [];
    const where = [];
    if (search) {
      args.push(`%${search}%`);
      where.push(`(
        title_ro ILIKE $1 OR internal_sku ILIKE $1 OR barcode ILIKE $1 OR
        model_code ILIKE $1 OR brand_name ILIKE $1 OR color_name ILIKE $1 OR size ILIKE $1
      )`);
    }
    args.push(limit);
    const r = await pool.query(
      `SELECT * FROM aif_inventory_summary
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY brand_name ASC NULLS LAST, title_ro ASC, color_name ASC NULLS LAST, size ASC
       LIMIT $${args.length}`,
      args
    );
    res.json({ items: r.rows });
  });

  router.get("/stock", requireAuthed, async (req, res) => {
    const location = text(req.query.location || req.query.locationCode || req.query.location_id);
    const variant = text(req.query.variant || req.query.variantId || req.query.variant_id);
    const args = [];
    const where = [];
    if (location) {
      args.push(location);
      where.push(`(l.code=$${args.length} OR l.id::text=$${args.length})`);
    }
    if (variant) {
      args.push(variant);
      where.push(`(v.id::text=$${args.length} OR v.internal_sku=$${args.length} OR v.barcode=$${args.length})`);
    }
    const r = await pool.query(
      `SELECT l.code AS location_code, l.name AS location_name,
              v.id AS variant_id, v.internal_sku, v.barcode, v.size, v.color_code, v.color_name,
              m.title_ro, s.qty, s.reserved_qty, (s.qty - s.reserved_qty) AS available_qty, s.updated_at
       FROM aif_stock s
       JOIN aif_locations l ON l.id=s.location_id
       JOIN aif_product_variants v ON v.id=s.variant_id
       JOIN aif_product_models m ON m.id=v.model_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY l.name ASC, m.title_ro ASC, v.color_name ASC NULLS LAST, v.size ASC`,
      args
    );
    res.json({ items: r.rows });
  });

  router.get("/health", requireAuthed, async (_req, res) => {
    const r = await pool.query(`SELECT count(*)::int AS suppliers FROM aif_suppliers`);
    res.json({ ok: true, suppliers: r.rows[0].suppliers });
  });

  return router;
}
