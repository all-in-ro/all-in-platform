\pset pager off
\echo '============================================================'
\echo 'AIF alkategória auto-link javítás'
\echo 'Mit csinál: product_type / RODESCR jellegű értékből alkategória ID-t köt a modellekhez.'
\echo 'Nem töröl adatot. Csak NULL subcategory_id mezőt tölt, ha talál egyező AKTÍV alkategóriát.'
\echo '============================================================'

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.aif_categories') IS NULL THEN
    RAISE EXCEPTION 'Hiányzik a public.aif_categories tábla.';
  END IF;
  IF to_regclass('public.aif_product_models') IS NULL THEN
    RAISE EXCEPTION 'Hiányzik a public.aif_product_models tábla.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'aif_categories' AND column_name = 'parent_id'
  ) THEN
    RAISE EXCEPTION 'Hiányzik a public.aif_categories.parent_id oszlop.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'aif_categories' AND column_name = 'aliases'
  ) THEN
    RAISE EXCEPTION 'Hiányzik a public.aif_categories.aliases oszlop.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'aif_product_models' AND column_name = 'subcategory_id'
  ) THEN
    RAISE EXCEPTION 'Hiányzik a public.aif_product_models.subcategory_id oszlop.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'aif_product_models' AND column_name = 'product_type'
  ) THEN
    RAISE EXCEPTION 'Hiányzik a public.aif_product_models.product_type oszlop.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.aif_taxonomy_match_key(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
      lower(coalesce(p_text, '')),
      'ă', 'a'),
      'â', 'a'),
      'î', 'i'),
      'ș', 's'),
      'ş', 's'),
      'ț', 't'),
      'ţ', 't'),
      'á', 'a'),
      'é', 'e'),
      'í', 'i'),
      'ó', 'o'),
      'ö', 'o'),
      'ő', 'o'),
      'ú', 'u'),
      'ü', 'u'),
    '[^a-z0-9]+', '', 'g'
  );
$$;

CREATE OR REPLACE FUNCTION public.aif_resolve_subcategory_id(p_value text, p_parent_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_key text := public.aif_taxonomy_match_key(p_value);
  v_id uuid;
BEGIN
  IF v_key IS NULL OR v_key = '' THEN
    RETURN NULL;
  END IF;

  SELECT c.id
    INTO v_id
  FROM public.aif_categories c
  LEFT JOIN LATERAL unnest(coalesce(c.aliases, ARRAY[]::text[])) a(alias) ON true
  WHERE c.parent_id IS NOT NULL
    AND c.is_active IS DISTINCT FROM false
    AND (p_parent_id IS NULL OR c.parent_id = p_parent_id)
    AND (
      public.aif_taxonomy_match_key(c.code) = v_key
      OR public.aif_taxonomy_match_key(c.name_ro) = v_key
      OR public.aif_taxonomy_match_key(c.name_hu) = v_key
      OR public.aif_taxonomy_match_key(a.alias) = v_key
    )
  ORDER BY
    CASE
      WHEN public.aif_taxonomy_match_key(c.code) = v_key THEN 1
      WHEN public.aif_taxonomy_match_key(c.name_ro) = v_key THEN 2
      WHEN public.aif_taxonomy_match_key(c.name_hu) = v_key THEN 3
      ELSE 4
    END,
    c.name_ro NULLS LAST,
    c.id
  LIMIT 1;

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.aif_product_models_autolink_subcategory()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.subcategory_id IS NULL AND nullif(btrim(coalesce(NEW.product_type, '')), '') IS NOT NULL THEN
    NEW.subcategory_id := public.aif_resolve_subcategory_id(NEW.product_type, NULL);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_aif_product_models_autolink_subcategory ON public.aif_product_models;
CREATE TRIGGER trg_aif_product_models_autolink_subcategory
BEFORE INSERT OR UPDATE OF product_type, subcategory_id ON public.aif_product_models
FOR EACH ROW
EXECUTE FUNCTION public.aif_product_models_autolink_subcategory();

DO $$
DECLARE
  v_count int := 0;
BEGIN
  UPDATE public.aif_product_models m
     SET subcategory_id = public.aif_resolve_subcategory_id(m.product_type, NULL)
   WHERE m.subcategory_id IS NULL
     AND nullif(btrim(coalesce(m.product_type, '')), '') IS NOT NULL
     AND public.aif_resolve_subcategory_id(m.product_type, NULL) IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Backfill product_models.product_type alapján: % modell kapott subcategory_id-t.', v_count;
END $$;

DO $$
DECLARE
  v_count int := 0;
BEGIN
  IF to_regclass('public.aif_inventory_summary') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'aif_inventory_summary' AND column_name = 'model_id'
     )
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'aif_inventory_summary' AND column_name = 'product_type'
     ) THEN
    EXECUTE $SQL$
      WITH src AS (
        SELECT DISTINCT ON (model_id::text)
          model_id::text AS model_id_text,
          product_type::text AS product_type
        FROM public.aif_inventory_summary
        WHERE model_id IS NOT NULL
          AND nullif(btrim(coalesce(product_type::text, '')), '') IS NOT NULL
          AND public.aif_resolve_subcategory_id(product_type::text, NULL) IS NOT NULL
        ORDER BY model_id::text, product_type::text
      )
      UPDATE public.aif_product_models m
         SET subcategory_id = public.aif_resolve_subcategory_id(src.product_type, NULL)
        FROM src
       WHERE m.id::text = src.model_id_text
         AND m.subcategory_id IS NULL
    $SQL$;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Backfill inventory_summary.product_type alapján: % modell kapott subcategory_id-t.', v_count;
  ELSE
    RAISE NOTICE 'inventory_summary backfill kihagyva: nincs tábla vagy nincs model_id/product_type oszlop.';
  END IF;
END $$;

\echo ''
\echo '============================================================'
\echo 'Aktív alkategória linkek a modelleken'
\echo '============================================================'
SELECT
  c.id AS subcategory_id,
  c.name_ro AS subcategory_name_ro,
  c.name_hu AS subcategory_name_hu,
  c.aliases,
  count(m.id) AS linked_models
FROM public.aif_categories c
LEFT JOIN public.aif_product_models m ON m.subcategory_id = c.id
WHERE c.parent_id IS NOT NULL
  AND c.is_active IS DISTINCT FROM false
GROUP BY c.id, c.name_ro, c.name_hu, c.aliases
HAVING count(m.id) > 0
ORDER BY linked_models DESC, c.name_ro;

\echo ''
\echo '============================================================'
\echo 'Még nem feloldott product_type értékek'
\echo 'Ha would_match_subcategory_id üres, ahhoz az értékhez kell alkategória alias.'
\echo 'Példa: TRICOU alias legyen az adott alkategórián.'
\echo '============================================================'
SELECT
  m.product_type,
  count(*) AS model_count,
  public.aif_resolve_subcategory_id(m.product_type, NULL) AS would_match_subcategory_id
FROM public.aif_product_models m
WHERE m.subcategory_id IS NULL
  AND nullif(btrim(coalesce(m.product_type, '')), '') IS NOT NULL
GROUP BY m.product_type
ORDER BY model_count DESC, m.product_type;

COMMIT;

\echo ''
\echo 'KÉSZ: aif_resolve_subcategory_id + trigger telepítve, backfill lefutott.'
