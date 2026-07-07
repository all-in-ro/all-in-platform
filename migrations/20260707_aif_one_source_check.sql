\pset pager off
\echo '============================================================'
\echo 'AIF ONE SOURCE CHECK - import / stockmoves / warehouse'
\echo '============================================================'

\echo ''
\echo '--- 0) Alap tablák / view-k leteznek-e ---'
SELECT *
FROM (
  VALUES
    ('aif_import_batches'),
    ('aif_import_rows'),
    ('aif_receptions'),
    ('aif_product_models'),
    ('aif_product_variants'),
    ('aif_variant_supplier_codes'),
    ('aif_stock'),
    ('aif_stock_movements'),
    ('aif_inventory_summary'),
    ('aif_brands'),
    ('aif_categories'),
    ('aif_locations')
) AS x(object_name)
CROSS JOIN LATERAL (
  SELECT CASE WHEN to_regclass(x.object_name) IS NULL THEN 'HIANYZIK' ELSE 'OK' END AS status
) s
ORDER BY object_name;

\echo ''
\echo '--- 1) Legutobbi keszletre vett import batch ---'
WITH lb AS (
  SELECT *
  FROM aif_import_batches
  WHERE status = 'committed'
  ORDER BY COALESCE(committed_at, created_at) DESC
  LIMIT 1
)
SELECT
  b.id,
  b.created_at,
  b.committed_at,
  b.status,
  b.row_count,
  b.error_count,
  b.source_file_name,
  s.name AS supplier,
  l.name AS target_location,
  r.invoice_number,
  r.status AS reception_status
FROM lb b
LEFT JOIN aif_suppliers s ON s.id = b.supplier_id
LEFT JOIN aif_locations l ON l.id = b.target_location_id
LEFT JOIN aif_receptions r ON r.id = b.reception_id;

\echo ''
\echo '--- 2) Legutobbi batch osszesites: Import sor / varians / qty / mozgas ---'
WITH lb AS (
  SELECT *
  FROM aif_import_batches
  WHERE status = 'committed'
  ORDER BY COALESCE(committed_at, created_at) DESC
  LIMIT 1
),
ir AS (
  SELECT rw.*
  FROM aif_import_rows rw
  JOIN lb ON lb.id = rw.batch_id
),
mv AS (
  SELECT
    sm.variant_id,
    COUNT(*) AS movement_rows,
    SUM(sm.qty_delta)::numeric AS movement_qty
  FROM aif_stock_movements sm
  JOIN lb ON sm.source_id::text = lb.id::text
       OR sm.raw->>'importBatchId' = lb.id::text
       OR sm.raw->>'import_batch_id' = lb.id::text
  GROUP BY sm.variant_id
)
SELECT
  (SELECT id FROM lb) AS batch_id,
  (SELECT source_file_name FROM lb) AS source_file_name,
  COUNT(ir.id) AS import_rows,
  COUNT(*) FILTER (WHERE ir.status = 'committed') AS committed_rows,
  COUNT(*) FILTER (WHERE ir.status <> 'committed') AS not_committed_rows,
  COUNT(DISTINCT ir.variant_id) AS distinct_import_variants,
  COALESCE(SUM(ir.qty), 0) AS import_qty,
  COALESCE((SELECT SUM(movement_rows) FROM mv), 0) AS stockmovement_rows,
  COALESCE((SELECT SUM(movement_qty) FROM mv), 0) AS stockmovement_qty
FROM ir;

\echo ''
\echo '--- 3) Import sorok, amelyek nincsenek rendesen rakotve termekre / variansra ---'
WITH lb AS (
  SELECT *
  FROM aif_import_batches
  WHERE status = 'committed'
  ORDER BY COALESCE(committed_at, created_at) DESC
  LIMIT 1
)
SELECT
  rw.row_no,
  rw.status AS import_status,
  rw.supplier_product_code,
  rw.supplier_color_code,
  rw.supplier_size,
  rw.qty,
  rw.variant_id,
  v.id AS variant_exists,
  v.status AS variant_status,
  m.id AS model_exists,
  m.status AS model_status,
  CASE
    WHEN rw.variant_id IS NULL THEN 'IMPORT_ROW_VARIANT_ID_NULL'
    WHEN v.id IS NULL THEN 'VARIANT_HIANYZIK'
    WHEN m.id IS NULL THEN 'MODEL_HIANYZIK'
    WHEN lower(COALESCE(v.status,'')) = 'archived' THEN 'VARIANS_ARCHIVALVA'
    WHEN lower(COALESCE(m.status,'')) = 'archived' THEN 'MODELL_ARCHIVALVA'
    ELSE 'OK'
  END AS problem
