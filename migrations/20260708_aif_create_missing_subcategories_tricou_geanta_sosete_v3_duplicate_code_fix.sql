\pset pager off
\echo '============================================================'
\echo 'AIF hiányzó alkategóriák v3 - duplicate code fix'
\echo 'Mit csinál: kezeli, ha a tricouri/geanta/sosete code már létezik fő kategóriaként vagy régi sorként.'
\echo 'Biztonság: nem töröl üzleti adatot. Meglévő kategóriasort újrahasznál/frissít, NULL subcategory_id mezőt tölt, ha biztos találat van.'
\echo '============================================================'

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Régi / duplikált resolver függvények és triggerek takarítása.
DROP TRIGGER IF EXISTS trg_aif_product_models_autolink_subcategory ON public.aif_product_models;
DROP TRIGGER IF EXISTS trg_aif_product_models_autolink_subcategory_v2 ON public.aif_product_models;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS regproc
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'aif_resolve_subcategory_id',
        'aif_resolve_subcategory_id_v2',
        'trg_aif_product_models_autolink_subcategory',
        'trg_aif_product_models_autolink_subcategory_v2'
      )
  LOOP
    RAISE NOTICE 'DROP FUNCTION IF EXISTS %', r.regproc;
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.regproc);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.aif_taxonomy_norm(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    lower(
      translate(
        coalesce(p_value, ''),
        'ĂăÂâÎîȘșŞşȚțŢţÁáÉéÍíÓóÖöŐőÚúÜüŰű',
        'AaAaIiSsSsTtTtAaEeIiOoOoOoUuUuUu'
      )
    ),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

CREATE OR REPLACE FUNCTION public.aif_resolve_subcategory_id(p_value text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_key text := public.aif_taxonomy_norm(p_value);
  v_id uuid;
BEGIN
  IF v_key IS NULL OR v_key = '' THEN
    RETURN NULL;
  END IF;

  WITH candidates AS (
    SELECT
      c.id,
      c.sort_order,
      c.name_ro,
      CASE
        WHEN public.aif_taxonomy_norm(c.code) = v_key THEN 10
        WHEN public.aif_taxonomy_norm(c.name_ro) = v_key THEN 9
        WHEN public.aif_taxonomy_norm(c.name_hu) = v_key THEN 8
        WHEN EXISTS (
          SELECT 1
          FROM unnest(coalesce(c.aliases, ARRAY[]::text[])) a(alias_value)
          WHERE public.aif_taxonomy_norm(a.alias_value) = v_key
        ) THEN 7
        ELSE 0
      END AS score
    FROM public.aif_categories c
    WHERE coalesce(c.is_active, true) = true
      AND c.parent_id IS NOT NULL
      AND (
        public.aif_taxonomy_norm(c.code) = v_key
        OR public.aif_taxonomy_norm(c.name_ro) = v_key
        OR public.aif_taxonomy_norm(c.name_hu) = v_key
        OR EXISTS (
          SELECT 1
          FROM unnest(coalesce(c.aliases, ARRAY[]::text[])) a(alias_value)
          WHERE public.aif_taxonomy_norm(a.alias_value) = v_key
        )
      )
  )
  SELECT id
    INTO v_id
  FROM candidates
  ORDER BY
    score DESC,
    CASE WHEN coalesce(sort_order::text, '') ~ '^\d+$' THEN sort_order::text::int ELSE 999999 END,
    name_ro NULLS LAST,
    id
  LIMIT 1;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_aif_product_models_autolink_subcategory()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.subcategory_id IS NULL THEN
    NEW.subcategory_id := public.aif_resolve_subcategory_id(NEW.product_type::text);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_aif_product_models_autolink_subcategory
BEFORE INSERT OR UPDATE OF product_type, subcategory_id
ON public.aif_product_models
FOR EACH ROW
EXECUTE FUNCTION public.trg_aif_product_models_autolink_subcategory();

DROP TABLE IF EXISTS pg_temp.aif_missing_subcategory_plan;
CREATE TEMP TABLE aif_missing_subcategory_plan (
  import_value text PRIMARY KEY,
  parent_code text NOT NULL,
  parent_name_ro text NOT NULL,
  parent_name_hu text,
  sub_code text NOT NULL,
  sub_name_ro text NOT NULL,
  sub_name_hu text,
  aliases text[] NOT NULL,
  sort_order integer NOT NULL DEFAULT 10
) ON COMMIT DROP;

INSERT INTO aif_missing_subcategory_plan
  (import_value, parent_code, parent_name_ro, parent_name_hu, sub_code, sub_name_ro, sub_name_hu, aliases, sort_order)
VALUES
  ('TRICOU', 'IMBRACAMINTE', 'Îmbrăcăminte', 'Ruházat', 'tricouri', 'Tricouri', 'Pólók', ARRAY['TRICOU','TRICOURI','TRICOU BARBATI','TRICOURI BARBATI','T-SHIRT','TSHIRT','POLO','RODESCR TRICOU'], 10),
  ('GEANTA', 'ACCESORII', 'Accesorii', 'Kiegészítők', 'geanta', 'Genți', 'Táskák', ARRAY['GEANTA','GEANTĂ','GENTI','GENȚI','BAG','BAGS','TASCA','TÁSKA','RODESCR GEANTA'], 20),
  ('SOSETE', 'ACCESORII', 'Accesorii', 'Kiegészítők', 'sosete', 'Șosete', 'Zoknik', ARRAY['SOSETE','ȘOSETE','SOSETA','ȘOSETĂ','CIORAPI','SOCKS','ZOKNI','RODESCR SOSETE'], 30);

DROP TABLE IF EXISTS pg_temp.aif_missing_subcategory_result;
CREATE TEMP TABLE aif_missing_subcategory_result (
  import_value text,
  parent_id uuid,
  parent_code text,
  parent_name_ro text,
  subcategory_id uuid,
  previous_parent_id uuid,
  sub_code text,
  sub_name_ro text,
  action text
) ON COMMIT DROP;

DO $$
DECLARE
  p record;
  v_parent_id uuid;
  v_sub_id uuid;
  v_previous_parent_id uuid;
  v_action text;
BEGIN
  FOR p IN SELECT * FROM aif_missing_subcategory_plan ORDER BY sort_order LOOP
    v_parent_id := NULL;
    v_sub_id := NULL;
    v_previous_parent_id := NULL;
    v_action := '';

    -- 1) Fő kategória keresés. Ha a code már létezik, azt használjuk, nem próbálunk duplikált code-ot beszúrni.
    SELECT c.id
      INTO v_parent_id
    FROM public.aif_categories c
    WHERE (
        public.aif_taxonomy_norm(c.code) = public.aif_taxonomy_norm(p.parent_code)
        OR public.aif_taxonomy_norm(c.name_ro) = public.aif_taxonomy_norm(p.parent_name_ro)
        OR public.aif_taxonomy_norm(c.name_hu) = public.aif_taxonomy_norm(p.parent_name_hu)
      )
    ORDER BY
      CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END,
      coalesce(c.is_active, true) DESC,
      c.created_at NULLS FIRST,
      c.id
    LIMIT 1;

    IF v_parent_id IS NULL THEN
      INSERT INTO public.aif_categories (id, parent_id, code, name_ro, name_hu, aliases, sort_order, is_active, created_at, updated_at)
      VALUES (gen_random_uuid(), NULL, p.parent_code, p.parent_name_ro, p.parent_name_hu, ARRAY[p.parent_code, p.parent_name_ro, coalesce(p.parent_name_hu, '')]::text[], p.sort_order, true, now(), now())
      ON CONFLICT (code) DO NOTHING
      RETURNING id INTO v_parent_id;

      IF v_parent_id IS NULL THEN
        SELECT id INTO v_parent_id
        FROM public.aif_categories
        WHERE code = p.parent_code
        LIMIT 1;
      END IF;

      v_action := 'created_or_reused_parent';
    ELSE
      v_action := 'updated_parent';
    END IF;

    IF v_parent_id IS NULL THEN
      RAISE EXCEPTION 'Nem sikerült fő kategóriát létrehozni/keresni: %', p.parent_code;
    END IF;

    UPDATE public.aif_categories AS c
       SET parent_id = NULL,
           code = CASE
             WHEN nullif(trim(coalesce(c.code, '')), '') IS NULL THEN p.parent_code
             WHEN c.code = p.parent_code THEN p.parent_code
             WHEN NOT EXISTS (SELECT 1 FROM public.aif_categories x WHERE x.id <> c.id AND x.code = p.parent_code) THEN p.parent_code
             ELSE c.code
           END,
           name_ro = coalesce(nullif(c.name_ro, ''), p.parent_name_ro),
           name_hu = coalesce(nullif(c.name_hu, ''), p.parent_name_hu),
           aliases = (
             SELECT coalesce(array_agg(DISTINCT trim(x) ORDER BY trim(x)), ARRAY[]::text[])
             FROM unnest(coalesce(c.aliases, ARRAY[]::text[]) || ARRAY[p.parent_code, p.parent_name_ro, coalesce(p.parent_name_hu, '')]::text[]) raw(x)
             WHERE nullif(trim(x), '') IS NOT NULL
           ),
           is_active = true,
           updated_at = now()
     WHERE c.id = v_parent_id;

    -- 2) Alkategória keresés. FONTOS: itt már minden kategóriasorban keresünk, nem csak parent_id IS NOT NULL sorokban.
    -- Ez javítja azt, amikor pl. code=tricouri már létezik fő kategóriaként, ezért az INSERT unique hibára futna.
    SELECT c.id, c.parent_id
      INTO v_sub_id, v_previous_parent_id
    FROM public.aif_categories c
    WHERE c.id <> v_parent_id
      AND (
        public.aif_taxonomy_norm(c.code) = public.aif_taxonomy_norm(p.sub_code)
        OR public.aif_taxonomy_norm(c.name_ro) = public.aif_taxonomy_norm(p.sub_name_ro)
        OR public.aif_taxonomy_norm(c.name_hu) = public.aif_taxonomy_norm(p.sub_name_hu)
        OR public.aif_taxonomy_norm(c.code) = public.aif_taxonomy_norm(p.import_value)
        OR public.aif_taxonomy_norm(c.name_ro) = public.aif_taxonomy_norm(p.import_value)
        OR public.aif_taxonomy_norm(c.name_hu) = public.aif_taxonomy_norm(p.import_value)
        OR EXISTS (
          SELECT 1
          FROM unnest(coalesce(c.aliases, ARRAY[]::text[])) a(alias_value)
          WHERE public.aif_taxonomy_norm(a.alias_value) = public.aif_taxonomy_norm(p.import_value)
             OR public.aif_taxonomy_norm(a.alias_value) = ANY (
               SELECT public.aif_taxonomy_norm(x)
               FROM unnest(p.aliases) x
             )
        )
      )
    ORDER BY
      CASE WHEN c.code = p.sub_code THEN 0 ELSE 1 END,
      CASE WHEN c.parent_id = v_parent_id THEN 0 ELSE 1 END,
      CASE WHEN c.parent_id IS NOT NULL THEN 0 ELSE 1 END,
      coalesce(c.is_active, true) DESC,
      c.created_at NULLS FIRST,
      c.id
    LIMIT 1;

    IF v_sub_id IS NULL THEN
      INSERT INTO public.aif_categories (id, parent_id, code, name_ro, name_hu, aliases, sort_order, is_active, created_at, updated_at)
      VALUES (gen_random_uuid(), v_parent_id, p.sub_code, p.sub_name_ro, p.sub_name_hu, p.aliases, p.sort_order, true, now(), now())
      ON CONFLICT (code) DO NOTHING
      RETURNING id INTO v_sub_id;

      IF v_sub_id IS NULL THEN
        SELECT c.id, c.parent_id
          INTO v_sub_id, v_previous_parent_id
        FROM public.aif_categories c
        WHERE c.code = p.sub_code
        LIMIT 1;
      END IF;

      v_action := v_action || ' + created_or_reused_subcategory';
    ELSE
      v_action := v_action || ' + updated_existing_subcategory';
    END IF;

    IF v_sub_id IS NULL THEN
      RAISE EXCEPTION 'Nem sikerült alkategóriát létrehozni/keresni: %', p.sub_code;
    END IF;

    UPDATE public.aif_categories AS c
       SET parent_id = v_parent_id,
           code = CASE
             WHEN nullif(trim(coalesce(c.code, '')), '') IS NULL THEN p.sub_code
             WHEN c.code = p.sub_code THEN p.sub_code
             WHEN NOT EXISTS (SELECT 1 FROM public.aif_categories x WHERE x.id <> c.id AND x.code = p.sub_code) THEN p.sub_code
             ELSE c.code
           END,
           name_ro = CASE
             WHEN nullif(trim(coalesce(c.name_ro, '')), '') IS NULL OR public.aif_taxonomy_norm(c.name_ro) = public.aif_taxonomy_norm(p.import_value) THEN p.sub_name_ro
             ELSE c.name_ro
           END,
           name_hu = coalesce(nullif(c.name_hu, ''), p.sub_name_hu),
           aliases = (
             SELECT coalesce(array_agg(DISTINCT trim(x) ORDER BY trim(x)), ARRAY[]::text[])
             FROM unnest(coalesce(c.aliases, ARRAY[]::text[]) || p.aliases || ARRAY[p.import_value, p.sub_code, p.sub_name_ro, coalesce(p.sub_name_hu, '')]::text[]) raw(x)
             WHERE nullif(trim(x), '') IS NOT NULL
           ),
           sort_order = coalesce(c.sort_order, p.sort_order),
           is_active = true,
           updated_at = now()
     WHERE c.id = v_sub_id;

    INSERT INTO aif_missing_subcategory_result
      (import_value, parent_id, parent_code, parent_name_ro, subcategory_id, previous_parent_id, sub_code, sub_name_ro, action)
    SELECT
      p.import_value,
      parent.id,
      parent.code,
      parent.name_ro,
      sub.id,
      v_previous_parent_id,
      sub.code,
      sub.name_ro,
      v_action
    FROM public.aif_categories parent
    JOIN public.aif_categories sub ON sub.id = v_sub_id
    WHERE parent.id = v_parent_id;
  END LOOP;
