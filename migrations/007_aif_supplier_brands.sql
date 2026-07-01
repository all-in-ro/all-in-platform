BEGIN;

CREATE TABLE IF NOT EXISTS aif_supplier_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES aif_suppliers(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES aif_brands(id) ON DELETE CASCADE,
  is_preferred boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, brand_id)
);

CREATE INDEX IF NOT EXISTS idx_aif_supplier_brands_supplier ON aif_supplier_brands(supplier_id);
CREATE INDEX IF NOT EXISTS idx_aif_supplier_brands_brand ON aif_supplier_brands(brand_id);
CREATE INDEX IF NOT EXISTS idx_aif_supplier_brands_active ON aif_supplier_brands(is_active);

DROP TRIGGER IF EXISTS trg_aif_supplier_brands_updated_at ON aif_supplier_brands;
CREATE TRIGGER trg_aif_supplier_brands_updated_at
BEFORE UPDATE ON aif_supplier_brands
FOR EACH ROW EXECUTE FUNCTION aif_set_updated_at();

INSERT INTO aif_supplier_brands (supplier_id, brand_id, is_preferred, is_active)
SELECT s.id, b.id, true, true
FROM aif_suppliers s
JOIN aif_brands b
  ON lower(s.code) = lower(b.code)
  OR lower(s.name) = lower(b.name)
ON CONFLICT (supplier_id, brand_id) DO UPDATE SET
  is_active=true,
  is_preferred=true,
  updated_at=now();

COMMIT;
