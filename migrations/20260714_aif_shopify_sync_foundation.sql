BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS aif_shopify_variant_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL UNIQUE REFERENCES aif_product_variants(id) ON DELETE CASCADE,
  sku text NOT NULL,
  shopify_product_id text NOT NULL,
  shopify_variant_id text NOT NULL UNIQUE,
  shopify_inventory_item_id text NOT NULL UNIQUE,
  shopify_product_title text NULL,
  shopify_variant_title text NULL,
  shopify_product_status text NULL,
  sync_status text NOT NULL DEFAULT 'mapped',
  last_synced_csikszereda_qty integer NULL,
  last_synced_kezdi_qty integer NULL,
  last_synced_at timestamptz NULL,
  last_error text NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS aif_shopify_variant_map_sku_lower_uidx
  ON aif_shopify_variant_map (lower(sku));
CREATE INDEX IF NOT EXISTS aif_shopify_variant_map_status_idx
  ON aif_shopify_variant_map (sync_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS aif_shopify_sync_outbox (
  variant_id uuid PRIMARY KEY REFERENCES aif_product_variants(id) ON DELETE CASCADE,
  desired_csikszereda_qty integer NOT NULL DEFAULT 0,
  desired_kezdi_qty integer NOT NULL DEFAULT 0,
  reason text NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL DEFAULT gen_random_uuid()::text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz NULL,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('pending','processing','done','error','blocked'))
);

CREATE INDEX IF NOT EXISTS aif_shopify_sync_outbox_work_idx
  ON aif_shopify_sync_outbox (status, next_attempt_at, updated_at);

CREATE TABLE IF NOT EXISTS aif_shopify_webhook_events (
  shopify_webhook_id text PRIMARY KEY,
  topic text NOT NULL,
  shop_domain text NULL,
  status text NOT NULL DEFAULT 'received',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aif_shopify_webhook_events_status_idx
  ON aif_shopify_webhook_events (status, received_at);

CREATE TABLE IF NOT EXISTS aif_shopify_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  item_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL
);

COMMIT;
