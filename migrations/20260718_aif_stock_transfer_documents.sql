BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS aif_stock_transfer_document_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id=1),
  series text NOT NULL DEFAULT 'PV',
  next_number bigint NOT NULL DEFAULT 1 CHECK (next_number > 0),
  digits integer NOT NULL DEFAULT 6 CHECK (digits BETWEEN 3 AND 10),
  include_year boolean NOT NULL DEFAULT true,
  yearly_reset boolean NOT NULL DEFAULT true,
  sequence_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer,
  document_title text NOT NULL DEFAULT 'PROCES-VERBAL DE PREDARE-PRIMIRE',
  document_subtitle text NOT NULL DEFAULT 'Transfer intern de stoc',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NULL
);

INSERT INTO aif_stock_transfer_document_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS aif_stock_transfer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id text NOT NULL UNIQUE,
  document_number text NOT NULL UNIQUE,
  series text NOT NULL,
  sequence_number bigint NOT NULL,
  sequence_year integer NULL,
  title text NOT NULL,
  subtitle text NULL,
  note text NULL,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','cancelled')),
  actor text NULL,
  owner_key text NULL,
  line_count integer NOT NULL DEFAULT 0,
  total_qty integer NOT NULL DEFAULT 0,
  from_location_summary text NULL,
  to_location_summary text NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aif_stock_transfer_documents_created_idx
  ON aif_stock_transfer_documents (created_at DESC);
CREATE INDEX IF NOT EXISTS aif_stock_transfer_documents_number_idx
  ON aif_stock_transfer_documents (document_number);

CREATE TABLE IF NOT EXISTS aif_stock_transfer_document_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES aif_stock_transfer_documents(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  variant_id text NULL,
  product_title text NULL,
  brand_name text NULL,
  category_name text NULL,
  product_code text NULL,
  barcode text NULL,
  color_name text NULL,
  size text NULL,
  image_url text NULL,
  from_location_id text NULL,
  from_location_name text NULL,
  to_location_id text NULL,
  to_location_name text NULL,
  qty integer NOT NULL CHECK (qty > 0),
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
