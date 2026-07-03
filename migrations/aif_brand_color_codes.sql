BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS aif_brand_color_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES aif_brands(id) ON DELETE CASCADE,
  color_code text NOT NULL,
  color_type_id uuid NOT NULL REFERENCES aif_color_types(id) ON DELETE RESTRICT,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aif_brand_color_codes_brand_code_uq UNIQUE (brand_id, color_code)
);

CREATE INDEX IF NOT EXISTS aif_brand_color_codes_brand_idx
  ON aif_brand_color_codes (brand_id);

CREATE INDEX IF NOT EXISTS aif_brand_color_codes_color_type_idx
  ON aif_brand_color_codes (color_type_id);

CREATE INDEX IF NOT EXISTS aif_brand_color_codes_active_idx
  ON aif_brand_color_codes (is_active);

-- Kezdő Under Armour mapping. Ha valamelyik kód nálatok más színt jelent,
-- a Törzsadatok / Márka színkódok résznél módosítható, Excel-nyúzás nélkül.
WITH brand AS (
  SELECT id FROM aif_brands
  WHERE code = 'under_armour' OR lower(name) = lower('Under Armour')
  ORDER BY name ASC
  LIMIT 1
), color AS (
  SELECT id FROM aif_color_types
  WHERE code = 'negru' OR lower(name_ro) = lower('negru') OR lower(COALESCE(name_hu,'')) = lower('fekete')
  ORDER BY sort_order ASC NULLS LAST
  LIMIT 1
)
INSERT INTO aif_brand_color_codes (brand_id, color_code, color_type_id, notes, is_active)
SELECT brand.id, '100', color.id, 'Under Armour CODPRODUS utolsó része: 100 = fekete/negru', true
FROM brand, color
ON CONFLICT (brand_id, color_code) DO UPDATE SET
  color_type_id = EXCLUDED.color_type_id,
  notes = EXCLUDED.notes,
  is_active = true,
  updated_at = now();

WITH brand AS (
  SELECT id FROM aif_brands
  WHERE code = 'under_armour' OR lower(name) = lower('Under Armour')
  ORDER BY name ASC
  LIMIT 1
), color AS (
  SELECT id FROM aif_color_types
  WHERE code = 'alb' OR lower(name_ro) = lower('alb') OR lower(COALESCE(name_hu,'')) = lower('fehér') OR lower(COALESCE(name_hu,'')) = lower('feher')
  ORDER BY sort_order ASC NULLS LAST
  LIMIT 1
)
INSERT INTO aif_brand_color_codes (brand_id, color_code, color_type_id, notes, is_active)
SELECT brand.id, '001', color.id, 'Under Armour CODPRODUS utolsó része: 001 = fehér/alb', true
FROM brand, color
ON CONFLICT (brand_id, color_code) DO UPDATE SET
  color_type_id = EXCLUDED.color_type_id,
  notes = EXCLUDED.notes,
  is_active = true,
  updated_at = now();

COMMIT;

SELECT b.name AS brand, bcc.color_code, c.name_ro AS color_ro, c.name_hu AS color_hu, bcc.is_active
FROM aif_brand_color_codes bcc
JOIN aif_brands b ON b.id = bcc.brand_id
JOIN aif_color_types c ON c.id = bcc.color_type_id
WHERE lower(b.name) = lower('Under Armour') OR b.code = 'under_armour'
ORDER BY bcc.color_code;
