BEGIN;

ALTER TABLE IF EXISTS aif_stock_transfer_documents
  ADD COLUMN IF NOT EXISTS total_value numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS aif_stock_transfer_documents
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'RON';

ALTER TABLE IF EXISTS aif_stock_transfer_document_lines
  ADD COLUMN IF NOT EXISTS unit_price numeric(14,2) NULL;

ALTER TABLE IF EXISTS aif_stock_transfer_document_lines
  ADD COLUMN IF NOT EXISTS line_total numeric(14,2) NULL;

ALTER TABLE IF EXISTS aif_stock_transfer_document_lines
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'RON';

-- Csak ELADÁSI ár. A korábbi hivatalos átadásoknál egyszeri visszatöltés
-- a termék jelenlegi eladási árából, mert átadáskori árpillanatkép még nem létezett.
UPDATE aif_stock_transfer_document_lines l
SET unit_price = round(v.sell_price::numeric, 2),
    line_total = round(l.qty::numeric * v.sell_price::numeric, 2),
    currency_code = 'RON'
FROM aif_product_variants v
WHERE l.variant_id = v.id
  AND l.unit_price IS NULL
  AND v.sell_price IS NOT NULL;

UPDATE aif_stock_transfer_document_lines
SET line_total = round(qty::numeric * unit_price::numeric, 2)
WHERE line_total IS NULL
  AND unit_price IS NOT NULL;

UPDATE aif_stock_transfer_documents d
SET total_value = COALESCE(x.total_value, 0),
    currency_code = 'RON'
FROM (
  SELECT document_id, round(COALESCE(sum(line_total), 0)::numeric, 2) AS total_value
  FROM aif_stock_transfer_document_lines
  GROUP BY document_id
) x
WHERE x.document_id = d.id;

COMMIT;
