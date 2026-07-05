-- AIF stock movement audit safety net
-- Logs stock changes even if a frontend/backend path updates aif_stock without explicitly inserting aif_stock_movements.
-- Also clears stock when a variant is archived through the status field.

CREATE OR REPLACE FUNCTION public.aif_stock_audit_log_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  before_qty integer;
  after_qty integer;
  before_reserved integer;
  after_reserved integer;
  delta_qty integer;
  existing_movement boolean;
  variant_status text;
  audit_source_type text;
  audit_reason text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    before_qty := 0;
    before_reserved := 0;
    after_qty := COALESCE(NEW.qty, 0)::integer;
    after_reserved := COALESCE(NEW.reserved_qty, 0)::integer;
  ELSIF TG_OP = 'UPDATE' THEN
    before_qty := COALESCE(OLD.qty, 0)::integer;
    before_reserved := COALESCE(OLD.reserved_qty, 0)::integer;
    after_qty := COALESCE(NEW.qty, 0)::integer;
    after_reserved := COALESCE(NEW.reserved_qty, 0)::integer;
  ELSE
    RETURN NEW;
  END IF;

  delta_qty := after_qty - before_qty;

  IF delta_qty = 0 AND before_reserved = after_reserved THEN
    RETURN NEW;
  END IF;

  SELECT status
    INTO variant_status
  FROM public.aif_product_variants
  WHERE id = NEW.variant_id
  LIMIT 1;

  IF delta_qty < 0 AND after_qty = 0 AND variant_status = 'archived' THEN
    audit_source_type := 'variant_archive_stock_clear';
    audit_reason := 'variant_archive_stock_clear';
  ELSE
    audit_source_type := 'stock_table_audit';
    audit_reason := 'stock_table_audit';
  END IF;

  -- DEFERRABLE trigger: this runs at transaction end, so explicit movement rows inserted by the backend
  -- are already visible. If the backend already logged the exact movement, do not duplicate it.
  SELECT EXISTS (
    SELECT 1
    FROM public.aif_stock_movements sm
    WHERE sm.location_id = NEW.location_id
      AND sm.variant_id = NEW.variant_id
      AND COALESCE(sm.qty_before, 0)::integer = before_qty
      AND COALESCE(sm.qty_after, 0)::integer = after_qty
      AND COALESCE(sm.qty_delta, 0)::integer = delta_qty
      AND sm.created_at >= (now() - interval '15 minutes')
    LIMIT 1
  ) INTO existing_movement;

  IF NOT existing_movement THEN
    INSERT INTO public.aif_stock_movements (
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
    VALUES (
      CASE WHEN delta_qty > 0 THEN 'incoming' ELSE 'manual_adjustment' END,
      audit_source_type,
      concat('stock_audit:', substr(md5(NEW.variant_id::text || ':' || NEW.location_id::text || ':' || txid_current()::text || ':' || random()::text), 1, 32)),
      NEW.location_id,
      NEW.variant_id,
      delta_qty,
      before_qty,
      after_qty,
      COALESCE(NULLIF(current_setting('aif.actor', true), ''), 'stock-audit'),
      jsonb_build_object(
        'reason', audit_reason,
        'operation', TG_OP,
        'variantStatus', variant_status,
        'qtyBefore', before_qty,
        'qtyAfter', after_qty,
        'reservedBefore', before_reserved,
        'reservedAfter', after_reserved
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aif_stock_audit_log_change_trigger ON public.aif_stock;

CREATE CONSTRAINT TRIGGER aif_stock_audit_log_change_trigger
AFTER INSERT OR UPDATE ON public.aif_stock
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.aif_stock_audit_log_change();

CREATE OR REPLACE FUNCTION public.aif_variant_archive_clears_stock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'archived' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.aif_stock
       SET qty = 0,
           reserved_qty = 0,
           updated_at = now()
     WHERE variant_id = NEW.id
       AND (COALESCE(qty, 0) <> 0 OR COALESCE(reserved_qty, 0) <> 0);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aif_variant_archive_clears_stock_trigger ON public.aif_product_variants;

CREATE TRIGGER aif_variant_archive_clears_stock_trigger
AFTER UPDATE OF status ON public.aif_product_variants
FOR EACH ROW
WHEN (NEW.status = 'archived' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.aif_variant_archive_clears_stock();

-- One-time cleanup: if a variant was already archived while stock still existed,
-- clear it now. The stock audit trigger above logs these movements.
UPDATE public.aif_stock s
   SET qty = 0,
       reserved_qty = 0,
       updated_at = now()
  FROM public.aif_product_variants v
 WHERE v.id = s.variant_id
   AND v.status = 'archived'
   AND (COALESCE(s.qty, 0) <> 0 OR COALESCE(s.reserved_qty, 0) <> 0);
