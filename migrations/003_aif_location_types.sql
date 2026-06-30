BEGIN;

CREATE TABLE IF NOT EXISTS aif_location_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aif_location_types_active ON aif_location_types (is_active, sort_order, name);

DROP TRIGGER IF EXISTS trg_aif_location_types_updated_at ON aif_location_types;
CREATE TRIGGER trg_aif_location_types_updated_at
BEFORE UPDATE ON aif_location_types
FOR EACH ROW EXECUTE FUNCTION aif_set_updated_at();

INSERT INTO aif_location_types (code, name, sort_order, is_active)
VALUES
  ('warehouse', 'Raktár', 10, true),
  ('shop', 'Üzlet / helyszín', 20, true),
  ('online', 'Online', 30, true),
  ('reserved', 'Foglalás', 40, true),
  ('other', 'Egyéb', 90, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

COMMIT;
