-- AllInFashion core product system
-- Safe migration: creates only new aif_* objects. Does not touch old allin_* / car / vacation tables.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION aif_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1) Suppliers / brands / locations

CREATE TABLE IF NOT EXISTS aif_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aif_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aif_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  location_type text NOT NULL DEFAULT 'warehouse',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aif_locations_type_check CHECK (location_type IN ('warehouse','shop','online','reserved','other'))
);

-- 2) Category tree controlled by AllIn, not by supplier XLS names

CREATE TABLE IF NOT EXISTS aif_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  parent_id uuid REFERENCES aif_categories(id) ON DELETE SET NULL,
  name_ro text NOT NULL,
  name_hu text,
  shopify_collection_handle text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Supplier-specific import profiles and value mapping

CREATE TABLE IF NOT EXISTS aif_supplier_import_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES aif_suppliers(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_format text NOT NULL DEFAULT 'xls',
  version integer NOT NULL DEFAULT 1,
  sheet_name_hint text,
  header_row_hint integer,
  is_active boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aif_import_profiles_source_format_check CHECK (source_format IN ('xls','xlsx','csv','manual','other')),
  CONSTRAINT aif_import_profiles_version_check CHECK (version > 0),
  CONSTRAINT aif_import_profiles_unique UNIQUE (supplier_id, name, version)
);

CREATE TABLE IF NOT EXISTS aif_supplier_import_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES aif_supplier_import_profiles(id) ON DELETE CASCADE,
  source_column text NOT NULL,
  target_field text NOT NULL,
  is_required boolean NOT NULL DEFAULT false,
  ordinal integer NOT NULL DEFAULT 0,
  transform_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aif_import_columns_unique UNIQUE (profile_id, source_column, target_field)
);

CREATE TABLE IF NOT EXISTS aif_supplier_value_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES aif_suppliers(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES aif_supplier_import_profiles(id) ON DELETE CASCADE,
  map_type text NOT NULL,
  source_value text NOT NULL,
  target_value text NOT NULL,
  target_extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aif_value_maps_type_check CHECK (map_type IN ('brand','category','gender','color','color_code','size','product_type','material','season','other'))
);

CREATE UNIQUE INDEX IF NOT EXISTS aif_value_maps_unique
ON aif_supplier_value_maps (
  supplier_id,
  COALESCE(profile_id, '00000000-0000-0000-0000-000000000000'::uuid),
  map_type,
  source_value
);

-- 4) Product model = Shopify product level. Variant = exact sellable size/color item.

