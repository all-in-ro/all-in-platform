BEGIN;

-- A legutóbbi készletre vett importban szereplő, korábban archivált modelleket visszahozzuk draft állapotba.
-- Így a Warehouse ugyanazokat a sorokat látja, mint az Incoming és a Mozgásnapló, de továbbra is aktiválni kell őket.
WITH latest_batch AS (
  SELECT id
  FROM aif_import_batches
  WHERE status = 'committed'
  ORDER BY COALESCE(committed_at, updated_at, created_at) DESC
  LIMIT 1
), touched_variants AS (
  SELECT DISTINCT rw.variant_id
  FROM aif_import_rows rw
  JOIN latest_batch lb ON lb.id = rw.batch_id
  WHERE rw.status = 'committed'
    AND rw.variant_id IS NOT NULL
), touched_models AS (
  SELECT DISTINCT v.model_id
  FROM aif_product_variants v
  JOIN touched_variants tv ON tv.variant_id = v.id
  WHERE v.model_id IS NOT NULL
)
UPDATE aif_product_models m
SET status = 'draft',
    updated_at = now()
FROM touched_models tm
WHERE m.id = tm.model_id
  AND COALESCE(m.status, '') = 'archived';

-- A variáns legyen újra aktív, mert a modell draft állapota elég a jóváhagyási munkalistához.
WITH latest_batch AS (
  SELECT id
  FROM aif_import_batches
  WHERE status = 'committed'
  ORDER BY COALESCE(committed_at, updated_at, created_at) DESC
  LIMIT 1
), touched_variants AS (
  SELECT DISTINCT rw.variant_id
  FROM aif_import_rows rw
  JOIN latest_batch lb ON lb.id = rw.batch_id
  WHERE rw.status = 'committed'
    AND rw.variant_id IS NOT NULL
)
UPDATE aif_product_variants v
SET status = 'active',
    updated_at = now()
FROM touched_variants tv
WHERE v.id = tv.variant_id
  AND COALESCE(v.status, '') = 'archived';

COMMIT;

SELECT
  b.id AS latest_batch_id,
  b.source_file_name,
  count(DISTINCT rw.id) FILTER (WHERE rw.status = 'committed') AS committed_import_rows,
  count(DISTINCT rw.variant_id) FILTER (WHERE rw.status = 'committed') AS committed_variants,
  sum(rw.qty) FILTER (WHERE rw.status = 'committed') AS committed_qty
FROM aif_import_batches b
LEFT JOIN aif_import_rows rw ON rw.batch_id = b.id
WHERE b.id = (
  SELECT id
  FROM aif_import_batches
  WHERE status = 'committed'
  ORDER BY COALESCE(committed_at, updated_at, created_at) DESC
  LIMIT 1
)
GROUP BY b.id, b.source_file_name;