END $$;

\echo ''
\echo '============================================================'
\echo 'Létrehozott / frissített / újrahasznált alkategóriák'
\echo '============================================================'
TABLE aif_missing_subcategory_result ORDER BY import_value;

\echo ''
\echo '============================================================'
\echo 'Feloldás ellenőrzése az import product_type értékekre'
\echo '============================================================'
SELECT
  p.import_value,
  public.aif_resolve_subcategory_id(p.import_value::text) AS resolved_subcategory_id,
  c.code,
  c.name_ro,
  c.name_hu,
  c.aliases
FROM aif_missing_subcategory_plan p
LEFT JOIN public.aif_categories c ON c.id = public.aif_resolve_subcategory_id(p.import_value::text)
ORDER BY p.import_value;

\echo ''
\echo '============================================================'
\echo 'Backfill: product_models.subcategory_id kitöltése product_type alapján'
\echo '============================================================'
WITH resolved AS (
  SELECT
    m.id,
    public.aif_resolve_subcategory_id(m.product_type::text) AS subcategory_id
  FROM public.aif_product_models m
  WHERE m.subcategory_id IS NULL
    AND nullif(trim(coalesce(m.product_type::text, '')), '') IS NOT NULL
), updated AS (
  UPDATE public.aif_product_models m
     SET subcategory_id = r.subcategory_id,
         updated_at = now()
    FROM resolved r
   WHERE m.id = r.id
     AND r.subcategory_id IS NOT NULL
  RETURNING m.id, m.product_type, m.subcategory_id
)
SELECT count(*) AS backfilled_models FROM updated;

