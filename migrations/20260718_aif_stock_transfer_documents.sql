BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS aif_stock_transfer_document_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id=1),
  series text NOT NULL DEFAULT 'PV',
  next_number bigint NOT NULL DEFAULT 1 CHECK (next_number > 0),
  padding smallint NOT NULL DEFAULT 6 CHECK (padding BETWEEN 1 AND 12),
  include_year boolean NOT NULL DEFAULT true,
  reset_yearly boolean NOT NULL DEFAULT true,
  current_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer,
  document_title text NOT NULL DEFAULT 'PROCES-VERBAL DE PREDARE-PRIMIRE',
  document_subtitle text NOT NULL DEFAULT 'TRANSFER INTERN DE STOC',
  updated_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO aif_stock_transfer_document_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS aif_stock_transfer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id text NOT NULL UNIQUE,
  idempotency_key text NULL,
  document_number text NOT NULL UNIQUE,
  series text NOT NULL,
  sequence_number bigint NOT NULL,
  document_year integer NOT NULL,
  document_title text NOT NULL,
  document_subtitle text NULL,
  transfer_title text NULL,
  note text NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','cancelled')),
  line_count integer NOT NULL DEFAULT 0,
  total_qty integer NOT NULL DEFAULT 0,
  from_locations text[] NOT NULL DEFAULT '{}'::text[],
  to_locations text[] NOT NULL DEFAULT '{}'::text[],
  created_by text NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aif_stock_transfer_documents_created_idx
  ON aif_stock_transfer_documents (created_at DESC);
CREATE INDEX IF NOT EXISTS aif_stock_transfer_documents_number_idx
  ON aif_stock_transfer_documents (document_number);
CREATE INDEX IF NOT EXISTS aif_stock_transfer_documents_status_idx
  ON aif_stock_transfer_documents (status, created_at DESC);

CREATE TABLE IF NOT EXISTS aif_stock_transfer_document_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES aif_stock_transfer_documents(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  variant_id uuid NULL,
  product_title text NULL,
  brand_name text NULL,
  category_name text NULL,
  product_code text NULL,
  barcode text NULL,
  color_name text NULL,
  size text NULL,
  image_url text NULL,
  from_location_id uuid NULL,
  from_location_name text NULL,
  to_location_id uuid NULL,
  to_location_name text NULL,
  qty integer NOT NULL DEFAULT 0,
  source_before integer NULL,
  source_after integer NULL,
  target_before integer NULL,
  target_after integer NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, line_no)
);

CREATE INDEX IF NOT EXISTS aif_stock_transfer_document_lines_document_idx
  ON aif_stock_transfer_document_lines (document_id, line_no);
CREATE INDEX IF NOT EXISTS aif_stock_transfer_document_lines_variant_idx
  ON aif_stock_transfer_document_lines (variant_id);

COMMIT;
