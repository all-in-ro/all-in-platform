BEGIN;

-- AllInFashion: standard méretek + márkához kötött méretfordítások
-- Biztonságos migráció: csak akkor hoz létre objektumot, ha még nincs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS aif_size_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  name_hu text NULL,
  aliases text[] NOT NULL DEFAULT '{}'::text[],
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS aif_size_types ADD COLUMN IF NOT EXISTS name_hu text NULL;
ALTER TABLE IF EXISTS aif_size_types ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE IF EXISTS aif_size_types ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100;
ALTER TABLE IF EXISTS aif_size_types ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE IF EXISTS aif_size_types ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS aif_size_types ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS aif_size_types_active_sort_idx
  ON aif_size_types (is_active, sort_order, name);

CREATE TABLE IF NOT EXISTS aif_brand_size_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES aif_brands(id) ON DELETE CASCADE,
  size_code text NOT NULL,
  size_type_id uuid NOT NULL REFERENCES aif_size_types(id),
  notes text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, size_code)
);

ALTER TABLE IF EXISTS aif_brand_size_codes ADD COLUMN IF NOT EXISTS notes text NULL;
ALTER TABLE IF EXISTS aif_brand_size_codes ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE IF EXISTS aif_brand_size_codes ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS aif_brand_size_codes ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS aif_brand_size_codes_brand_active_idx
  ON aif_brand_size_codes (brand_id, is_active, size_code);

-- Alap standard méretek, köztük OSFM és EU cipőméretek.
INSERT INTO aif_size_types (code, name, name_hu, aliases, sort_order, is_active)
VALUES
  ('xxs', 'XXS', 'XXS', ARRAY['XXS','2XS']::text[], 1, true),
  ('xs', 'XS', 'XS', ARRAY['XS']::text[], 2, true),
  ('s', 'S', 'S', ARRAY['S','SMALL']::text[], 3, true),
  ('m', 'M', 'M', ARRAY['M','MEDIUM']::text[], 4, true),
  ('l', 'L', 'L', ARRAY['L','LARGE']::text[], 5, true),
  ('xl', 'XL', 'XL', ARRAY['XL','X-LARGE']::text[], 6, true),
  ('xxl', 'XXL', 'XXL', ARRAY['XXL','2XL']::text[], 7, true),
  ('xxxl', 'XXXL', 'XXXL', ARRAY['XXXL','3XL']::text[], 8, true),
  ('osfm', 'OSFM', 'OSFM', ARRAY['OSFM','ONE SIZE','ONESIZE','ONE-SIZE','OS','UNI','UNIVERSAL']::text[], 9, true),
  ('one_size', 'One Size', 'Egy méret', ARRAY['ONE SIZE','ONESIZE','ONE-SIZE','OS']::text[], 10, true),
  ('eu_35', 'EU 35', 'EU 35', ARRAY['35','EU35','EU 35','35 EU']::text[], 35, true),
  ('eu_36', 'EU 36', 'EU 36', ARRAY['36','EU36','EU 36','36 EU']::text[], 36, true),
  ('eu_37', 'EU 37', 'EU 37', ARRAY['37','EU37','EU 37','37 EU']::text[], 37, true),
  ('eu_38', 'EU 38', 'EU 38', ARRAY['38','EU38','EU 38','38 EU']::text[], 38, true),
  ('eu_39', 'EU 39', 'EU 39', ARRAY['39','EU39','EU 39','39 EU']::text[], 39, true),
  ('eu_40', 'EU 40', 'EU 40', ARRAY['40','EU40','EU 40','40 EU']::text[], 40, true),
  ('eu_41', 'EU 41', 'EU 41', ARRAY['41','EU41','EU 41','41 EU']::text[], 41, true),
  ('eu_42', 'EU 42', 'EU 42', ARRAY['42','EU42','EU 42','42 EU']::text[], 42, true),
  ('eu_43', 'EU 43', 'EU 43', ARRAY['43','EU43','EU 43','43 EU']::text[], 43, true),
  ('eu_44', 'EU 44', 'EU 44', ARRAY['44','EU44','EU 44','44 EU']::text[], 44, true),
  ('eu_45', 'EU 45', 'EU 45', ARRAY['45','EU45','EU 45','45 EU']::text[], 45, true),
  ('eu_46', 'EU 46', 'EU 46', ARRAY['46','EU46','EU 46','46 EU']::text[], 46, true),
  ('eu_47', 'EU 47', 'EU 47', ARRAY['47','EU47','EU 47','47 EU']::text[], 47, true),
  ('eu_48', 'EU 48', 'EU 48', ARRAY['48','EU48','EU 48','48 EU']::text[], 48, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  name_hu = COALESCE(aif_size_types.name_hu, EXCLUDED.name_hu),
  aliases = CASE
    WHEN aif_size_types.aliases IS NULL OR array_length(aif_size_types.aliases, 1) IS NULL
      THEN EXCLUDED.aliases
    ELSE aif_size_types.aliases
  END,
  sort_order = LEAST(COALESCE(aif_size_types.sort_order, EXCLUDED.sort_order), EXCLUDED.sort_order),
  is_active = true,
  updated_at = now();

COMMIT;