FROM aif_import_rows rw
JOIN lb ON lb.id = rw.batch_id
LEFT JOIN aif_product_variants v ON v.id = rw.variant_id
LEFT JOIN aif_product_models m ON m.id = v.model_id
WHERE rw.variant_id IS NULL
   OR v.id IS NULL
   OR m.id IS NULL
   OR lower(COALESCE(v.status,'')) = 'archived'
   OR lower(COALESCE(m.status,'')) = 'archived'
ORDER BY rw.row_no;

\echo ''
\echo '--- 4) Soronkent: Incoming -> Variant -> StockMoves -> Stock -> Warehouse view ---'
WITH lb AS (
  SELECT *
  FROM aif_import_batches
  WHERE status = 'committed'
  ORDER BY COALESCE(committed_at, created_at) DESC
  LIMIT 1
),
mv AS (
  SELECT
    sm.variant_id,
    COUNT(*) AS movement_rows,
    SUM(sm.qty_delta)::numeric AS movement_qty,
    MAX(sm.qty_after)::numeric AS last_qty_after,
    MAX(sm.created_at) AS last_movement_at
  FROM aif_stock_movements sm
  JOIN lb ON sm.source_id::text = lb.id::text
       OR sm.raw->>'importBatchId' = lb.id::text
       OR sm.raw->>'import_batch_id' = lb.id::text
  GROUP BY sm.variant_id
),
stock_target AS (
  SELECT st.variant_id, st.qty, st.reserved_qty, (st.qty - st.reserved_qty) AS available_qty, st.location_id
  FROM aif_stock st
  JOIN lb ON lb.target_location_id = st.location_id
)
SELECT
  rw.row_no,
  rw.status AS import_status,
  rw.supplier_product_code AS import_termekkod,
  rw.supplier_color_code AS import_szinkod,
  rw.supplier_size AS import_meret,
  rw.qty AS import_qty,
  left(rw.variant_id::text, 8) AS variant_short,
  br.name AS brand,
  m.title_ro AS model_name,
  m.status AS model_status,
  v.status AS variant_status,
  v.color_code,
  v.color_name,
  v.size,
  v.barcode,
  v.sn_cod,
  vsc.supplier_product_code AS supplier_link_termekkod,
  vsc.supplier_color_code AS supplier_link_szinkod,
  vsc.supplier_size AS supplier_link_meret,
  COALESCE(mv.movement_rows, 0) AS movement_rows,
  COALESCE(mv.movement_qty, 0) AS movement_qty,
  COALESCE(st.qty, 0) AS stock_qty_at_target,
  CASE WHEN inv.variant_id IS NULL THEN 'NINCS_VIEW' ELSE 'VAN_VIEW' END AS warehouse_view,
  inv.total_qty AS inv_total_qty,
  inv.available_qty AS inv_available_qty,
  CASE
    WHEN rw.variant_id IS NULL THEN 'BAJ: import row nincs variansra kotve'
    WHEN v.id IS NULL THEN 'BAJ: variant nincs'
    WHEN m.id IS NULL THEN 'BAJ: model nincs'
    WHEN inv.variant_id IS NULL THEN 'BAJ: warehouse view nem latja'
    WHEN COALESCE(mv.movement_qty, 0) <> COALESCE(rw.qty, 0) THEN 'BAJ: import qty != movement qty'
    WHEN vsc.variant_id IS NULL THEN 'FIGYELEM: nincs beszallitoi kod kapcsolat'
    ELSE 'OK'
  END AS status_check
FROM aif_import_rows rw
JOIN lb ON lb.id = rw.batch_id
LEFT JOIN aif_product_variants v ON v.id = rw.variant_id
LEFT JOIN aif_product_models m ON m.id = v.model_id
LEFT JOIN aif_brands br ON br.id = m.brand_id
LEFT JOIN mv ON mv.variant_id = rw.variant_id
LEFT JOIN stock_target st ON st.variant_id = rw.variant_id
LEFT JOIN aif_inventory_summary inv ON inv.variant_id::text = rw.variant_id::text
LEFT JOIN LATERAL (
  SELECT *
  FROM aif_variant_supplier_codes x
  WHERE x.variant_id = rw.variant_id
  ORDER BY x.is_active DESC, x.updated_at DESC NULLS LAST, x.created_at DESC NULLS LAST
  LIMIT 1
) vsc ON TRUE
ORDER BY rw.row_no;

