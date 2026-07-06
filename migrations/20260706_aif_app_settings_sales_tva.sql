-- Central AllInFashion application settings.
-- Stores the incoming sales price / TVA default globally, not per browser.

CREATE TABLE IF NOT EXISTS aif_app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NULL,
  CHECK (length(trim(key)) > 0)
);

CREATE INDEX IF NOT EXISTS aif_app_settings_updated_idx
  ON aif_app_settings (updated_at DESC);

INSERT INTO aif_app_settings (key, value, updated_by)
VALUES (
  'incoming_sales_tva',
  '{"salesTvaRate":21,"sellPriceIncludesTva":true,"salesPriceIncludesTva":true,"sellPriceCurrency":"RON"}'::jsonb,
  'system'
)
ON CONFLICT (key) DO NOTHING;
