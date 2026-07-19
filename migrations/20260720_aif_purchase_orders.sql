BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS aif_purchase_order_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id=1),
  series text NOT NULL DEFAULT 'CMD',
  next_number bigint NOT NULL DEFAULT 1 CHECK (next_number > 0),
  digits integer NOT NULL DEFAULT 6 CHECK (digits BETWEEN 3 AND 10),
  include_year boolean NOT NULL DEFAULT true,
  yearly_reset boolean NOT NULL DEFAULT true,
  sequence_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer,
  document_title text NOT NULL DEFAULT 'COMANDĂ CĂTRE FURNIZOR',
  document_subtitle text NOT NULL DEFAULT 'Comandă de aprovizionare',
  updated_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO aif_purchase_order_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS aif_purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  series text NOT NULL,
  sequence_number bigint NOT NULL,
  sequence_year integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ordered','partially_received','received','cancelled')),
  supplier_id uuid NOT NULL REFERENCES aif_suppliers(id),
  target_location_id uuid NULL REFERENCES aif_locations(id),
  currency_code text NOT NULL DEFAULT 'RON',
  order_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Bucharest')::date,
  expected_date date NULL,
  external_reference text NULL,
  note text NULL,
  ordered_at timestamptz NULL,
  ordered_by text NULL,
  cancelled_at timestamptz NULL,
  cancelled_by text NULL,
  created_by text NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aif_purchase_orders_status_date_idx
  ON aif_purchase_orders (status, order_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS aif_purchase_orders_supplier_idx
  ON aif_purchase_orders (supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS aif_purchase_orders_location_idx
  ON aif_purchase_orders (target_location_id, created_at DESC);

CREATE TABLE IF NOT EXISTS aif_purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES aif_purchase_orders(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  variant_id uuid NULL REFERENCES aif_product_variants(id) ON DELETE SET NULL,
  supplier_product_code text NULL,
  supplier_variant_code text NULL,
  model_code text NULL,
  product_title text NOT NULL,
  brand_name text NULL,
  category_name text NULL,
  barcode text NULL,
  sn_cod text NULL,
  customs_tariff_code text NULL,
  color_name text NULL,
  color_code text NULL,
  size text NULL,
  gender text NULL,
  product_type text NULL,
  material text NULL,
  description_ro text NULL,
  image_url text NULL,
  qty_ordered integer NOT NULL CHECK (qty_ordered > 0),
  qty_received integer NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  unit_price numeric(14,2) NULL,
  sell_price numeric(14,2) NULL,
  line_total numeric(14,2) NULL,
  currency_code text NOT NULL DEFAULT 'RON',
  note text NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, line_no)
);

CREATE INDEX IF NOT EXISTS aif_purchase_order_lines_order_idx
  ON aif_purchase_order_lines (order_id, line_no);
CREATE INDEX IF NOT EXISTS aif_purchase_order_lines_variant_idx
  ON aif_purchase_order_lines (variant_id);
CREATE INDEX IF NOT EXISTS aif_purchase_order_lines_barcode_idx
  ON aif_purchase_order_lines (barcode);

CREATE TABLE IF NOT EXISTS aif_purchase_order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES aif_purchase_orders(id) ON DELETE CASCADE,
  from_status text NULL,
  to_status text NOT NULL,
  note text NULL,
  actor text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aif_purchase_order_status_history_order_idx
  ON aif_purchase_order_status_history (order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS aif_purchase_order_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES aif_purchase_orders(id) ON DELETE CASCADE,
  order_line_id uuid NOT NULL REFERENCES aif_purchase_order_lines(id) ON DELETE CASCADE,
  reception_id uuid NULL REFERENCES aif_receptions(id) ON DELETE SET NULL,
  import_batch_id uuid NULL REFERENCES aif_import_batches(id) ON DELETE SET NULL,
  import_row_id uuid NULL REFERENCES aif_import_rows(id) ON DELETE SET NULL,
  qty integer NOT NULL CHECK (qty > 0),
  actor text NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_row_id)
);

CREATE INDEX IF NOT EXISTS aif_purchase_order_receipts_order_idx
  ON aif_purchase_order_receipts (order_id, received_at DESC);
CREATE INDEX IF NOT EXISTS aif_purchase_order_receipts_line_idx
  ON aif_purchase_order_receipts (order_line_id, received_at DESC);

ALTER TABLE IF EXISTS aif_receptions
  ADD COLUMN IF NOT EXISTS purchase_order_id uuid NULL REFERENCES aif_purchase_orders(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS aif_import_batches
  ADD COLUMN IF NOT EXISTS purchase_order_id uuid NULL REFERENCES aif_purchase_orders(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS aif_import_rows
  ADD COLUMN IF NOT EXISTS purchase_order_id uuid NULL REFERENCES aif_purchase_orders(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS aif_import_rows
  ADD COLUMN IF NOT EXISTS purchase_order_line_id uuid NULL REFERENCES aif_purchase_order_lines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS aif_receptions_purchase_order_idx
  ON aif_receptions (purchase_order_id);
CREATE INDEX IF NOT EXISTS aif_import_batches_purchase_order_idx
  ON aif_import_batches (purchase_order_id);
CREATE INDEX IF NOT EXISTS aif_import_rows_purchase_order_idx
  ON aif_import_rows (purchase_order_id, purchase_order_line_id);

COMMIT;