\echo ''
\echo '--- 5) Warehouse view statusz logika: mi miert latszik / nem latszik ---'
WITH lb AS (
  SELECT *
  FROM aif_import_batches
  WHERE status = 'committed'
  ORDER BY COALESCE(committed_at, created_at) DESC
  LIMIT 1
)
SELECT
  COUNT(*) AS import_variants,
  COUNT(*) FILTER (WHERE lower(COALESCE(m.status,'')) = 'active') AS model_active,
  COUNT(*) FILTER (WHERE lower(COALESCE(v.status,'')) = 'active') AS variant_active,
  COUNT(*) FILTER (WHERE inv.variant_id IS NOT NULL) AS exists_in_inventory_view,
  COUNT(*) FILTER (
    WHERE lower(COALESCE(m.status,'')) = 'active'
      AND lower(COALESCE(v.status,'')) = 'active'
      AND inv.variant_id IS NOT NULL
  ) AS should_show_in_main_warehouse,
  COUNT(*) FILTER (
    WHERE lower(COALESCE(m.status,'')) <> 'active'
       OR lower(COALESCE(v.status,'')) <> 'active'
  ) AS activation_worklist_count
FROM aif_import_rows rw
JOIN lb ON lb.id = rw.batch_id
LEFT JOIN aif_product_variants v ON v.id = rw.variant_id
LEFT JOIN aif_product_models m ON m.id = v.model_id
LEFT JOIN aif_inventory_summary inv ON inv.variant_id::text = rw.variant_id::text;

\echo ''
\echo '--- 6) Aktiv keszletes variansok, amelyeket a Warehouse view NEM lat ---'
SELECT
  left(v.id::text, 8) AS variant_short,
  br.name AS brand,
  m.title_ro,
  m.status AS model_status,
  v.status AS variant_status,
  v.color_name,
  v.color_code,
  v.size,
  SUM(st.qty)::numeric AS stock_qty,
  SUM(st.reserved_qty)::numeric AS reserved_qty
FROM aif_stock st
JOIN aif_product_variants v ON v.id = st.variant_id
JOIN aif_product_models m ON m.id = v.model_id
LEFT JOIN aif_brands br ON br.id = m.brand_id
LEFT JOIN aif_inventory_summary inv ON inv.variant_id::text = v.id::text
WHERE COALESCE(st.qty, 0) <> 0
  AND lower(COALESCE(v.status,'')) = 'active'
  AND lower(COALESCE(m.status,'')) = 'active'
  AND inv.variant_id IS NULL
GROUP BY v.id, br.name, m.title_ro, m.status, v.status, v.color_name, v.color_code, v.size
ORDER BY br.name, m.title_ro, v.color_name, v.size
LIMIT 100;

\echo ''
\echo '--- 7) Warehouse view sorok, amelyek mogott nincs stock vagy elteres van ---'
SELECT
  left(inv.variant_id::text, 8) AS variant_short,
  inv.brand_name,
  inv.title_ro,
  inv.color_name,
  inv.color_code,
  inv.size,
  inv.total_qty AS inventory_total_qty,
  COALESCE(SUM(st.qty), 0)::numeric AS real_stock_qty,
  inv.available_qty AS inventory_available_qty,
  COALESCE(SUM(st.qty - st.reserved_qty), 0)::numeric AS real_available_qty,
  CASE
    WHEN COALESCE(inv.total_qty,0)::numeric <> COALESCE(SUM(st.qty),0)::numeric THEN 'BAJ: total_qty elteres'
    WHEN COALESCE(inv.available_qty,0)::numeric <> COALESCE(SUM(st.qty - st.reserved_qty),0)::numeric THEN 'BAJ: available_qty elteres'
    ELSE 'OK'
  END AS status_check
FROM aif_inventory_summary inv
LEFT JOIN aif_stock st ON st.variant_id::text = inv.variant_id::text
GROUP BY inv.variant_id, inv.brand_name, inv.title_ro, inv.color_name, inv.color_code, inv.size, inv.total_qty, inv.available_qty
HAVING COALESCE(inv.total_qty,0)::numeric <> COALESCE(SUM(st.qty),0)::numeric
    OR COALESCE(inv.available_qty,0)::numeric <> COALESCE(SUM(st.qty - st.reserved_qty),0)::numeric
