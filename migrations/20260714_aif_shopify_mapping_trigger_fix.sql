BEGIN;

CREATE OR REPLACE FUNCTION aif_shopify_mapping_outbox_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM aif_shopify_queue_variant_stock(
      NEW.variant_id,
      'shopify_mapping_created'
    );

  ELSIF NEW.variant_id IS DISTINCT FROM OLD.variant_id
     OR NEW.shopify_variant_id IS DISTINCT FROM OLD.shopify_variant_id
     OR NEW.shopify_inventory_item_id IS DISTINCT FROM OLD.shopify_inventory_item_id THEN

    PERFORM aif_shopify_queue_variant_stock(
      NEW.variant_id,
      'shopify_mapping_changed'
    );
  END IF;

  RETURN NEW;
END;
$$;

UPDATE aif_shopify_sync_outbox AS o
SET
  status = 'done',
  attempts = GREATEST(o.attempts, 1),
  locked_at = NULL,
  last_error = NULL,
  updated_at = now()
FROM aif_shopify_variant_map AS m
WHERE m.variant_id = o.variant_id
  AND o.status = 'pending'
  AND o.desired_csikszereda_qty IS NOT DISTINCT FROM m.last_synced_csikszereda_qty
  AND o.desired_kezdi_qty IS NOT DISTINCT FROM m.last_synced_kezdi_qty
  AND m.last_synced_at IS NOT NULL;

COMMIT;