CREATE TABLE IF NOT EXISTS aif_product_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES aif_brands(id) ON DELETE SET NULL,
  category_id uuid REFERENCES aif_categories(id) ON DELETE SET NULL,
  model_code text,
  title_ro text NOT NULL,
  title_hu text,
  description_ro text,
  gender text NOT NULL DEFAULT 'unisex',
  product_type text,
  season text,
  material text,
  shopify_title text,
  shopify_handle text,
  seo_title text,
  seo_description text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aif_product_models_gender_check CHECK (gender IN ('men','women','kids','unisex')),
  CONSTRAINT aif_product_models_status_check CHECK (status IN ('draft','active','archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS aif_product_models_model_code_unique
ON aif_product_models (model_code)
WHERE model_code IS NOT NULL AND model_code <> '';

CREATE TABLE IF NOT EXISTS aif_product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES aif_product_models(id) ON DELETE CASCADE,
  internal_sku text NOT NULL UNIQUE DEFAULT ('AIF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  barcode text UNIQUE,
  color_code text,
  color_name text,
  color_hex text,
  size text NOT NULL,
  buy_price numeric(12,2),
  sell_price numeric(12,2),
  compare_at_price numeric(12,2),
  weight_grams integer,
  image_url text,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aif_variants_status_check CHECK (status IN ('active','inactive','archived')),
  CONSTRAINT aif_variants_buy_price_check CHECK (buy_price IS NULL OR buy_price >= 0),
  CONSTRAINT aif_variants_sell_price_check CHECK (sell_price IS NULL OR sell_price >= 0),
  CONSTRAINT aif_variants_compare_price_check CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
  CONSTRAINT aif_variants_weight_check CHECK (weight_grams IS NULL OR weight_grams >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS aif_variants_model_color_size_unique
ON aif_product_variants (
  model_id,
  lower(COALESCE(color_code, '')),
  lower(COALESCE(color_name, '')),
  lower(size)
);

CREATE TABLE IF NOT EXISTS aif_variant_supplier_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES aif_product_variants(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES aif_suppliers(id) ON DELETE CASCADE,
  supplier_product_code text,
  supplier_variant_code text,
  supplier_color_code text,
  supplier_color_name text,
  supplier_size text,
  supplier_barcode text,
  supplier_sku text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS aif_variant_supplier_codes_unique
ON aif_variant_supplier_codes (
  supplier_id,
  COALESCE(supplier_product_code, ''),
  COALESCE(supplier_variant_code, ''),
  COALESCE(supplier_color_code, ''),
  COALESCE(supplier_size, '')
);

-- 5) Stock and stock movements. All stock is variant-based, never supplier-code-based.

CREATE TABLE IF NOT EXISTS aif_stock (
  location_id uuid NOT NULL REFERENCES aif_locations(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES aif_product_variants(id) ON DELETE CASCADE,
  qty integer NOT NULL DEFAULT 0,
  reserved_qty integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (location_id, variant_id),
  CONSTRAINT aif_stock_qty_check CHECK (qty >= 0),
  CONSTRAINT aif_stock_reserved_qty_check CHECK (reserved_qty >= 0 AND reserved_qty <= qty)
);

CREATE TABLE IF NOT EXISTS aif_stock_movements (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  movement_type text NOT NULL,
  source_type text,
  source_id text,
  location_id uuid NOT NULL REFERENCES aif_locations(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES aif_product_variants(id) ON DELETE RESTRICT,
  qty_delta integer NOT NULL,
  qty_before integer,
  qty_after integer,
  actor text NOT NULL DEFAULT 'system',
  note text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT aif_stock_movements_type_check CHECK (movement_type IN (
    'incoming','manual_adjustment','transfer_out','transfer_in','reservation','reservation_release','sale','return','shopify_adjustment','other'
  ))
);

-- 6) Import batches / rows. Raw XLS remains auditable; normalized rows remain editable in AllIn UI.

CREATE TABLE IF NOT EXISTS aif_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES aif_suppliers(id) ON DELETE RESTRICT,
  profile_id uuid REFERENCES aif_supplier_import_profiles(id) ON DELETE SET NULL,
  target_location_id uuid REFERENCES aif_locations(id) ON DELETE SET NULL,
  source_file_name text,
  source_file_url text,
  source_format text NOT NULL DEFAULT 'xls',
  status text NOT NULL DEFAULT 'draft',
  row_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  created_by text NOT NULL DEFAULT 'system',
  actor text NOT NULL DEFAULT 'system',
  note text,
  raw_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  committed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aif_import_batches_source_format_check CHECK (source_format IN ('xls','xlsx','csv','manual','other')),
  CONSTRAINT aif_import_batches_status_check CHECK (status IN ('draft','parsed','needs_review','committed','cancelled','failed')),
  CONSTRAINT aif_import_batches_row_count_check CHECK (row_count >= 0),
  CONSTRAINT aif_import_batches_error_count_check CHECK (error_count >= 0)
);

CREATE TABLE IF NOT EXISTS aif_import_rows (
  id bigserial PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES aif_import_batches(id) ON DELETE CASCADE,
  row_no integer NOT NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'parsed',
  error_messages text[] NOT NULL DEFAULT '{}'::text[],
  variant_id uuid REFERENCES aif_product_variants(id) ON DELETE SET NULL,
  supplier_product_code text,
  supplier_variant_code text,
  supplier_color_code text,
  supplier_size text,
  qty integer,
  buy_price numeric(12,2),
  sell_price numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aif_import_rows_row_no_check CHECK (row_no > 0),
  CONSTRAINT aif_import_rows_status_check CHECK (status IN ('parsed','error','matched','new_model','new_variant','ignored','committed')),
  CONSTRAINT aif_import_rows_qty_check CHECK (qty IS NULL OR qty >= 0),
  CONSTRAINT aif_import_rows_buy_price_check CHECK (buy_price IS NULL OR buy_price >= 0),
  CONSTRAINT aif_import_rows_sell_price_check CHECK (sell_price IS NULL OR sell_price >= 0),
  CONSTRAINT aif_import_rows_unique_row UNIQUE (batch_id, row_no)
);

-- 7) Shopify mapping. AllIn remains source of truth; Shopify is a sales channel.

CREATE TABLE IF NOT EXISTS aif_shopify_products (
  model_id uuid PRIMARY KEY REFERENCES aif_product_models(id) ON DELETE CASCADE,
  shopify_product_id text UNIQUE,
  shopify_handle text,
  shopify_status text,
  last_synced_at timestamptz,
  sync_error text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aif_shopify_variants (
  variant_id uuid PRIMARY KEY REFERENCES aif_product_variants(id) ON DELETE CASCADE,
  shopify_variant_id text UNIQUE,
  shopify_inventory_item_id text UNIQUE,
  shopify_sku text,
  last_synced_at timestamptz,
  sync_error text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 8) Barcodes. One variant may later have internal + supplier + printed codes.

CREATE TABLE IF NOT EXISTS aif_barcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES aif_product_variants(id) ON DELETE CASCADE,
  barcode text NOT NULL UNIQUE,
  barcode_type text NOT NULL DEFAULT 'internal',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aif_barcodes_type_check CHECK (barcode_type IN ('internal','ean13','upc','supplier','shopify','other'))
);

-- Indexes

CREATE INDEX IF NOT EXISTS idx_aif_models_brand ON aif_product_models(brand_id);
CREATE INDEX IF NOT EXISTS idx_aif_models_category ON aif_product_models(category_id);
CREATE INDEX IF NOT EXISTS idx_aif_models_gender ON aif_product_models(gender);
CREATE INDEX IF NOT EXISTS idx_aif_models_status ON aif_product_models(status);
CREATE INDEX IF NOT EXISTS idx_aif_variants_model ON aif_product_variants(model_id);
CREATE INDEX IF NOT EXISTS idx_aif_variants_sku ON aif_product_variants(internal_sku);
CREATE INDEX IF NOT EXISTS idx_aif_variants_barcode ON aif_product_variants(barcode);
CREATE INDEX IF NOT EXISTS idx_aif_supplier_codes_variant ON aif_variant_supplier_codes(variant_id);
CREATE INDEX IF NOT EXISTS idx_aif_supplier_codes_supplier ON aif_variant_supplier_codes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_aif_stock_location ON aif_stock(location_id);
CREATE INDEX IF NOT EXISTS idx_aif_stock_variant ON aif_stock(variant_id);
CREATE INDEX IF NOT EXISTS idx_aif_stock_moves_created ON aif_stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aif_stock_moves_location ON aif_stock_movements(location_id);
CREATE INDEX IF NOT EXISTS idx_aif_stock_moves_variant ON aif_stock_movements(variant_id);
CREATE INDEX IF NOT EXISTS idx_aif_import_batches_created ON aif_import_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aif_import_batches_supplier ON aif_import_batches(supplier_id);
CREATE INDEX IF NOT EXISTS idx_aif_import_rows_batch ON aif_import_rows(batch_id);
CREATE INDEX IF NOT EXISTS idx_aif_import_rows_status ON aif_import_rows(status);
CREATE INDEX IF NOT EXISTS idx_aif_categories_parent ON aif_categories(parent_id);

-- Triggers for updated_at

DROP TRIGGER IF EXISTS trg_aif_suppliers_updated_at ON aif_suppliers;
CREATE TRIGGER trg_aif_suppliers_updated_at BEFORE UPDATE ON aif_suppliers FOR EACH ROW EXECUTE FUNCTION aif_set_updated_at();

DROP TRIGGER IF EXISTS trg_aif_brands_updated_at ON aif_brands;
CREATE TRIGGER trg_aif_brands_updated_at BEFORE UPDATE ON aif_brands FOR EACH ROW EXECUTE FUNCTION aif_set_updated_at();

DROP TRIGGER IF EXISTS trg_aif_locations_updated_at ON aif_locations;
CREATE TRIGGER trg_aif_locations_updated_at BEFORE UPDATE ON aif_locations FOR EACH ROW EXECUTE FUNCTION aif_set_updated_at();

DROP TRIGGER IF EXISTS trg_aif_categories_updated_at ON aif_categories;
CREATE TRIGGER trg_aif_categories_updated_at BEFORE UPDATE ON aif_categories FOR EACH ROW EXECUTE FUNCTION aif_set_updated_at();

DROP TRIGGER IF EXISTS trg_aif_import_profiles_updated_at ON aif_supplier_import_profiles;
CREATE TRIGGER trg_aif_import_profiles_updated_at BEFORE UPDATE ON aif_supplier_import_profiles FOR EACH ROW EXECUTE FUNCTION aif_set_updated_at();

DROP TRIGGER IF EXISTS trg_aif_import_columns_updated_at ON aif_supplier_import_columns;
CREATE TRIGGER trg_aif_import_columns_updated_at BEFORE UPDATE ON aif_supplier_import_columns FOR EACH ROW EXECUTE FUNCTION aif_set_updated_at();

DROP TRIGGER IF EXISTS trg_aif_value_maps_updated_at ON aif_supplier_value_maps;
CREATE TRIGGER trg_aif_value_maps_updated_at BEFORE UPDATE ON aif_supplier_value_maps FOR EACH ROW EXECUTE FUNCTION aif_set_updated_at();

DROP TRIGGER IF EXISTS trg_aif_models_updated_at ON aif_product_models;
CREATE TRIGGER trg_aif_models_updated_at BEFORE UPDATE ON aif_product_models FOR EACH ROW EXECUTE FUNCTION aif_set_updated_at();

DROP TRIGGER IF EXISTS trg_aif_variants_updated_at ON aif_product_variants;
CREATE TRIGGER trg_aif_variants_updated_at BEFORE UPDATE ON aif_product_variants FOR EACH ROW EXECUTE FUNCTION aif_set_updated_at();

DROP TRIGGER IF EXISTS trg_aif_supplier_codes_updated_at ON aif_variant_supplier_codes;
CREATE TRIGGER trg_aif_supplier_codes_updated_at BEFORE UPDATE ON aif_variant_supplier_codes FOR EACH ROW EXECUTE FUNCTION aif_set_updated_at();

DROP TRIGGER IF EXISTS trg_aif_import_batches_updated_at ON aif_import_batches;
CREATE TRIGGER trg_aif_import_batches_updated_at BEFORE UPDATE ON aif_import_batches FOR EACH ROW EXECUTE FUNCTION aif_set_updated_at();

DROP TRIGGER IF EXISTS trg_aif_import_rows_updated_at ON aif_import_rows;
CREATE TRIGGER trg_aif_import_rows_updated_at BEFORE UPDATE ON aif_import_rows FOR EACH ROW EXECUTE FUNCTION aif_set_updated_at();

DROP TRIGGER IF EXISTS trg_aif_shopify_products_updated_at ON aif_shopify_products;
CREATE TRIGGER trg_aif_shopify_products_updated_at BEFORE UPDATE ON aif_shopify_products FOR EACH ROW EXECUTE FUNCTION aif_set_updated_at();

DROP TRIGGER IF EXISTS trg_aif_shopify_variants_updated_at ON aif_shopify_variants;
CREATE TRIGGER trg_aif_shopify_variants_updated_at BEFORE UPDATE ON aif_shopify_variants FOR EACH ROW EXECUTE FUNCTION aif_set_updated_at();

-- Useful inventory summary for admin UI

CREATE OR REPLACE VIEW aif_inventory_summary AS
SELECT
  v.id AS variant_id,
  v.internal_sku,
  v.barcode,
  b.name AS brand_name,
  m.id AS model_id,
  m.model_code,
  m.title_ro,
  m.gender,
  c.code AS category_code,
  c.name_ro AS category_name_ro,
  v.color_code,
  v.color_name,
  v.size,
  v.buy_price,
  v.sell_price,
  v.status AS variant_status,
  COALESCE(SUM(s.qty), 0)::integer AS total_qty,
  COALESCE(SUM(s.reserved_qty), 0)::integer AS total_reserved_qty,
  (COALESCE(SUM(s.qty), 0) - COALESCE(SUM(s.reserved_qty), 0))::integer AS available_qty
FROM aif_product_variants v
JOIN aif_product_models m ON m.id = v.model_id
LEFT JOIN aif_brands b ON b.id = m.brand_id
LEFT JOIN aif_categories c ON c.id = m.category_id
LEFT JOIN aif_stock s ON s.variant_id = v.id
GROUP BY
  v.id, v.internal_sku, v.barcode, b.name, m.id, m.model_code, m.title_ro, m.gender,
  c.code, c.name_ro, v.color_code, v.color_name, v.size, v.buy_price, v.sell_price, v.status;

-- Starter data, safe and idempotent.

INSERT INTO aif_suppliers (code, name)
VALUES
  ('under_armour', 'Under Armour'),
  ('adidas', 'Adidas'),
  ('forit', 'ForIT')
ON CONFLICT (code) DO NOTHING;

INSERT INTO aif_brands (code, name)
VALUES
  ('under_armour', 'Under Armour'),
  ('adidas', 'Adidas'),
  ('mayo_chix', 'Mayo Chix')
ON CONFLICT (code) DO NOTHING;

INSERT INTO aif_locations (code, name, location_type)
VALUES
  ('main_warehouse', 'Depozit principal', 'warehouse'),
  ('online_shop', 'Online / Shopify', 'online'),
  ('reserved', 'Rezervari', 'reserved')
ON CONFLICT (code) DO NOTHING;

INSERT INTO aif_categories (code, name_ro, name_hu, sort_order)
VALUES
  ('imbracaminte', 'Imbracaminte', 'Ruhazat', 10),
  ('incaltaminte', 'Incaltaminte', 'Labbelik', 20),
  ('accesorii', 'Accesorii', 'Kiegeszitok', 30),
  ('outlet', 'Outlet', 'Outlet', 90)
ON CONFLICT (code) DO NOTHING;

INSERT INTO aif_supplier_import_profiles (supplier_id, name, source_format, version)
SELECT id, 'Default XLS', 'xls', 1
FROM aif_suppliers
WHERE code IN ('under_armour', 'adidas', 'forit')
ON CONFLICT (supplier_id, name, version) DO NOTHING;

COMMIT;
