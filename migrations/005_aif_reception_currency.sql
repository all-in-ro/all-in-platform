BEGIN;

CREATE TABLE IF NOT EXISTS aif_currencies (
  code text PRIMARY KEY,
  name text NOT NULL,
  symbol text,
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aif_exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_code text NOT NULL REFERENCES aif_currencies(code),
  rate_date date NOT NULL DEFAULT current_date,
  rate_to_ron numeric(18,6) NOT NULL CHECK (rate_to_ron > 0),
  source text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (currency_code, rate_date)
);

CREATE TABLE IF NOT EXISTS aif_receptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES aif_suppliers(id),
  target_location_id uuid REFERENCES aif_locations(id),
  invoice_number text,
  invoice_date date,
  reception_date date,
  currency_code text NOT NULL REFERENCES aif_currencies(code),
  exchange_rate_to_ron numeric(18,6) NOT NULL CHECK (exchange_rate_to_ron > 0),
  tva_mode text NOT NULL DEFAULT 'without_tva' CHECK (tva_mode IN ('without_tva','with_tva','no_tva')),
  tva_rate numeric(6,2) NOT NULL DEFAULT 19,
  shipping_cost numeric(14,2) NOT NULL DEFAULT 0,
  goods_value numeric(14,2),
  goods_value_ron numeric(14,2) GENERATED ALWAYS AS (CASE WHEN goods_value IS NULL THEN NULL ELSE round(goods_value * exchange_rate_to_ron, 2) END) STORED,
  invoice_net numeric(14,2),
  invoice_net_ron numeric(14,2) GENERATED ALWAYS AS (CASE WHEN invoice_net IS NULL THEN NULL ELSE round(invoice_net * exchange_rate_to_ron, 2) END) STORED,
  invoice_vat numeric(14,2),
  invoice_vat_ron numeric(14,2) GENERATED ALWAYS AS (CASE WHEN invoice_vat IS NULL THEN NULL ELSE round(invoice_vat * exchange_rate_to_ron, 2) END) STORED,
  invoice_gross numeric(14,2),
  invoice_gross_ron numeric(14,2) GENERATED ALWAYS AS (CASE WHEN invoice_gross IS NULL THEN NULL ELSE round(invoice_gross * exchange_rate_to_ron, 2) END) STORED,
  shipping_cost_ron numeric(14,2) GENERATED ALWAYS AS (round(shipping_cost * exchange_rate_to_ron, 2)) STORED,
  total_qty integer NOT NULL DEFAULT 0,
  line_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','committed','cancelled')),
  note text,
  raw_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text,
  actor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE aif_import_batches ADD COLUMN IF NOT EXISTS reception_id uuid REFERENCES aif_receptions(id);
ALTER TABLE aif_import_batches ADD COLUMN IF NOT EXISTS currency_code text REFERENCES aif_currencies(code);
ALTER TABLE aif_import_batches ADD COLUMN IF NOT EXISTS exchange_rate_to_ron numeric(18,6);
ALTER TABLE aif_import_batches ADD COLUMN IF NOT EXISTS invoice_number text;

ALTER TABLE aif_import_rows ADD COLUMN IF NOT EXISTS buy_price_ron numeric(12,2);
ALTER TABLE aif_import_rows ADD COLUMN IF NOT EXISTS sell_price_ron numeric(12,2);

CREATE INDEX IF NOT EXISTS idx_aif_receptions_supplier ON aif_receptions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_aif_receptions_location ON aif_receptions(target_location_id);
CREATE INDEX IF NOT EXISTS idx_aif_receptions_invoice_date ON aif_receptions(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_aif_receptions_status ON aif_receptions(status);
CREATE INDEX IF NOT EXISTS idx_aif_import_batches_reception ON aif_import_batches(reception_id);
CREATE INDEX IF NOT EXISTS idx_aif_exchange_rates_currency_date ON aif_exchange_rates(currency_code, rate_date DESC);

DROP TRIGGER IF EXISTS trg_aif_currencies_updated_at ON aif_currencies;
CREATE TRIGGER trg_aif_currencies_updated_at BEFORE UPDATE ON aif_currencies FOR EACH ROW EXECUTE FUNCTION aif_set_updated_at();

DROP TRIGGER IF EXISTS trg_aif_receptions_updated_at ON aif_receptions;
CREATE TRIGGER trg_aif_receptions_updated_at BEFORE UPDATE ON aif_receptions FOR EACH ROW EXECUTE FUNCTION aif_set_updated_at();

INSERT INTO aif_currencies (code, name, symbol, sort_order, is_active) VALUES
  ('RON','Leu românesc','lei',10,true),
  ('EUR','Euro','€',20,true),
  ('USD','Dolar american','$',30,true),
  ('HUF','Forint maghiar','Ft',40,true)
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name,
  symbol=EXCLUDED.symbol,
  sort_order=EXCLUDED.sort_order,
  is_active=true,
  updated_at=now();

INSERT INTO aif_exchange_rates (currency_code, rate_date, rate_to_ron, source, note) VALUES
  ('RON', current_date, 1, 'system', 'Monedă de bază')
ON CONFLICT (currency_code, rate_date) DO UPDATE SET
  rate_to_ron=EXCLUDED.rate_to_ron,
  source=EXCLUDED.source,
  note=EXCLUDED.note;

COMMIT;
