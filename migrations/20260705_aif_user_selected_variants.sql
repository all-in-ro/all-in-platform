-- Persistent selected product worklist for AllInFashion Warehouse
-- Keeps selected variants across browsers/devices for the same authenticated user/session owner.

CREATE TABLE IF NOT EXISTS aif_user_selected_variants (
  owner_key text NOT NULL,
  variant_id text NOT NULL,
  action text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_key, variant_id),
  CONSTRAINT aif_user_selected_variants_action_check
    CHECK (action IS NULL OR action IN ('label','order','move'))
);

-- Upgrade older installs where variant_id was uuid and/or columns were missing.
DO $$
DECLARE constraint_name text;
BEGIN
  IF to_regclass('aif_user_selected_variants') IS NOT NULL THEN
    FOR constraint_name IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'aif_user_selected_variants'::regclass
        AND contype = 'f'
    LOOP
      EXECUTE format('ALTER TABLE aif_user_selected_variants DROP CONSTRAINT IF EXISTS %I', constraint_name);
    END LOOP;
  END IF;
END $$;

ALTER TABLE aif_user_selected_variants
  ADD COLUMN IF NOT EXISTS action text NULL;
ALTER TABLE aif_user_selected_variants
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE aif_user_selected_variants
  ADD COLUMN IF NOT EXISTS raw jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE aif_user_selected_variants
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE aif_user_selected_variants
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE aif_user_selected_variants
  ALTER COLUMN variant_id TYPE text USING variant_id::text;
ALTER TABLE aif_user_selected_variants
  ALTER COLUMN owner_key TYPE text USING owner_key::text;
ALTER TABLE aif_user_selected_variants
  ALTER COLUMN sort_order SET DEFAULT 0;
ALTER TABLE aif_user_selected_variants
  ALTER COLUMN raw SET DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'aif_user_selected_variants'::regclass
      AND conname = 'aif_user_selected_variants_action_check'
  ) THEN
    ALTER TABLE aif_user_selected_variants
      ADD CONSTRAINT aif_user_selected_variants_action_check
      CHECK (action IS NULL OR action IN ('label','order','move'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS aif_user_selected_variants_owner_sort_idx
  ON aif_user_selected_variants (owner_key, sort_order, updated_at);