ORDER BY inv.brand_name, inv.title_ro, inv.size
LIMIT 100;

\echo ''
\echo '--- 8) Beszallitoi termekkod / szin / meret tobb variansra mutat-e ---'
SELECT
  s.name AS supplier,
  vsc.supplier_product_code,
  vsc.supplier_color_code,
  vsc.supplier_size,
  COUNT(DISTINCT vsc.variant_id) AS distinct_variants,
  STRING_AGG(left(vsc.variant_id::text, 8), ', ' ORDER BY left(vsc.variant_id::text, 8)) AS variants
FROM aif_variant_supplier_codes vsc
LEFT JOIN aif_suppliers s ON s.id = vsc.supplier_id
WHERE vsc.is_active IS DISTINCT FROM false
GROUP BY s.name, vsc.supplier_product_code, vsc.supplier_color_code, vsc.supplier_size
HAVING COUNT(DISTINCT vsc.variant_id) > 1
ORDER BY distinct_variants DESC, supplier, supplier_product_code
LIMIT 100;

\echo ''
\echo '--- 9) Ugyanaz a varians tobb aktiv beszallitoi termekkoddal ---'
SELECT
  left(vsc.variant_id::text, 8) AS variant_short,
  br.name AS brand,
  m.title_ro,
  v.color_name,
  v.color_code,
  v.size,
  COUNT(*) AS active_supplier_links,
  STRING_AGG(
    COALESCE(vsc.supplier_product_code,'-') || ' / ' ||
    COALESCE(vsc.supplier_color_code,'-') || ' / ' ||
    COALESCE(vsc.supplier_size,'-'),
    ' | '
    ORDER BY vsc.updated_at DESC NULLS LAST
  ) AS links
FROM aif_variant_supplier_codes vsc
LEFT JOIN aif_product_variants v ON v.id = vsc.variant_id
LEFT JOIN aif_product_models m ON m.id = v.model_id
LEFT JOIN aif_brands br ON br.id = m.brand_id
WHERE vsc.is_active IS DISTINCT FROM false
GROUP BY vsc.variant_id, br.name, m.title_ro, v.color_name, v.color_code, v.size
HAVING COUNT(*) > 1
ORDER BY active_supplier_links DESC, br.name, m.title_ro
LIMIT 100;

\echo ''
\echo '--- 10) Vonalkod-kaosz: barcode termekkodnak vagy belso AIF kodnak nez ki ---'
SELECT
  left(inv.variant_id::text, 8) AS variant_short,
  inv.brand_name,
  inv.title_ro,
  inv.color_name,
  inv.size,
  inv.internal_sku,
  inv.barcode,
  vsc.supplier_product_code,
  CASE
    WHEN inv.barcode IS NULL OR trim(inv.barcode) = '' THEN 'OK: nincs vonalkod'
    WHEN inv.barcode = inv.internal_sku THEN 'BAJ: barcode = internal_sku'
    WHEN inv.barcode ILIKE 'AIF-%' THEN 'BAJ: barcode belso AIF kod'
    WHEN inv.barcode = vsc.supplier_product_code THEN 'FIGYELEM: barcode = termekkod'
    ELSE 'OK'
  END AS barcode_check
FROM aif_inventory_summary inv
LEFT JOIN LATERAL (
  SELECT supplier_product_code
  FROM aif_variant_supplier_codes x
  WHERE x.variant_id::text = inv.variant_id::text
  ORDER BY x.is_active DESC, x.updated_at DESC NULLS LAST, x.created_at DESC NULLS LAST
  LIMIT 1
) vsc ON TRUE
WHERE inv.barcode IS NOT NULL
  AND trim(inv.barcode) <> ''
  AND (
    inv.barcode = inv.internal_sku
    OR inv.barcode ILIKE 'AIF-%'
    OR inv.barcode = vsc.supplier_product_code
  )
ORDER BY inv.brand_name, inv.title_ro, inv.size
LIMIT 100;

