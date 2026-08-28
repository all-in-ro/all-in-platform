BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS aif_color_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ro text NOT NULL,
  name_hu text NULL,
  hex text NULL,
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE aif_color_types
  ADD COLUMN IF NOT EXISTS color_group_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'aif_color_types'::regclass
      AND conname = 'aif_color_types_color_group_id_fkey'
  ) THEN
    ALTER TABLE aif_color_types
      ADD CONSTRAINT aif_color_types_color_group_id_fkey
      FOREIGN KEY (color_group_id)
      REFERENCES aif_color_groups(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS aif_color_groups_active_sort_idx
  ON aif_color_groups (is_active, sort_order, name_hu, name_ro);

CREATE INDEX IF NOT EXISTS aif_color_types_group_idx
  ON aif_color_types (color_group_id)
  WHERE color_group_id IS NOT NULL;

COMMIT;
