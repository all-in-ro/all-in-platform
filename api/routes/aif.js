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

  function rawValueByHeaders(raw, headers) {
    if (!raw || typeof raw !== "object") return null;
    const wanted = new Set((headers || []).map((x) => normCode(x)).filter(Boolean));
    for (const [key, value] of Object.entries(raw)) {
      if (wanted.has(normCode(key))) return emptyToNull(value);
    }
    return null;
  }

  function splitBrandProductCode(value) {
    const raw = text(value);
    if (!raw) return { fullCode: null, modelCode: null, colorCode: null };
    const match = raw.match(/^(.+)-([A-Za-z0-9]{1,16})$/);
    if (!match) return { fullCode: raw, modelCode: raw, colorCode: null };
    return {
      fullCode: raw,
      modelCode: text(match[1]),
      colorCode: text(match[2]),
    };
  }

  function applyProductCodeSplit(normalized) {
    if (!normalized || typeof normalized !== "object") return normalized;
    const split = splitBrandProductCode(normalized.supplierProductCode || normalized.productCode || normalized.modelCode);
    if (split.fullCode) normalized.supplierProductCode = normalized.supplierProductCode || split.fullCode;
    if (split.modelCode && (!normalized.modelCode || String(normalized.modelCode) === String(split.fullCode))) normalized.modelCode = split.modelCode;
    if (split.colorCode && !normalized.colorCode) normalized.colorCode = split.colorCode;
    if (split.colorCode && !normalized.supplierColorCode) normalized.supplierColorCode = split.colorCode;
    return normalized;
  }

  function actorFrom(req) {
    return text(req.session?.actor || req.session?.shopId || req.session?.role || "system") || "system";
  }

  function selectionOwnerKey(req) {
    const session = req.session || {};
    const user = req.user || {};
    const sessionUser = session.user && typeof session.user === "object" ? session.user : {};
    const candidates = [
      session.userId, session.user_id, session.adminId, session.admin_id,
      session.employeeId, session.employee_id, session.email, session.username,
      session.shopId, session.shop_id, session.actor,
      sessionUser.id, sessionUser.userId, sessionUser.user_id, sessionUser.email, sessionUser.username,
      user.id, user.userId, user.user_id, user.email, user.username,
      session.role,
    ];
    for (const candidate of candidates) {
      const value = text(candidate);
      if (value) return value.slice(0, 200);
    }
    return "system";
  }

  function cleanSelectedWorkAction(value) {
    const action = normCode(value);
    return ["label", "order", "move"].includes(action) ? action : null;
  }

  function selectedRowsFromBody(body) {
    const sourceItems = Array.isArray(body?.items)
      ? body.items
      : Array.isArray(body?.selectedVariantIds)
        ? body.selectedVariantIds
        : Array.isArray(body?.selected_variant_ids)
          ? body.selected_variant_ids
          : Array.isArray(body?.variantIds)
            ? body.variantIds
            : Array.isArray(body?.variant_ids)
              ? body.variant_ids
              : [];
    const actionMap = body?.actions && typeof body.actions === "object" && !Array.isArray(body.actions) ? body.actions : {};
    const selectedObject = body?.selectedVariants && typeof body.selectedVariants === "object" && !Array.isArray(body.selectedVariants)
      ? body.selectedVariants
      : body?.selected_variants && typeof body.selected_variants === "object" && !Array.isArray(body.selected_variants)
        ? body.selected_variants
        : null;
    const rows = [];

    if (sourceItems.length) {
      for (const item of sourceItems) {
        const id = text(typeof item === "object" && item !== null ? (item.variantId || item.variant_id || item.id) : item);
        if (!id) continue;
        const action = cleanSelectedWorkAction(typeof item === "object" && item !== null ? (item.action || item.selectedAction || item.selected_action || actionMap[id]) : actionMap[id]);
        rows.push({ variantId: id, action });
      }
    } else if (selectedObject) {
      for (const [idRaw, selected] of Object.entries(selectedObject)) {
        const id = text(idRaw);
        if (!id || !selected) continue;
        rows.push({ variantId: id, action: cleanSelectedWorkAction(actionMap[id]) });
      }
    }

    const seen = new Set();
    return rows.filter((row) => {
      if (!row.variantId || seen.has(row.variantId)) return false;
      seen.add(row.variantId);
      return true;
    }).slice(0, 1000);
  }

  async function ensureSelectedVariantsTable(client) {
    await client.query(`CREATE TABLE IF NOT EXISTS aif_user_selected_variants (
      owner_key text NOT NULL,
      variant_id text NOT NULL,
      action text NULL,
      sort_order integer NOT NULL DEFAULT 0,
      raw jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (owner_key, variant_id),
      CHECK (action IS NULL OR action IN ('label','order','move'))
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS aif_user_selected_variants_owner_sort_idx
      ON aif_user_selected_variants (owner_key, sort_order, updated_at)`);
  }

  async function loadSelectedVariantRows(client, ownerKey) {
    return client.query(
      `SELECT i.*,
              s.variant_id AS selected_variant_id,
              s.action,
              s.sort_order,
              s.created_at AS selected_at,
              s.updated_at AS selected_updated_at
       FROM aif_user_selected_variants s
       LEFT JOIN aif_inventory_summary i ON i.variant_id::text=s.variant_id
       WHERE s.owner_key=$1
       ORDER BY s.sort_order ASC, s.updated_at ASC`,
      [ownerKey]
    );
  }

  function selectedVariantResponseFromRows(rows) {
    const selectedVariantIds = [];
    const actions = {};
    const items = [];
    let updatedAt = null;
    for (const row of rows || []) {
      const id = text(row?.selected_variant_id || row?.variant_id);
      if (!id) continue;
      selectedVariantIds.push(id);
      const action = cleanSelectedWorkAction(row?.action);
      if (action) actions[id] = action;
      items.push({ ...row, variant_id: row?.variant_id || id });
      const ts = row?.selected_updated_at || row?.selected_at;
      if (ts && (!updatedAt || new Date(ts).getTime() > new Date(updatedAt).getTime())) updatedAt = ts;
    }
    return {
      ok: true,
      items,
      selectedVariantIds,
      actions,
      updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
      count: selectedVariantIds.length,
    };
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

  async function findColorTypeByIdOrCode(client, idOrCode) {
    const v = text(idOrCode);
    if (!v) return null;
    const r = await client.query(
      `SELECT id, code, name_ro, is_active
       FROM aif_color_types
       WHERE id::text=$1 OR code=$1 OR lower(name_ro)=lower($1) OR lower(COALESCE(name_hu,''))=lower($1)
       LIMIT 1`,
      [v]
    );
    return r.rows[0] || null;
  }

  async function getDefaultLocationId(client) {
    const r = await client.query(`SELECT id FROM aif_locations WHERE code='main_warehouse' LIMIT 1`);
    return r.rows[0]?.id || null;
  }

  function canonicalGender(v) {
    const code = normCode(v || "unisex") || "unisex";
    const map = {
      men: "men", man: "men", male: "men", masculin: "men", barbati: "men", barbat: "men", bărbat: "men", ferfi: "men", ffi: "men", herren: "men", homme: "men", uomo: "men",
      women: "women", woman: "women", female: "women", feminin: "women", femei: "women", femeie: "women", dama: "women", damă: "women", dame: "women", noi: "women", no: "women", ladies: "women", lady: "women", damen: "women", femme: "women",
      kids: "kids", kid: "kids", copii: "kids", copil: "kids", gyerek: "kids", junior: "kids", youth: "kids", child: "kids", children: "kids", copii_tineri: "kids",
      unisex: "unisex", universal: "unisex", mixt: "unisex", mixed: "unisex"
    };
    return map[code] || (['men', 'women', 'kids', 'unisex'].includes(code) ? code : 'unisex');
  }

  function normalizeRowInput(input, rowNo) {
    const src = input?.normalized && typeof input.normalized === "object" ? input.normalized : input || {};
    const raw = input?.raw && typeof input.raw === "object" ? input.raw : input || {};

    const rawProductCode = rawValueByHeaders(raw, ["CODPRODUS", "COD PRODUS", "COD_PRODUS", "Cod produs", "product code", "cod produs"]);
    const supplierProductCodeRaw = emptyToNull(
      src.supplierProductCode || src.supplier_product_code || src.productCode || src.product_code || src.code || input?.product_code || rawProductCode
    );
    const productSplit = splitBrandProductCode(supplierProductCodeRaw);
    const supplierProductCode = productSplit.fullCode || supplierProductCodeRaw;
    const supplierVariantCode = emptyToNull(
      src.supplierVariantCode || src.supplier_variant_code || src.variantCode || src.variant_code || input?.variant_code
    );
    const supplierColorCode = emptyToNull(src.supplierColorCode || src.supplier_color_code || src.colorCode || src.color_code || productSplit.colorCode);
    const supplierSize = emptyToNull(src.supplierSize || src.supplier_size || src.size);

    const brandRaw = emptyToNull(src.brandCode || src.brand_code || src.brandId || src.brand_id || src.brand);
    const categoryRaw = emptyToNull(src.categoryCode || src.category_code || src.categoryId || src.category_id || src.category);

    const normalized = {
      brandId: emptyToNull(src.brandId || src.brand_id),
      brandCode: brandRaw ? normCode(brandRaw) : null,
      brandName: emptyToNull(src.brandName || src.brand_name || src.brand),
      categoryId: emptyToNull(src.categoryId || src.category_id),
      categoryCode: categoryRaw ? normCode(categoryRaw) : null,
      categoryName: emptyToNull(src.categoryName || src.category_name || src.category),
      modelCode: emptyToNull(src.modelCode || src.model_code || productSplit.modelCode || supplierProductCode),
      titleRo: emptyToNull(src.titleRo || src.title_ro || src.nameRo || src.name_ro || src.productName || src.product_name || src.name || src.title),
      titleHu: emptyToNull(src.titleHu || src.title_hu),
      descriptionRo: emptyToNull(src.descriptionRo || src.description_ro || src.description),
      genderRaw: emptyToNull(src.gender || src.genderCode || src.gender_code || src.dept || src.department || src.departmentName || src.department_name),
      gender: canonicalGender(src.gender || src.genderCode || src.gender_code || src.dept || src.department || src.departmentName || src.department_name || "unisex"),
      productType: emptyToNull(src.productType || src.product_type),
      season: emptyToNull(src.season),
      material: emptyToNull(src.material || src.composition || src.compositionRo || src.composition_ro || src.materialComposition || src.material_composition || src.fabric || src.bodyFabric || src.body_fabric),
      colorCode: emptyToNull(src.colorCode || src.color_code || supplierColorCode || productSplit.colorCode),
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
    normalized.gender = canonicalGender(normalized.gender);

    return {
      rowNo: toInt(input?.rowNo ?? input?.row_no ?? rowNo) || rowNo,
      raw: input?.raw && typeof input.raw === "object" ? input.raw : input,
      normalized,
      status: errors.length ? "error" : "parsed",
      errors,
    };
  }

  async function ensureBrand(client, normalized, fallbackSupplierCode) {
    const candidates = [
      emptyToNull(normalized.brandId),
      emptyToNull(normalized.brandCode),
      emptyToNull(normalized.brandName),
    ].filter(Boolean);

    for (const candidate of candidates) {
      const r = await client.query(
        `SELECT id FROM aif_brands
         WHERE id::text=$1 OR code=$1 OR lower(name)=lower($1)
         LIMIT 1`,
        [candidate]
      );
      if (r.rowCount) return r.rows[0].id;
    }

    const rawCode = normCode(normalized.brandCode || normalized.brandName || fallbackSupplierCode);
    if (!rawCode) return null;
    const name = normalized.brandName || text(rawCode).replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

    const existing = await client.query(`SELECT id FROM aif_brands WHERE code=$1 LIMIT 1`, [rawCode]);
    if (existing.rowCount) return existing.rows[0].id;

    const r = await client.query(
      `INSERT INTO aif_brands (code, name)
       VALUES ($1, $2)
       RETURNING id`,
      [rawCode, name]
    );
    return r.rows[0].id;
  }

  async function findCategoryId(client, normalizedOrCode) {
    const raw = typeof normalizedOrCode === "object" && normalizedOrCode
      ? emptyToNull(normalizedOrCode.categoryId || normalizedOrCode.categoryCode || normalizedOrCode.categoryName)
      : emptyToNull(normalizedOrCode);
    if (!raw) return null;
    const code = normCode(raw);
    const r = await client.query(
      `SELECT id FROM aif_categories
       WHERE id::text=$1
          OR code=$1
          OR code=$2
          OR lower(name_ro)=lower($1)
          OR lower(COALESCE(name_hu,''))=lower($1)
          OR EXISTS (
            SELECT 1 FROM unnest(COALESCE(aliases, '{}'::text[])) a
            WHERE lower(a)=lower($1) OR lower(a)=lower($2)
          )
       ORDER BY is_active DESC, sort_order ASC
       LIMIT 1`,
      [raw, code]
    );
    return r.rows[0]?.id || null;
  }

  async function upsertModel(client, { supplierCode, normalized }) {
    const safeNormalized = { ...normalized, gender: normalized.gender ? normCode(normalized.gender) : "unisex" };
    const brandId = await ensureBrand(client, safeNormalized, supplierCode);
    const categoryId = await findCategoryId(client, safeNormalized);
    applyProductCodeSplit(safeNormalized);
    const baseModelCode = safeNormalized.modelCode || safeNormalized.supplierProductCode || safeNormalized.titleRo;
    const brandKey = normCode(safeNormalized.brandCode || safeNormalized.brandName || supplierCode || "aif");
    const modelCode = `${brandKey}:${normCode(baseModelCode)}`;

    const existing = await client.query(
      `SELECT id FROM aif_product_models WHERE model_code=$1 LIMIT 1`,
      [modelCode]
    );

    if (existing.rowCount) {
      const id = existing.rows[0].id;
      await client.query(
        `UPDATE aif_product_models SET
           brand_id = COALESCE($2, brand_id),
           category_id = COALESCE($3, category_id),
           title_ro = $4,
           title_hu = COALESCE($5, title_hu),
           description_ro = COALESCE($6, description_ro),
           gender = $7,
           product_type = COALESCE($8, product_type),
           season = COALESCE($9, season),
           material = COALESCE($10, material),
           shopify_title = COALESCE($11, shopify_title),
           updated_at = now()
         WHERE id=$1`,
        [
          id,
          brandId,
          categoryId,
          safeNormalized.titleRo,
          safeNormalized.titleHu,
          safeNormalized.descriptionRo,
          safeNormalized.gender,
          safeNormalized.productType,
          safeNormalized.season,
          safeNormalized.material,
          safeNormalized.titleRo,
        ]
      );
      return id;
    }

    const r = await client.query(
      `INSERT INTO aif_product_models (
         brand_id, category_id, model_code, title_ro, title_hu, description_ro,
         gender, product_type, season, material, shopify_title, status
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft')
       RETURNING id`,
      [
        brandId,
        categoryId,
        modelCode,
        safeNormalized.titleRo,
        safeNormalized.titleHu,
        safeNormalized.descriptionRo,
        safeNormalized.gender,
        safeNormalized.productType,
        safeNormalized.season,
        safeNormalized.material,
        safeNormalized.titleRo,
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


  async function categoryUsage(client, categoryId) {
    const r = await client.query(
      `SELECT
         (SELECT count(*)::int FROM aif_product_models WHERE category_id=$1) AS product_models,
         (SELECT count(*)::int FROM aif_categories WHERE parent_id=$1) AS child_categories`,
      [categoryId]
    );
    return r.rows[0] || { product_models: 0, child_categories: 0 };
  }

  async function genderTypeUsage(client, code) {
    const r = await client.query(
      `SELECT count(*)::int AS product_models
       FROM aif_product_models
       WHERE gender=$1`,
      [code]
    );
    return r.rows[0] || { product_models: 0 };
  }

  async function activeGenderTypeExists(client, code) {
    const r = await client.query(
      `SELECT 1 FROM aif_gender_types WHERE code=$1 AND is_active=true LIMIT 1`,
      [code]
    );
    return r.rowCount > 0;
  }

  function splitAliasesFromInput(value) {
    if (Array.isArray(value)) {
      return Array.from(new Set(value.map((x) => text(x)).filter(Boolean)));
    }
    return Array.from(new Set(text(value).split(/[\n,;]+/).map((x) => text(x)).filter(Boolean)));
  }

  function colorAliasesFromInput(value) {
    return splitAliasesFromInput(value);
  }

  function categoryAliasesFromInput(value) {
    return splitAliasesFromInput(value);
  }

  function genderAliasesFromInput(value) {
    return splitAliasesFromInput(value);
  }

  function materialAliasesFromInput(value) {
    return splitAliasesFromInput(value);
  }

  async function normalizeGenderCode(client, value) {
    const raw = emptyToNull(value);
    if (!raw) return "unisex";
    const rawKey = normCode(raw);
    try {
      const r = await client.query(
        `SELECT code, name, aliases
         FROM aif_gender_types
         WHERE is_active=true
         ORDER BY sort_order ASC, name ASC`
      );
      const found = r.rows.find((g) => {
        const aliases = Array.isArray(g.aliases) ? g.aliases : [];
        return [g.code, g.name, ...aliases].filter(Boolean).some((x) => normCode(x) === rawKey);
      });
      if (found?.code) return found.code;
    } catch (e) {
      if (e?.code !== "42P01" && e?.code !== "42703") console.error("AIF gender normalize warning", e);
    }
    return canonicalGender(raw);
  }

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  async function normalizeMaterialText(client, value) {
    const raw = emptyToNull(value);
    if (!raw) return null;
    try {
      const r = await client.query(
        `SELECT code, name_ro, name_hu, name_en, name_de, aliases
         FROM aif_material_types
         WHERE is_active=true
         ORDER BY sort_order ASC, length(name_ro) DESC`
      );
      let out = raw
        .replace(/\bBODY\s+FABRIC\b\s*:?/gi, "Material exterior:")
        .replace(/\bMAIN\s+FABRIC\b\s*:?/gi, "Material principal:")
        .replace(/\bADDITIONAL\s+FABRIC\b\s*:?/gi, "Material suplimentar:")
        .replace(/\bLINING\b\s*:?/gi, "Căptușeală:")
        .replace(/\bSHELL\b\s*:?/gi, "Exterior:");
      const replacements = [];
      for (const item of r.rows) {
        const aliases = Array.isArray(item.aliases) ? item.aliases : [];
        for (const v of [item.code, item.name_ro, item.name_hu, item.name_en, item.name_de, ...aliases]) {
          const candidate = text(v);
          if (!candidate || normCode(candidate) === normCode(item.name_ro)) continue;
          replacements.push({ from: candidate, to: item.name_ro });
        }
      }
      replacements.sort((a, b) => b.from.length - a.from.length);
      for (const rep of replacements) {
        const pattern = escapeRegex(rep.from).replace(/\\s+/g, "\\s+");
        out = out.replace(new RegExp(`\\b${pattern}\\b`, "gi"), rep.to);
      }
      return out;
    } catch (e) {
      if (e?.code !== "42P01" && e?.code !== "42703") console.error("AIF material normalize warning", e);
      return raw;
    }
  }

  async function findBrandIdForNormalized(client, normalized) {
    const candidates = [
      emptyToNull(normalized?.brandId),
      emptyToNull(normalized?.brandCode),
      emptyToNull(normalized?.brandName),
    ].filter(Boolean);
    for (const candidate of candidates) {
      const r = await client.query(
        `SELECT id FROM aif_brands
         WHERE id::text=$1 OR code=$1 OR lower(name)=lower($1)
         LIMIT 1`,
        [candidate]
      );
      if (r.rowCount) return r.rows[0].id;
    }
    return null;
  }

  async function applyBrandColorCodeMapping(client, normalized) {
    if (!normalized || typeof normalized !== "object") return false;
    const colorCode = emptyToNull(normalized.colorCode || normalized.supplierColorCode);
    if (!colorCode) return false;
    const brandId = await findBrandIdForNormalized(client, normalized);
    if (!brandId) return false;
    const r = await client.query(
      `SELECT bcc.id, c.code AS color_type_code, c.name_ro, c.name_hu, c.name_en, c.name_de, c.hex
       FROM aif_brand_color_codes bcc
       JOIN aif_color_types c ON c.id=bcc.color_type_id
       WHERE bcc.brand_id=$1
         AND bcc.is_active=true
         AND c.is_active=true
         AND lower(bcc.color_code)=lower($2)
       LIMIT 1`,
      [brandId, colorCode]
    );
    const found = r.rows[0];
    if (!found) return false;
    normalized.colorName = found.name_ro;
    normalized.colorCode = colorCode;
    normalized.supplierColorCode = normalized.supplierColorCode || colorCode;
    normalized.colorHex = found.hex || normalized.colorHex || null;
    normalized.brandColorCodeId = found.id;
    normalized.colorTypeCode = found.color_type_code;
    return true;
  }

  async function enrichNormalizedRow(client, nr) {
    if (nr?.normalized) {
      applyProductCodeSplit(nr.normalized);
      const brandColorMapped = await applyBrandColorCodeMapping(client, nr.normalized);
      if (!brandColorMapped && nr.normalized.colorName) nr.normalized.colorName = await normalizeColorName(client, nr.normalized.colorName);
      nr.normalized.gender = await normalizeGenderCode(client, nr.normalized.genderRaw || nr.normalized.gender);
      if (nr.normalized.material) nr.normalized.material = await normalizeMaterialText(client, nr.normalized.material);
    }
    return nr;
  }

  async function normalizeColorName(client, value) {
    const raw = emptyToNull(value);
    if (!raw) return null;
    const rawKey = normCode(raw);
    if (!rawKey) return raw;

    const r = await client.query(
      `SELECT id, code, name_ro, name_hu, name_en, name_de, aliases
       FROM aif_color_types
       WHERE is_active=true
       ORDER BY sort_order ASC, name_ro ASC`
    );

    const direct = r.rows.find((color) => {
      const aliases = Array.isArray(color.aliases) ? color.aliases : [];
      const values = [color.code, color.name_ro, color.name_hu, color.name_en, color.name_de, ...aliases];
      return values.some((x) => normCode(x) === rawKey);
    });
    if (direct) return direct.name_ro;

    const parts = rawKey.split(/_+/).filter(Boolean);
    if (parts.length > 1) {
      const translated = [];
      for (const part of parts) {
        const match = r.rows.find((color) => {
          const aliases = Array.isArray(color.aliases) ? color.aliases : [];
          const values = [color.code, color.name_ro, color.name_hu, color.name_en, color.name_de, ...aliases];
          return values.some((x) => normCode(x) === part);
        });
        if (!match) return raw;
        translated.push(match.name_ro);
      }
      return Array.from(new Set(translated)).join(" / ");
    }

    return raw;
  }

  async function colorUsage(client, colorIdOrCode) {
    const c = await client.query(
      `SELECT id, code, name_ro FROM aif_color_types WHERE id::text=$1 OR code=$1 LIMIT 1`,
      [text(colorIdOrCode)]
    );
    if (!c.rowCount) return { product_variants: 0 };
    const r = await client.query(
      `SELECT count(*)::int AS product_variants
       FROM aif_product_variants
       WHERE lower(COALESCE(color_name,''))=lower($1)`,
      [c.rows[0].name_ro]
    );
    return r.rows[0] || { product_variants: 0 };
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

  router.get("/supplier-brands", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const supplier = text(req.query.supplier || req.query.supplierId || req.query.supplier_id);
    const args = [];
    const where = [];
    if (!includeInactive) where.push(`sb.is_active=true AND s.is_active=true AND b.is_active=true`);
    if (supplier) {
      args.push(supplier);
      where.push(`(s.id::text=$${args.length} OR s.code=$${args.length})`);
    }
    const r = await pool.query(
      `SELECT sb.id, sb.supplier_id, sb.brand_id, sb.is_preferred, sb.is_active, sb.notes, sb.created_at, sb.updated_at,
              s.name AS supplier_name, b.name AS brand_name
       FROM aif_supplier_brands sb
       JOIN aif_suppliers s ON s.id=sb.supplier_id
       JOIN aif_brands b ON b.id=sb.brand_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY s.name ASC, sb.is_preferred DESC, b.name ASC`,
      args
    );
    res.json({ items: r.rows });
  });

  router.post("/supplier-brands", requireAdminOrSecret, async (req, res) => {
    const body = req.body || {};
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const supplier = await findByIdOrCode(client, "aif_suppliers", body.supplierId || body.supplier_id || body.supplier);
      const brand = await findByIdOrCode(client, "aif_brands", body.brandId || body.brand_id || body.brand);
      if (!supplier) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "supplier required" });
      }
      if (!brand) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "brand required" });
      }
      const preferred = Boolean(body.isPreferred ?? body.is_preferred);
      if (preferred) {
        await client.query(`UPDATE aif_supplier_brands SET is_preferred=false, updated_at=now() WHERE supplier_id=$1`, [supplier.id]);
      }
      const r = await client.query(
        `INSERT INTO aif_supplier_brands (supplier_id, brand_id, is_preferred, is_active, notes)
         VALUES ($1,$2,$3,true,$4)
         ON CONFLICT (supplier_id, brand_id) DO UPDATE SET
           is_active=true,
           is_preferred=EXCLUDED.is_preferred,
           notes=COALESCE(EXCLUDED.notes, aif_supplier_brands.notes),
           updated_at=now()
         RETURNING id, supplier_id, brand_id, is_preferred, is_active, notes, created_at, updated_at`,
        [supplier.id, brand.id, preferred, emptyToNull(body.notes)]
      );
      await client.query("COMMIT");
      res.json({ item: r.rows[0] });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF create supplier brand link failed", e);
      res.status(500).json({ error: "failed to save supplier brand link" });
    } finally {
      client.release();
    }
  });

  router.patch("/supplier-brands/:id", requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    const body = req.body || {};
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(`SELECT * FROM aif_supplier_brands WHERE id::text=$1 FOR UPDATE`, [id]);
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "supplier brand link not found" });
      }
      const sets = [];
      const args = [];
      let i = 1;
      if (body.is_preferred !== undefined || body.isPreferred !== undefined) {
        const preferred = Boolean(body.is_preferred ?? body.isPreferred);
        if (preferred) {
          await client.query(
            `UPDATE aif_supplier_brands SET is_preferred=false, updated_at=now() WHERE supplier_id=$1 AND id <> $2`,
            [current.rows[0].supplier_id, current.rows[0].id]
          );
        }
        sets.push(`is_preferred=$${i++}`);
        args.push(preferred);
      }
      if (body.is_active !== undefined || body.isActive !== undefined) {
        sets.push(`is_active=$${i++}`);
        args.push(Boolean(body.is_active ?? body.isActive));
      }
      if (body.notes !== undefined) {
        sets.push(`notes=$${i++}`);
        args.push(emptyToNull(body.notes));
      }
      if (!sets.length) {
        await client.query("COMMIT");
        return res.json({ ok: true });
      }
      args.push(id);
      const r = await client.query(
        `UPDATE aif_supplier_brands
         SET ${sets.join(", ")}, updated_at=now()
         WHERE id::text=$${i}
         RETURNING id, supplier_id, brand_id, is_preferred, is_active, notes, created_at, updated_at`,
        args
      );
      await client.query("COMMIT");
      res.json({ item: r.rows[0] });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF update supplier brand link failed", e);
      res.status(500).json({ error: "failed to update supplier brand link" });
    } finally {
      client.release();
    }
  });

  router.delete("/supplier-brands/:id", requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    try {
      const r = await pool.query(`DELETE FROM aif_supplier_brands WHERE id::text=$1`, [id]);
      if (!r.rowCount) return res.status(404).json({ error: "supplier brand link not found" });
      res.json({ ok: true, mode: "deleted" });
    } catch (e) {
      console.error("AIF delete supplier brand link failed", e);
      res.status(500).json({ error: "failed to delete supplier brand link" });
    }
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

  function csvCell(v) {
    const s = String(v ?? "");
    if (/["\n\r,;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function csvLine(values) {
    return values.map(csvCell).join(";");
  }

  router.get("/receptions", requireAuthed, async (req, res) => {
    const limit = Math.min(300, Math.max(1, Number(req.query.limit || 80)));
    const search = text(req.query.q || req.query.search);
    const supplier = text(req.query.supplier || req.query.supplier_id || req.query.supplierId);
    const location = text(req.query.location || req.query.location_id || req.query.locationId);
    const currency = currencyCode(req.query.currency || req.query.currency_code);
    const status = text(req.query.status);
    const from = emptyToNull(req.query.from);
    const to = emptyToNull(req.query.to);

    const args = [];
    const where = [];
    const addArg = (value) => {
      args.push(value);
      return `$${args.length}`;
    };

    if (search) {
      const p = addArg(`%${search}%`);
      where.push(`(
        r.invoice_number ILIKE ${p}
        OR r.note ILIKE ${p}
        OR s.name ILIKE ${p}
        OR l.name ILIKE ${p}
        OR r.currency_code ILIKE ${p}
      )`);
    }
    if (supplier) {
      const p = addArg(supplier);
      where.push(`(s.id::text=${p} OR s.code=${p})`);
    }
    if (location) {
      const p = addArg(location);
      where.push(`(l.id::text=${p} OR l.code=${p})`);
    }
    if (currency) {
      const p = addArg(currency);
      where.push(`r.currency_code=${p}`);
    }
    if (status) {
      const p = addArg(status);
      where.push(`r.status=${p}`);
    }
    if (from) {
      const p = addArg(from);
      where.push(`r.reception_date >= ${p}::date`);
    }
    if (to) {
      const p = addArg(to);
      where.push(`r.reception_date < (${p}::date + interval '1 day')`);
    }

    const limitParam = addArg(limit);
    const sql = `
      SELECT
        r.id, r.created_at, r.updated_at, r.status, r.invoice_number, r.invoice_date, r.reception_date,
        r.currency_code, r.exchange_rate_to_ron, r.tva_mode, r.tva_rate, r.goods_value,
        r.invoice_net, r.invoice_vat, r.invoice_gross, r.shipping_cost, r.total_qty, r.line_count,
        r.note, r.supplier_id, r.target_location_id,
        s.name AS supplier_name,
        l.name AS location_name,
        count(DISTINCT b.id)::int AS import_batches,
        count(rw.id) FILTER (WHERE rw.status <> 'ignored')::int AS import_rows,
        count(rw.id) FILTER (WHERE rw.status = 'committed')::int AS committed_rows,
        count(rw.id) FILTER (WHERE rw.status = 'error')::int AS error_rows,
        count(rw.id) FILTER (WHERE rw.status = 'ignored')::int AS ignored_rows,
        count(rw.id) FILTER (WHERE rw.status NOT IN ('ignored','committed'))::int AS remaining_rows,
        count(DISTINCT b.id) FILTER (WHERE b.status='committed')::int AS committed_batches,
        (count(sm.id) > 0) AS has_stock_movements,
        (
          r.status <> 'committed'
          AND count(DISTINCT b.id) FILTER (WHERE b.status='committed') = 0
          AND count(sm.id) = 0
        ) AS can_delete
      FROM aif_receptions r
      LEFT JOIN aif_suppliers s ON s.id=r.supplier_id
      LEFT JOIN aif_locations l ON l.id=r.target_location_id
      LEFT JOIN aif_import_batches b ON b.reception_id=r.id
      LEFT JOIN aif_import_rows rw ON rw.batch_id=b.id
      LEFT JOIN aif_stock_movements sm ON sm.source_type='import_batch' AND sm.source_id=b.id::text
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      GROUP BY r.id, s.name, l.name
      ORDER BY r.created_at DESC
      LIMIT ${limitParam}
    `;
    const r = await pool.query(sql, args);
    res.json({ items: r.rows });
  });


  async function handleReceptionHeaderUpdate(req, res) {
    const id = text(req.params.id);
    const body = req.body || {};
    const src = body.reception && typeof body.reception === "object" ? body.reception : body;
    const client = await pool.connect();
    let receptionId = null;
    try {
      await client.query("BEGIN");
      const rec = await client.query(`SELECT id FROM aif_receptions WHERE id::text=$1 FOR UPDATE`, [id]);
      if (!rec.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Receptió nem található." });
      }
      receptionId = rec.rows[0].id;
      const sets = [];
      const args = [];
      let i = 1;
      const add = (col, value) => { sets.push(`${col}=$${i++}`); args.push(value); };

      if (src.invoiceNumber !== undefined || src.invoice_number !== undefined) add("invoice_number", emptyToNull(src.invoiceNumber ?? src.invoice_number));
      if (src.invoiceDate !== undefined || src.invoice_date !== undefined) add("invoice_date", emptyToNull(src.invoiceDate ?? src.invoice_date));
      if (src.receptionDate !== undefined || src.reception_date !== undefined) add("reception_date", emptyToNull(src.receptionDate ?? src.reception_date));
      if (src.currencyCode !== undefined || src.currency_code !== undefined) {
        const c = currencyCode(src.currencyCode ?? src.currency_code);
        const exists = await client.query(`SELECT 1 FROM aif_currencies WHERE code=$1 AND is_active=true LIMIT 1`, [c]);
        if (!exists.rowCount) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "A kiválasztott pénznem nem létezik vagy inaktív." });
        }
        add("currency_code", c);
      }
      if (src.exchangeRateToRon !== undefined || src.exchange_rate_to_ron !== undefined) {
        const rate = toMoney(src.exchangeRateToRon ?? src.exchange_rate_to_ron);
        if (!rate || rate <= 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Pozitív RON árfolyam szükséges." });
        }
        add("exchange_rate_to_ron", rate);
      }
      if (src.tvaMode !== undefined || src.tva_mode !== undefined) {
        const mode = tvaMode(src.tvaMode ?? src.tva_mode);
        if (!mode) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Érvénytelen TVA kezelés." });
        }
        add("tva_mode", mode);
        if (mode === "no_tva") add("tva_rate", 0);
      }
      if (src.tvaRate !== undefined || src.tva_rate !== undefined) add("tva_rate", toMoney(src.tvaRate ?? src.tva_rate) ?? 0);
      if (src.shippingCost !== undefined || src.shipping_cost !== undefined) add("shipping_cost", toMoney(src.shippingCost ?? src.shipping_cost) ?? 0);
      if (src.goodsValue !== undefined || src.goods_value !== undefined) add("goods_value", toMoney(src.goodsValue ?? src.goods_value));
      if (src.invoiceNet !== undefined || src.invoice_net !== undefined) add("invoice_net", toMoney(src.invoiceNet ?? src.invoice_net));
      if (src.invoiceVat !== undefined || src.invoice_vat !== undefined) add("invoice_vat", toMoney(src.invoiceVat ?? src.invoice_vat));
      if (src.invoiceGross !== undefined || src.invoice_gross !== undefined) add("invoice_gross", toMoney(src.invoiceGross ?? src.invoice_gross));
      if (src.note !== undefined) add("note", emptyToNull(src.note));

      if (sets.length) {
        args.push(receptionId);
        await client.query(`UPDATE aif_receptions SET ${sets.join(", ")}, updated_at=now() WHERE id=$${i}`, args);
      }
      await client.query("COMMIT");

      let recalcWarning = null;
      try {
        const fresh = await pool.query(`SELECT currency_code, exchange_rate_to_ron FROM aif_receptions WHERE id=$1`, [receptionId]);
        const rate = Number(fresh.rows[0]?.exchange_rate_to_ron || 1);
        const currency = fresh.rows[0]?.currency_code || null;
        await pool.query(
          `UPDATE aif_import_rows rw
           SET buy_price_ron = CASE WHEN rw.buy_price IS NULL THEN NULL ELSE round(rw.buy_price * $2::numeric, 2) END,
               sell_price_ron = CASE WHEN rw.sell_price IS NULL THEN NULL ELSE round(rw.sell_price * $2::numeric, 2) END,
               normalized = COALESCE(rw.normalized,'{}'::jsonb) || jsonb_build_object('currencyCode',$3,'exchangeRateToRon',$2),
               updated_at=now()
           FROM aif_import_batches b
           WHERE rw.batch_id=b.id AND b.reception_id=$1 AND rw.status <> 'committed'`,
          [receptionId, rate, currency]
        );
      } catch (recalcError) {
        recalcWarning = recalcError?.message || "A nem készletre vett sorok RON újraszámolása nem sikerült.";
        console.error("AIF reception row recalculation warning", recalcError);
      }

      const updated = await pool.query(
        `SELECT r.id, r.created_at, r.updated_at, r.status, r.invoice_number, r.invoice_date, r.reception_date,
                r.currency_code, r.exchange_rate_to_ron, r.tva_mode, r.tva_rate, r.goods_value,
                r.invoice_net, r.invoice_vat, r.invoice_gross, r.shipping_cost, r.total_qty, r.line_count,
                r.note, r.supplier_id, r.target_location_id,
                s.name AS supplier_name, l.name AS location_name
         FROM aif_receptions r
         LEFT JOIN aif_suppliers s ON s.id=r.supplier_id
         LEFT JOIN aif_locations l ON l.id=r.target_location_id
         WHERE r.id=$1
         LIMIT 1`,
        [receptionId]
      );
      res.json({ ok: true, item: updated.rows[0] || null, warning: recalcWarning });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF update reception failed", e);
      res.status(500).json({ error: e?.message || "A receptió mentése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  }



  router.patch("/receptions/:id", requireAuthed, handleReceptionHeaderUpdate);
  router.post("/receptions/:id/update", requireAuthed, handleReceptionHeaderUpdate);

  router.get("/receptions/:id/export.csv", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    if (!id) return res.status(400).json({ error: "reception id required" });
    try {
      const rec = await pool.query(
        `SELECT r.*, s.name AS supplier_name, l.name AS location_name
         FROM aif_receptions r
         LEFT JOIN aif_suppliers s ON s.id=r.supplier_id
         LEFT JOIN aif_locations l ON l.id=r.target_location_id
         WHERE r.id::text=$1
         LIMIT 1`,
        [id]
      );
      if (!rec.rowCount) return res.status(404).json({ error: "reception not found" });

      const rows = await pool.query(
        `SELECT
           b.id AS batch_id, b.status AS batch_status, b.source_file_name,
           rw.row_no, rw.status AS row_status, rw.qty, rw.buy_price, rw.buy_price_ron,
           rw.sell_price, rw.sell_price_ron, rw.supplier_product_code, rw.supplier_variant_code,
           rw.supplier_color_code, rw.supplier_size, rw.normalized
         FROM aif_import_batches b
         LEFT JOIN aif_import_rows rw ON rw.batch_id=b.id
         WHERE b.reception_id=$1
         ORDER BY b.created_at ASC, rw.row_no ASC NULLS LAST`,
        [rec.rows[0].id]
      );

      const head = rec.rows[0];
      const lines = [];
      lines.push(csvLine(["Receptio", head.invoice_number || ""]));
      lines.push(csvLine(["Beszallito", head.supplier_name || ""]));
      lines.push(csvLine(["Cel hely", head.location_name || ""]));
      lines.push(csvLine(["Szamla datum", head.invoice_date ? String(head.invoice_date).slice(0, 10) : ""]));
      lines.push(csvLine(["Receptio datum", head.reception_date ? String(head.reception_date).slice(0, 10) : ""]));
      lines.push(csvLine(["Penznem", head.currency_code || ""]));
      lines.push(csvLine(["Arfolyam RON", head.exchange_rate_to_ron || ""]));
      lines.push(csvLine(["Szamla vegosszeg", head.invoice_gross || ""]));
      lines.push("");
      lines.push(csvLine([
        "Sor", "Allapot", "Termekkod", "Variant kod", "Nev", "Marka", "Kategoria", "Nem",
        "Szin", "Szinkod", "Meret", "Darab", "Vetelar", "Vetelar RON", "Eladasi ar", "Eladasi ar RON", "Forras fajl"
      ]));
      for (const x of rows.rows) {
        const n = x.normalized || {};
        lines.push(csvLine([
          x.row_no || "",
          x.row_status || x.batch_status || "",
          x.supplier_product_code || n.supplierProductCode || n.modelCode || "",
          x.supplier_variant_code || n.supplierVariantCode || "",
          n.titleRo || n.productName || "",
          n.brandName || n.brandCode || "",
          n.categoryCode || "",
          n.gender || "",
          n.colorName || "",
          x.supplier_color_code || n.colorCode || "",
          x.supplier_size || n.size || "",
          x.qty || n.qty || "",
          x.buy_price || "",
          x.buy_price_ron || "",
          x.sell_price || "",
          x.sell_price_ron || "",
          x.source_file_name || "",
        ]));
      }
      const csv = "\ufeff" + lines.join("\n");
      const safeName = String(head.invoice_number || "receptio").replace(/[^a-zA-Z0-9._-]+/g, "_");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="receptio_${safeName}.csv"`);
      res.send(csv);
    } catch (e) {
      console.error("AIF reception CSV export failed", e);
      res.status(500).json({ error: "failed to export reception" });
    }
  });

  router.get("/receptions/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    if (!id) return res.status(400).json({ error: "reception id required" });
    try {
      const item = await pool.query(
        `SELECT r.id, r.created_at, r.updated_at, r.status, r.invoice_number, r.invoice_date, r.reception_date,
                r.currency_code, r.exchange_rate_to_ron, r.tva_mode, r.tva_rate, r.goods_value,
                r.invoice_net, r.invoice_vat, r.invoice_gross, r.shipping_cost, r.total_qty, r.line_count,
                r.note, r.supplier_id, r.target_location_id,
                s.name AS supplier_name, l.name AS location_name,
                count(DISTINCT b.id)::int AS import_batches,
                count(rw.id) FILTER (WHERE rw.status <> 'ignored')::int AS import_rows,
                count(rw.id) FILTER (WHERE rw.status = 'committed')::int AS committed_rows,
                count(rw.id) FILTER (WHERE rw.status = 'error')::int AS error_rows,
                count(rw.id) FILTER (WHERE rw.status = 'ignored')::int AS ignored_rows,
                count(rw.id) FILTER (WHERE rw.status NOT IN ('ignored','committed'))::int AS remaining_rows,
                count(DISTINCT b.id) FILTER (WHERE b.status='committed')::int AS committed_batches,
                (count(sm.id) > 0) AS has_stock_movements,
                (r.status <> 'committed' AND count(DISTINCT b.id) FILTER (WHERE b.status='committed') = 0 AND count(sm.id)=0) AS can_delete
         FROM aif_receptions r
         LEFT JOIN aif_suppliers s ON s.id=r.supplier_id
         LEFT JOIN aif_locations l ON l.id=r.target_location_id
         LEFT JOIN aif_import_batches b ON b.reception_id=r.id
         LEFT JOIN aif_import_rows rw ON rw.batch_id=b.id
         LEFT JOIN aif_stock_movements sm ON sm.source_type='import_batch' AND sm.source_id=b.id::text
         WHERE r.id::text=$1
         GROUP BY r.id, s.name, l.name
         LIMIT 1`,
        [id]
      );
      if (!item.rowCount) return res.status(404).json({ error: "reception not found" });

      const batches = await pool.query(
        `SELECT b.id, b.created_at, b.updated_at, b.status, b.row_count, b.error_count,
                b.source_file_name, b.note, b.committed_at, b.reception_id, b.invoice_number,
                b.currency_code, b.exchange_rate_to_ron, s.code AS supplier_code, s.name AS supplier_name,
                l.code AS location_code, l.name AS location_name, p.name AS profile_name, p.version AS profile_version
         FROM aif_import_batches b
         JOIN aif_suppliers s ON s.id=b.supplier_id
         LEFT JOIN aif_locations l ON l.id=b.target_location_id
         LEFT JOIN aif_supplier_import_profiles p ON p.id=b.profile_id
         WHERE b.reception_id=$1
         ORDER BY b.created_at ASC`,
        [item.rows[0].id]
      );
      const rows = await pool.query(
        `SELECT rw.id, rw.batch_id, rw.row_no, rw.raw, rw.normalized, rw.status, rw.error_messages,
                rw.variant_id, rw.supplier_product_code, rw.supplier_variant_code, rw.supplier_color_code,
                rw.supplier_size, rw.qty, rw.buy_price, rw.buy_price_ron, rw.sell_price, rw.sell_price_ron
         FROM aif_import_batches b
         JOIN aif_import_rows rw ON rw.batch_id=b.id
         WHERE b.reception_id=$1
         ORDER BY b.created_at ASC, rw.row_no ASC`,
        [item.rows[0].id]
      );
      res.json({ item: item.rows[0], batches: batches.rows, rows: rows.rows });
    } catch (e) {
      console.error("AIF reception detail failed", e);
      res.status(500).json({ error: "failed to load reception" });
    }
  });

  router.delete("/receptions/:id", requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const rec = await client.query(`SELECT id, status FROM aif_receptions WHERE id::text=$1 FOR UPDATE`, [id]);
      if (!rec.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "reception not found" });
      }
      const batches = await client.query(`SELECT id, status FROM aif_import_batches WHERE reception_id=$1 FOR UPDATE`, [rec.rows[0].id]);
      const batchIds = batches.rows.map((x) => x.id);
      const committed = batches.rows.some((x) => x.status === "committed") || rec.rows[0].status === "committed";
      let movementCount = 0;
      if (batchIds.length) {
        const movements = await client.query(
          `SELECT count(*)::int AS c FROM aif_stock_movements WHERE source_type='import_batch' AND source_id = ANY($1::text[])`,
          [batchIds.map(String)]
        );
        movementCount = Number(movements.rows[0]?.c || 0);
      }
      if (committed || movementCount > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "A receptió már készletmozgáshoz kapcsolódik, nem törölhető közvetlenül." });
      }
      if (batchIds.length) {
        await client.query(`DELETE FROM aif_import_rows WHERE batch_id = ANY($1::uuid[])`, [batchIds]);
        await client.query(`DELETE FROM aif_import_batches WHERE id = ANY($1::uuid[])`, [batchIds]);
      }
      await client.query(`DELETE FROM aif_receptions WHERE id=$1`, [rec.rows[0].id]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "deleted" });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete reception failed", e);
      res.status(500).json({ error: "failed to delete reception" });
    } finally {
      client.release();
    }
  });

  router.get("/color-types", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const r = await pool.query(
      `SELECT id, code, name_ro, name_hu, name_en, name_de, aliases, hex, sort_order, is_active, created_at, updated_at
       FROM aif_color_types
       ${includeInactive ? "" : "WHERE is_active=true"}
       ORDER BY is_active DESC, sort_order ASC, name_ro ASC`
    );
    res.json({ items: r.rows });
  });

  router.post("/color-types/normalize", requireAuthed, async (req, res) => {
    const input = text(req.body?.color || req.body?.name || req.body?.value);
    if (!input) return res.status(400).json({ error: "color required" });
    try {
      const color = await normalizeColorName(pool, input);
      const item = await pool.query(
        `SELECT id, code, name_ro, name_hu, name_en, name_de, aliases, hex, sort_order, is_active
         FROM aif_color_types
         WHERE is_active=true AND lower(name_ro)=lower($1)
         LIMIT 1`,
        [color]
      );
      res.json({ input, color, item: item.rows[0] || null });
    } catch (e) {
      console.error("AIF normalize color failed", e);
      res.status(500).json({ error: "failed to normalize color" });
    }
  });

  router.post("/color-types", requireAuthed, async (req, res) => {
    const body = req.body || {};
    const nameRo = text(body.nameRo || body.name_ro || body.name || body.nameRoOfficial);
    const code = normCode(body.code || nameRo);
    const aliases = colorAliasesFromInput(body.aliases || body.alias_list || body.aliasList);
    const sortOrder = toInt(body.sortOrder ?? body.sort_order) || 100;
    if (!nameRo) return res.status(400).json({ error: "color Romanian name required" });
    if (!code) return res.status(400).json({ error: "color code required" });
    try {
      const r = await pool.query(
        `INSERT INTO aif_color_types (code, name_ro, name_hu, name_en, name_de, aliases, hex, sort_order, is_active)
         VALUES ($1,$2,$3,$4,$5,$6::text[],$7,$8,true)
         ON CONFLICT (code) DO UPDATE SET
           name_ro=EXCLUDED.name_ro,
           name_hu=EXCLUDED.name_hu,
           name_en=EXCLUDED.name_en,
           name_de=EXCLUDED.name_de,
           aliases=EXCLUDED.aliases,
           hex=EXCLUDED.hex,
           sort_order=EXCLUDED.sort_order,
           is_active=true,
           updated_at=now()
         RETURNING id, code, name_ro, name_hu, name_en, name_de, aliases, hex, sort_order, is_active, created_at, updated_at`,
        [code, nameRo, emptyToNull(body.nameHu || body.name_hu), emptyToNull(body.nameEn || body.name_en), emptyToNull(body.nameDe || body.name_de), aliases, emptyToNull(body.hex), sortOrder]
      );
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF create color type failed", e);
      res.status(500).json({ error: "failed to save color" });
    }
  });

  router.patch("/color-types/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const body = req.body || {};
    const sets = [];
    const args = [];
    let i = 1;
    if (body.nameRo !== undefined || body.name_ro !== undefined || body.name !== undefined) {
      const nameRo = text(body.nameRo ?? body.name_ro ?? body.name);
      if (!nameRo) return res.status(400).json({ error: "color Romanian name required" });
      sets.push(`name_ro=$${i++}`);
      args.push(nameRo);
    }
    if (body.code !== undefined) {
      const code = normCode(body.code);
      if (!code) return res.status(400).json({ error: "color code required" });
      sets.push(`code=$${i++}`);
      args.push(code);
    }
    if (body.nameHu !== undefined || body.name_hu !== undefined) { sets.push(`name_hu=$${i++}`); args.push(emptyToNull(body.nameHu ?? body.name_hu)); }
    if (body.nameEn !== undefined || body.name_en !== undefined) { sets.push(`name_en=$${i++}`); args.push(emptyToNull(body.nameEn ?? body.name_en)); }
    if (body.nameDe !== undefined || body.name_de !== undefined) { sets.push(`name_de=$${i++}`); args.push(emptyToNull(body.nameDe ?? body.name_de)); }
    if (body.aliases !== undefined || body.aliasList !== undefined || body.alias_list !== undefined) { sets.push(`aliases=$${i++}::text[]`); args.push(colorAliasesFromInput(body.aliases ?? body.aliasList ?? body.alias_list)); }
    if (body.hex !== undefined) { sets.push(`hex=$${i++}`); args.push(emptyToNull(body.hex)); }
    if (body.sortOrder !== undefined || body.sort_order !== undefined) { sets.push(`sort_order=$${i++}`); args.push(toInt(body.sortOrder ?? body.sort_order) || 100); }
    if (body.is_active !== undefined || body.isActive !== undefined) { sets.push(`is_active=$${i++}`); args.push(Boolean(body.is_active ?? body.isActive)); }
    if (!sets.length) return res.json({ ok: true });
    args.push(id);
    try {
      const r = await pool.query(
        `UPDATE aif_color_types
         SET ${sets.join(", ")}, updated_at=now()
         WHERE id::text=$${i} OR code=$${i}
         RETURNING id, code, name_ro, name_hu, name_en, name_de, aliases, hex, sort_order, is_active, created_at, updated_at`,
        args
      );
      if (!r.rowCount) return res.status(404).json({ error: "color not found" });
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF update color type failed", e);
      res.status(500).json({ error: "failed to update color" });
    }
  });

  router.delete("/color-types/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const color = await client.query(`SELECT id, code, name_ro FROM aif_color_types WHERE id::text=$1 OR code=$1 FOR UPDATE`, [id]);
      if (!color.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "color not found" });
      }
      const usage = await colorUsage(client, color.rows[0].id);
      if (Number(usage.product_variants || 0) > 0) {
        await client.query(`UPDATE aif_color_types SET is_active=false, updated_at=now() WHERE id=$1`, [color.rows[0].id]);
        await client.query("COMMIT");
        return res.json({ ok: true, mode: "deactivated", usage });
      }
      await client.query(`DELETE FROM aif_color_types WHERE id=$1`, [color.rows[0].id]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "deleted", usage });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete color type failed", e);
      res.status(500).json({ error: "failed to delete color" });
    } finally {
      client.release();
    }
  });


  function brandColorCodeSelect() {
    return `SELECT bcc.id, bcc.brand_id, b.code AS brand_code, b.name AS brand_name,
                   bcc.color_code, bcc.color_type_id,
                   c.code AS color_type_code, c.name_ro AS color_name_ro, c.name_hu AS color_name_hu,
                   c.name_en AS color_name_en, c.name_de AS color_name_de, c.hex AS color_hex,
                   bcc.notes, bcc.is_active, bcc.created_at, bcc.updated_at
            FROM aif_brand_color_codes bcc
            JOIN aif_brands b ON b.id=bcc.brand_id
            JOIN aif_color_types c ON c.id=bcc.color_type_id`;
  }

  async function getBrandColorCodeItem(client, id) {
    const r = await client.query(
      `${brandColorCodeSelect()}
       WHERE bcc.id::text=$1
       LIMIT 1`,
      [id]
    );
    return r.rows[0] || null;
  }

  router.get("/brand-color-codes", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const brand = text(req.query.brand || req.query.brandId || req.query.brand_id || req.query.brandCode || req.query.brand_code);
    const args = [];
    const where = [];
    if (!includeInactive) where.push(`bcc.is_active=true AND b.is_active=true AND c.is_active=true`);
    if (brand) {
      args.push(brand);
      where.push(`(b.id::text=$${args.length} OR b.code=$${args.length} OR lower(b.name)=lower($${args.length}))`);
    }
    try {
      const r = await pool.query(
        `${brandColorCodeSelect()}
         ${where.length ? "WHERE " + where.join(" AND ") : ""}
         ORDER BY b.name ASC, bcc.color_code ASC`,
        args
      );
      res.json({ items: r.rows });
    } catch (e) {
      console.error("AIF list brand color codes failed", e);
      res.status(500).json({ error: "failed to load brand color codes" });
    }
  });

  router.post("/brand-color-codes", requireAuthed, async (req, res) => {
    const body = req.body || {};
    const colorCode = text(body.colorCode || body.color_code).toUpperCase();
    if (!colorCode) return res.status(400).json({ error: "brand color code required" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const brand = await findByIdOrCode(client, "aif_brands", body.brandId || body.brand_id || body.brandCode || body.brand_code || body.brand);
      const color = await findColorTypeByIdOrCode(client, body.colorTypeId || body.color_type_id || body.colorTypeCode || body.color_type_code || body.color);
      if (!brand || brand.is_active === false) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "brand required or inactive" });
      }
      if (!color || color.is_active === false) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "color type required or inactive" });
      }
      const r = await client.query(
        `INSERT INTO aif_brand_color_codes (brand_id, color_code, color_type_id, notes, is_active)
         VALUES ($1,$2,$3,$4,true)
         ON CONFLICT (brand_id, color_code) DO UPDATE SET
           color_type_id=EXCLUDED.color_type_id,
           notes=EXCLUDED.notes,
           is_active=true,
           updated_at=now()
         RETURNING id`,
        [brand.id, colorCode, color.id, emptyToNull(body.notes)]
      );
      const item = await getBrandColorCodeItem(client, r.rows[0].id);
      await client.query("COMMIT");
      res.json({ item });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF save brand color code failed", e);
      res.status(500).json({ error: "failed to save brand color code" });
    } finally {
      client.release();
    }
  });

  router.patch("/brand-color-codes/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const body = req.body || {};
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(`SELECT id FROM aif_brand_color_codes WHERE id::text=$1 FOR UPDATE`, [id]);
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "brand color code not found" });
      }
      const sets = [];
      const args = [];
      let i = 1;
      if (body.brandId !== undefined || body.brand_id !== undefined || body.brandCode !== undefined || body.brand_code !== undefined || body.brand !== undefined) {
        const brand = await findByIdOrCode(client, "aif_brands", body.brandId || body.brand_id || body.brandCode || body.brand_code || body.brand);
        if (!brand || brand.is_active === false) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "brand required or inactive" });
        }
        sets.push(`brand_id=$${i++}`);
        args.push(brand.id);
      }
      if (body.colorCode !== undefined || body.color_code !== undefined) {
        const colorCode = text(body.colorCode ?? body.color_code).toUpperCase();
        if (!colorCode) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "brand color code required" });
        }
        sets.push(`color_code=$${i++}`);
        args.push(colorCode);
      }
      if (body.colorTypeId !== undefined || body.color_type_id !== undefined || body.colorTypeCode !== undefined || body.color_type_code !== undefined || body.color !== undefined) {
        const color = await findColorTypeByIdOrCode(client, body.colorTypeId || body.color_type_id || body.colorTypeCode || body.color_type_code || body.color);
        if (!color || color.is_active === false) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "color type required or inactive" });
        }
        sets.push(`color_type_id=$${i++}`);
        args.push(color.id);
      }
      if (body.notes !== undefined) {
        sets.push(`notes=$${i++}`);
        args.push(emptyToNull(body.notes));
      }
      if (body.is_active !== undefined || body.isActive !== undefined) {
        sets.push(`is_active=$${i++}`);
        args.push(Boolean(body.is_active ?? body.isActive));
      }
      if (sets.length) {
        args.push(current.rows[0].id);
        await client.query(
          `UPDATE aif_brand_color_codes SET ${sets.join(", ")}, updated_at=now() WHERE id=$${i}`,
          args
        );
      }
      const item = await getBrandColorCodeItem(client, current.rows[0].id);
      await client.query("COMMIT");
      res.json({ item });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF update brand color code failed", e);
      if (e?.code === "23505") return res.status(400).json({ error: "A márkához ez a színkód már létezik." });
      res.status(500).json({ error: "failed to update brand color code" });
    } finally {
      client.release();
    }
  });

  router.delete("/brand-color-codes/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    try {
      const r = await pool.query(
        `UPDATE aif_brand_color_codes SET is_active=false, updated_at=now() WHERE id::text=$1 RETURNING id`,
        [id]
      );
      if (!r.rowCount) return res.status(404).json({ error: "brand color code not found" });
      res.json({ ok: true, mode: "deactivated" });
    } catch (e) {
      console.error("AIF delete brand color code failed", e);
      res.status(500).json({ error: "failed to delete brand color code" });
    }
  });


  async function materialUsage(client, materialIdOrCode) {
    const m = await client.query(
      `SELECT id, code, name_ro FROM aif_material_types WHERE id::text=$1 OR code=$1 LIMIT 1`,
      [text(materialIdOrCode)]
    );
    if (!m.rowCount) return { product_models: 0 };
    const r = await client.query(
      `SELECT count(*)::int AS product_models
       FROM aif_product_models
       WHERE material ILIKE $1`,
      [`%${m.rows[0].name_ro}%`]
    );
    return r.rows[0] || { product_models: 0 };
  }

  router.get("/material-types", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const r = await pool.query(
      `SELECT id, code, name_ro, name_hu, name_en, name_de, aliases, sort_order, is_active, created_at, updated_at
       FROM aif_material_types
       ${includeInactive ? "" : "WHERE is_active=true"}
       ORDER BY is_active DESC, sort_order ASC, name_ro ASC`
    );
    res.json({ items: r.rows });
  });

  router.post("/material-types/normalize", requireAuthed, async (req, res) => {
    const input = text(req.body?.material || req.body?.name || req.body?.value);
    if (!input) return res.status(400).json({ error: "material required" });
    try {
      const material = await normalizeMaterialText(pool, input);
      res.json({ input, material });
    } catch (e) {
      console.error("AIF normalize material failed", e);
      res.status(500).json({ error: "failed to normalize material" });
    }
  });

  router.post("/material-types", requireAuthed, async (req, res) => {
    const body = req.body || {};
    const nameRo = text(body.nameRo || body.name_ro || body.name || body.nameRoOfficial);
    const code = normCode(body.code || nameRo);
    const aliases = materialAliasesFromInput(body.aliases || body.alias_list || body.aliasList);
    const sortOrder = toInt(body.sortOrder ?? body.sort_order) || 100;
    if (!nameRo) return res.status(400).json({ error: "material Romanian name required" });
    if (!code) return res.status(400).json({ error: "material code required" });
    try {
      const r = await pool.query(
        `INSERT INTO aif_material_types (code, name_ro, name_hu, name_en, name_de, aliases, sort_order, is_active)
         VALUES ($1,$2,$3,$4,$5,$6::text[],$7,true)
         ON CONFLICT (code) DO UPDATE SET
           name_ro=EXCLUDED.name_ro,
           name_hu=EXCLUDED.name_hu,
           name_en=EXCLUDED.name_en,
           name_de=EXCLUDED.name_de,
           aliases=EXCLUDED.aliases,
           sort_order=EXCLUDED.sort_order,
           is_active=true,
           updated_at=now()
         RETURNING id, code, name_ro, name_hu, name_en, name_de, aliases, sort_order, is_active, created_at, updated_at`,
        [code, nameRo, emptyToNull(body.nameHu || body.name_hu), emptyToNull(body.nameEn || body.name_en), emptyToNull(body.nameDe || body.name_de), aliases, sortOrder]
      );
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF create material type failed", e);
      res.status(500).json({ error: "failed to save material" });
    }
  });

  router.patch("/material-types/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const body = req.body || {};
    const sets = [];
    const args = [];
    let i = 1;
    if (body.nameRo !== undefined || body.name_ro !== undefined || body.name !== undefined) {
      const nameRo = text(body.nameRo ?? body.name_ro ?? body.name);
      if (!nameRo) return res.status(400).json({ error: "material Romanian name required" });
      sets.push(`name_ro=$${i++}`);
      args.push(nameRo);
    }
    if (body.code !== undefined) {
      const code = normCode(body.code);
      if (!code) return res.status(400).json({ error: "material code required" });
      sets.push(`code=$${i++}`);
      args.push(code);
    }
    if (body.nameHu !== undefined || body.name_hu !== undefined) { sets.push(`name_hu=$${i++}`); args.push(emptyToNull(body.nameHu ?? body.name_hu)); }
    if (body.nameEn !== undefined || body.name_en !== undefined) { sets.push(`name_en=$${i++}`); args.push(emptyToNull(body.nameEn ?? body.name_en)); }
    if (body.nameDe !== undefined || body.name_de !== undefined) { sets.push(`name_de=$${i++}`); args.push(emptyToNull(body.nameDe ?? body.name_de)); }
    if (body.aliases !== undefined || body.aliasList !== undefined || body.alias_list !== undefined) { sets.push(`aliases=$${i++}::text[]`); args.push(materialAliasesFromInput(body.aliases ?? body.aliasList ?? body.alias_list)); }
    if (body.sortOrder !== undefined || body.sort_order !== undefined) { sets.push(`sort_order=$${i++}`); args.push(toInt(body.sortOrder ?? body.sort_order) || 100); }
    if (body.is_active !== undefined || body.isActive !== undefined) { sets.push(`is_active=$${i++}`); args.push(Boolean(body.is_active ?? body.isActive)); }
    if (!sets.length) return res.json({ ok: true });
    args.push(id);
    try {
      const r = await pool.query(
        `UPDATE aif_material_types
         SET ${sets.join(", ")}, updated_at=now()
         WHERE id::text=$${i} OR code=$${i}
         RETURNING id, code, name_ro, name_hu, name_en, name_de, aliases, sort_order, is_active, created_at, updated_at`,
        args
      );
      if (!r.rowCount) return res.status(404).json({ error: "material not found" });
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF update material type failed", e);
      res.status(500).json({ error: "failed to update material" });
    }
  });

  router.delete("/material-types/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const material = await client.query(`SELECT id, code, name_ro FROM aif_material_types WHERE id::text=$1 OR code=$1 FOR UPDATE`, [id]);
      if (!material.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "material not found" });
      }
      const usage = await materialUsage(client, material.rows[0].id);
      if (Number(usage.product_models || 0) > 0) {
        await client.query(`UPDATE aif_material_types SET is_active=false, updated_at=now() WHERE id=$1`, [material.rows[0].id]);
        await client.query("COMMIT");
        return res.json({ ok: true, mode: "deactivated", usage });
      }
      await client.query(`DELETE FROM aif_material_types WHERE id=$1`, [material.rows[0].id]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "deleted", usage });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete material type failed", e);
      res.status(500).json({ error: "failed to delete material" });
    } finally {
      client.release();
    }
  });


  router.get("/brands", requireAuthed, async (_req, res) => {
    const r = await pool.query(`SELECT id, code, name, is_active FROM aif_brands ORDER BY name ASC`);
    res.json({ items: r.rows });
  });

  router.get("/categories", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const r = await pool.query(
      `SELECT id, code, parent_id, name_ro, name_hu, aliases, shopify_collection_handle, sort_order, is_active, created_at, updated_at
       FROM aif_categories
       ${includeInactive ? "" : "WHERE is_active=true"}
       ORDER BY is_active DESC, sort_order ASC, name_ro ASC`
    );
    res.json({ items: r.rows });
  });

  router.post("/categories", requireAuthed, async (req, res) => {
    const body = req.body || {};
    const nameRo = text(body.nameRo || body.name_ro || body.name);
    const nameHu = emptyToNull(body.nameHu || body.name_hu);
    const code = normCode(body.code || nameRo);
    const sortOrder = toInt(body.sortOrder ?? body.sort_order) || 100;
    const aliases = categoryAliasesFromInput(body.aliases || body.alias_list || body.aliasList);
    const shopifyHandle = emptyToNull(body.shopifyCollectionHandle || body.shopify_collection_handle);
    if (!nameRo) return res.status(400).json({ error: "category name required" });
    if (!code) return res.status(400).json({ error: "category code required" });
    try {
      const r = await pool.query(
        `INSERT INTO aif_categories (code, name_ro, name_hu, aliases, shopify_collection_handle, sort_order, is_active)
         VALUES ($1,$2,$3,$4::text[],$5,$6,true)
         ON CONFLICT (code) DO UPDATE SET
           name_ro=EXCLUDED.name_ro,
           name_hu=EXCLUDED.name_hu,
           aliases=EXCLUDED.aliases,
           shopify_collection_handle=EXCLUDED.shopify_collection_handle,
           sort_order=EXCLUDED.sort_order,
           is_active=true,
           updated_at=now()
         RETURNING id, code, parent_id, name_ro, name_hu, aliases, shopify_collection_handle, sort_order, is_active, created_at, updated_at`,
        [code, nameRo, nameHu, aliases, shopifyHandle, sortOrder]
      );
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF create category failed", e);
      res.status(500).json({ error: "failed to save category" });
    }
  });

  router.patch("/categories/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const body = req.body || {};
    const sets = [];
    const args = [];
    let i = 1;

    if (body.nameRo !== undefined || body.name_ro !== undefined || body.name !== undefined) {
      const nameRo = text(body.nameRo ?? body.name_ro ?? body.name);
      if (!nameRo) return res.status(400).json({ error: "category name required" });
      sets.push(`name_ro=$${i++}`);
      args.push(nameRo);
    }
    if (body.nameHu !== undefined || body.name_hu !== undefined) {
      sets.push(`name_hu=$${i++}`);
      args.push(emptyToNull(body.nameHu ?? body.name_hu));
    }
    if (body.aliases !== undefined || body.aliasList !== undefined || body.alias_list !== undefined) {
      sets.push(`aliases=$${i++}::text[]`);
      args.push(categoryAliasesFromInput(body.aliases ?? body.aliasList ?? body.alias_list));
    }
    if (body.code !== undefined) {
      const code = normCode(body.code);
      if (!code) return res.status(400).json({ error: "category code required" });
      sets.push(`code=$${i++}`);
      args.push(code);
    }
    if (body.shopifyCollectionHandle !== undefined || body.shopify_collection_handle !== undefined) {
      sets.push(`shopify_collection_handle=$${i++}`);
      args.push(emptyToNull(body.shopifyCollectionHandle ?? body.shopify_collection_handle));
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
        `UPDATE aif_categories
         SET ${sets.join(", ")}, updated_at=now()
         WHERE id::text=$${i} OR code=$${i}
         RETURNING id, code, parent_id, name_ro, name_hu, aliases, shopify_collection_handle, sort_order, is_active, created_at, updated_at`,
        args
      );
      if (!r.rowCount) return res.status(404).json({ error: "category not found" });
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF update category failed", e);
      res.status(500).json({ error: "failed to update category" });
    }
  });

  router.delete("/categories/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const category = await client.query(
        `SELECT id, code, name_ro FROM aif_categories WHERE id::text=$1 OR code=$1 FOR UPDATE`,
        [id]
      );
      if (!category.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "category not found" });
      }
      const usage = await categoryUsage(client, category.rows[0].id);
      if (Number(usage.product_models || 0) > 0 || Number(usage.child_categories || 0) > 0) {
        await client.query(`UPDATE aif_categories SET is_active=false, updated_at=now() WHERE id=$1`, [category.rows[0].id]);
        await client.query("COMMIT");
        return res.json({ ok: true, mode: "deactivated", usage });
      }
      await client.query(`DELETE FROM aif_categories WHERE id=$1`, [category.rows[0].id]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "deleted", usage });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete category failed", e);
      res.status(500).json({ error: "failed to delete category" });
    } finally {
      client.release();
    }
  });

  router.get("/gender-types", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const r = await pool.query(
      `SELECT code, name, aliases, sort_order, is_active, created_at, updated_at
       FROM aif_gender_types
       ${includeInactive ? "" : "WHERE is_active=true"}
       ORDER BY is_active DESC, sort_order ASC, name ASC`
    );
    res.json({ items: r.rows });
  });

  router.post("/gender-types", requireAuthed, async (req, res) => {
    const body = req.body || {};
    const name = text(body.name);
    const code = normCode(body.code || name);
    const sortOrder = toInt(body.sortOrder ?? body.sort_order) || 100;
    const aliases = genderAliasesFromInput(body.aliases || body.alias_list || body.aliasList);
    if (!name) return res.status(400).json({ error: "gender name required" });
    if (!code) return res.status(400).json({ error: "gender code required" });
    try {
      const r = await pool.query(
        `INSERT INTO aif_gender_types (code, name, aliases, sort_order, is_active)
         VALUES ($1,$2,$3::text[],$4,true)
         ON CONFLICT (code) DO UPDATE SET
           name=EXCLUDED.name,
           aliases=EXCLUDED.aliases,
           sort_order=EXCLUDED.sort_order,
           is_active=true,
           updated_at=now()
         RETURNING code, name, aliases, sort_order, is_active, created_at, updated_at`,
        [code, name, aliases, sortOrder]
      );
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF create gender type failed", e);
      res.status(500).json({ error: "failed to save gender" });
    }
  });

  router.patch("/gender-types/:code", requireAuthed, async (req, res) => {
    const codeParam = normCode(req.params.code);
    const body = req.body || {};
    const sets = [];
    const args = [];
    let i = 1;

    if (body.name !== undefined) {
      const name = text(body.name);
      if (!name) return res.status(400).json({ error: "gender name required" });
      sets.push(`name=$${i++}`);
      args.push(name);
    }
    if (body.aliases !== undefined || body.aliasList !== undefined || body.alias_list !== undefined) {
      sets.push(`aliases=$${i++}::text[]`);
      args.push(genderAliasesFromInput(body.aliases ?? body.aliasList ?? body.alias_list));
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
        `UPDATE aif_gender_types
         SET ${sets.join(", ")}, updated_at=now()
         WHERE code=$${i}
         RETURNING code, name, aliases, sort_order, is_active, created_at, updated_at`,
        args
      );
      if (!r.rowCount) return res.status(404).json({ error: "gender not found" });
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF update gender type failed", e);
      res.status(500).json({ error: "failed to update gender" });
    }
  });

  router.delete("/gender-types/:code", requireAuthed, async (req, res) => {
    const codeParam = normCode(req.params.code);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const gt = await client.query(`SELECT code, name FROM aif_gender_types WHERE code=$1 FOR UPDATE`, [codeParam]);
      if (!gt.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "gender not found" });
      }
      const activeCount = await client.query(`SELECT count(*)::int AS c FROM aif_gender_types WHERE is_active=true AND code <> $1`, [codeParam]);
      if (Number(activeCount.rows[0]?.c || 0) <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "at least one active gender is required" });
      }
      const usage = await genderTypeUsage(client, codeParam);
      if (Number(usage.product_models || 0) > 0) {
        await client.query(`UPDATE aif_gender_types SET is_active=false, updated_at=now() WHERE code=$1`, [codeParam]);
        await client.query("COMMIT");
        return res.json({ ok: true, mode: "deactivated", usage });
      }
      await client.query(`DELETE FROM aif_gender_types WHERE code=$1`, [codeParam]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "deleted", usage });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete gender type failed", e);
      res.status(500).json({ error: "failed to delete gender" });
    } finally {
      client.release();
    }
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
    const [suppliers, brands, categories, genderTypes, locations, locationTypes, currencies, colorTypes, brandColorCodes, materialTypes, supplierBrands, profiles] = await Promise.all([
      pool.query(`SELECT id, code, name, is_active FROM aif_suppliers WHERE is_active=true ORDER BY name ASC`),
      pool.query(`SELECT id, code, name, is_active FROM aif_brands WHERE is_active=true ORDER BY name ASC`),
      pool.query(`SELECT id, code, name_ro, name_hu, aliases, sort_order, is_active FROM aif_categories WHERE is_active=true ORDER BY sort_order ASC, name_ro ASC`),
      pool.query(`SELECT code, name, aliases, sort_order, is_active FROM aif_gender_types WHERE is_active=true ORDER BY sort_order ASC, name ASC`),
      pool.query(`SELECT id, code, name, location_type, is_active FROM aif_locations WHERE is_active=true ORDER BY name ASC`),
      pool.query(`SELECT id, code, name, sort_order, is_active FROM aif_location_types WHERE is_active=true ORDER BY sort_order ASC, name ASC`),
      pool.query(`SELECT code, name, symbol, sort_order, is_active FROM aif_currencies WHERE is_active=true ORDER BY sort_order ASC, code ASC`),
      pool.query(`SELECT id, code, name_ro, name_hu, name_en, name_de, aliases, hex, sort_order, is_active
                  FROM aif_color_types
                  WHERE is_active=true
                  ORDER BY sort_order ASC, name_ro ASC`),
      pool.query(`${brandColorCodeSelect()}
                  WHERE bcc.is_active=true AND b.is_active=true AND c.is_active=true
                  ORDER BY b.name ASC, bcc.color_code ASC`),
      pool.query(`SELECT id, code, name_ro, name_hu, name_en, name_de, aliases, sort_order, is_active
                  FROM aif_material_types
                  WHERE is_active=true
                  ORDER BY sort_order ASC, name_ro ASC`),
      pool.query(`SELECT sb.id, sb.supplier_id, sb.brand_id, sb.is_preferred, sb.is_active,
                         s.name AS supplier_name, b.name AS brand_name
                  FROM aif_supplier_brands sb
                  JOIN aif_suppliers s ON s.id=sb.supplier_id
                  JOIN aif_brands b ON b.id=sb.brand_id
                  WHERE sb.is_active=true AND s.is_active=true AND b.is_active=true
                  ORDER BY s.name ASC, b.name ASC`),
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
      genderTypes: genderTypes.rows,
      locations: locations.rows,
      locationTypes: locationTypes.rows,
      currencies: currencies.rows,
      colorTypes: colorTypes.rows,
      brandColorCodes: brandColorCodes.rows,
      materialTypes: materialTypes.rows,
      supplierBrands: supplierBrands.rows,
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

  router.post("/import-batches/full", requireAuthed, async (req, res) => {
    const body = req.body || {};
    const rowsInput = Array.isArray(body.rows) ? body.rows : Array.isArray(body.items) ? body.items : [];
    if (!rowsInput.length) return res.status(400).json({ error: "Nincs kijelölt menthető terméksor." });

    const client = await pool.connect();
    try {
      const supplier = await findByIdOrCode(client, "aif_suppliers", body.supplierId || body.supplier_id || body.supplierCode || body.supplier);
      if (!supplier) return res.status(400).json({ error: "Beszállító kiválasztása kötelező." });
      if (supplier.is_active === false) return res.status(400).json({ error: "A kiválasztott beszállító inaktív." });

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
      if (!targetLocationId) return res.status(400).json({ error: "Cél hely kiválasztása kötelező." });

      const reception = receptionFromBody(body);
      if (!reception.invoiceNumber) return res.status(400).json({ error: "Számlaszám megadása kötelező." });
      if (!reception.invoiceDate) return res.status(400).json({ error: "Számla dátuma kötelező." });
      if (!reception.receptionDate) return res.status(400).json({ error: "Receptió dátuma kötelező." });
      if (!reception.currencyCode) return res.status(400).json({ error: "Pénznem kiválasztása kötelező." });
      if (!reception.exchangeRateToRon || reception.exchangeRateToRon <= 0) return res.status(400).json({ error: "Pozitív RON árfolyam megadása kötelező." });
      if (!reception.tvaMode) return res.status(400).json({ error: "TVA kezelés kiválasztása kötelező." });
      if (reception.tvaMode !== "no_tva" && (reception.tvaRate === null || reception.tvaRate === undefined)) return res.status(400).json({ error: "TVA százalék megadása kötelező." });
      if (reception.invoiceGross === null || reception.invoiceGross === undefined) return res.status(400).json({ error: "Számla végösszeg megadása kötelező." });

      const curr = await client.query(`SELECT code FROM aif_currencies WHERE code=$1 AND is_active=true LIMIT 1`, [reception.currencyCode]);
      if (!curr.rowCount) return res.status(400).json({ error: "A kiválasztott pénznem inaktív vagy nem létezik." });

      const normalizedRows = [];
      let rowNo = 1;
      for (const input of rowsInput) {
        const nr = normalizeRowInput(input, rowNo++);
        await enrichNormalizedRow(client, nr);
        if (nr.errors.length) {
          return res.status(400).json({
            error: `A(z) ${nr.rowNo}. terméksor hiányos vagy hibás: ${nr.errors.join(" ")}`,
            rowNo: nr.rowNo,
            errors: nr.errors,
          });
        }
        normalizedRows.push(nr);
      }

      await client.query("BEGIN");

      const existingReceptionId = emptyToNull(body.receptionId || body.reception_id);
      let receptionId = null;

      if (existingReceptionId) {
        const currentReception = await client.query(
          `SELECT id, status FROM aif_receptions WHERE id::text=$1 FOR UPDATE`,
          [existingReceptionId]
        );
        if (!currentReception.rowCount) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "A kiválasztott receptió nem található." });
        }
        receptionId = currentReception.rows[0].id;
        await client.query(
          `UPDATE aif_receptions SET
             supplier_id=$2,
             target_location_id=$3,
             invoice_number=$4,
             invoice_date=$5,
             reception_date=$6,
             currency_code=$7,
             exchange_rate_to_ron=$8,
             tva_mode=$9,
             tva_rate=$10,
             shipping_cost=$11,
             goods_value=COALESCE(goods_value,0) + COALESCE($12,0),
             invoice_net=COALESCE($13, invoice_net),
             invoice_vat=COALESCE($14, invoice_vat),
             invoice_gross=$15,
             total_qty=COALESCE(total_qty,0) + $16,
             line_count=COALESCE(line_count,0) + $17,
             status=CASE WHEN status='cancelled' THEN status ELSE 'draft' END,
             note=COALESCE($18, note),
             raw_meta=COALESCE(raw_meta,'{}'::jsonb) || $19::jsonb,
             updated_at=now()
           WHERE id=$1`,
          [
            receptionId,
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
          ]
        );
      } else {
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
        receptionId = receptionRes.rows[0].id;
      }

      const batchRes = await client.query(
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
          receptionId,
          emptyToNull(body.sourceFileName || body.source_file_name || body.fileName),
          emptyToNull(body.sourceFileUrl || body.source_file_url || body.fileUrl),
          normCode(body.sourceFormat || body.source_format || "manual") || "manual",
          req.session?.role || "system",
          actorFrom(req),
          emptyToNull(body.note),
          JSON.stringify(body.rawMeta || body.raw_meta || {}),
          reception.currencyCode,
          reception.exchangeRateToRon,
          reception.invoiceNumber,
        ]
      );

      const batchId = batchRes.rows[0].id;
      const exchangeRate = Number(reception.exchangeRateToRon);
      let errorCount = 0;
      for (const nr of normalizedRows) {
        const buyPriceRon = nr.normalized.buyPrice == null || !Number.isFinite(exchangeRate)
          ? null
          : Number(nr.normalized.buyPrice) * exchangeRate;
        const sellPriceRon = nr.normalized.sellPrice == null || !Number.isFinite(exchangeRate)
          ? null
          : Number(nr.normalized.sellPrice) * exchangeRate;
        const normalizedForDb = {
          ...nr.normalized,
          currencyCode: reception.currencyCode,
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
        [batchId, normalizedRows.length, errorCount, errorCount ? "needs_review" : "parsed"]
      );

      await client.query("COMMIT");
      res.json({ ok: true, id: batchId, receptionId, rowCount: normalizedRows.length, errorCount });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF create full import batch failed", e);
      if (e && e.code === "23514") {
        return res.status(400).json({ error: "A mentés nem sikerült: egy terméksor mennyisége vagy ára hibás." });
      }
      res.status(500).json({ error: "A mentés nem sikerült. Ellenőrizd a receptiót és a kijelölt terméksorokat." });
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


  async function refreshReceptionAfterImportHistoryDelete(client, receptionId) {
    if (!receptionId) return;

    const stats = await client.query(
      `SELECT
         count(rw.id) FILTER (WHERE rw.status <> 'ignored')::int AS line_count,
         COALESCE(sum(COALESCE(rw.qty,0)) FILTER (WHERE rw.status <> 'ignored'),0)::int AS total_qty,
         COALESCE(sum(COALESCE(rw.qty,0) * COALESCE(rw.buy_price,0)) FILTER (WHERE rw.status <> 'ignored'),0)::numeric(14,2) AS goods_value,
         count(rw.id) FILTER (WHERE rw.status = 'committed')::int AS committed_rows,
         count(rw.id) FILTER (WHERE rw.status NOT IN ('ignored','committed'))::int AS remaining_rows,
         count(rw.id) FILTER (WHERE rw.status = 'error')::int AS error_rows
       FROM aif_import_batches b
       LEFT JOIN aif_import_rows rw ON rw.batch_id=b.id
       WHERE b.reception_id=$1`,
      [receptionId]
    );

    const st = stats.rows[0] || {};
    const lineCount = Number(st.line_count || 0);
    const totalQty = Number(st.total_qty || 0);
    const goodsValue = Number(st.goods_value || 0);
    const committedRows = Number(st.committed_rows || 0);
    const remainingRows = Number(st.remaining_rows || 0);
    const errorRows = Number(st.error_rows || 0);

    await client.query(
      `UPDATE aif_receptions
       SET line_count=$2,
           total_qty=$3,
           goods_value=$4,
           status=CASE
             WHEN $5::int > 0 OR $6::int > 0 THEN 'draft'
             WHEN $7::int > 0 THEN 'committed'
             ELSE 'draft'
           END,
           updated_at=now()
       WHERE id=$1`,
      [receptionId, lineCount, totalQty, goodsValue, remainingRows, errorRows, committedRows]
    );
  }

  async function deleteImportBatchHistory(req, res) {
    const batchId = text(req.params.id);
    if (!batchId) return res.status(400).json({ error: "Import előzmény azonosító kötelező." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const batchRes = await client.query(
        `SELECT id, reception_id, status, row_count, source_file_name
         FROM aif_import_batches
         WHERE id::text=$1
         FOR UPDATE`,
        [batchId]
      );

      if (!batchRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Import előzmény nem található." });
      }

      const batch = batchRes.rows[0];

      const rowStats = await client.query(
        `SELECT
           count(*)::int AS rows,
           count(*) FILTER (WHERE status='committed')::int AS committed_rows
         FROM aif_import_rows
         WHERE batch_id=$1`,
        [batch.id]
      );

      const deletedRows = Number(rowStats.rows[0]?.rows || 0);
      const committedRows = Number(rowStats.rows[0]?.committed_rows || 0);

      /*
        Csak az import előzményt töröljük:
        - aif_import_rows
        - aif_import_batches

        Direkt NEM nyúlunk ezekhez:
        - aif_product_models
        - aif_product_variants
        - aif_stock
        - aif_stock_movements
        - aif_variant_supplier_codes

        Tehát a már feltöltött / készletre vett termékek maradnak. Az Exceles régészeti ásatás meg végre nem hagy maga után 1000 fölös import előzményt.
      */
      await client.query(`DELETE FROM aif_import_rows WHERE batch_id=$1`, [batch.id]);
      await client.query(`DELETE FROM aif_import_batches WHERE id=$1`, [batch.id]);

      if (batch.reception_id) {
        await refreshReceptionAfterImportHistoryDelete(client, batch.reception_id);
      }

      await client.query("COMMIT");

      res.json({
        ok: true,
        mode: "history_deleted",
        deletedRows,
        committedRows,
        receptionId: batch.reception_id || null,
      });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete import history failed", e);
      res.status(500).json({ error: e?.message || "Az import előzmény törlése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  }

  router.delete("/import-batches/:id/history", requireAuthed, deleteImportBatchHistory);
  router.delete("/import-batches/:id", requireAuthed, deleteImportBatchHistory);


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
         FOR UPDATE OF b`,
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
        await enrichNormalizedRow(client, nr);
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


  async function commitBatchRows(client, { batchId, rowIds = null, actor = "system" }) {
    const batchRes = await client.query(
      `SELECT b.*, s.code AS supplier_code
       FROM aif_import_batches b
       JOIN aif_suppliers s ON s.id=b.supplier_id
       WHERE b.id=$1
       FOR UPDATE OF b`,
      [batchId]
    );
    if (!batchRes.rowCount) {
      const e = new Error("Import csomag nem található.");
      e.statusCode = 404;
      throw e;
    }

    const batch = batchRes.rows[0];
    if (batch.status === "cancelled") {
      const e = new Error("Törölt import nem vehető készletre.");
      e.statusCode = 400;
      throw e;
    }
    if (!batch.target_location_id) {
      const e = new Error("Hiányzik a cél hely.");
      e.statusCode = 400;
      throw e;
    }

    const args = [batchId];
    let where = `batch_id=$1 AND status NOT IN ('ignored','committed')`;
    if (Array.isArray(rowIds) && rowIds.length) {
      args.push(rowIds.map(String));
      where += ` AND id::text = ANY($2::text[])`;
    }

    const rows = await client.query(
      `SELECT * FROM aif_import_rows
       WHERE ${where}
       ORDER BY row_no ASC
       FOR UPDATE`,
      args
    );

    if (!rows.rowCount) {
      const e = new Error("Nincs készletre vehető terméksor. Ellenőrizd, hogy van-e kijelölt, hibátlan és még nem készletre vett sor.");
      e.statusCode = 400;
      throw e;
    }

    const errors = rows.rows.filter((r) => r.status === "error" || (r.error_messages || []).length);
    if (errors.length) {
      await client.query(
        `UPDATE aif_import_batches SET status='needs_review', error_count=$2, updated_at=now() WHERE id=$1`,
        [batchId, errors.length]
      );
      const e = new Error(`A készletre vétel nem indítható: ${errors.length} terméksor hibás vagy ellenőrzést igényel.`);
      e.statusCode = 400;
      throw e;
    }

    let committed = 0;
    for (const row of rows.rows) {
      try {
        const normalized = { ...(row.normalized || {}) };
        applyProductCodeSplit(normalized);
        normalized.gender = canonicalGender(normalized.gender);
        const brandColorMapped = await applyBrandColorCodeMapping(client, normalized);
        if (!brandColorMapped && normalized.colorName) normalized.colorName = await normalizeColorName(client, normalized.colorName);
        const qty = Number(row.qty ?? normalized.qty ?? 0);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error("a mennyiség hiányzik vagy nem pozitív");

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
      } catch (rowError) {
        const e = new Error(`A(z) ${row.row_no || "?"}. terméksor készletre vétele nem sikerült: ${rowError?.message || rowError}`);
        e.statusCode = 400;
        throw e;
      }
    }

    const state = await client.query(
      `SELECT
         count(*) FILTER (WHERE status <> 'ignored')::int AS total_rows,
         count(*) FILTER (WHERE status = 'committed')::int AS committed_rows,
         count(*) FILTER (WHERE status = 'error')::int AS error_rows,
         count(*) FILTER (WHERE status NOT IN ('ignored','committed'))::int AS remaining_rows
       FROM aif_import_rows
       WHERE batch_id=$1`,
      [batchId]
    );
    const st = state.rows[0] || { total_rows: 0, committed_rows: 0, error_rows: 0, remaining_rows: 0 };

    if (Number(st.remaining_rows || 0) <= 0 && Number(st.total_rows || 0) > 0) {
      await client.query(
        `UPDATE aif_import_batches
         SET status='committed', committed_at=COALESCE(committed_at, now()), error_count=0, updated_at=now()
         WHERE id=$1`,
        [batchId]
      );
    } else {
      await client.query(
        `UPDATE aif_import_batches
         SET status=CASE WHEN $2::int > 0 THEN 'needs_review' ELSE 'parsed' END,
             error_count=$2,
             updated_at=now()
         WHERE id=$1`,
        [batchId, Number(st.error_rows || 0)]
      );
    }

    if (batch.reception_id) {
      const recState = await client.query(
        `SELECT
           count(rw.id) FILTER (WHERE rw.status <> 'ignored')::int AS total_rows,
           count(rw.id) FILTER (WHERE rw.status = 'committed')::int AS committed_rows,
           count(rw.id) FILTER (WHERE rw.status NOT IN ('ignored','committed'))::int AS remaining_rows,
           count(rw.id) FILTER (WHERE rw.status = 'error')::int AS error_rows
         FROM aif_import_batches b
         LEFT JOIN aif_import_rows rw ON rw.batch_id=b.id
         WHERE b.reception_id=$1`,
        [batch.reception_id]
      );
      const rs = recState.rows[0] || {};
      if (Number(rs.total_rows || 0) > 0 && Number(rs.remaining_rows || 0) <= 0) {
        await client.query(`UPDATE aif_receptions SET status='committed', updated_at=now() WHERE id=$1`, [batch.reception_id]);
      } else {
        await client.query(`UPDATE aif_receptions SET status='draft', updated_at=now() WHERE id=$1 AND status <> 'cancelled'`, [batch.reception_id]);
      }
    }

    return {
      committed,
      totalRows: Number(st.total_rows || 0),
      committedRows: Number(st.committed_rows || 0),
      remainingRows: Number(st.remaining_rows || 0),
      errorRows: Number(st.error_rows || 0),
    };
  }

  router.post("/import-batches/:id/commit", requireAuthed, async (req, res) => {
    const batchId = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await commitBatchRows(client, {
        batchId,
        rowIds: null,
        actor: actorFrom(req),
      });
      await client.query("COMMIT");
      res.json({ ok: true, committed: result.committed, ...result });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF commit import batch failed", e);
      const status = Number(e?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: e?.message || "A készletre vétel nem sikerült." });
    } finally {
      client.release();
    }
  });

  router.post("/receptions/:id/commit-selected", requireAuthed, async (req, res) => {
    const receptionId = text(req.params.id);
    const rowIds = Array.isArray(req.body?.rowIds) ? req.body.rowIds.map(String).filter(Boolean) : null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const rec = await client.query(`SELECT id FROM aif_receptions WHERE id::text=$1 FOR UPDATE`, [receptionId]);
      if (!rec.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Receptió nem található." });
      }

      let batches;
      if (rowIds && rowIds.length) {
        batches = await client.query(
          `SELECT DISTINCT b.id
           FROM aif_import_batches b
           JOIN aif_import_rows rw ON rw.batch_id=b.id
           WHERE b.reception_id=$1 AND rw.id::text = ANY($2::text[])
           ORDER BY b.id`,
          [rec.rows[0].id, rowIds]
        );
      } else {
        batches = await client.query(
          `SELECT id
           FROM aif_import_batches
           WHERE reception_id=$1
           ORDER BY created_at ASC`,
          [rec.rows[0].id]
        );
      }

      if (!batches.rowCount) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Nincs készletre vehető mentett terméksor ebben a receptióban." });
      }

      let committed = 0;
      const details = [];
      for (const b of batches.rows) {
        const batchRowIds = rowIds && rowIds.length
          ? rowIds
          : null;
        const result = await commitBatchRows(client, {
          batchId: b.id,
          rowIds: batchRowIds,
          actor: actorFrom(req),
        });
        committed += Number(result.committed || 0);
        details.push({ batchId: b.id, ...result });
      }

      await client.query("COMMIT");
      res.json({ ok: true, committed, batches: details });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF reception selected commit failed", e);
      const status = Number(e?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: e?.message || "A kijelölt sorok készletre vétele nem sikerült." });
    } finally {
      client.release();
    }
  });

  router.patch("/import-rows/:id", requireAuthed, async (req, res) => {
    const rowId = text(req.params.id);
    const body = req.body || {};
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT rw.*, b.exchange_rate_to_ron, b.currency_code, b.status AS batch_status
         FROM aif_import_rows rw
         JOIN aif_import_batches b ON b.id=rw.batch_id
         WHERE rw.id::text=$1
         FOR UPDATE OF rw`,
        [rowId]
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Terméksor nem található." });
      }
      const row = current.rows[0];
      const isCommitted = row.status === "committed";

      if (body.status === "ignored") {
        if (isCommitted) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Készletre vett terméksor nem hagyható ki. Ehhez külön korrekció szükséges." });
        }
        await client.query(
          `UPDATE aif_import_rows SET status='ignored', error_messages='{}'::text[], updated_at=now() WHERE id=$1`,
          [row.id]
        );
        await client.query("COMMIT");
        return res.json({ ok: true, mode: "ignored" });
      }

      const nextNormalized = {
        ...(row.normalized || {}),
        ...(body.normalized && typeof body.normalized === "object" ? body.normalized : {}),
      };
      if (isCommitted) {
        nextNormalized.qty = row.qty ?? nextNormalized.qty;
      }

      const nr = normalizeRowInput({ normalized: nextNormalized, raw: row.raw, rowNo: row.row_no }, row.row_no || 1);
      await enrichNormalizedRow(client, nr);
      if (isCommitted) {
        nr.status = "committed";
        nr.errors = [];
        nr.normalized.qty = row.qty;
      }

      const exchangeRate = Number(row.exchange_rate_to_ron || 1);
      const buyPriceRon = nr.normalized.buyPrice == null || !Number.isFinite(exchangeRate)
        ? null
        : Number(nr.normalized.buyPrice) * exchangeRate;
      const sellPriceRon = nr.normalized.sellPrice == null || !Number.isFinite(exchangeRate)
        ? null
        : Number(nr.normalized.sellPrice) * exchangeRate;
      const normalizedForDb = {
        ...nr.normalized,
        currencyCode: row.currency_code,
        exchangeRateToRon: exchangeRate,
        buyPriceRon,
        sellPriceRon,
      };

      await client.query(
        `UPDATE aif_import_rows SET
           normalized=$2::jsonb,
           status=$3,
           error_messages=$4::text[],
           supplier_product_code=$5,
           supplier_variant_code=$6,
           supplier_color_code=$7,
           supplier_size=$8,
           qty=$9,
           buy_price=$10,
           buy_price_ron=$11,
           sell_price=$12,
           sell_price_ron=$13,
           updated_at=now()
         WHERE id=$1`,
        [
          row.id,
          JSON.stringify(normalizedForDb),
          nr.status,
          nr.errors,
          nr.normalized.supplierProductCode,
          nr.normalized.supplierVariantCode,
          nr.normalized.supplierColorCode,
          nr.normalized.supplierSize,
          isCommitted ? row.qty : nr.normalized.qty,
          nr.normalized.buyPrice,
          buyPriceRon,
          nr.normalized.sellPrice,
          sellPriceRon,
        ]
      );

      if (isCommitted && row.variant_id) {
        await client.query(
          `UPDATE aif_product_variants SET
             barcode=COALESCE($2, barcode),
             color_code=COALESCE($3, color_code),
             color_name=COALESCE($4, color_name),
             size=COALESCE($5, size),
             buy_price=COALESCE($6, buy_price),
             sell_price=COALESCE($7, sell_price),
             compare_at_price=COALESCE($8, compare_at_price),
             updated_at=now()
           WHERE id=$1`,
          [
            row.variant_id,
            nr.normalized.barcode,
            nr.normalized.colorCode,
            nr.normalized.colorName,
            nr.normalized.size,
            nr.normalized.buyPrice,
            nr.normalized.sellPrice,
            nr.normalized.compareAtPrice,
          ]
        );
        if (nr.normalized.titleRo) {
          await client.query(
            `UPDATE aif_product_models m
             SET title_ro=$2, updated_at=now()
             FROM aif_product_variants v
             WHERE v.model_id=m.id AND v.id=$1`,
            [row.variant_id, nr.normalized.titleRo]
          );
        }
        await client.query(
          `UPDATE aif_variant_supplier_codes
           SET supplier_product_code=COALESCE($2, supplier_product_code),
               supplier_variant_code=$3,
               supplier_color_code=$4,
               supplier_color_name=COALESCE($5, supplier_color_name),
               supplier_size=COALESCE($6, supplier_size),
               raw=$7::jsonb,
               updated_at=now()
           WHERE variant_id=$1`,
          [
            row.variant_id,
            nr.normalized.supplierProductCode,
            nr.normalized.supplierVariantCode,
            nr.normalized.supplierColorCode,
            nr.normalized.colorName,
            nr.normalized.supplierSize,
            JSON.stringify(normalizedForDb),
          ]
        );
      }

      await client.query("COMMIT");
      res.json({ ok: true, status: nr.status, errors: nr.errors, committedEdit: isCommitted });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF update import row failed", e);
      res.status(500).json({ error: e?.message || "A terméksor mentése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });


  router.delete("/import-rows/:id", requireAuthed, async (req, res) => {
    const rowId = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(`SELECT id, status FROM aif_import_rows WHERE id::text=$1 FOR UPDATE`, [rowId]);
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Terméksor nem található." });
      }
      if (current.rows[0].status === "committed") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Készletre vett terméksor nem törölhető itt." });
      }
      await client.query(`UPDATE aif_import_rows SET status='ignored', error_messages='{}'::text[], updated_at=now() WHERE id=$1`, [current.rows[0].id]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "ignored" });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF ignore import row failed", e);
      res.status(500).json({ error: e?.message || "A terméksor kihagyása nem sikerült." });
    } finally {
      client.release();
    }
  });


  router.post("/import-rows/:id/move-reception", requireAuthed, async (req, res) => {
    const rowId = text(req.params.id);
    const targetReceptionId = text(req.body?.targetReceptionId || req.body?.target_reception_id || req.body?.receptionId || req.body?.reception_id);
    if (!targetReceptionId) return res.status(400).json({ error: "Cél receptió kiválasztása kötelező." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const rowRes = await client.query(
        `SELECT rw.*, b.id AS source_batch_id, b.reception_id AS source_reception_id
         FROM aif_import_rows rw
         JOIN aif_import_batches b ON b.id=rw.batch_id
         WHERE rw.id::text=$1
         FOR UPDATE OF rw`,
        [rowId]
      );
      if (!rowRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Terméksor nem található." });
      }
      const row = rowRes.rows[0];
      if (row.status === "committed") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Készletre vett sort nem lehet másik receptióba áthelyezni." });
      }
      if (String(row.source_reception_id || "") === targetReceptionId) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Ez a sor már ebben a receptióban van." });
      }
      const target = await client.query(
        `SELECT r.*, s.code AS supplier_code
         FROM aif_receptions r
         LEFT JOIN aif_suppliers s ON s.id=r.supplier_id
         WHERE r.id::text=$1
         FOR UPDATE`,
        [targetReceptionId]
      );
      if (!target.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Cél receptió nem található." });
      }
      if (["committed", "cancelled"].includes(String(target.rows[0].status || ""))) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Lezárt vagy törölt receptióba nem lehet sort áthelyezni." });
      }
      let targetBatchId = null;
      const tb = await client.query(
        `SELECT id FROM aif_import_batches WHERE reception_id=$1 AND status <> 'committed' ORDER BY created_at DESC LIMIT 1`,
        [target.rows[0].id]
      );
      if (tb.rowCount) targetBatchId = tb.rows[0].id;
      else {
        let profileId = null;
        if (target.rows[0].supplier_id) {
          const pr = await client.query(
            `SELECT id FROM aif_supplier_import_profiles WHERE supplier_id=$1 AND is_active=true ORDER BY version DESC LIMIT 1`,
            [target.rows[0].supplier_id]
          );
          profileId = pr.rows[0]?.id || null;
        }
        const created = await client.query(
          `INSERT INTO aif_import_batches (
             supplier_id, profile_id, target_location_id, reception_id, source_format, status,
             created_by, actor, note, raw_meta, currency_code, exchange_rate_to_ron, invoice_number
           )
           VALUES ($1,$2,$3,$4,'manual','parsed','system','system','Receptió folytatás','{}'::jsonb,$5,$6,$7)
           RETURNING id`,
          [target.rows[0].supplier_id, profileId, target.rows[0].target_location_id, target.rows[0].id, target.rows[0].currency_code, target.rows[0].exchange_rate_to_ron, target.rows[0].invoice_number]
        );
        targetBatchId = created.rows[0].id;
      }
      const rate = Number(target.rows[0].exchange_rate_to_ron || 1);
      const nextNormalized = { ...(row.normalized || {}), currencyCode: target.rows[0].currency_code, exchangeRateToRon: rate };
      await client.query(
        `UPDATE aif_import_rows
         SET batch_id=$2,
             buy_price_ron=CASE WHEN buy_price IS NULL THEN NULL ELSE round(buy_price * $3::numeric, 2) END,
             sell_price_ron=CASE WHEN sell_price IS NULL THEN NULL ELSE round(sell_price * $3::numeric, 2) END,
             normalized=$4::jsonb,
             updated_at=now()
         WHERE id=$1`,
        [row.id, targetBatchId, rate, JSON.stringify(nextNormalized)]
      );
      const refreshBatch = async (batchId) => {
        const st = await client.query(
          `SELECT count(*)::int AS rows, count(*) FILTER (WHERE status='error')::int AS errors FROM aif_import_rows WHERE batch_id=$1`,
          [batchId]
        );
        const rows = Number(st.rows[0]?.rows || 0);
        const errors = Number(st.rows[0]?.errors || 0);
        await client.query(
          `UPDATE aif_import_batches SET row_count=$2, error_count=$3, status=CASE WHEN $2=0 THEN 'draft' WHEN $3>0 THEN 'needs_review' ELSE 'parsed' END, updated_at=now() WHERE id=$1 AND status <> 'committed'`,
          [batchId, rows, errors]
        );
      };
      await refreshBatch(row.source_batch_id);
      await refreshBatch(targetBatchId);
      await client.query("COMMIT");
      res.json({ ok: true, targetBatchId });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF move import row failed", e);
      res.status(500).json({ error: e?.message || "A terméksor áthelyezése nem sikerült." });
    } finally {
      client.release();
    }
  });


  async function readVariantStockRows(client, variantId) {
    const stock = await client.query(
      `SELECT l.id AS location_id, l.code AS location_code, l.name AS location_name,
              l.location_type, s.qty, s.reserved_qty, (s.qty - s.reserved_qty) AS available_qty, s.updated_at
       FROM aif_stock s
       JOIN aif_locations l ON l.id=s.location_id
       WHERE s.variant_id=$1
       ORDER BY l.name ASC`,
      [variantId]
    );
    return stock.rows;
  }

  function stockMovementSourceId(prefix, variantId, locationId) {
    // Keep this intentionally short. Some existing databases have source_id as varchar(40/64),
    // and a huge UUID-packed id makes stock edits fail. Fantastic little trap, obviously.
    const cleanPrefix = normCode(prefix || "stock").slice(0, 12) || "stock";
    const timePart = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${cleanPrefix}:${timePart}:${rand}`;
  }

  async function insertStockMovementSafe(client, {
    movementType = "manual_adjustment",
    sourceType = "manual_stock_edit",
    sourcePrefix = "stock",
    locationId,
    variantId,
    qtyDelta,
    qtyBefore,
    qtyAfter,
    actor = "system",
    raw = {},
    fallbackSourceType = "manual_stock_edit",
  }) {
    const insertOnce = async (safeSourceType, safeSourcePrefix) => {
      await client.query(
        `INSERT INTO aif_stock_movements (
           movement_type, source_type, source_id, location_id, variant_id,
           qty_delta, qty_before, qty_after, actor, raw
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
        [
          movementType,
          safeSourceType,
          stockMovementSourceId(safeSourcePrefix || safeSourceType || "stock", variantId, locationId),
          locationId,
          variantId,
          qtyDelta,
          qtyBefore,
          qtyAfter,
          actor,
          JSON.stringify(raw || {}),
        ]
      );
    };

    try {
      await client.query("SAVEPOINT aif_stock_movement_log");
      await insertOnce(sourceType, sourcePrefix || sourceType);
      await client.query("RELEASE SAVEPOINT aif_stock_movement_log");
      return true;
    } catch (firstError) {
      try { await client.query("ROLLBACK TO SAVEPOINT aif_stock_movement_log"); } catch {}
      try { await client.query("RELEASE SAVEPOINT aif_stock_movement_log"); } catch {}

      if (fallbackSourceType && fallbackSourceType !== sourceType) {
        try {
          await client.query("SAVEPOINT aif_stock_movement_log_fallback");
          await insertOnce(fallbackSourceType, fallbackSourceType);
          await client.query("RELEASE SAVEPOINT aif_stock_movement_log_fallback");
          console.error("AIF stock movement logged with fallback source_type", { sourceType, fallbackSourceType, error: firstError?.message || firstError });
          return true;
        } catch (fallbackError) {
          try { await client.query("ROLLBACK TO SAVEPOINT aif_stock_movement_log_fallback"); } catch {}
          try { await client.query("RELEASE SAVEPOINT aif_stock_movement_log_fallback"); } catch {}
          console.error("AIF stock movement log warning", fallbackError);
          return false;
        }
      }

      console.error("AIF stock movement log warning", firstError);
      return false;
    }
  }

  router.patch("/variants/:id/stock", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const rowsInput = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!id) return res.status(400).json({ error: "variant id required" });
    if (!rowsInput.length) return res.status(400).json({ error: "Nincs menthető készletsor." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const variant = await client.query(
        `SELECT id FROM aif_product_variants
         WHERE id::text=$1 OR internal_sku=$1 OR barcode=$1
         FOR UPDATE`,
        [id]
      );
      if (!variant.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "variant not found" });
      }
      const variantId = variant.rows[0].id;
      const actor = actorFrom(req);

      for (const input of rowsInput) {
        const locationInput = input.locationId || input.location_id || input.locationCode || input.location_code || input.location || input.code;
        const location = await findByIdOrCode(client, "aif_locations", locationInput);
        if (!location || location.is_active === false) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: `Érvénytelen vagy inaktív célhely: ${locationInput || "-"}` });
        }

        const qty = toInt(input.qty);
        if (qty === null || qty < 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: `Érvénytelen készlet mennyiség: ${input.qty ?? ""}` });
        }

        const current = await client.query(
          `SELECT qty, reserved_qty FROM aif_stock WHERE location_id=$1 AND variant_id=$2 FOR UPDATE`,
          [location.id, variantId]
        );
        const beforeQty = current.rowCount ? Number(current.rows[0].qty || 0) : 0;
        const beforeReserved = current.rowCount ? Number(current.rows[0].reserved_qty || 0) : 0;
        const reservedInput = input.reservedQty ?? input.reserved_qty;
        const reservedQty = reservedInput === undefined || reservedInput === null || reservedInput === ""
          ? beforeReserved
          : toInt(reservedInput);

        if (reservedQty === null || reservedQty < 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: `Érvénytelen foglalt mennyiség: ${reservedInput ?? ""}` });
        }
        if (reservedQty > qty) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: `${location.name}: a foglalt mennyiség nem lehet nagyobb, mint a készlet.` });
        }

        await client.query(
          `INSERT INTO aif_stock (location_id, variant_id, qty, reserved_qty, updated_at)
           VALUES ($1,$2,$3,$4,now())
           ON CONFLICT (location_id, variant_id)
           DO UPDATE SET qty=$3, reserved_qty=$4, updated_at=now()`,
          [location.id, variantId, qty, reservedQty]
        );

        const diff = qty - beforeQty;
        if (diff !== 0 || reservedQty !== beforeReserved) {
          await insertStockMovementSafe(client, {
            movementType: "manual_adjustment",
            sourceType: "manual_stock_edit",
            sourcePrefix: "manual_stock",
            locationId: location.id,
            variantId,
            qtyDelta: diff,
            qtyBefore: beforeQty,
            qtyAfter: qty,
            actor,
            raw: {
              reason: "manual_location_stock_edit",
              direction: diff > 0 ? "in" : diff < 0 ? "out" : "adjust",
              locationCode: location.code,
              locationName: location.name,
              qtyBefore: beforeQty,
              qtyAfter: qty,
              reservedBefore: beforeReserved,
              reservedAfter: reservedQty,
            },
          });
        }
      }

      const freshStock = await readVariantStockRows(client, variantId);
      await client.query("COMMIT");
      res.json({ ok: true, stock: freshStock });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF update variant stock failed", e);
      res.status(500).json({ error: e?.message || "A készlet módosítása nem sikerült.", code: e?.code || null });
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
      if (body.colorName !== undefined || body.color_name !== undefined) {
        const normalizedColor = await normalizeColorName(client, body.colorName ?? body.color_name);
        addVariant("color_name", emptyToNull(normalizedColor));
      }
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
        if (!(await activeGenderTypeExists(client, gender))) {
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


  router.delete("/variants/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    if (!id) return res.status(400).json({ error: "variant id required" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT v.id, v.model_id, v.status, m.title_ro
         FROM aif_product_variants v
         JOIN aif_product_models m ON m.id=v.model_id
         WHERE v.id::text=$1 OR v.internal_sku=$1 OR v.barcode=$1
         FOR UPDATE OF v`,
        [id]
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "variant not found" });
      }

      const variantId = current.rows[0].id;
      const modelId = current.rows[0].model_id;

      const stockUsage = await client.query(
        `SELECT count(*)::int AS stock_rows,
                COALESCE(sum(qty),0)::numeric AS qty,
                COALESCE(sum(reserved_qty),0)::numeric AS reserved_qty
         FROM aif_stock
         WHERE variant_id=$1`,
        [variantId]
      );
      const movementUsage = await client.query(
        `SELECT count(*)::int AS movements
         FROM aif_stock_movements
         WHERE variant_id=$1`,
        [variantId]
      );
      const importUsage = await client.query(
        `SELECT count(*)::int AS import_rows
         FROM aif_import_rows
         WHERE variant_id=$1`,
        [variantId]
      );

      const stockRowsForRemoval = await client.query(
        `SELECT s.location_id, l.code AS location_code, l.name AS location_name,
                COALESCE(s.qty,0)::numeric AS qty,
                COALESCE(s.reserved_qty,0)::numeric AS reserved_qty
         FROM aif_stock s
         JOIN aif_locations l ON l.id=s.location_id
         WHERE s.variant_id=$1
         FOR UPDATE OF s`,
        [variantId]
      );

      let stockMovementsCreated = 0;
      for (const stockRow of stockRowsForRemoval.rows) {
        const beforeQty = Number(stockRow.qty || 0);
        const beforeReserved = Number(stockRow.reserved_qty || 0);
        if (beforeQty === 0 && beforeReserved === 0) continue;
        const logged = await insertStockMovementSafe(client, {
          movementType: "manual_adjustment",
          sourceType: "variant_archive_stock_clear",
          sourcePrefix: "archive_clear",
          fallbackSourceType: "manual_stock_edit",
          locationId: stockRow.location_id,
          variantId,
          qtyDelta: -beforeQty,
          qtyBefore: beforeQty,
          qtyAfter: 0,
          actor: actorFrom(req),
          raw: {
            reason: "variant_archive_stock_clear",
            direction: beforeQty > 0 ? "out" : "adjust",
            locationCode: stockRow.location_code,
            locationName: stockRow.location_name,
            qtyBefore: beforeQty,
            qtyAfter: 0,
            reservedBefore: beforeReserved,
            reservedAfter: 0,
          },
        });
        if (logged) stockMovementsCreated++;
      }

      await client.query(
        `UPDATE aif_product_variants
         SET status='archived', updated_at=now()
         WHERE id=$1`,
        [variantId]
      );
      await client.query(
        `UPDATE aif_stock
         SET qty=0, reserved_qty=0, updated_at=now()
         WHERE variant_id=$1`,
        [variantId]
      );
      await client.query(
        `UPDATE aif_variant_supplier_codes
         SET is_active=false, updated_at=now()
         WHERE variant_id=$1`,
        [variantId]
      );

      const activeSiblings = await client.query(
        `SELECT count(*)::int AS c
         FROM aif_product_variants
         WHERE model_id=$1 AND id <> $2 AND status <> 'archived'`,
        [modelId, variantId]
      );
      if (Number(activeSiblings.rows[0]?.c || 0) <= 0) {
        await client.query(
          `UPDATE aif_product_models
           SET status='archived', updated_at=now()
           WHERE id=$1`,
          [modelId]
        );
      }

      await client.query("COMMIT");
      res.json({
        ok: true,
        mode: "archived",
        usage: {
          stock_rows: Number(stockUsage.rows[0]?.stock_rows || 0),
          qty: Number(stockUsage.rows[0]?.qty || 0),
          reserved_qty: Number(stockUsage.rows[0]?.reserved_qty || 0),
          movements: Number(movementUsage.rows[0]?.movements || 0),
          stock_movements_created: stockMovementsCreated,
          import_rows: Number(importUsage.rows[0]?.import_rows || 0),
        },
      });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete variant failed", e);
      res.status(500).json({ error: e?.message || "failed to delete variant", code: e?.code || null });
    } finally {
      client.release();
    }
  });


  async function loadSelectedVariants(req, res) {
    const ownerKey = selectionOwnerKey(req);
    try {
      await ensureSelectedVariantsTable(pool);
      const r = await loadSelectedVariantRows(pool, ownerKey);
      res.json(selectedVariantResponseFromRows(r.rows));
    } catch (e) {
      console.error("AIF selected variants load failed", e);
      res.status(500).json({ error: "A kijelölt termékek betöltése nem sikerült." });
    }
  }

  router.get("/selection", requireAuthed, loadSelectedVariants);
  router.get("/selected-variants", requireAuthed, loadSelectedVariants);

  async function saveSelectedVariants(req, res) {
    const ownerKey = selectionOwnerKey(req);
    const rows = selectedRowsFromBody(req.body || {});
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSelectedVariantsTable(client);

      const ids = rows.map((row) => row.variantId);
      let validIds = new Set();
      if (ids.length) {
        const valid = await client.query(
          `SELECT id::text AS id
           FROM aif_product_variants
           WHERE id::text = ANY($1::text[]) AND COALESCE(status, 'active') <> 'archived'`,
          [ids]
        );
        validIds = new Set(valid.rows.map((x) => String(x.id)));
      }

      await client.query(`DELETE FROM aif_user_selected_variants WHERE owner_key=$1`, [ownerKey]);
      let saved = 0;
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        if (!validIds.has(row.variantId)) continue;
        await client.query(
          `INSERT INTO aif_user_selected_variants (owner_key, variant_id, action, sort_order, raw, updated_at)
           VALUES ($1,$2,$3,$4,$5::jsonb,now())
           ON CONFLICT (owner_key, variant_id) DO UPDATE SET
             action=EXCLUDED.action,
             sort_order=EXCLUDED.sort_order,
             raw=EXCLUDED.raw,
             updated_at=now()`,
          [ownerKey, row.variantId, row.action, index, JSON.stringify({ source: "warehouse_ui" })]
        );
        saved++;
      }

      await client.query("COMMIT");
      const fresh = await loadSelectedVariantRows(client, ownerKey);
      res.json({ ...selectedVariantResponseFromRows(fresh.rows), saved });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF selected variants save failed", e);
      res.status(500).json({ error: "A kijelölt termékek mentése nem sikerült." });
    } finally {
      client.release();
    }
  }

  router.post("/selection", requireAuthed, saveSelectedVariants);
  router.put("/selection", requireAuthed, saveSelectedVariants);
  router.post("/selected-variants", requireAuthed, saveSelectedVariants);
  router.put("/selected-variants", requireAuthed, saveSelectedVariants);

  async function clearSelectedVariants(req, res) {
    const ownerKey = selectionOwnerKey(req);
    try {
      await ensureSelectedVariantsTable(pool);
      await pool.query(`DELETE FROM aif_user_selected_variants WHERE owner_key=$1`, [ownerKey]);
      res.json({ ok: true, items: [], selectedVariantIds: [], actions: {}, updatedAt: new Date().toISOString(), count: 0 });
    } catch (e) {
      console.error("AIF selected variants clear failed", e);
      res.status(500).json({ error: "A kijelölések törlése nem sikerült." });
    }
  }

  router.delete("/selection", requireAuthed, clearSelectedVariants);
  router.delete("/selected-variants", requireAuthed, clearSelectedVariants);

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

  function aifStockProductJoinSql(baseAlias = "sm") {
    return `
       JOIN aif_locations l ON l.id=${baseAlias}.location_id
       JOIN aif_product_variants v ON v.id=${baseAlias}.variant_id
       JOIN aif_product_models m ON m.id=v.model_id
       LEFT JOIN aif_brands b ON b.id=m.brand_id
       LEFT JOIN aif_categories c ON c.id=m.category_id
       LEFT JOIN LATERAL (
         SELECT supplier_barcode, supplier_sku, supplier_product_code, supplier_variant_code
         FROM aif_variant_supplier_codes sc
         WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
         ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST
         LIMIT 1
       ) sc ON true`;
  }

  function aifStockProductSearchWhere(search, args) {
    const q = text(search);
    if (!q) return null;
    args.push(`%${q}%`);
    const p = `$${args.length}`;
    return `(
      m.title_ro ILIKE ${p}
      OR COALESCE(m.shopify_title,'') ILIKE ${p}
      OR COALESCE(b.name,'') ILIKE ${p}
      OR COALESCE(c.name_ro,'') ILIKE ${p}
      OR COALESCE(v.color_name,'') ILIKE ${p}
      OR COALESCE(v.size,'') ILIKE ${p}
      OR COALESCE(v.barcode, sc.supplier_barcode, sc.supplier_sku, '') ILIKE ${p}
      OR COALESCE(v.internal_sku,'') ILIKE ${p}
    )`;
  }

  router.get("/stock", requireAuthed, async (req, res) => {
    const location = text(req.query.location || req.query.locationCode || req.query.location_id);
    const variant = text(req.query.variant || req.query.variantId || req.query.variant_id);
    const search = text(req.query.search || req.query.q);
    const args = [];
    const where = [];
    if (location) {
      args.push(location);
      where.push(`(l.code=$${args.length} OR l.id::text=$${args.length})`);
    }
    if (variant) {
      args.push(variant);
      where.push(`(v.id::text=$${args.length} OR v.internal_sku=$${args.length} OR v.barcode=$${args.length} OR sc.supplier_barcode=$${args.length} OR sc.supplier_sku=$${args.length})`);
    }
    const searchWhere = aifStockProductSearchWhere(search, args);
    if (searchWhere) where.push(searchWhere);
    const r = await pool.query(
      `SELECT l.id AS location_id, l.code AS location_code, l.name AS location_name,
              v.id AS variant_id, v.internal_sku, v.barcode,
              COALESCE(v.barcode, sc.supplier_barcode, sc.supplier_sku) AS display_barcode,
              v.size, v.color_code, v.color_name, v.color_hex, v.image_url, v.images,
              m.id AS model_id, m.model_code, m.title_ro, m.shopify_title,
              b.name AS brand_name, b.code AS brand_code,
              c.name_ro AS category_name_ro, c.code AS category_code,
              s.qty, s.reserved_qty, (s.qty - s.reserved_qty) AS available_qty, s.updated_at
       FROM aif_stock s
       ${aifStockProductJoinSql("s")}
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY l.name ASC, m.title_ro ASC, v.color_name ASC NULLS LAST, v.size ASC`,
      args
    );
    res.json({ items: r.rows });
  });

  async function listStockMovements(req, res) {
    const location = text(req.query.location || req.query.locationCode || req.query.location_id);
    const variant = text(req.query.variant || req.query.variantId || req.query.variant_id);
    const search = text(req.query.search || req.query.q);
    const direction = normCode(req.query.direction || req.query.type || "all");
    const from = emptyToNull(req.query.from || req.query.dateFrom || req.query.date_from);
    const to = emptyToNull(req.query.to || req.query.dateTo || req.query.date_to);
    const limit = Math.min(800, Math.max(1, Number(req.query.limit || 250)));

    const args = [];
    const where = [];
    if (location) {
      args.push(location);
      where.push(`(l.code=$${args.length} OR l.id::text=$${args.length})`);
    }
    if (variant) {
      args.push(variant);
      where.push(`(v.id::text=$${args.length} OR v.internal_sku=$${args.length} OR v.barcode=$${args.length} OR sc.supplier_barcode=$${args.length} OR sc.supplier_sku=$${args.length})`);
    }
    if (from) {
      args.push(from);
      if (/^\d{4}-\d{2}-\d{2}$/.test(from)) where.push(`sm.created_at >= $${args.length}::date`);
      else where.push(`sm.created_at >= $${args.length}::timestamptz`);
    }
    if (to) {
      args.push(to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) where.push(`sm.created_at < ($${args.length}::date + interval '1 day')`);
      else where.push(`sm.created_at <= $${args.length}::timestamptz`);
    }
    if (["in", "incoming", "be", "bejovo", "bevetelezes"].includes(direction)) {
      where.push(`sm.qty_delta > 0`);
    } else if (["out", "outgoing", "ki", "kimeno", "eladas", "levonas"].includes(direction)) {
      where.push(`sm.qty_delta < 0`);
    } else if (["adjust", "adjustment", "korrekcio", "manual"].includes(direction)) {
      where.push(`(sm.qty_delta = 0 OR sm.movement_type IN ('manual_adjustment','adjustment') OR sm.source_type ILIKE '%manual%')`);
    }
    const searchWhere = aifStockProductSearchWhere(search, args);
    if (searchWhere) where.push(searchWhere);

    const fromSql = `
       FROM aif_stock_movements sm
       ${aifStockProductJoinSql("sm")}
       ${where.length ? "WHERE " + where.join(" AND ") : ""}`;

    try {
      const totals = await pool.query(
        `SELECT
           count(*)::int AS movement_count,
           count(DISTINCT sm.variant_id)::int AS distinct_variants,
           COALESCE(sum(CASE WHEN sm.qty_delta > 0 THEN sm.qty_delta ELSE 0 END),0)::numeric AS incoming_qty,
           COALESCE(sum(CASE WHEN sm.qty_delta < 0 THEN abs(sm.qty_delta) ELSE 0 END),0)::numeric AS outgoing_qty,
           COALESCE(sum(sm.qty_delta),0)::numeric AS net_qty
         ${fromSql}`,
        args
      );

      const rowArgs = [...args, limit];
      const rows = await pool.query(
        `SELECT sm.id, sm.created_at, sm.movement_type, sm.source_type, sm.source_id,
                sm.qty_delta, sm.qty_before, sm.qty_after, sm.actor, sm.raw,
                CASE WHEN sm.qty_delta > 0 THEN 'in' WHEN sm.qty_delta < 0 THEN 'out' ELSE 'adjust' END AS direction,
                l.id AS location_id, l.code AS location_code, l.name AS location_name,
                v.id AS variant_id, v.internal_sku, v.barcode,
                COALESCE(v.barcode, sc.supplier_barcode, sc.supplier_sku) AS display_barcode,
                v.size, v.color_code, v.color_name, v.color_hex, v.image_url, v.images,
                m.id AS model_id, m.model_code, m.title_ro, m.shopify_title,
                b.name AS brand_name, b.code AS brand_code,
                c.name_ro AS category_name_ro, c.code AS category_code
         ${fromSql}
         ORDER BY sm.created_at DESC, sm.id DESC
         LIMIT $${rowArgs.length}`,
        rowArgs
      );

      res.json({ items: rows.rows, totals: totals.rows[0] || {} });
    } catch (e) {
      console.error("AIF stock movements failed", e);
      res.status(500).json({ error: e?.message || "A készletmozgások betöltése nem sikerült.", code: e?.code || null });
    }
  }

  router.get("/stock-movements", requireAuthed, listStockMovements);
  router.get("/stock/movements", requireAuthed, listStockMovements);

  router.get("/health", requireAuthed, async (_req, res) => {
    const r = await pool.query(`SELECT count(*)::int AS suppliers FROM aif_suppliers`);
    res.json({ ok: true, suppliers: r.rows[0].suppliers });
  });

  return router;
}
