BEGIN;

ALTER TABLE IF EXISTS aif_receptions
  ADD COLUMN IF NOT EXISTS uit_code text NULL;

UPDATE aif_receptions
SET uit_code = NULLIF(
  regexp_replace(
    upper(COALESCE(raw_meta->>'uitCode', raw_meta->>'uit_code', '')),
    '[^A-Z0-9-]+',
    '',
    'g'
  ),
  ''
)
WHERE NULLIF(btrim(COALESCE(uit_code, '')), '') IS NULL
  AND NULLIF(btrim(COALESCE(raw_meta->>'uitCode', raw_meta->>'uit_code', '')), '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS aif_receptions_uit_code_lower_idx
  ON aif_receptions (lower(btrim(uit_code)))
  WHERE NULLIF(btrim(COALESCE(uit_code, '')), '') IS NOT NULL;

COMMENT ON COLUMN aif_receptions.uit_code IS
  'Optional Romanian UIT transport code associated with the supplier invoice/reception.';

COMMIT;