\echo ''
\echo '--- 11) Legutobbi batch: import termekkod elter a beszallitoi kapcsolattol ---'
WITH lb AS (
  SELECT *
  FROM aif_import_batches
  WHERE status = 'committed'
  ORDER BY COALESCE(committed_at, created_at) DESC
  LIMIT 1
)
SELECT
  rw.row_no,
  left(rw.variant_id::text, 8) AS variant_short,
  rw.supplier_product_code AS import_termekkod,
  vsc.supplier_product_code AS supplier_link_termekkod,
  rw.supplier_color_code AS import_szinkod,
  vsc.supplier_color_code AS supplier_link_szinkod,
  rw.supplier_size AS import_meret,
  vsc.supplier_size AS supplier_link_meret,
  CASE
    WHEN vsc.variant_id IS NULL THEN 'BAJ: nincs supplier link'
    WHEN COALESCE(rw.supplier_product_code,'') <> COALESCE(vsc.supplier_product_code,'') THEN 'BAJ: termekkod elteres'
    WHEN COALESCE(rw.supplier_color_code,'') <> COALESCE(vsc.supplier_color_code,'') THEN 'BAJ: szinkod elteres'
    WHEN COALESCE(rw.supplier_size,'') <> COALESCE(vsc.supplier_size,'') THEN 'BAJ: meret elteres'
    ELSE 'OK'
  END AS status_check
FROM aif_import_rows rw
JOIN lb ON lb.id = rw.batch_id
LEFT JOIN LATERAL (
  SELECT *
  FROM aif_variant_supplier_codes x
  WHERE x.variant_id = rw.variant_id
  ORDER BY x.is_active DESC, x.updated_at DESC NULLS LAST, x.created_at DESC NULLS LAST
  LIMIT 1
) vsc ON TRUE
WHERE vsc.variant_id IS NULL
   OR COALESCE(rw.supplier_product_code,'') <> COALESCE(vsc.supplier_product_code,'')
   OR COALESCE(rw.supplier_color_code,'') <> COALESCE(vsc.supplier_color_code,'')
   OR COALESCE(rw.supplier_size,'') <> COALESCE(vsc.supplier_size,'')
ORDER BY rw.row_no;

\echo ''
\echo '--- 12) Osszkep: melyik oldal mibol olvasna ---'
SELECT
  'AllInIncoming' AS page,
  'aif_import_batches + aif_import_rows + aif_receptions' AS source,
  COUNT(*) FILTER (WHERE rw.status = 'committed') AS latest_committed_rows,
  COUNT(DISTINCT rw.variant_id) FILTER (WHERE rw.status = 'committed') AS latest_distinct_variants,
  COALESCE(SUM(rw.qty) FILTER (WHERE rw.status = 'committed'), 0) AS latest_qty
FROM aif_import_batches b
LEFT JOIN aif_import_rows rw ON rw.batch_id = b.id
WHERE b.id = (
  SELECT id
  FROM aif_import_batches
  WHERE status='committed'
  ORDER BY COALESCE(committed_at, created_at) DESC
  LIMIT 1
)
UNION ALL
SELECT
  'AllInStockMoves' AS page,
  'aif_stock_movements' AS source,
  COUNT(*) AS latest_committed_rows,
  COUNT(DISTINCT sm.variant_id) AS latest_distinct_variants,
  COALESCE(SUM(sm.qty_delta), 0) AS latest_qty
FROM aif_stock_movements sm
WHERE sm.source_id::text = (
  SELECT id::text
  FROM aif_import_batches
  WHERE status='committed'
  ORDER BY COALESCE(committed_at, created_at) DESC
  LIMIT 1
)
OR sm.raw->>'importBatchId' = (
  SELECT id::text
  FROM aif_import_batches
  WHERE status='committed'
  ORDER BY COALESCE(committed_at, created_at) DESC
  LIMIT 1
)
UNION ALL
SELECT
  'AllInWarehouse' AS page,
  'aif_inventory_summary + aif_stock + product tables' AS source,
  COUNT(inv.variant_id) AS latest_committed_rows,
  COUNT(DISTINCT inv.variant_id) AS latest_distinct_variants,
  COALESCE(SUM(inv.total_qty), 0) AS latest_qty
FROM aif_import_rows rw
LEFT JOIN aif_inventory_summary inv ON inv.variant_id::text = rw.variant_id::text
WHERE rw.batch_id = (
  SELECT id
  FROM aif_import_batches
  WHERE status='committed'
  ORDER BY COALESCE(committed_at, created_at) DESC
  LIMIT 1
);

\echo ''
\echo '============================================================'
\echo 'KESZ. Ha minden jo, a BAJ sorok uresen vagy 0-val jonnek.'
\echo '============================================================'
