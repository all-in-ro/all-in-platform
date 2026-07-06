-- AllInFashion inventory counting sessions / stocktake audit
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS aif_inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  location_id uuid NOT NULL REFERENCES aif_locations(id),
  status text NOT NULL DEFAULT 'draft',
  started_at timestamptz NOT NULL DEFAULT now(),
  counted_at timestamptz NULL,
  committed_at timestamptz NULL,
  actor text NULL,
  note text NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('draft','counting','review','committed','cancelled'))
);

CREATE TABLE IF NOT EXISTS aif_inventory_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES aif_inventory_counts(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES aif_product_variants(id),
  expected_qty numeric NOT NULL DEFAULT 0,
  expected_reserved_qty numeric NOT NULL DEFAULT 0,
  counted_qty numeric NULL,
  buy_price numeric NULL,
  sell_price numeric NULL,
  note text NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (count_id, variant_id)
);

CREATE INDEX IF NOT EXISTS aif_inventory_counts_location_status_idx
  ON aif_inventory_counts (location_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS aif_inventory_counts_created_idx
  ON aif_inventory_counts (created_at DESC);

CREATE INDEX IF NOT EXISTS aif_inventory_count_lines_count_idx
  ON aif_inventory_count_lines (count_id);

CREATE INDEX IF NOT EXISTS aif_inventory_count_lines_variant_idx
  ON aif_inventory_count_lines (variant_id);
