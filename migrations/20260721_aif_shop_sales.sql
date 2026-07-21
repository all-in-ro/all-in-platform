BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS aif_shop_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NULL,
  email text NULL,
  address text NULL,
  city text NULL,
  notes text NULL,
  credit_limit numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_by text NULL,
  updated_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aif_shop_customers_name_idx
  ON aif_shop_customers (lower(full_name));
CREATE INDEX IF NOT EXISTS aif_shop_customers_phone_idx
  ON aif_shop_customers (lower(phone))
  WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS aif_shop_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number text NOT NULL UNIQUE,
  location_id uuid NOT NULL REFERENCES aif_locations(id),
  customer_id uuid NULL REFERENCES aif_shop_customers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','completed','cancelled','refunded')),
  sale_type text NOT NULL DEFAULT 'sale'
    CHECK (sale_type IN ('sale','reservation','credit')),
  payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','partial','paid','credit')),
  actor text NOT NULL DEFAULT 'system',
  sold_at timestamptz NOT NULL DEFAULT now(),
  subtotal numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  total numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  paid_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_total >= 0),
  balance_due numeric(14,2) NOT NULL DEFAULT 0 CHECK (balance_due >= 0),
  currency_code text NOT NULL DEFAULT 'RON',
  customer_name text NULL,
  customer_phone text NULL,
  note text NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aif_shop_sales_location_date_idx
  ON aif_shop_sales (location_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS aif_shop_sales_payment_idx
  ON aif_shop_sales (location_id, payment_status, sold_at DESC);
CREATE INDEX IF NOT EXISTS aif_shop_sales_actor_idx
  ON aif_shop_sales (location_id, actor, sold_at DESC);
CREATE INDEX IF NOT EXISTS aif_shop_sales_customer_idx
  ON aif_shop_sales (customer_id, sold_at DESC);

CREATE TABLE IF NOT EXISTS aif_shop_sale_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES aif_shop_sales(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  variant_id uuid NULL REFERENCES aif_product_variants(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  list_price numeric(14,2) NOT NULL DEFAULT 0 CHECK (list_price >= 0),
  unit_price numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  discount_percent numeric(7,3) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0),
  line_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  buy_price_snapshot numeric(14,2) NULL,
  product_title text NULL,
  product_code text NULL,
  barcode text NULL,
  brand_name text NULL,
  category_name text NULL,
  color_name text NULL,
  size text NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sale_id, line_no)
);

CREATE INDEX IF NOT EXISTS aif_shop_sale_lines_sale_idx
  ON aif_shop_sale_lines (sale_id, line_no);
CREATE INDEX IF NOT EXISTS aif_shop_sale_lines_variant_idx
  ON aif_shop_sale_lines (variant_id);
CREATE INDEX IF NOT EXISTS aif_shop_sale_lines_brand_idx
  ON aif_shop_sale_lines (lower(brand_name))
  WHERE brand_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS aif_shop_sale_lines_category_idx
  ON aif_shop_sale_lines (lower(category_name))
  WHERE category_name IS NOT NULL;

CREATE TABLE IF NOT EXISTS aif_shop_sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES aif_shop_sales(id) ON DELETE CASCADE,
  method text NOT NULL
    CHECK (method IN ('cash','card','bank_transfer','credit','voucher','other')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_at timestamptz NOT NULL DEFAULT now(),
  actor text NULL,
  reference text NULL,
  note text NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aif_shop_sale_payments_sale_idx
  ON aif_shop_sale_payments (sale_id, paid_at ASC);
CREATE INDEX IF NOT EXISTS aif_shop_sale_payments_method_idx
  ON aif_shop_sale_payments (method, paid_at DESC);

CREATE TABLE IF NOT EXISTS aif_shop_sale_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES aif_shop_sales(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor text NULL,
  note text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aif_shop_sale_events_sale_idx
  ON aif_shop_sale_events (sale_id, created_at ASC);
CREATE INDEX IF NOT EXISTS aif_shop_sale_events_created_idx
  ON aif_shop_sale_events (created_at DESC);

COMMIT;
