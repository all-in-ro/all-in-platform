-- Repair imported product brand links and activate stocked/imported products.
-- Safe to run multiple times.

BEGIN;

WITH raw_brands AS (
  SELECT DISTINCT
    NULLIF(TRIM(COALESCE(
      rw.normalized->>'brandName',
      rw.normalized->>'brand_name',
      rw.normalized->>'brand',
      rw.normalized->>'brandCode',
      rw.normalized->>'brand_code'
    )), '') AS brand_name
  FROM aif_import_rows rw
  WHERE rw.normalized IS NOT NULL
), normalized_brands AS (
  SELECT
    brand_name,
    NULLIF(TRIM(BOTH '_' FROM regexp_replace(lower(brand_name), '[^a-z0-9]+', '_', 'g')), '') AS brand_code
  FROM raw_brands
  WHERE brand_name IS NOT NULL
), inserted_brands AS (
  INSERT INTO aif_brands (code, name, is_active)
  SELECT brand_code, brand_name, true
  FROM normalized_brands
  WHERE brand_code IS NOT NULL
  ON CONFLICT (code) DO UPDATE SET
    name = COALESCE(NULLIF(aif_brands.name, ''), EXCLUDED.name),
    is_active = true,
    updated_at = now()
  RETURNING id
), row_brand AS (
  SELECT DISTINCT
    v.model_id,
    NULLIF(TRIM(COALESCE(
      rw.normalized->>'brandName',
      rw.normalized->>'brand_name',
      rw.normalized->>'brand',
      rw.normalized->>'brandCode',
      rw.normalized->>'brand_code'
    )), '') AS brand_name
  FROM aif_import_rows rw
  JOIN aif_product_variants v ON v.id = rw.variant_id
  WHERE rw.variant_id IS NOT NULL
    AND rw.normalized IS NOT NULL
), normalized_row_brand AS (
  SELECT
    model_id,
    brand_name,
    NULLIF(TRIM(BOTH '_' FROM regexp_replace(lower(brand_name), '[^a-z0-9]+', '_', 'g')), '') AS brand_code
  FROM row_brand
  WHERE brand_name IS NOT NULL
), matched AS (
  SELECT DISTINCT ON (nrb.model_id)
    nrb.model_id,
    b.id AS brand_id,
    b.name AS brand_name
  FROM normalized_row_brand nrb
  JOIN aif_brands b
    ON b.code = nrb.brand_code
    OR lower(b.name) = lower(nrb.brand_name)
  ORDER BY nrb.model_id, b.is_active DESC, b.name ASC
), updated_brands AS (
  UPDATE aif_product_models m
  SET brand_id = matched.brand_id,
      updated_at = now()
  FROM matched
  WHERE m.id = matched.model_id
    AND (m.brand_id IS NULL OR m.brand_id <> matched.brand_id)
  RETURNING m.id
), imported_or_stocked_models AS (
  SELECT DISTINCT m.id
  FROM aif_product_models m
  JOIN aif_product_variants v ON v.model_id = m.id
  LEFT JOIN aif_stock s ON s.variant_id = v.id
  LEFT JOIN aif_import_rows rw ON rw.variant_id = v.id
  WHERE COALESCE(s.qty, 0) <> 0
     OR rw.id IS NOT NULL
), activated_models AS (
  UPDATE aif_product_models m
  SET status='active', updated_at=now()
  FROM imported_or_stocked_models src
  WHERE m.id = src.id
    AND COALESCE(m.status, 'draft') <> 'archived'
    AND COALESCE(m.status, 'draft') <> 'active'
  RETURNING m.id
), imported_or_stocked_variants AS (
  SELECT DISTINCT v.id
  FROM aif_product_variants v
  LEFT JOIN aif_stock s ON s.variant_id = v.id
  LEFT JOIN aif_import_rows rw ON rw.variant_id = v.id
  WHERE COALESCE(s.qty, 0) <> 0
     OR rw.id IS NOT NULL
), activated_variants AS (
  UPDATE aif_product_variants v
  SET status='active', updated_at=now()
  FROM imported_or_stocked_variants src
  WHERE v.id = src.id
    AND COALESCE(v.status, 'active') <> 'archived'
    AND COALESCE(v.status, 'active') <> 'active'
  RETURNING v.id
)
SELECT
  (SELECT count(*) FROM updated_brands)::int AS repaired_model_brands,
  (SELECT count(*) FROM activated_models)::int AS activated_models,
  (SELECT count(*) FROM activated_variants)::int AS activated_variants;

COMMIT;
