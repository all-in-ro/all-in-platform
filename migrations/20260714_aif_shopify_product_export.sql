BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS aif_shopify_product_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'prepared',
  selection_mode text NOT NULL DEFAULT 'all_model_variants',
  product_status text NOT NULL DEFAULT 'draft',
  shopify_location_id text NULL,
  shopify_location_name text NULL,
  model_count integer NOT NULL DEFAULT 0,
  variant_count integer NOT NULL DEFAULT 0,
  valid_variant_count integer NOT NULL DEFAULT 0,
  invalid_variant_count integer NOT NULL DEFAULT 0,
  warning_count integer NOT NULL DEFAULT 0,
  created_by text NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  downloaded_at timestamptz NULL,
  reconciled_at timestamptz NULL,
  CHECK (status IN ('prepared','downloaded','partially_mapped','mapped','error')),
  CHECK (selection_mode IN ('selected_variants','all_model_variants')),
  CHECK (product_status IN ('draft','active'))
);

CREATE INDEX IF NOT EXISTS aif_shopify_product_exports_created_idx
  ON aif_shopify_product_exports (created_at DESC);

CREATE TABLE IF NOT EXISTS aif_shopify_product_export_items (
  export_id uuid NOT NULL REFERENCES aif_shopify_product_exports(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES aif_product_variants(id) ON DELETE CASCADE,
  model_id uuid NOT NULL REFERENCES aif_product_models(id) ON DELETE CASCADE,
  handle text NOT NULL,
  sku text NULL,
  item_status text NOT NULL DEFAULT 'exported_pending',
  validation_errors text[] NOT NULL DEFAULT '{}'::text[],
  validation_warnings text[] NOT NULL DEFAULT '{}'::text[],
  product_row jsonb NULL,
  inventory_row jsonb NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  mapped_at timestamptz NULL,
  PRIMARY KEY (export_id, variant_id),
  CHECK (item_status IN ('exported_pending','invalid','mapped','error','skipped_mapped'))
);

CREATE INDEX IF NOT EXISTS aif_shopify_product_export_items_variant_idx
  ON aif_shopify_product_export_items (variant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS aif_shopify_product_export_items_status_idx
  ON aif_shopify_product_export_items (item_status, created_at DESC);

ALTER TABLE IF EXISTS aif_user_selected_variants
  DROP CONSTRAINT IF EXISTS aif_user_selected_variants_action_check;

ALTER TABLE IF EXISTS aif_user_selected_variants
  DROP CONSTRAINT IF EXISTS aif_user_selected_variants_check;

ALTER TABLE IF EXISTS aif_user_selected_variants
  ADD CONSTRAINT aif_user_selected_variants_action_check
  CHECK (action IS NULL OR action IN ('label','order','move','shopify'));

COMMIT;
