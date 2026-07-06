-- Javítás olyan már készletre vett importokra, ahol a beszállítói vonalkód miatt
-- több méret ugyanarra a variánsra olvadt össze.
-- Futtatás példa:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v batch_id='445afbaf-8265-48ac-a509-b79ebbae9298' -f migrations/20260706_aif_repair_import_size_variants.sql

BEGIN;

ALTER TABLE IF EXISTS aif_product_variants ADD COLUMN IF NOT EXISTS sn_cod text;
ALTER TABLE IF EXISTS aif_import_rows ADD COLUMN IF NOT EXISTS sn_cod text;

CREATE TEMP TABLE aif_import_size_fix_map ON COMMIT DROP AS
SELECT
  rw.id AS row_id,
  rw.batch_id,
  b.target_location_id,
  b.supplier_id,
  rw.variant_id AS old_variant_id,
  v.model_id,
  COALESCE(NULLIF(rw.supplier_size, ''), NULLIF(rw.normalized->>'size', ''), NULLIF(rw.normalized->>'supplierSize', ''), NULLIF(rw.normalized->>'supplier_size', '')) AS row_size,
  COALESCE(NULLIF(rw.supplier_color_code, ''), NULLIF(rw.normalized->>'colorCode', ''), NULLIF(rw.normalized->>'color_code', ''), NULLIF(v.color_code, ''), '') AS row_color_code,
  COALESCE(NULLIF(rw.normalized->>'colorName', ''), NULLIF(rw.normalized->>'color_name', ''), NULLIF(v.color_name, ''), '') AS row_color_name,
  COALESCE(NULLIF(v.color_hex, ''), NULLIF(rw.normalized->>'colorHex', ''), NULLIF(rw.normalized->>'color_hex', '')) AS row_color_hex,
  COALESCE(NULLIF(rw.normalized->>'barcode', ''), NULLIF(v.barcode, '')) AS row_barcode,
  COALESCE(NULLIF(rw.sn_cod, ''), NULLIF(rw.normalized->>'snCod', ''), NULLIF(rw.normalized->>'sn_cod', ''), NULLIF(v.sn_cod, '')) AS row_sn_cod,
  COALESCE(rw.qty, NULLIF(rw.normalized->>'qty', '')::numeric, 0) AS qty,
  COALESCE(rw.buy_price_ron, rw.buy_price, v.buy_price) AS buy_price,
  COALESCE(rw.sell_price_ron, rw.sell_price, v.sell_price) AS sell_price,
  v.compare_at_price,
  v.weight_grams,
  v.image_url,
  rw.supplier_product_code,
  rw.supplier_variant_code,
  rw.supplier_color_code,
  rw.supplier_size,
  NULL::uuid AS target_variant_id
FROM aif_import_rows rw
JOIN aif_import_batches b ON b.id = rw.batch_id
JOIN aif_product_variants v ON v.id = rw.variant_id
WHERE rw.batch_id = :'batch_id'::uuid
  AND rw.status = 'committed'
  AND rw.variant_id IS NOT NULL;

-- Ha nincs méret a sorban, nem nyúlunk hozzá. A méret nélküli sorból nem lehet biztonságosan variánst építeni.
DELETE FROM aif_import_size_fix_map
WHERE row_size IS NULL OR trim(row_size) = '';

INSERT INTO aif_product_variants (
  model_id,
  barcode,
  color_code,
  color_name,
  color_hex,
  size,
  buy_price,
  sell_price,
  compare_at_price,
  weight_grams,
  image_url,
  sn_cod,
  status
)
SELECT DISTINCT ON (
  m.model_id,
  lower(COALESCE(m.row_color_code, '')),
  lower(COALESCE(m.row_color_name, '')),
  lower(m.row_size)
)
  m.model_id,
  CASE
    WHEN m.row_barcode IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM aif_product_variants bx WHERE bx.barcode = m.row_barcode)
    THEN m.row_barcode
    ELSE NULL
  END AS barcode,
  NULLIF(m.row_color_code, ''),
  NULLIF(m.row_color_name, ''),
  m.row_color_hex,
  m.row_size,
  m.buy_price,
  m.sell_price,
  m.compare_at_price,
  m.weight_grams,
  m.image_url,
  m.row_sn_cod,
  'active'
FROM aif_import_size_fix_map m
WHERE NOT EXISTS (
  SELECT 1
  FROM aif_product_variants ex
  WHERE ex.model_id = m.model_id
    AND lower(COALESCE(ex.color_code, '')) = lower(COALESCE(m.row_color_code, ''))
    AND lower(COALESCE(ex.color_name, '')) = lower(COALESCE(m.row_color_name, ''))
    AND lower(ex.size) = lower(m.row_size)
)
ORDER BY
  m.model_id,
  lower(COALESCE(m.row_color_code, '')),
  lower(COALESCE(m.row_color_name, '')),
  lower(m.row_size),
  m.row_id;

