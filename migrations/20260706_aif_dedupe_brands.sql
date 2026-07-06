-- AIF duplicate brand cleanup.
-- Összevonja az azonos nevű aktív márkákat: termékmodell, beszállító-márka kapcsolat,
-- márka színkód és márkaméret kapcsolat átkerül a megtartott márkára.

BEGIN;

CREATE TEMP TABLE aif_brand_dedupe_map ON COMMIT DROP AS
WITH usage AS (
  SELECT
    b.id,
    b.code,
    b.name,
    b.is_active,
    lower(regexp_replace(trim(coalesce(b.name, b.code, '')), '\s+', ' ', 'g')) AS name_key,
    COALESCE(pm.cnt, 0) AS product_models,
    COALESCE(sb.cnt, 0) AS supplier_links,
    COALESCE(bcc.cnt, 0) AS color_codes,
    COALESCE(bsc.cnt, 0) AS size_codes
  FROM aif_brands b
  LEFT JOIN (SELECT brand_id, count(*) AS cnt FROM aif_product_models GROUP BY brand_id) pm ON pm.brand_id=b.id
  LEFT JOIN (SELECT brand_id, count(*) AS cnt FROM aif_supplier_brands GROUP BY brand_id) sb ON sb.brand_id=b.id
  LEFT JOIN (SELECT brand_id, count(*) AS cnt FROM aif_brand_color_codes GROUP BY brand_id) bcc ON bcc.brand_id=b.id
  LEFT JOIN (SELECT brand_id, count(*) AS cnt FROM aif_brand_size_codes GROUP BY brand_id) bsc ON bsc.brand_id=b.id
), ranked AS (
  SELECT
    *,
    first_value(id) OVER (
      PARTITION BY name_key
      ORDER BY is_active DESC,
               (product_models + supplier_links + color_codes + size_codes) DESC,
               product_models DESC,
               supplier_links DESC,
               CASE WHEN code = name_key THEN 0 ELSE 1 END,
               code ASC,
               id::text ASC
    ) AS keep_id,
    row_number() OVER (
      PARTITION BY name_key
      ORDER BY is_active DESC,
               (product_models + supplier_links + color_codes + size_codes) DESC,
               product_models DESC,
               supplier_links DESC,
               CASE WHEN code = name_key THEN 0 ELSE 1 END,
               code ASC,
               id::text ASC
    ) AS rn
  FROM usage
  WHERE name_key <> ''
)
SELECT
  id AS duplicate_id,
  keep_id,
  name_key
FROM ranked
WHERE rn > 1 AND id <> keep_id;

\echo '--- Brand rows to merge ---'
SELECT m.name_key, k.name AS keep_name, k.code AS keep_code, d.name AS duplicate_name, d.code AS duplicate_code, d.is_active AS duplicate_active
FROM aif_brand_dedupe_map m
JOIN aif_brands k ON k.id=m.keep_id
JOIN aif_brands d ON d.id=m.duplicate_id
ORDER BY m.name_key, d.code;

-- Termékmodellek átvezetése.
UPDATE aif_product_models pm
SET brand_id=m.keep_id,
    updated_at=now()
FROM aif_brand_dedupe_map m
WHERE pm.brand_id=m.duplicate_id;

-- Beszállító-márka kapcsolatok: előbb összeolvasztjuk az azonos supplier + márka sorokat.
UPDATE aif_supplier_brands keep
SET is_preferred = COALESCE(keep.is_preferred, false) OR COALESCE(dup.is_preferred, false),
    is_active = COALESCE(keep.is_active, true) OR COALESCE(dup.is_active, true),
    notes = COALESCE(NULLIF(keep.notes, ''), dup.notes),
    updated_at=now()
FROM aif_supplier_brands dup
JOIN aif_brand_dedupe_map m ON m.duplicate_id=dup.brand_id
WHERE keep.brand_id=m.keep_id
  AND keep.supplier_id=dup.supplier_id;

DELETE FROM aif_supplier_brands dup
USING aif_brand_dedupe_map m
WHERE dup.brand_id=m.duplicate_id
  AND EXISTS (
    SELECT 1 FROM aif_supplier_brands keep
    WHERE keep.brand_id=m.keep_id AND keep.supplier_id=dup.supplier_id
  );

UPDATE aif_supplier_brands sb
SET brand_id=m.keep_id,
    updated_at=now()
FROM aif_brand_dedupe_map m
WHERE sb.brand_id=m.duplicate_id;

-- Márka színkódok: azonos gyártói színkódot nem duplázunk.
UPDATE aif_brand_color_codes keep
SET is_active = COALESCE(keep.is_active, true) OR COALESCE(dup.is_active, true),
    notes = COALESCE(NULLIF(keep.notes, ''), dup.notes),
    updated_at=now()
FROM aif_brand_color_codes dup
JOIN aif_brand_dedupe_map m ON m.duplicate_id=dup.brand_id
WHERE keep.brand_id=m.keep_id
  AND lower(keep.color_code)=lower(dup.color_code);

DELETE FROM aif_brand_color_codes dup
USING aif_brand_dedupe_map m
WHERE dup.brand_id=m.duplicate_id
  AND EXISTS (
    SELECT 1 FROM aif_brand_color_codes keep
    WHERE keep.brand_id=m.keep_id AND lower(keep.color_code)=lower(dup.color_code)
  );

UPDATE aif_brand_color_codes bcc
SET brand_id=m.keep_id,
    updated_at=now()
FROM aif_brand_dedupe_map m
WHERE bcc.brand_id=m.duplicate_id;

-- Márkaméretek: azonos gyártói méretkódot nem duplázunk.
UPDATE aif_brand_size_codes keep
SET is_active = COALESCE(keep.is_active, true) OR COALESCE(dup.is_active, true),
    notes = COALESCE(NULLIF(keep.notes, ''), dup.notes),
    updated_at=now()
FROM aif_brand_size_codes dup
JOIN aif_brand_dedupe_map m ON m.duplicate_id=dup.brand_id
WHERE keep.brand_id=m.keep_id
  AND lower(keep.size_code)=lower(dup.size_code);

DELETE FROM aif_brand_size_codes dup
USING aif_brand_dedupe_map m
WHERE dup.brand_id=m.duplicate_id
  AND EXISTS (
    SELECT 1 FROM aif_brand_size_codes keep
    WHERE keep.brand_id=m.keep_id AND lower(keep.size_code)=lower(dup.size_code)
  );

UPDATE aif_brand_size_codes bsc
SET brand_id=m.keep_id,
    updated_at=now()
FROM aif_brand_dedupe_map m
WHERE bsc.brand_id=m.duplicate_id;

-- A duplikált márka sorokat nem töröljük, csak inaktiváljuk. Nem rugdossuk szét az előzményeket, mert nem vagyunk barbárok.
UPDATE aif_brands b
SET is_active=false,
    updated_at=now()
FROM aif_brand_dedupe_map m
WHERE b.id=m.duplicate_id;

\echo '--- Remaining duplicate active brands after cleanup ---'
WITH b AS (
  SELECT lower(regexp_replace(trim(coalesce(name, code, '')), '\s+', ' ', 'g')) AS name_key, count(*) AS active_rows
  FROM aif_brands
  WHERE is_active=true
  GROUP BY 1
)
SELECT * FROM b WHERE active_rows > 1 ORDER BY name_key;

COMMIT;
