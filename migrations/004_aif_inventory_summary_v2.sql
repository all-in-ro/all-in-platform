BEGIN;

DROP VIEW IF EXISTS aif_inventory_summary;

CREATE VIEW aif_inventory_summary AS
SELECT
  v.id AS variant_id,
  v.internal_sku,
  v.barcode,
  v.image_url,
  b.name AS brand_name,
  b.code AS brand_code,
  m.id AS model_id,
  m.model_code,
  m.title_ro,
  m.title_hu,
  m.gender,
  m.product_type,
  m.season,
  m.material,
  m.status AS model_status,
  c.code AS category_code,
  c.name_ro AS category_name_ro,
  c.name_hu AS category_name_hu,
  v.color_code,
  v.color_name,
  v.color_hex,
  v.size,
  v.buy_price,
  v.sell_price,
  v.compare_at_price,
  v.status AS variant_status,
  v.updated_at AS variant_updated_at,
  COALESCE(SUM(s.qty), 0)::integer AS total_qty,
  COALESCE(SUM(s.reserved_qty), 0)::integer AS total_reserved_qty,
  (COALESCE(SUM(s.qty), 0) - COALESCE(SUM(s.reserved_qty), 0))::integer AS available_qty,
  (
    SELECT max(sm.created_at)
    FROM aif_stock_movements sm
    WHERE sm.variant_id = v.id
  ) AS last_stock_movement_at,
  (
    SELECT max(sm.created_at)
    FROM aif_stock_movements sm
    WHERE sm.variant_id = v.id
      AND sm.movement_type = 'incoming'
  ) AS last_incoming_at
FROM aif_product_variants v
JOIN aif_product_models m ON m.id = v.model_id
LEFT JOIN aif_brands b ON b.id = m.brand_id
LEFT JOIN aif_categories c ON c.id = m.category_id
LEFT JOIN aif_stock s ON s.variant_id = v.id
GROUP BY
  v.id, v.internal_sku, v.barcode, v.image_url,
  b.name, b.code, m.id, m.model_code, m.title_ro, m.title_hu, m.gender,
  m.product_type, m.season, m.material, m.status,
  c.code, c.name_ro, c.name_hu,
  v.color_code, v.color_name, v.color_hex, v.size,
  v.buy_price, v.sell_price, v.compare_at_price, v.status, v.updated_at;

COMMIT;