UPDATE aif_import_size_fix_map m
SET target_variant_id = (
  SELECT ex.id
  FROM aif_product_variants ex
  WHERE ex.model_id = m.model_id
    AND lower(COALESCE(ex.color_code, '')) = lower(COALESCE(m.row_color_code, ''))
    AND lower(COALESCE(ex.color_name, '')) = lower(COALESCE(m.row_color_name, ''))
    AND lower(ex.size) = lower(m.row_size)
  ORDER BY
    CASE WHEN ex.id = m.old_variant_id THEN 0 ELSE 1 END,
    ex.created_at ASC NULLS LAST,
    ex.id ASC
  LIMIT 1
);

-- Régi, összeolvadt variánsról levesszük azokat a darabokat, amelyek most más méretre kerülnek.
WITH moved_out AS (
  SELECT target_location_id AS location_id, old_variant_id AS variant_id, SUM(qty) AS move_qty
  FROM aif_import_size_fix_map
  WHERE target_variant_id IS NOT NULL AND old_variant_id IS DISTINCT FROM target_variant_id
  GROUP BY target_location_id, old_variant_id
)
UPDATE aif_stock s
SET qty = GREATEST(0, COALESCE(s.qty,0) - moved_out.move_qty),
    updated_at = now()
FROM moved_out
WHERE s.location_id = moved_out.location_id
  AND s.variant_id = moved_out.variant_id;

-- Új / helyes méretvariánsokra rátesszük a sorok darabszámát.
WITH moved_in AS (
  SELECT target_location_id AS location_id, target_variant_id AS variant_id, SUM(qty) AS move_qty
  FROM aif_import_size_fix_map
  WHERE target_variant_id IS NOT NULL AND old_variant_id IS DISTINCT FROM target_variant_id
  GROUP BY target_location_id, target_variant_id
)
INSERT INTO aif_stock (location_id, variant_id, qty, reserved_qty, updated_at)
SELECT location_id, variant_id, move_qty, 0, now()
FROM moved_in
ON CONFLICT (location_id, variant_id)
DO UPDATE SET qty = COALESCE(aif_stock.qty,0) + EXCLUDED.qty,
              updated_at = now();

-- A mozgásnapló sorát is a helyes méretvariánsra kötjük, ha a raw.rowId alapján azonosítható.
WITH movement_seq AS (
  SELECT
    sm.id AS movement_id,
    m.target_variant_id,
    sm.qty_delta,
    COALESCE(
      SUM(sm.qty_delta) OVER (
        PARTITION BY m.target_variant_id
        ORDER BY sm.created_at ASC, sm.id ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),
      0
    ) AS before_qty
  FROM aif_stock_movements sm
  JOIN aif_import_size_fix_map m ON sm.raw->>'rowId' = m.row_id::text
  WHERE sm.source_type = 'import_batch'
    AND sm.source_id = :'batch_id'
    AND m.target_variant_id IS NOT NULL
)
UPDATE aif_stock_movements sm
SET variant_id = movement_seq.target_variant_id,
    qty_before = movement_seq.before_qty,
    qty_after = movement_seq.before_qty + movement_seq.qty_delta
FROM movement_seq
WHERE sm.id = movement_seq.movement_id;

-- Beszállítói kód kapcsolat javítása méret szerint.
UPDATE aif_variant_supplier_codes sc
SET variant_id = m.target_variant_id,
    updated_at = now()
FROM aif_import_size_fix_map m
WHERE m.target_variant_id IS NOT NULL
  AND sc.supplier_id = m.supplier_id
  AND COALESCE(sc.supplier_product_code, '') = COALESCE(m.supplier_product_code, '')
  AND COALESCE(sc.supplier_variant_code, '') = COALESCE(m.supplier_variant_code, '')
  AND COALESCE(sc.supplier_color_code, '') = COALESCE(m.supplier_color_code, '')
  AND COALESCE(sc.supplier_size, '') = COALESCE(m.supplier_size, '');

-- Import sorok átvezetése a helyes variánsokra.
UPDATE aif_import_rows rw
SET variant_id = m.target_variant_id,
    updated_at = now()
FROM aif_import_size_fix_map m
WHERE rw.id = m.row_id
  AND m.target_variant_id IS NOT NULL;

SELECT
  count(*)::int AS touched_rows,
  count(*) FILTER (WHERE old_variant_id IS DISTINCT FROM target_variant_id)::int AS moved_rows,
  count(DISTINCT old_variant_id)::int AS old_variants,
  count(DISTINCT target_variant_id)::int AS target_variants
FROM aif_import_size_fix_map;

COMMIT;