\echo ''
\echo '============================================================'
\echo 'Aktív alkategória linkek a modelleken'
\echo '============================================================'
SELECT
  m.product_type,
  m.subcategory_id,
  c.name_ro AS subcategory_name_ro,
  c.name_hu AS subcategory_name_hu,
  count(*) AS linked_models
FROM public.aif_product_models m
LEFT JOIN public.aif_categories c ON c.id = m.subcategory_id
WHERE nullif(trim(coalesce(m.product_type::text, '')), '') IS NOT NULL
GROUP BY m.product_type, m.subcategory_id, c.name_ro, c.name_hu
ORDER BY m.product_type;

\echo ''
\echo '============================================================'
\echo 'Még nem feloldott product_type értékek'
\echo 'Ha itt marad sor, ahhoz továbbra sincs egyértelmű aktív alkategória alias.'
\echo '============================================================'
SELECT
  m.product_type,
  count(*) AS model_count,
  public.aif_resolve_subcategory_id(m.product_type::text) AS would_match_subcategory_id
FROM public.aif_product_models m
WHERE m.subcategory_id IS NULL
  AND nullif(trim(coalesce(m.product_type::text, '')), '') IS NOT NULL
GROUP BY m.product_type
ORDER BY count(*) DESC, m.product_type;

COMMIT;

\echo ''
\echo 'KÉSZ: v3 duplicate-code fix lefutott. Ha backfilled_models > 0, az alkategória-kötés már él.'
