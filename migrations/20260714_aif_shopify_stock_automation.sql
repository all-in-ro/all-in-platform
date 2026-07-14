BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION aif_shopify_queue_variant_stock(
  p_variant_id uuid,
  p_reason text DEFAULT 'stock_change'
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_csikszereda_qty integer := 0;
  v_kezdi_qty integer := 0;
BEGIN
  IF p_variant_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM aif_shopify_variant_map m
    WHERE m.variant_id = p_variant_id
  ) THEN
    RETURN false;
  END IF;

  SELECT
    COALESCE(sum(
      CASE
        WHEN l.code = 'main_warehouse'
          THEN GREATEST(COALESCE(s.qty, 0) - COALESCE(s.reserved_qty, 0), 0)
        ELSE 0
      END
    ), 0)::integer,
    COALESCE(sum(
      CASE
        WHEN l.code = 'magazin_targu_secuiesc'
          THEN GREATEST(COALESCE(s.qty, 0) - COALESCE(s.reserved_qty, 0), 0)
        ELSE 0
      END
    ), 0)::integer
  INTO v_csikszereda_qty, v_kezdi_qty
  FROM aif_stock s
  LEFT JOIN aif_locations l ON l.id = s.location_id
  WHERE s.variant_id = p_variant_id;

  INSERT INTO aif_shopify_sync_outbox (
    variant_id,
    desired_csikszereda_qty,
    desired_kezdi_qty,
    reason,
    status,
    attempts,
    idempotency_key,
    next_attempt_at,
    locked_at,
    last_error,
    created_at,
    updated_at
  )
  VALUES (
    p_variant_id,
    v_csikszereda_qty,
    v_kezdi_qty,
    left(COALESCE(NULLIF(trim(p_reason), ''), 'stock_change'), 500),
    'pending',
    0,
    gen_random_uuid()::text,
    now(),
    NULL,
    NULL,
    now(),
    now()
  )
  ON CONFLICT (variant_id) DO UPDATE SET
    desired_csikszereda_qty = EXCLUDED.desired_csikszereda_qty,
    desired_kezdi_qty = EXCLUDED.desired_kezdi_qty,
    reason = EXCLUDED.reason,
    status = 'pending',
    attempts = 0,
    idempotency_key = EXCLUDED.idempotency_key,
    next_attempt_at = now(),
    locked_at = NULL,
    last_error = NULL,
    updated_at = now();

  PERFORM pg_notify('aif_shopify_sync', p_variant_id::text);
  RETURN true;
EXCEPTION
  WHEN foreign_key_violation THEN
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION aif_shopify_stock_outbox_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.variant_id IS NOT DISTINCT FROM OLD.variant_id
     AND NEW.location_id IS NOT DISTINCT FROM OLD.location_id
     AND NEW.qty IS NOT DISTINCT FROM OLD.qty
     AND NEW.reserved_qty IS NOT DISTINCT FROM OLD.reserved_qty THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM aif_shopify_queue_variant_stock(OLD.variant_id, 'aif_stock_delete');
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.variant_id IS DISTINCT FROM NEW.variant_id THEN
    PERFORM aif_shopify_queue_variant_stock(OLD.variant_id, 'aif_stock_variant_changed_old');
  END IF;

  PERFORM aif_shopify_queue_variant_stock(
    NEW.variant_id,
    CASE TG_OP
      WHEN 'INSERT' THEN 'aif_stock_insert'
      WHEN 'UPDATE' THEN 'aif_stock_update'
      ELSE 'aif_stock_change'
    END
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aif_shopify_stock_outbox_trg ON aif_stock;
CREATE TRIGGER aif_shopify_stock_outbox_trg
AFTER INSERT OR UPDATE OR DELETE ON aif_stock
FOR EACH ROW
EXECUTE FUNCTION aif_shopify_stock_outbox_trigger_fn();

CREATE OR REPLACE FUNCTION aif_shopify_mapping_outbox_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM aif_shopify_queue_variant_stock(NEW.variant_id, 'shopify_mapping_created');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aif_shopify_variant_map_outbox_trg ON aif_shopify_variant_map;
CREATE TRIGGER aif_shopify_variant_map_outbox_trg
AFTER INSERT OR UPDATE ON aif_shopify_variant_map
FOR EACH ROW
EXECUTE FUNCTION aif_shopify_mapping_outbox_trigger_fn();

UPDATE aif_shopify_sync_outbox
SET
  status = 'pending',
  attempts = 0,
  idempotency_key = gen_random_uuid()::text,
  next_attempt_at = now(),
  locked_at = NULL,
  last_error = NULL,
  updated_at = now()
WHERE status = 'blocked'
  AND COALESCE(last_error, '') = 'SHOPIFY_SYNC_ENABLED=false';

COMMIT;
