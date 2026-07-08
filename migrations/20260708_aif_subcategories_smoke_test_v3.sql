\set ON_ERROR_STOP on
\pset pager off

\echo '============================================================'
\echo 'AIF alkategória smoke test v3 - ÚJ FÁJL'
\echo 'Mit néz: aif_categories mentés / módosítás / törlés + import alkategória nyomok'
\echo 'Biztonság: ZZZ_TEST sorokat használ és ROLLBACK-kel zár, tehát nem hagy bent szemetet.'
\echo '============================================================'

BEGIN;

DROP TABLE IF EXISTS pg_temp.aif_subcategory_import_probe;
CREATE TEMP TABLE aif_subcategory_import_probe (
  probe_type text,
  table_name text,
  column_name text,
  data_type text,
  total_rows bigint,
  nonempty_rows bigint,
  sample_value text
) ON COMMIT DROP;

DO $$
DECLARE
  v_main_id uuid := (
    substr(md5(clock_timestamp()::text || random()::text || 'main-a'), 1, 8) || '-' ||
    substr(md5(clock_timestamp()::text || random()::text || 'main-b'), 1, 4) || '-4' ||
    substr(md5(clock_timestamp()::text || random()::text || 'main-c'), 1, 3) || '-8' ||
    substr(md5(clock_timestamp()::text || random()::text || 'main-d'), 1, 3) || '-' ||
    substr(md5(clock_timestamp()::text || random()::text || 'main-e'), 1, 12)
  )::uuid;
  v_sub_id uuid := (
    substr(md5(clock_timestamp()::text || random()::text || 'sub-a'), 1, 8) || '-' ||
    substr(md5(clock_timestamp()::text || random()::text || 'sub-b'), 1, 4) || '-4' ||
    substr(md5(clock_timestamp()::text || random()::text || 'sub-c'), 1, 3) || '-8' ||
    substr(md5(clock_timestamp()::text || random()::text || 'sub-d'), 1, 3) || '-' ||
    substr(md5(clock_timestamp()::text || random()::text || 'sub-e'), 1, 12)
  )::uuid;
  v_ts text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  v_required_missing text;
  v_count int;
  v_nonempty bigint;
  v_total bigint;
  v_sample text;
  r record;
