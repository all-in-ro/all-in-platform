-- AllInFashion: S/N/COD belső azonosító támogatás
-- Termékvariáns + import sor szintjén tároljuk, hogy importból és utólagos szerkesztésből is éljen.

ALTER TABLE IF EXISTS aif_product_variants
  ADD COLUMN IF NOT EXISTS sn_cod text;

ALTER TABLE IF EXISTS aif_import_rows
  ADD COLUMN IF NOT EXISTS sn_cod text;

-- Régi import sorok visszatöltése, ahol a normalizált/raw JSON-ben már benne volt valamilyen alakban.
UPDATE aif_import_rows
SET sn_cod = NULLIF(TRIM(COALESCE(
  normalized->>'snCod',
  normalized->>'sn_cod',
  normalized->>'snCode',
  normalized->>'serialCode',
  normalized->>'internalCode',
  raw->>'S/N/COD',
  raw->>'S/N COD',
  raw->>'SN/COD',
  raw->>'SN COD',
  raw->>'S/N',
  raw->>'S/N EV HONAP',
  raw->>'S/N ÉV HÓNAP',
  raw->>'SN EV HONAP',
  raw->>'SN ÉV HÓNAP',
  raw->>'COD SERIAL',
  raw->>'COD INTERN',
  raw->>'SERIAL CODE',
  raw->>'INTERNAL CODE'
)), '')
WHERE sn_cod IS NULL;

-- Már készletre vett sorokból visszaírjuk a variánsra is, ha ott még üres.
UPDATE aif_product_variants v
SET sn_cod = ir.sn_cod,
    updated_at = now()
FROM (
  SELECT DISTINCT ON (variant_id) variant_id, sn_cod
  FROM aif_import_rows
  WHERE variant_id IS NOT NULL
    AND NULLIF(TRIM(sn_cod), '') IS NOT NULL
  ORDER BY variant_id, updated_at DESC NULLS LAST, row_no DESC NULLS LAST
) ir
WHERE v.id = ir.variant_id
  AND NULLIF(TRIM(COALESCE(v.sn_cod, '')), '') IS NULL;

CREATE INDEX IF NOT EXISTS idx_aif_product_variants_sn_cod_lower
  ON aif_product_variants (lower(sn_cod))
  WHERE sn_cod IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_aif_import_rows_sn_cod_lower
  ON aif_import_rows (lower(sn_cod))
  WHERE sn_cod IS NOT NULL;
