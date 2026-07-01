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
  COALESCE(sup.supplier_names, '') AS supplier_names,
  COALESCE(sup.supplier_codes, '') AS supplier_codes,
  COALESCE(sup.supplier_ids, '') AS supplier_ids,
  COALESCE(sup.suppliers, '[]'::jsonb) AS suppliers,
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
  COALESCE(SUM(st.qty), 0)::integer AS total_qty,
  COALESCE(SUM(st.reserved_qty), 0)::integer AS total_reserved_qty,
  (COALESCE(SUM(st.qty), 0) - COALESCE(SUM(st.reserved_qty), 0))::integer AS available_qty,
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
LEFT JOIN aif_stock st ON st.variant_id = v.id
LEFT JOIN LATERAL (
  SELECT
    string_agg(DISTINCT s.name, ', ' ORDER BY s.name) AS supplier_names,
    string_agg(DISTINCT s.code, ',' ORDER BY s.code) AS supplier_codes,
    string_agg(DISTINCT s.id::text, ',') AS supplier_ids,
    jsonb_agg(DISTINCT jsonb_build_object('id', s.id::text, 'code', s.code, 'name', s.name)) FILTER (WHERE s.id IS NOT NULL) AS suppliers
  FROM aif_variant_supplier_codes sc
  JOIN aif_suppliers s ON s.id = sc.supplier_id
  WHERE sc.variant_id = v.id
    AND sc.is_active = true
    AND s.is_active = true
) sup ON true
GROUP BY
  v.id, v.internal_sku, v.barcode, v.image_url,
  b.name, b.code,
  sup.supplier_names, sup.supplier_codes, sup.supplier_ids, sup.suppliers,
  m.id, m.model_code, m.title_ro, m.title_hu, m.gender,
  m.product_type, m.season, m.material, m.status,
  c.code, c.name_ro, c.name_hu,
  v.color_code, v.color_name, v.color_hex, v.size,
  v.buy_price, v.sell_price, v.compare_at_price, v.status, v.updated_at;

COMMIT;
