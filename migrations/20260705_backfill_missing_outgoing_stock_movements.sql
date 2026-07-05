BEGIN;

WITH movement_totals AS (
  SELECT
    location_id,
    variant_id,
    COALESCE(SUM(qty_delta), 0)::numeric AS logged_qty
  FROM aif_stock_movements
  GROUP BY location_id, variant_id
), diff AS (
  SELECT
    s.location_id,
    s.variant_id,
    COALESCE(mt.logged_qty, 0)::numeric AS qty_before,
    COALESCE(s.qty, 0)::numeric AS qty_after,
    (COALESCE(s.qty, 0) - COALESCE(mt.logged_qty, 0))::numeric AS qty_delta,
    COALESCE(s.reserved_qty, 0)::numeric AS reserved_qty
  FROM aif_stock s
  LEFT JOIN movement_totals mt
    ON mt.location_id = s.location_id
   AND mt.variant_id = s.variant_id
  WHERE COALESCE(s.qty, 0) < COALESCE(mt.logged_qty, 0)
), inserted AS (
  INSERT INTO aif_stock_movements (
    movement_type,
    source_type,
    source_id,
    location_id,
    variant_id,
    qty_delta,
    qty_before,
    qty_after,
    actor,
    raw
  )
  SELECT
    'adjustment',
    'stock_movement_gap_backfill',
    'stock_movement_gap_backfill:' || d.variant_id::text || ':' || d.location_id::text || ':' || to_char(now(), 'YYYYMMDDHH24MISS'),
    d.location_id,
    d.variant_id,
    d.qty_delta,
    d.qty_before,
    d.qty_after,
    'system',
    jsonb_build_object(
      'reason', 'stock_movement_gap_backfill',
      'direction', 'out',
      'qtyBefore', d.qty_before,
      'qtyAfter', d.qty_after,
      'reservedQty', d.reserved_qty,
      'note', 'Korábbi készletcsökkentés naplóbejegyzés nélkül történt, ezért a jelenlegi készlet és a mozgásnapló különbségéből lett pótolva.'
    )
  FROM diff d
  WHERE NOT EXISTS (
    SELECT 1
    FROM aif_stock_movements sm
    WHERE sm.source_type = 'stock_movement_gap_backfill'
      AND sm.location_id = d.location_id
      AND sm.variant_id = d.variant_id
      AND sm.qty_delta = d.qty_delta
      AND sm.qty_before = d.qty_before
      AND sm.qty_after = d.qty_after
  )
  RETURNING id, created_at, variant_id, location_id, qty_delta, qty_before, qty_after
)
SELECT
  count(*)::int AS inserted_backfill_rows,
  COALESCE(sum(qty_delta), 0)::numeric AS total_backfilled_delta
FROM inserted;

COMMIT;
