/** Read-only statistics for credit receipts. Aliases required: p, s, sl.
 * Revenue follows receipt dates. Units are recognized on the first full
 * settlement of a line (legacy unallocated receipts: full sale settlement).
 * Never use allocation.quantity alone: partial payments also store full qty.
 */
export function creditSettlementStatisticsJoins() {
  return `
  LEFT JOIN LATERAL (
    SELECT GREATEST(sl.quantity-COALESCE(sum(e.returned_qty),0),0)::numeric AS qty
    FROM aif_shop_exchanges e
    WHERE e.source_sale_line_id=sl.id AND e.status='completed'
      AND e.created_at<=p.paid_at
  ) cs_active ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS n FROM aif_shop_customer_payment_line_allocations a
    WHERE a.customer_payment_id=p.customer_payment_id AND a.sale_id=s.id
  ) cs_allocated ON true
  LEFT JOIN LATERAL (
    SELECT sum(a.amount)::numeric AS amount, max(a.quantity)::numeric AS qty,
      min(a.line_due_after)::numeric AS due_after
    FROM aif_shop_customer_payment_line_allocations a
    WHERE a.customer_payment_id=p.customer_payment_id AND a.sale_id=s.id
      AND a.sale_line_id=sl.id
  ) cs_line ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(CASE WHEN x.quantity>0 THEN x.line_total *
      GREATEST(x.quantity-COALESCE(r.qty,0),0)/x.quantity ELSE 0 END),0)::numeric AS total
    FROM aif_shop_sale_lines x
    LEFT JOIN LATERAL (
      SELECT sum(e.returned_qty) AS qty FROM aif_shop_exchanges e
      WHERE e.source_sale_line_id=x.id AND e.status='completed' AND e.created_at<=p.paid_at
    ) r ON true WHERE x.sale_id=s.id
  ) cs_sale ON true
  LEFT JOIN LATERAL (
    SELECT min(a.balance_after)::numeric AS balance_after
    FROM aif_shop_customer_payment_allocations a
    WHERE a.customer_payment_id=p.customer_payment_id AND a.sale_id=s.id
  ) cs_balance ON true
  CROSS JOIN LATERAL (
    SELECT CASE WHEN cs_allocated.n>0 THEN COALESCE(cs_line.amount,0)
      WHEN cs_sale.total>0 AND sl.quantity>0 THEN
        p.amount * sl.line_total * cs_active.qty / sl.quantity / cs_sale.total
      ELSE 0::numeric END AS amount,
      CASE WHEN cs_allocated.n>0 THEN cs_line.due_after<=0.005
        ELSE cs_balance.balance_after<=0.005 END AS completed
  ) cs_value
  CROSS JOIN LATERAL (
    SELECT cs_value.amount::numeric AS amount,
      CASE WHEN cs_value.amount>0 AND cs_value.completed AND NOT EXISTS (
        SELECT 1 FROM aif_shop_sale_payments pp
        WHERE pp.sale_id=s.id AND pp.customer_payment_id IS NOT NULL
          AND pp.amount>0 AND pp.method<>'credit'
          AND (pp.paid_at,pp.id)<(p.paid_at,p.id)
          AND (
            EXISTS (SELECT 1 FROM aif_shop_customer_payment_line_allocations a
              WHERE a.customer_payment_id=pp.customer_payment_id AND a.sale_id=s.id
                AND a.sale_line_id=sl.id AND a.amount>0 AND a.line_due_after<=0.005)
            OR (
              NOT EXISTS (SELECT 1 FROM aif_shop_customer_payment_line_allocations a
                WHERE a.customer_payment_id=pp.customer_payment_id AND a.sale_id=s.id)
              AND EXISTS (SELECT 1 FROM aif_shop_customer_payment_allocations a
                WHERE a.customer_payment_id=pp.customer_payment_id AND a.sale_id=s.id
                  AND a.balance_after<=0.005)
            )
          )
      ) THEN LEAST(cs_active.qty,COALESCE(cs_line.qty,cs_active.qty))
        ELSE 0::numeric END AS qty
  ) credit_stats`;
}
