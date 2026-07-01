BEGIN;

CREATE TABLE IF NOT EXISTS aif_gender_types (
  code text PRIMARY KEY,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aif_gender_types_active ON aif_gender_types(is_active, sort_order, name);

DROP TRIGGER IF EXISTS trg_aif_gender_types_updated_at ON aif_gender_types;
CREATE TRIGGER trg_aif_gender_types_updated_at BEFORE UPDATE ON aif_gender_types FOR EACH ROW EXECUTE FUNCTION aif_set_updated_at();

INSERT INTO aif_gender_types (code, name, sort_order, is_active)
VALUES
  ('men', 'Férfi', 10, true),
  ('women', 'Női', 20, true),
  ('kids', 'Gyerek', 30, true),
  ('unisex', 'Unisex', 40, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

ALTER TABLE aif_product_models
  DROP CONSTRAINT IF EXISTS aif_product_models_gender_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'aif_product_models'
      AND constraint_name = 'aif_product_models_gender_fk'
  ) THEN
    ALTER TABLE aif_product_models
      ADD CONSTRAINT aif_product_models_gender_fk
      FOREIGN KEY (gender)
      REFERENCES aif_gender_types(code)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;

COMMIT;
