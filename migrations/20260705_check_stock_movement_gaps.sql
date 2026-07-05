WITH movement_totals AS (
  SELECT
    location_id,
    variant_id,
    COALESCE(SUM(qty_delta), 0)::numeric AS logged_qty
  FROM aif_stock_movements
  GROUP BY location_id, variant_id
), stock_now AS (
  SELECT
    s.location_id,
    s.variant_id,
    COALESCE(s.qty, 0)::numeric AS current_qty,
    COALESCE(s.reserved_qty, 0)::numeric AS reserved_qty
  FROM aif_stock s
), diff AS (
  SELECT
    sn.location_id,
    sn.variant_id,
    COALESCE(mt.logged_qty, 0)::numeric AS logged_qty,
    sn.current_qty,
    sn.reserved_qty,
    (sn.current_qty - COALESCE(mt.logged_qty, 0))::numeric AS missing_delta
  FROM stock_now sn
  LEFT JOIN movement_totals mt
    ON mt.location_id = sn.location_id
   AND mt.variant_id = sn.variant_id
  WHERE sn.current_qty <> COALESCE(mt.logged_qty, 0)
)
SELECT
  m.title_ro AS product_name,
  v.barcode,
  l.name AS location_name,
  d.logged_qty,
  d.current_qty,
  d.missing_delta,
  CASE
    WHEN d.missing_delta < 0 THEN 'hiányzó kimenő mozgás'
    WHEN d.missing_delta > 0 THEN 'hiányzó bejövő / korrekció mozgás'
    ELSE 'rendben'
  END AS note
FROM diff d
JOIN aif_product_variants v ON v.id = d.variant_id
JOIN aif_product_models m ON m.id = v.model_id
JOIN aif_locations l ON l.id = d.location_id
ORDER BY abs(d.missing_delta) DESC, m.title_ro ASC, l.name ASC;
