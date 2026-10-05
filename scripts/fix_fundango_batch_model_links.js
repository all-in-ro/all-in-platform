import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BATCH = "fbbc43a5-cfd6-4122-87fc-64571ffe87e1";
const EXPECTED_LEGACY_ROWS = 18;

function txt(v) {
  return String(v ?? "").trim();
}

function norm(v) {
  return txt(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function splitProductCode(value) {
  const raw = txt(value);
  if (!raw) return { fullCode: null, modelCode: null };
  const match = raw.match(/^(.+)-([A-Za-z0-9]{1,16})$/);
  if (!match) return { fullCode: raw, modelCode: raw };
  return { fullCode: raw, modelCode: txt(match[1]) };
}

function canonicalGender(value, fallback = "unisex") {
  const key = norm(value || fallback);
  const map = {
    men: "men", man: "men", male: "men", masculin: "men", barbati: "men", barbat: "men", ferfi: "men",
    women: "women", woman: "women", female: "women", feminin: "women", femei: "women", femeie: "women", dama: "women",
    kids: "kids", kid: "kids", copii: "kids", copil: "kids", gyerek: "kids", junior: "kids", youth: "kids",
    unisex: "unisex", universal: "unisex", mixt: "unisex", mixed: "unisex",
  };
  return map[key] || (["men", "women", "kids", "unisex"].includes(key) ? key : canonicalGender(fallback, "unisex"));
}

async function resolveCategoryId(client, candidates = []) {
  for (const candidateRaw of candidates) {
    const candidate = txt(candidateRaw);
    if (!candidate) continue;
    const key = norm(candidate);
    const r = await client.query(
      `SELECT id
       FROM aif_categories
       WHERE id::text=$1
          OR code=$1
          OR code=$2
          OR lower(name_ro)=lower($1)
          OR lower(COALESCE(name_hu,''))=lower($1)
       ORDER BY is_active DESC, sort_order ASC
       LIMIT 1`,
      [candidate, key]
    );
    if (r.rowCount) return r.rows[0].id;
  }
  return null;
}

function sameColor(candidate, row, normalized) {
  const cCode = norm(candidate?.color_code || "");
  const cName = norm(candidate?.color_name || "");
  const incomingCode = norm(normalized?.colorCode || normalized?.supplierColorCode || row?.color_code || "");
  const incomingName = norm(normalized?.colorName || row?.color_name || "");
  const oldCode = norm(row?.color_code || "");
  const oldName = norm(row?.color_name || "");

  return Boolean(
    (cCode && incomingCode && cCode === incomingCode) ||
    (cCode && oldCode && cCode === oldCode) ||
    (cName && incomingName && cName === incomingName) ||
    (cName && oldName && cName === oldName)
  );
}

const client = await pool.connect();

try {
  await client.query("BEGIN");

  console.log("\n======================================================");
  console.log("FUNDANGO IMPORT MODELLNORMALIZÁLÁS");
  console.log("======================================================");

  const batchRes = await client.query(
    `SELECT b.id, b.status, b.supplier_id, s.code AS supplier_code, s.name AS supplier_name
     FROM aif_import_batches b
     JOIN aif_suppliers s ON s.id=b.supplier_id
     WHERE b.id::text=$1
     FOR UPDATE OF b`,
    [BATCH]
  );

  if (!batchRes.rowCount) throw new Error("Batch nem található.");
  const batch = batchRes.rows[0];

  if (batch.status !== "committed") {
    throw new Error(`A batch státusza nem committed, hanem: ${batch.status}`);
  }

  const rowsRes = await client.query(
    `SELECT
       r.id AS import_row_id,
       r.row_no,
       r.variant_id,
       r.normalized,
       r.supplier_product_code,

       v.barcode,
       v.internal_sku,
       v.size,
       v.color_code,
       v.color_name,
       v.attributes,
       v.status AS variant_status,

       m.id AS current_model_id,
       m.model_code AS current_model_code,
       m.title_ro AS current_title,
       m.title_hu AS current_title_hu,
       m.description_ro AS current_description,
       m.gender AS current_gender,
       m.product_type AS current_product_type,
       m.season AS current_season,
       m.material AS current_material,
       m.shopify_title AS current_shopify_title,
       m.brand_id,
       m.category_id,
       m.subcategory_id,

       b.code AS brand_code,
       b.name AS brand_name

     FROM aif_import_rows r
     JOIN aif_product_variants v ON v.id=r.variant_id
     JOIN aif_product_models m ON m.id=v.model_id
     LEFT JOIN aif_brands b ON b.id=m.brand_id

     WHERE r.batch_id::text=$1
       AND r.status='committed'
       AND COALESCE(r.normalized->>'legacyBarcodeStockMatch','false')='true'

     ORDER BY r.row_no
     FOR UPDATE OF r, v, m`,
    [BATCH]
  );

  if (rowsRes.rowCount !== EXPECTED_LEGACY_ROWS) {
    throw new Error(
      `Biztonsági STOP: ${rowsRes.rowCount} legacy sort találtam, elvárt: ${EXPECTED_LEGACY_ROWS}.`
    );
  }

  const variantIds = rowsRes.rows.map(r => r.variant_id);

  const stockBefore = await client.query(
    `SELECT
       count(*)::int AS rows,
       COALESCE(sum(qty),0)::int AS qty,
       COALESCE(sum(reserved_qty),0)::int AS reserved
     FROM aif_stock
     WHERE variant_id = ANY($1::uuid[])`,
    [variantIds]
  );

  const movementBefore = await client.query(
    `SELECT count(*)::int AS rows
     FROM aif_stock_movements
     WHERE variant_id = ANY($1::uuid[])`,
    [variantIds]
  );

  const summary = [];
  const touchedOldModels = new Set();
  const targetModels = new Map();
  let moved = 0;
  let alreadyNormalized = 0;

  for (const row of rowsRes.rows) {
    const n = row.normalized || {};

    const baseModelCode = txt(
      n.modelCode ||
      n.model_code ||
      splitProductCode(row.supplier_product_code).modelCode ||
      row.supplier_product_code ||
      n.titleRo
    );

    const brandKey = norm(
      n.brandCode ||
      n.brand_code ||
      n.brandName ||
      n.brand_name ||
      row.brand_code ||
      row.brand_name ||
      batch.supplier_code ||
      "aif"
    );

    if (!baseModelCode || !brandKey) {
      throw new Error(`Sor ${row.row_no}: canonical model kód nem képezhető.`);
    }

    const canonicalModelCode = `${brandKey}:${norm(baseModelCode)}`;

    const categoryId =
      await resolveCategoryId(client, [
        n.categoryId, n.category_id,
        n.categoryCode, n.category_code,
        n.categoryName, n.category_name,
      ]) || row.category_id || null;

    const subcategoryId =
      await resolveCategoryId(client, [
        n.subcategoryId, n.subcategory_id,
        n.subCategoryId, n.sub_category_id,
        n.subcategoryCode, n.subcategory_code,
        n.subCategoryCode, n.sub_category_code,
        n.subcategoryName, n.subcategory_name,
        n.subCategoryName, n.sub_category_name,
      ]) || row.subcategory_id || null;

    const titleRo = txt(n.titleRo || n.title_ro || row.current_title);
    if (!titleRo) throw new Error(`Sor ${row.row_no}: új terméknév hiányzik.`);

    const modelPayload = {
      brandId: row.brand_id,
      categoryId,
      subcategoryId,
      titleRo,
      titleHu: txt(n.titleHu || n.title_hu || row.current_title_hu) || null,
      descriptionRo: txt(n.descriptionRo || n.description_ro || row.current_description) || null,
      gender: canonicalGender(n.gender || row.current_gender || "unisex"),
      productType: txt(n.productType || n.product_type || row.current_product_type) || null,
      season: txt(n.season || row.current_season) || null,
      material: txt(n.material || row.current_material) || null,
      shopifyTitle: titleRo,
    };

    let targetRes = await client.query(
      `SELECT id, model_code, title_ro
       FROM aif_product_models
       WHERE model_code=$1
       LIMIT 1
       FOR UPDATE`,
      [canonicalModelCode]
    );

    let targetModelId;
    let targetCreated = false;

    if (targetRes.rowCount) {
      targetModelId = targetRes.rows[0].id;
      await client.query(
        `UPDATE aif_product_models
         SET brand_id=COALESCE($2,brand_id),
             category_id=COALESCE($3,category_id),
             subcategory_id=COALESCE($4,subcategory_id),
             title_ro=$5,
             title_hu=COALESCE($6,title_hu),
             description_ro=COALESCE($7,description_ro),
             gender=$8,
             product_type=COALESCE($9,product_type),
             season=COALESCE($10,season),
             material=COALESCE($11,material),
             shopify_title=COALESCE($12,shopify_title),
             status='active',
             updated_at=now()
         WHERE id=$1`,
        [
          targetModelId,
          modelPayload.brandId,
          modelPayload.categoryId,
          modelPayload.subcategoryId,
          modelPayload.titleRo,
          modelPayload.titleHu,
          modelPayload.descriptionRo,
          modelPayload.gender,
          modelPayload.productType,
          modelPayload.season,
          modelPayload.material,
          modelPayload.shopifyTitle,
        ]
      );
    } else {
      const inserted = await client.query(
        `INSERT INTO aif_product_models (
           brand_id, category_id, subcategory_id, model_code,
           title_ro, title_hu, description_ro,
           gender, product_type, season, material, shopify_title, status
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active')
         RETURNING id`,
        [
          modelPayload.brandId,
          modelPayload.categoryId,
          modelPayload.subcategoryId,
          canonicalModelCode,
          modelPayload.titleRo,
          modelPayload.titleHu,
          modelPayload.descriptionRo,
          modelPayload.gender,
          modelPayload.productType,
          modelPayload.season,
          modelPayload.material,
          modelPayload.shopifyTitle,
        ]
      );
      targetModelId = inserted.rows[0].id;
      targetCreated = true;
    }

    targetModels.set(canonicalModelCode, {
      id: String(targetModelId),
      title: titleRo,
      created: targetCreated || targetModels.get(canonicalModelCode)?.created || false,
    });

    if (String(row.current_model_id) === String(targetModelId)) {
      alreadyNormalized++;
      summary.push({
        row: row.row_no,
        barcode: row.barcode,
        from: row.current_model_code,
        to: canonicalModelCode,
        title: titleRo,
        action: "MÁR JÓ",
      });
      continue;
    }

    const candidates = await client.query(
      `SELECT id, barcode, internal_sku, size, color_code, color_name
       FROM aif_product_variants
       WHERE model_id=$1
         AND id<>$2
         AND lower(btrim(COALESCE(size,'')))=lower(btrim($3))
       ORDER BY created_at ASC, id::text ASC`,
      [targetModelId, row.variant_id, row.size]
    );

    const collision = candidates.rows.find(candidate => sameColor(candidate, row, n)) || null;

    if (collision) {
      throw new Error(
        `Sor ${row.row_no}: ÜTKÖZÉS a célmodellben. ` +
        `${collision.internal_sku || collision.barcode || collision.id}`
      );
    }

    const existingAttrs =
      row.attributes && typeof row.attributes === "object" && !Array.isArray(row.attributes)
        ? row.attributes
        : {};

    const history = Array.isArray(existingAttrs.legacyModelHistory)
      ? [...existingAttrs.legacyModelHistory]
      : [];

    const oldEntry = {
      modelId: String(row.current_model_id),
      modelCode: row.current_model_code || null,
      titleRo: row.current_title || null,
    };

    const remembered = history.some(entry =>
      entry &&
      (
        String(entry.modelId || "") === oldEntry.modelId ||
        (oldEntry.modelCode && norm(entry.modelCode || "") === norm(oldEntry.modelCode))
      )
    );

    if (!remembered) history.push(oldEntry);

    const attrsPatch = {
      legacyModelHistory: history,
      legacyModelCode: existingAttrs.legacyModelCode || row.current_model_code || null,
      legacyModelTitle: existingAttrs.legacyModelTitle || row.current_title || null,
      canonicalModelId: String(targetModelId),
      canonicalModelCode,
    };

    await client.query(
      `UPDATE aif_product_variants
       SET model_id=$2,
           attributes=COALESCE(attributes,'{}'::jsonb) || $3::jsonb,
           status='active',
           updated_at=now()
       WHERE id=$1`,
      [row.variant_id, targetModelId, JSON.stringify(attrsPatch)]
    );

    await client.query(
      `UPDATE aif_import_rows
       SET normalized=COALESCE(normalized,'{}'::jsonb) || $2::jsonb,
           updated_at=now()
       WHERE id=$1`,
      [
        row.import_row_id,
        JSON.stringify({
          legacyBarcodeExistingModelId: String(row.current_model_id),
          legacyBarcodeExistingModelCode: row.current_model_code || null,
          legacyBarcodeCanonicalModelId: String(targetModelId),
          legacyBarcodeCanonicalModelCode: canonicalModelCode,
          legacyBarcodeCanonicalModelTitle: titleRo,
          legacyBarcodeModelNormalized: true,
          legacyBarcodeModelNormalizedBy: "one_time_batch_repair",
        }),
      ]
    );

    touchedOldModels.add(String(row.current_model_id));
    moved++;

    summary.push({
      row: row.row_no,
      barcode: row.barcode,
      from: row.current_model_code,
      to: canonicalModelCode,
      title: titleRo,
      action: targetCreated ? "ÚJ MODELL + ÁTTEVE" : "ÁTTEVE",
    });
  }

  for (const oldModelId of touchedOldModels) {
    await client.query(
      `UPDATE aif_product_models m
       SET status='archived', updated_at=now()
       WHERE m.id::text=$1
         AND NOT EXISTS (
           SELECT 1 FROM aif_product_variants v WHERE v.model_id=m.id
         )`,
      [oldModelId]
    );
  }

  console.log("\n======================================================");
  console.log("TERVEZETT / VÉGREHAJTOTT ÁTRENDEZÉS");
  console.log("======================================================");
  console.table(summary);

  const verify = await client.query(
    `SELECT
       r.row_no,
       r.normalized->>'barcode' AS barcode,
       r.normalized->>'titleRo' AS imported_title,
       m.model_code,
       m.title_ro AS current_title,
       v.internal_sku
     FROM aif_import_rows r
     JOIN aif_product_variants v ON v.id=r.variant_id
     JOIN aif_product_models m ON m.id=v.model_id
     WHERE r.batch_id::text=$1
       AND r.status='committed'
       AND COALESCE(r.normalized->>'legacyBarcodeStockMatch','false')='true'
     ORDER BY r.row_no`,
    [BATCH]
  );

  const bad = verify.rows.filter(r => {
    const titleOk = txt(r.current_title).toLowerCase() === txt(r.imported_title).toLowerCase();
    const n = rowsRes.rows.find(x => Number(x.row_no) === Number(r.row_no))?.normalized || {};
    const brandKey = norm(
      n.brandCode || n.brand_code || n.brandName || n.brand_name ||
      rowsRes.rows.find(x => Number(x.row_no) === Number(r.row_no))?.brand_code ||
      rowsRes.rows.find(x => Number(x.row_no) === Number(r.row_no))?.brand_name ||
      batch.supplier_code || "aif"
    );
    const base = txt(
      n.modelCode || n.model_code ||
      splitProductCode(rowsRes.rows.find(x => Number(x.row_no) === Number(r.row_no))?.supplier_product_code).modelCode ||
      rowsRes.rows.find(x => Number(x.row_no) === Number(r.row_no))?.supplier_product_code ||
      n.titleRo
    );
    const expectedCode = `${brandKey}:${norm(base)}`;
    return !titleOk || norm(r.model_code) !== norm(expectedCode);
  });

  if (bad.length) {
    console.table(bad);
    throw new Error(`${bad.length} sornál a modellnév/kód ellenőrzése nem sikerült.`);
  }

  const stockAfter = await client.query(
    `SELECT
       count(*)::int AS rows,
       COALESCE(sum(qty),0)::int AS qty,
       COALESCE(sum(reserved_qty),0)::int AS reserved
     FROM aif_stock
     WHERE variant_id = ANY($1::uuid[])`,
    [variantIds]
  );

  const movementAfter = await client.query(
    `SELECT count(*)::int AS rows
     FROM aif_stock_movements
     WHERE variant_id = ANY($1::uuid[])`,
    [variantIds]
  );

  const before = stockBefore.rows[0];
  const after = stockAfter.rows[0];

  if (
    Number(before.rows) !== Number(after.rows) ||
    Number(before.qty) !== Number(after.qty) ||
    Number(before.reserved) !== Number(after.reserved) ||
    Number(movementBefore.rows[0]?.rows || 0) !== Number(movementAfter.rows[0]?.rows || 0)
  ) {
    throw new Error("Biztonsági STOP: a készlet vagy készletmozgások megváltoztak.");
  }

  console.log("\n======================================================");
  console.log("ÖSSZESÍTÉS");
  console.log("======================================================");
  console.log(`Legacy sorok: ${rowsRes.rowCount}`);
  console.log(`Áthelyezett variánsok: ${moved}`);
  console.log(`Már normalizált variánsok: ${alreadyNormalized}`);
  console.log(`Érintett canonical modellek: ${targetModels.size}`);
  console.table(Array.from(targetModels.entries()).map(([model_code, info]) => ({
    model_code,
    title: info.title,
    created_now: info.created ? "IGEN" : "NEM",
  })));

  console.log("\nKészlet előtte:", before);
  console.log("Készlet utána:", after);
  console.log("Készletmozgás sorok előtte:", movementBefore.rows[0]?.rows || 0);
  console.log("Készletmozgás sorok utána:", movementAfter.rows[0]?.rows || 0);

  await client.query("COMMIT");

  console.log("\n======================================================");
  console.log("✅ SIKERES MODELLNORMALIZÁLÁS");
  console.log("======================================================");
  console.log("✅ Az érintett régi variánsok az aktuális modellek alá kerültek.");
  console.log("✅ Az új importnév lett a jelenlegi terméknév.");
  console.log("✅ internal_sku / vonalkód / készlet változatlan.");
  console.log("✅ A régi modelladatok a variáns attributes előzményében megmaradtak.");
  console.log("✅ Készletmozgás nem keletkezett.");
  console.log("======================================================\n");

} catch (e) {
  try { await client.query("ROLLBACK"); } catch {}
  console.error("\n❌ ROLLBACK. NEM MARADT FÉLBEHAGYOTT MÓDOSÍTÁS:");
  console.error(e?.stack || e);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
