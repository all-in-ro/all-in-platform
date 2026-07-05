-- Optional performance indexes for the AllInFashion stock movement page.
-- Safe to run multiple times.

CREATE INDEX IF NOT EXISTS idx_aif_stock_movements_created_at_desc
  ON aif_stock_movements (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aif_stock_movements_location_created_at_desc
  ON aif_stock_movements (location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aif_stock_movements_variant_created_at_desc
  ON aif_stock_movements (variant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aif_stock_location_variant
  ON aif_stock (location_id, variant_id);
