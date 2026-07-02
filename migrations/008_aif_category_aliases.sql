BEGIN;

ALTER TABLE aif_categories
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_aif_categories_aliases_gin
  ON aif_categories USING gin (aliases);

UPDATE aif_categories
SET aliases = ARRAY(
  SELECT DISTINCT x
  FROM unnest(COALESCE(aliases, '{}'::text[]) || ARRAY[
    'TSHIRT', 'T-Shirt', 'T SHIRT', 'TEE', 'TEE SHIRT', 'TRICOU', 'TRICOURI'
  ]::text[]) AS x
  WHERE trim(x) <> ''
)
WHERE code = 'tricouri';

UPDATE aif_categories
SET aliases = ARRAY(
  SELECT DISTINCT x
  FROM unnest(COALESCE(aliases, '{}'::text[]) || ARRAY[
    'SHORTS CAS', 'SHORTS', 'SHORT', 'BERMUDA', 'PANTALONI SCURTI', 'PANTALONI SCURȚI', 'SORTURI', 'ȘORTURI'
  ]::text[]) AS x
  WHERE trim(x) <> ''
)
WHERE code = 'pantaloni_scurti';

UPDATE aif_categories
SET aliases = ARRAY(
  SELECT DISTINCT x
  FROM unnest(COALESCE(aliases, '{}'::text[]) || ARRAY[
    'JOGGERS', 'JOGGER', 'SWEATPANTS', 'TRAINING PANTS', 'PANTALONI TRENING'
  ]::text[]) AS x
  WHERE trim(x) <> ''
)
WHERE code = 'pantaloni_trening';

UPDATE aif_categories
SET aliases = ARRAY(
  SELECT DISTINCT x
  FROM unnest(COALESCE(aliases, '{}'::text[]) || ARRAY[
    'HOODIE', 'HOODIES', 'SWEATSHIRT', 'HANORAC', 'HANORACE'
  ]::text[]) AS x
  WHERE trim(x) <> ''
)
WHERE code = 'hanorace';

UPDATE aif_categories
SET aliases = ARRAY(
  SELECT DISTINCT x
  FROM unnest(COALESCE(aliases, '{}'::text[]) || ARRAY[
    'SNEAKERS', 'TRAINERS', 'SHOES', 'SPORT SHOES', 'PANTOFI SPORT'
  ]::text[]) AS x
  WHERE trim(x) <> ''
)
WHERE code = 'pantofi_sport';

COMMIT;
