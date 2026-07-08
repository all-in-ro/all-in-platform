\pset pager off
\echo '============================================================'
\echo 'AIF hiányzó alkategóriák létrehozása: TRICOU / GEANTA / SOSETE'
\echo 'Mit csinál: ha nincs megfelelő aktív alkategória, létrehozza / újraaktiválja, aliasokat ad, majd subcategory_id backfillt futtat.'
\echo 'Biztonság: nem töröl adatot. Meglévő sort frissít, ha talál; különben új alkategóriát hoz létre.'
\echo '============================================================'

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.aif_subcategory_norm(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '', 'g')
$$;

CREATE OR REPLACE FUNCTION public.aif_categories_merge_aliases(current_aliases text[], new_aliases text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(DISTINCT trim(x) ORDER BY trim(x)), ARRAY[]::text[])
  FROM unnest(COALESCE(current_aliases, ARRAY[]::text[]) || COALESCE(new_aliases, ARRAY[]::text[])) AS t(x)
  WHERE trim(coalesce(x, '')) <> ''
$$;

CREATE OR REPLACE FUNCTION public.aif_resolve_subcategory_id(source_value text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  WITH q AS (
    SELECT public.aif_subcategory_norm(source_value) AS key
  ), candidates AS (
    SELECT c.id
    FROM public.aif_categories c, q
    WHERE c.parent_id IS NOT NULL
      AND COALESCE(c.is_active, true) IS TRUE
      AND q.key <> ''
      AND (
        public.aif_subcategory_norm(c.code) = q.key
        OR public.aif_subcategory_norm(c.name_ro) = q.key
        OR public.aif_subcategory_norm(c.name_hu) = q.key
        OR EXISTS (
          SELECT 1
          FROM unnest(COALESCE(c.aliases, ARRAY[]::text[])) a(alias_value)
          WHERE public.aif_subcategory_norm(a.alias_value) = q.key
        )
      )
    ORDER BY c.sort_order NULLS LAST, c.name_ro NULLS LAST, c.code NULLS LAST, c.id
    LIMIT 1
  )
  SELECT id FROM candidates
$$;

CREATE OR REPLACE FUNCTION public.aif_product_models_autolink_subcategory()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.subcategory_id IS NULL THEN
    NEW.subcategory_id := public.aif_resolve_subcategory_id(NEW.product_type);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aif_product_models_autolink_subcategory ON public.aif_product_models;
CREATE TRIGGER trg_aif_product_models_autolink_subcategory
BEFORE INSERT OR UPDATE OF product_type, subcategory_id ON public.aif_product_models
FOR EACH ROW
EXECUTE FUNCTION public.aif_product_models_autolink_subcategory();

DROP TABLE IF EXISTS pg_temp.aif_missing_subcategory_plan;
CREATE TEMP TABLE aif_missing_subcategory_plan (
  import_value text PRIMARY KEY,
  parent_code text NOT NULL,
  parent_name_ro text NOT NULL,
  parent_name_hu text NOT NULL,
  parent_aliases text[] NOT NULL,
  sub_code text NOT NULL,
  sub_name_ro text NOT NULL,
  sub_name_hu text NOT NULL,
  sub_aliases text[] NOT NULL,
  sort_order int NOT NULL
);

INSERT INTO aif_missing_subcategory_plan
  (import_value, parent_code, parent_name_ro, parent_name_hu, parent_aliases, sub_code, sub_name_ro, sub_name_hu, sub_aliases, sort_order)
VALUES
  (
    'TRICOU',
    'IMBRACAMINTE',
    'Îmbrăcăminte',
    'Ruházat',
    ARRAY['IMBRACAMINTE','ÎMBRĂCĂMINTE','IMBRACAMINTE','APPAREL','HAINE','RUHAZAT','RUHÁZAT','CLOTHING'],
    'TRICOU',
    'Tricouri',
    'Pólók',
    ARRAY['TRICOU','TRICOURI','TRICOU BARBAT','TRICOU FEMEI','T-SHIRT','TEE','POLO','RODESCR:TRICOU','PRODUCT_TYPE:TRICOU'],
    10
  ),
  (
    'GEANTA',
    'ACCESORII',
    'Accesorii',
    'Kiegészítők',
    ARRAY['ACCESORII','ACCESSORIES','KIEGESZITOK','KIEGÉSZÍTŐK'],
    'GEANTA',
    'Genți',
    'Táskák',
    ARRAY['GEANTA','GEANTĂ','GENTI','GENȚI','BAG','BAGS','TASCA','TÁSKA','RODESCR:GEANTA','PRODUCT_TYPE:GEANTA'],
    20
  ),
  (
    'SOSETE',
    'ACCESORII',
    'Accesorii',
    'Kiegészítők',
    ARRAY['ACCESORII','ACCESSORIES','KIEGESZITOK','KIEGÉSZÍTŐK'],
    'SOSETE',
    'Șosete',
    'Zoknik',
    ARRAY['SOSETE','ȘOSETE','SOSete','CIORAPI','SOCKS','ZOKNI','ZOKNIK','RODESCR:SOSETE','PRODUCT_TYPE:SOSETE'],
    30
  );

DROP TABLE IF EXISTS pg_temp.aif_missing_subcategory_result;
CREATE TEMP TABLE aif_missing_subcategory_result (
  import_value text,
  parent_id uuid,
  parent_code text,
  parent_name_ro text,
  subcategory_id uuid,
  sub_code text,
  sub_name_ro text,
  action text
);

DO $$
DECLARE
  p record;
  v_parent_id uuid;
  v_sub_id uuid;
  v_parent_action text;
  v_sub_action text;
BEGIN
  FOR p IN SELECT * FROM aif_missing_subcategory_plan ORDER BY sort_order LOOP
    v_parent_id := NULL;
    v_sub_id := NULL;
    v_parent_action := '';
    v_sub_action := '';

    SELECT c.id
      INTO v_parent_id
    FROM public.aif_categories c
    WHERE c.parent_id IS NULL
      AND (
        public.aif_subcategory_norm(c.code) = public.aif_subcategory_norm(p.parent_code)
        OR public.aif_subcategory_norm(c.name_ro) = public.aif_subcategory_norm(p.parent_name_ro)
        OR public.aif_subcategory_norm(c.name_hu) = public.aif_subcategory_norm(p.parent_name_hu)
        OR EXISTS (
          SELECT 1
          FROM unnest(COALESCE(c.aliases, ARRAY[]::text[])) a(alias_value)
          WHERE public.aif_subcategory_norm(a.alias_value) = ANY (
            SELECT public.aif_subcategory_norm(x) FROM unnest(p.parent_aliases) x
          )
        )
      )
    ORDER BY COALESCE(c.is_active, true) DESC, c.sort_order NULLS LAST, c.name_ro NULLS LAST, c.code NULLS LAST, c.id
    LIMIT 1;

    IF v_parent_id IS NULL THEN
      INSERT INTO public.aif_categories (id, parent_id, code, name_ro, name_hu, aliases, sort_order, is_active)
      VALUES (gen_random_uuid(), NULL, p.parent_code, p.parent_name_ro, p.parent_name_hu, p.parent_aliases, p.sort_order, true)
      RETURNING id INTO v_parent_id;
      v_parent_action := 'created_parent';
    ELSE
      UPDATE public.aif_categories c
      SET
        code = COALESCE(NULLIF(c.code, ''), p.parent_code),
        name_ro = COALESCE(NULLIF(c.name_ro, ''), p.parent_name_ro),
        name_hu = COALESCE(NULLIF(c.name_hu, ''), p.parent_name_hu),
        aliases = public.aif_categories_merge_aliases(c.aliases, p.parent_aliases),
        is_active = true
      WHERE c.id = v_parent_id;
      v_parent_action := 'updated_parent';
    END IF;

    SELECT c.id
      INTO v_sub_id
    FROM public.aif_categories c
    WHERE (
        public.aif_subcategory_norm(c.code) = public.aif_subcategory_norm(p.sub_code)
        OR public.aif_subcategory_norm(c.name_ro) = public.aif_subcategory_norm(p.sub_name_ro)
        OR public.aif_subcategory_norm(c.name_hu) = public.aif_subcategory_norm(p.sub_name_hu)
        OR EXISTS (
          SELECT 1
          FROM unnest(COALESCE(c.aliases, ARRAY[]::text[])) a(alias_value)
          WHERE public.aif_subcategory_norm(a.alias_value) = ANY (
            SELECT public.aif_subcategory_norm(x) FROM unnest(p.sub_aliases || ARRAY[p.import_value]) x
          )
        )
      )
    ORDER BY COALESCE(c.is_active, true) DESC,
      CASE WHEN c.parent_id IS NOT NULL THEN 0 ELSE 1 END,
      c.sort_order NULLS LAST,
      c.name_ro NULLS LAST,
      c.code NULLS LAST,
      c.id
    LIMIT 1;

    IF v_sub_id IS NULL THEN
      INSERT INTO public.aif_categories (id, parent_id, code, name_ro, name_hu, aliases, sort_order, is_active)
      VALUES (gen_random_uuid(), v_parent_id, p.sub_code, p.sub_name_ro, p.sub_name_hu, p.sub_aliases, p.sort_order, true)
      RETURNING id INTO v_sub_id;
      v_sub_action := 'created_subcategory';
    ELSE
      UPDATE public.aif_categories c
      SET
        parent_id = v_parent_id,
        code = COALESCE(NULLIF(c.code, ''), p.sub_code),
        name_ro = COALESCE(NULLIF(c.name_ro, ''), p.sub_name_ro),
        name_hu = COALESCE(NULLIF(c.name_hu, ''), p.sub_name_hu),
        aliases = public.aif_categories_merge_aliases(c.aliases, p.sub_aliases),
        sort_order = COALESCE(c.sort_order, p.sort_order),
        is_active = true
      WHERE c.id = v_sub_id;
      v_sub_action := 'updated_subcategory';
    END IF;

    INSERT INTO aif_missing_subcategory_result
      (import_value, parent_id, parent_code, parent_name_ro, subcategory_id, sub_code, sub_name_ro, action)
    SELECT
      p.import_value,
      parent.id,
      parent.code,
      parent.name_ro,
      sub.id,
      sub.code,
      sub.name_ro,
      concat_ws(' + ', v_parent_action, v_sub_action)
    FROM public.aif_categories parent
    JOIN public.aif_categories sub ON sub.id = v_sub_id
    WHERE parent.id = v_parent_id;
  END LOOP;
END $$;

\echo ''
\echo '============================================================'
\echo 'Létrehozott / frissített alkategóriák'
\echo '============================================================'
TABLE aif_missing_subcategory_result ORDER BY import_value;

\echo ''
\echo '============================================================'
\echo 'Feloldás ellenőrzése az import product_type értékekre'
\echo '============================================================'
SELECT
  p.import_value AS product_type,
  public.aif_resolve_subcategory_id(p.import_value) AS resolved_subcategory_id,
  c.name_ro AS resolved_name_ro,
  c.name_hu AS resolved_name_hu,
  c.aliases AS resolved_aliases
FROM aif_missing_subcategory_plan p
LEFT JOIN public.aif_categories c ON c.id = public.aif_resolve_subcategory_id(p.import_value)
ORDER BY p.import_value;

\echo ''
\echo '============================================================'
\echo 'Backfill: product_models.subcategory_id kitöltése product_type alapján'
\echo '============================================================'
WITH updated AS (
  UPDATE public.aif_product_models m
  SET subcategory_id = public.aif_resolve_subcategory_id(m.product_type)
  WHERE m.subcategory_id IS NULL
    AND NULLIF(trim(COALESCE(m.product_type, '')), '') IS NOT NULL
    AND public.aif_resolve_subcategory_id(m.product_type) IS NOT NULL
  RETURNING m.id, m.product_type, m.subcategory_id
)
SELECT COUNT(*) AS backfilled_models FROM updated;

\echo ''
\echo '============================================================'
\echo 'Aktív alkategória linkek a modelleken'
\echo '============================================================'
SELECT
  m.product_type,
  m.subcategory_id,
  c.name_ro AS subcategory_name_ro,
  c.name_hu AS subcategory_name_hu,
  COUNT(*) AS linked_models
FROM public.aif_product_models m
LEFT JOIN public.aif_categories c ON c.id = m.subcategory_id
WHERE NULLIF(trim(COALESCE(m.product_type, '')), '') IS NOT NULL
GROUP BY m.product_type, m.subcategory_id, c.name_ro, c.name_hu
ORDER BY linked_models DESC, m.product_type;

\echo ''
\echo '============================================================'
\echo 'Még nem feloldott product_type értékek'
\echo 'Ha itt nincs sor, akkor a jelenlegi TRICOU / GEANTA / SOSETE importértékek kötése kész.'
\echo '============================================================'
SELECT
  m.product_type,
  COUNT(*) AS model_count,
  public.aif_resolve_subcategory_id(m.product_type) AS would_match_subcategory_id
FROM public.aif_product_models m
WHERE m.subcategory_id IS NULL
  AND NULLIF(trim(COALESCE(m.product_type, '')), '') IS NOT NULL
GROUP BY m.product_type
ORDER BY model_count DESC, m.product_type;

COMMIT;

\echo ''
\echo 'KÉSZ: hiányzó alkategóriák létrehozva/frissítve, trigger aktív, backfill lefutott.'