BEGIN
  IF to_regclass('public.aif_categories') IS NULL THEN
    RAISE EXCEPTION 'FAIL: public.aif_categories nem létezik.';
  END IF;

  SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
    INTO v_required_missing
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'aif_categories'
    AND is_nullable = 'NO'
    AND column_default IS NULL
    AND identity_generation IS NULL
    AND column_name NOT IN ('id', 'code', 'name_ro', 'name_hu', 'parent_id', 'aliases', 'sort_order', 'is_active');

  IF v_required_missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: public.aif_categories tábla extra kötelező oszlopokat kér, amit a smoke test nem tölt: %', v_required_missing;
  END IF;

  RAISE NOTICE 'Kategória tábla: public.aif_categories';
  RAISE NOTICE 'Teszt main_id=%, sub_id=%', v_main_id, v_sub_id;

  INSERT INTO public.aif_categories (
    id,
    code,
    name_ro,
    name_hu,
    parent_id,
    aliases,
    sort_order,
    is_active
  ) VALUES (
    v_main_id,
    'ZZZ_TEST_MAIN_' || v_ts,
    'ZZZ_TEST_MAIN_' || v_ts,
    'TESZT_FOKATEGORIA_' || v_ts,
    NULL,
    ARRAY['zz_test_main_' || v_ts, 'RODESCR_MAIN_' || v_ts]::text[],
    999991,
    true
  );

  SELECT count(*) INTO v_count
  FROM public.aif_categories
  WHERE id = v_main_id
    AND parent_id IS NULL
    AND is_active = true;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: főkategória mentés után nem található aktív fő kategóriaként.';
  END IF;
  RAISE NOTICE 'PASS: főkategória menthető.';

  INSERT INTO public.aif_categories (
    id,
    code,
    name_ro,
    name_hu,
    parent_id,
    aliases,
    sort_order,
    is_active
  ) VALUES (
    v_sub_id,
    'ZZZ_TEST_SUB_' || v_ts,
    'ZZZ_TEST_SUB_' || v_ts,
    'TESZT_ALKATEGORIA_' || v_ts,
    v_main_id,
    ARRAY['zz_test_sub_' || v_ts, 'RODESCR_TEST_' || v_ts, 'SUBCATEGORY_TEST_' || v_ts]::text[],
    999992,
    true
  );

  SELECT count(*) INTO v_count
  FROM public.aif_categories
  WHERE id = v_sub_id
    AND parent_id = v_main_id
    AND is_active = true;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: alkategória mentés után nem található a fő kategória alatt.';
  END IF;
  RAISE NOTICE 'PASS: alkategória menthető és parent_id-val fő kategóriához kötődik.';

  UPDATE public.aif_categories
     SET name_ro = 'ZZZ_TEST_SUB_EDITED_' || v_ts,
         name_hu = 'TESZT_ALKATEGORIA_EDITED_' || v_ts,
         aliases = ARRAY['zz_test_sub_edited_' || v_ts, 'RODESCR_TEST_EDITED_' || v_ts]::text[],
         sort_order = 999993
   WHERE id = v_sub_id;

  SELECT count(*) INTO v_count
  FROM public.aif_categories
  WHERE id = v_sub_id
    AND parent_id = v_main_id
    AND name_ro = 'ZZZ_TEST_SUB_EDITED_' || v_ts
    AND aliases @> ARRAY['RODESCR_TEST_EDITED_' || v_ts]::text[];

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: alkategória módosítás nem látszik a táblában.';
  END IF;
  RAISE NOTICE 'PASS: alkategória módosítható.';

  UPDATE public.aif_categories
     SET is_active = false
   WHERE id = v_sub_id;

  SELECT count(*) INTO v_count
  FROM public.aif_categories
  WHERE id = v_sub_id
    AND is_active = false;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: alkategória soft delete / inaktiválás nem működik.';
  END IF;
  RAISE NOTICE 'PASS: alkategória inaktiválható / törölhető logikailag.';

  DELETE FROM public.aif_categories WHERE id = v_sub_id;
  DELETE FROM public.aif_categories WHERE id = v_main_id;

  SELECT count(*) INTO v_count
  FROM public.aif_categories
  WHERE id IN (v_main_id, v_sub_id);

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: teszt kategóriák fizikai törlése nem sikerült. Maradt sor: %', v_count;
  END IF;
  RAISE NOTICE 'PASS: teszt kategóriák fizikai törölhetők. A fájl végén ettől függetlenül ROLLBACK van.';

  -- Direkt alkategória oszlopok keresése bármely public táblában.
  FOR r IN
    SELECT table_schema, table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        lower(column_name) LIKE '%subcategory%'
        OR lower(column_name) LIKE '%sub_category%'
        OR lower(column_name) IN ('rodescr', 'subcategorie', 'subcategory', 'product_type')
      )
    ORDER BY table_name, column_name
  LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I', r.table_schema, r.table_name)
      INTO v_total;

    EXECUTE format(
      'SELECT count(*) FROM %I.%I WHERE %I IS NOT NULL AND btrim(%I::text) <> ''''',
      r.table_schema, r.table_name, r.column_name, r.column_name
    ) INTO v_nonempty;

    EXECUTE format(
      'SELECT left(%I::text, 220) FROM %I.%I WHERE %I IS NOT NULL AND btrim(%I::text) <> '''' LIMIT 1',
      r.column_name, r.table_schema, r.table_name, r.column_name, r.column_name
    ) INTO v_sample;

    INSERT INTO aif_subcategory_import_probe(probe_type, table_name, column_name, data_type, total_rows, nonempty_rows, sample_value)
    VALUES ('DIRECT_COLUMN', r.table_schema || '.' || r.table_name, r.column_name, r.data_type, v_total, v_nonempty, v_sample);
  END LOOP;

  -- JSON / JSONB import mezőkben alkategória-nyomok keresése.
  FOR r IN
    SELECT table_schema, table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('json', 'jsonb')
      AND (
        lower(table_name) LIKE '%import%'
        OR lower(table_name) LIKE '%batch%'
        OR lower(table_name) LIKE '%incoming%'
        OR lower(table_name) LIKE '%stock%'
      )
    ORDER BY table_name, column_name
  LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I', r.table_schema, r.table_name)
      INTO v_total;

    EXECUTE format(
      $q$SELECT count(*) FROM %I.%I WHERE %I::text ~* '(subcategory|sub_category|subCategory|sourceSubCategory|RODESCR|SUBCATEGORIE|PRODUCT TYPE)'$q$,
      r.table_schema, r.table_name, r.column_name
    ) INTO v_nonempty;

    EXECUTE format(
      $q$SELECT left(%I::text, 220) FROM %I.%I WHERE %I::text ~* '(subcategory|sub_category|subCategory|sourceSubCategory|RODESCR|SUBCATEGORIE|PRODUCT TYPE)' LIMIT 1$q$,
      r.column_name, r.table_schema, r.table_name, r.column_name
    ) INTO v_sample;

    INSERT INTO aif_subcategory_import_probe(probe_type, table_name, column_name, data_type, total_rows, nonempty_rows, sample_value)
    VALUES ('JSON_TRACE', r.table_schema || '.' || r.table_name, r.column_name, r.data_type, v_total, v_nonempty, v_sample);
  END LOOP;

  RAISE NOTICE 'PASS: DB smoke test rész lefutott. Lent jön az import-felismerés nyomtábla.';
