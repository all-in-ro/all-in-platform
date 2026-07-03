BEGIN;

ALTER TABLE aif_gender_types
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_aif_gender_types_aliases_gin
  ON aif_gender_types USING gin (aliases);

UPDATE aif_gender_types
SET aliases = ARRAY(
  SELECT DISTINCT x
  FROM unnest(COALESCE(aliases, '{}'::text[]) || ARRAY[
    'Barbat', 'Bărbat', 'Barbati', 'Bărbați', 'Masculin', 'Men', 'Man', 'Male', 'Herren', 'Uomo', 'Homme', 'Férfi', 'Ferfi'
  ]::text[]) AS x
  WHERE trim(x) <> ''
)
WHERE code = 'men';

UPDATE aif_gender_types
SET aliases = ARRAY(
  SELECT DISTINCT x
  FROM unnest(COALESCE(aliases, '{}'::text[]) || ARRAY[
    'Femei', 'Femeie', 'Feminin', 'Dama', 'Damă', 'Dame', 'Women', 'Woman', 'Female', 'Ladies', 'Lady', 'Damen', 'Femme', 'Női', 'Noi', 'No'
  ]::text[]) AS x
  WHERE trim(x) <> ''
)
WHERE code = 'women';

UPDATE aif_gender_types
SET aliases = ARRAY(
  SELECT DISTINCT x
  FROM unnest(COALESCE(aliases, '{}'::text[]) || ARRAY[
    'Copii', 'Copil', 'Junior', 'Kids', 'Kid', 'Child', 'Children', 'Youth', 'Gyerek', 'Tineri'
  ]::text[]) AS x
  WHERE trim(x) <> ''
)
WHERE code = 'kids';

UPDATE aif_gender_types
SET aliases = ARRAY(
  SELECT DISTINCT x
  FROM unnest(COALESCE(aliases, '{}'::text[]) || ARRAY[
    'Unisex', 'Mixt', 'Mixed', 'Universal', 'U'
  ]::text[]) AS x
  WHERE trim(x) <> ''
)
WHERE code = 'unisex';

CREATE TABLE IF NOT EXISTS aif_material_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ro text NOT NULL,
  name_hu text,
  name_en text,
  name_de text,
  aliases text[] NOT NULL DEFAULT '{}'::text[],
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aif_material_types_aliases_gin
  ON aif_material_types USING gin (aliases);

CREATE INDEX IF NOT EXISTS idx_aif_material_types_active_sort
  ON aif_material_types (is_active, sort_order, name_ro);

INSERT INTO aif_material_types (code, name_ro, name_hu, name_en, name_de, aliases, sort_order)
VALUES
  ('bumbac', 'bumbac', 'pamut', 'cotton', 'baumwolle', ARRAY['COTTON','COTON','BUMBAC','PAMUT','BAUMWOLLE','COTONE'], 10),
  ('bumbac_reciclat', 'bumbac reciclat', 'újrahasznosított pamut', 'recycled cotton', 'recycelte baumwolle', ARRAY['RECYCLED COTTON','BUMBAC RECICLAT','ÚJRAHASZNOSÍTOTT PAMUT','UJRAHASZNOSITOTT PAMUT'], 11),
  ('poliester', 'poliester', 'poliészter', 'polyester', 'polyester', ARRAY['POLYESTER','POLIESTER','POLIÉSZTER','POLIESZTER','POLIESTERE'], 20),
  ('poliester_reciclat', 'poliester reciclat', 'újrahasznosított poliészter', 'recycled polyester', 'recycelter polyester', ARRAY['RECYCLED POLYESTER','POLYESTER RECYCLED','POLIESTER RECICLAT','RECYCLED POLY','ÚJRAHASZNOSÍTOTT POLIÉSZTER','UJRAHASZNOSITOTT POLIESZTER'], 21),
  ('elastan', 'elastan', 'elasztán', 'elastane', 'elasthan', ARRAY['ELASTANE','ELASTAN','ELASZTÁN','ELASZTAN','ELASTHAN','SPANDEX','LYCRA'], 30),
  ('poliamida', 'poliamidă', 'poliamid', 'polyamide', 'polyamid', ARRAY['POLYAMIDE','POLIAMIDA','POLIAMIDĂ','POLIAMID','POLYAMID','NYLON','NAILON'], 40),
  ('nailon', 'nailon', 'nejlon', 'nylon', 'nylon', ARRAY['NYLON','NAILON','NEJLON'], 45),
  ('vascoza', 'viscoză', 'viszkóz', 'viscose', 'viskose', ARRAY['VISCOSE','VISCOZĂ','VISCOZA','VISZKÓZ','VISZKOZ','VISKOSE'], 50),
  ('lana', 'lână', 'gyapjú', 'wool', 'wolle', ARRAY['WOOL','LÂNĂ','LANA','GYAPJÚ','GYAPJU','WOLLE'], 60),
  ('acril', 'acril', 'akril', 'acrylic', 'acryl', ARRAY['ACRYLIC','ACRIL','AKRIL','ACRYL'], 70),
  ('in', 'in', 'len', 'linen', 'leinen', ARRAY['LINEN','IN','LEN','LEINEN'], 80),
  ('matase', 'mătase', 'selyem', 'silk', 'seide', ARRAY['SILK','MĂTASE','MATASE','SELYEM','SEIDE'], 90),
  ('casmir', 'cașmir', 'kasmír', 'cashmere', 'kaschmir', ARRAY['CASHMERE','CAȘMIR','CASMIR','KASMÍR','KASMIR','KASCHMIR'], 100),
  ('piele', 'piele', 'bőr', 'leather', 'leder', ARRAY['LEATHER','PIELE','BŐR','BOR','LEDER'], 110),
  ('poliuretan', 'poliuretan', 'poliuretán', 'polyurethane', 'polyurethan', ARRAY['POLYURETHANE','POLIURETAN','POLIURETÁN','POLYURETHAN','PU'], 120),
  ('modal', 'modal', 'modal', 'modal', 'modal', ARRAY['MODAL'], 130),
  ('lyocell', 'lyocell', 'lyocell', 'lyocell', 'lyocell', ARRAY['LYOCELL','TENCEL'], 140),
  ('cupro', 'cupro', 'cupro', 'cupro', 'cupro', ARRAY['CUPRO'], 150),
  ('bambus', 'bambus', 'bambusz', 'bamboo', 'bambus', ARRAY['BAMBOO','BAMBUS','BAMBUSZ'], 160),
  ('cauciuc', 'cauciuc', 'gumi', 'rubber', 'gummi', ARRAY['RUBBER','CAUCIUC','GUMI','GUMMI'], 170)
ON CONFLICT (code) DO UPDATE SET
  name_ro = EXCLUDED.name_ro,
  name_hu = EXCLUDED.name_hu,
  name_en = EXCLUDED.name_en,
  name_de = EXCLUDED.name_de,
  aliases = ARRAY(
    SELECT DISTINCT x
    FROM unnest(COALESCE(aif_material_types.aliases, '{}'::text[]) || EXCLUDED.aliases) AS x
    WHERE trim(x) <> ''
  ),
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

COMMIT;
