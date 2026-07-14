BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE aif_shopify_webhook_events
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS locked_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS result jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS aif_shopify_orders (
  shopify_order_id text PRIMARY KEY,
  shopify_order_legacy_id text UNIQUE,
  order_name text NULL,
  order_number bigint NULL,
  confirmation_number text NULL,
  status text NOT NULL DEFAULT 'open',
  financial_status text NULL,
  fulfillment_status text NULL,
  currency_code text NULL,
  subtotal_price numeric NULL,
  total_price numeric NULL,
  total_tax numeric NULL,
  total_discounts numeric NULL,
  total_shipping numeric NULL,
  refunded_amount numeric NOT NULL DEFAULT 0,
  customer_name text NULL,
  customer_email text NULL,
  customer_phone text NULL,
  source_name text NULL,
  note text NULL,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  shipping_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  billing_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  cancel_reason text NULL,
  shopify_created_at timestamptz NULL,
  shopify_updated_at timestamptz NULL,
  processed_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  closed_at timestamptz NULL,
  last_event_topic text NULL,
  last_webhook_id text NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aif_shopify_orders_date_idx
  ON aif_shopify_orders (shopify_created_at DESC NULLS LAST, created_at DESC);
CREATE INDEX IF NOT EXISTS aif_shopify_orders_status_idx
  ON aif_shopify_orders (status, financial_status, fulfillment_status);
CREATE INDEX IF NOT EXISTS aif_shopify_orders_name_idx
  ON aif_shopify_orders (order_name);

CREATE TABLE IF NOT EXISTS aif_shopify_order_lines (
  shopify_line_item_id text PRIMARY KEY,
  shopify_order_id text NOT NULL REFERENCES aif_shopify_orders(shopify_order_id) ON DELETE CASCADE,
  shopify_variant_id text NULL,
  shopify_product_id text NULL,
  aif_variant_id uuid NULL REFERENCES aif_product_variants(id) ON DELETE SET NULL,
  sku text NULL,
  title text NULL,
  variant_title text NULL,
  vendor text NULL,
  quantity integer NOT NULL DEFAULT 0,
  current_quantity integer NOT NULL DEFAULT 0,
  fulfillable_quantity integer NULL,
  fulfillment_status text NULL,
  unit_price numeric NULL,
  total_discount numeric NULL,
  grams integer NULL,
  requires_shipping boolean NULL,
  taxable boolean NULL,
  is_active boolean NOT NULL DEFAULT true,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aif_shopify_order_lines_order_idx
  ON aif_shopify_order_lines (shopify_order_id, is_active, created_at);
CREATE INDEX IF NOT EXISTS aif_shopify_order_lines_sku_idx
  ON aif_shopify_order_lines (sku);
CREATE INDEX IF NOT EXISTS aif_shopify_order_lines_aif_variant_idx
  ON aif_shopify_order_lines (aif_variant_id);

CREATE TABLE IF NOT EXISTS aif_shopify_refunds (
  shopify_refund_id text PRIMARY KEY,
  shopify_order_id text NOT NULL REFERENCES aif_shopify_orders(shopify_order_id) ON DELETE CASCADE,
  shopify_refund_legacy_id text UNIQUE,
  amount numeric NOT NULL DEFAULT 0,
  currency_code text NULL,
  note text NULL,
  restock boolean NULL,
  shopify_created_at timestamptz NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aif_shopify_refunds_order_idx
  ON aif_shopify_refunds (shopify_order_id, shopify_created_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS aif_shopify_refund_lines (
  shopify_refund_line_id text PRIMARY KEY,
  shopify_refund_id text NOT NULL REFERENCES aif_shopify_refunds(shopify_refund_id) ON DELETE CASCADE,
  shopify_line_item_id text NULL,
  quantity integer NOT NULL DEFAULT 0,
  subtotal numeric NULL,
  total_tax numeric NULL,
  restock_type text NULL,
  shopify_location_id text NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aif_shopify_refund_lines_refund_idx
  ON aif_shopify_refund_lines (shopify_refund_id);

CREATE INDEX IF NOT EXISTS aif_shopify_order_event_work_idx
  ON aif_shopify_webhook_events (status, next_attempt_at, received_at)
  WHERE topic IN (
    'orders/create','orders/updated','orders/cancelled','orders/paid',
    'orders/fulfilled','orders/partially_fulfilled','refunds/create'
  );

COMMIT;