END $$;

\echo ''
\echo '============================================================'
\echo 'Import / alkategória felismerés nyomok'
\echo 'A nonempty_rows > 0 azt jelenti, hogy az adott oszlopban van alkategória-jellegű adat.'
\echo 'Legfontosabb: subcategory_id nonempty_rows > 0 = valódi törzsadat-kötésre utal.'
\echo '============================================================'

SELECT
  probe_type,
  table_name,
  column_name,
  data_type,
  total_rows,
  nonempty_rows,
  sample_value
FROM aif_subcategory_import_probe
ORDER BY
  CASE WHEN lower(column_name) IN ('subcategory_id', 'sub_category_id') THEN 0 ELSE 1 END,
  nonempty_rows DESC,
  probe_type,
  table_name,
  column_name;

\echo ''
\echo '============================================================'
\echo 'Összegzés'
\echo 'direct_subcategory_id_rows > 0: import / variáns adatokban van tényleges alkategória ID.'
\echo 'json_trace_rows > 0: import raw/normalized JSON-ban látszik alkategória forrásadat.'
\echo '============================================================'

SELECT
  COALESCE(SUM(nonempty_rows) FILTER (WHERE probe_type = 'DIRECT_COLUMN' AND lower(column_name) IN ('subcategory_id', 'sub_category_id')), 0) AS direct_subcategory_id_rows,
  COALESCE(SUM(nonempty_rows) FILTER (WHERE probe_type = 'DIRECT_COLUMN' AND lower(column_name) IN ('subcategory_code', 'sub_category_code')), 0) AS direct_subcategory_code_rows,
  COALESCE(SUM(nonempty_rows) FILTER (WHERE probe_type = 'DIRECT_COLUMN' AND lower(column_name) LIKE '%subcategory%name%'), 0) AS direct_subcategory_name_rows,
  COALESCE(SUM(nonempty_rows) FILTER (WHERE probe_type = 'JSON_TRACE'), 0) AS json_trace_rows
FROM aif_subcategory_import_probe;

ROLLBACK;

\echo ''
\echo 'KÉSZ: ROLLBACK megtörtént, tesztadat nem maradt bent.'
