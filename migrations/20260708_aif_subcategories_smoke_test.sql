\set ON_ERROR_STOP on
\pset pager off

\echo '============================================================'
\echo 'AIF alkategória smoke test'
\echo 'Mit néz: DB oldali mentés / módosítás / törlés + import felismerés nyomai'
\echo 'Biztonság: a teszt saját ZZZ_TEST sorokat használ és ROLLBACK-kel zár.'
\echo '============================================================'

BEGIN;

DO $$
DECLARE
  v_cat_table regclass;
  v_cat_schema text;
  v_cat_name text;
  v_has_code boolean;
  v_has_name_ro boolean;
  v_has_name_hu boolean;
  v_has_name boolean;
  v_has_aliases boolean;
  v_aliases_type text;
  v_has_sort_order boolean;
  v_has_is_active boolean;
  v_has_parent_id boolean;
  v_id_type text;
  v_id_default text;
  v_id_nullable text;
  v_id_identity text;
  v_parent_type text;
  v_ts text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  v_main_id text;
  v_sub_id text;
  v_sql text;
  v_cols text[];
  v_vals text[];
  v_sets text[];
  v_count int;
  v_count2 int;
  v_count3 int;
  v_row record;
  v_json_col record;
  v_status text;
  v_alias_main text;
  v_alias_sub text;
  v_alias_sub_edit text;

  -- Egyszerű UUID szöveg, gen_random_uuid nélkül. Ne egy extension hiányán csússzon el a cirkusz.
  v_main_uuid text := lower(
    substr(md5(clock_timestamp()::text || random()::text || 'main-a'), 1, 8) || '-' ||
    substr(md5(clock_timestamp()::text || random()::text || 'main-b'), 1, 4) || '-4' ||
    substr(md5(clock_timestamp()::text || random()::text || 'main-c'), 1, 3) || '-8' ||
    substr(md5(clock_timestamp()::text || random()::text || 'main-d'), 1, 3) || '-' ||
    substr(md5(clock_timestamp()::text || random()::text || 'main-e'), 1, 12)
  );
  v_sub_uuid text := lower(
    substr(md5(clock_timestamp()::text || random()::text || 'sub-a'), 1, 8) || '-' ||
    substr(md5(clock_timestamp()::text || random()::text || 'sub-b'), 1, 4) || '-4' ||
    substr(md5(clock_timestamp()::text || random()::text || 'sub-c'), 1, 3) || '-8' ||
    substr(md5(clock_timestamp()::text || random()::text || 'sub-d'), 1, 3) || '-' ||
    substr(md5(clock_timestamp()::text || random()::text || 'sub-e'), 1, 12)
  );
BEGIN
  SELECT c.oid::regclass, n.nspname, c.relname
    INTO v_cat_table, v_cat_schema, v_cat_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p')
    AND n.nspname = 'public'
    AND c.relname IN ('aif_categories', 'aif_product_categories', 'product_categories', 'categories')
  ORDER BY array_position(ARRAY['aif_categories','aif_product_categories','product_categories','categories'], c.relname)
  LIMIT 1;

  IF v_cat_table IS NULL THEN
    RAISE EXCEPTION 'Nem találom a kategória táblát. Kerestem: aif_categories, aif_product_categories, product_categories, categories.';
  END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = v_cat_schema AND table_name = v_cat_name AND column_name = 'code') INTO v_has_code;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = v_cat_schema AND table_name = v_cat_name AND column_name = 'name_ro') INTO v_has_name_ro;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = v_cat_schema AND table_name = v_cat_name AND column_name = 'name_hu') INTO v_has_name_hu;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = v_cat_schema AND table_name = v_cat_name AND column_name = 'name') INTO v_has_name;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = v_cat_schema AND table_name = v_cat_name AND column_name = 'aliases') INTO v_has_aliases;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = v_cat_schema AND table_name = v_cat_name AND column_name = 'sort_order') INTO v_has_sort_order;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = v_cat_schema AND table_name = v_cat_name AND column_name = 'is_active') INTO v_has_is_active;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = v_cat_schema AND table_name = v_cat_name AND column_name = 'parent_id') INTO v_has_parent_id;

  SELECT format_type(a.atttypid, a.atttypmod)
    INTO v_id_type
  FROM pg_attribute a
  WHERE a.attrelid = v_cat_table
    AND a.attname = 'id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_has_parent_id THEN
    SELECT format_type(a.atttypid, a.atttypmod)
      INTO v_parent_type
    FROM pg_attribute a
    WHERE a.attrelid = v_cat_table
      AND a.attname = 'parent_id'
      AND a.attnum > 0
      AND NOT a.attisdropped;
  END IF;

  IF v_has_aliases THEN
    SELECT format_type(a.atttypid, a.atttypmod)
      INTO v_aliases_type
    FROM pg_attribute a
    WHERE a.attrelid = v_cat_table
      AND a.attname = 'aliases'
      AND a.attnum > 0
      AND NOT a.attisdropped;
  END IF;

  SELECT column_default, is_nullable, identity_generation
    INTO v_id_default, v_id_nullable, v_id_identity
  FROM information_schema.columns
  WHERE table_schema = v_cat_schema
    AND table_name = v_cat_name
    AND column_name = 'id';

  RAISE NOTICE 'Kategória tábla: %.%', v_cat_schema, v_cat_name;
  RAISE NOTICE 'Oszlopok: id=%, parent_id=%, code=%, name_ro=%, name_hu=%, name=%, aliases=%',
    COALESCE(v_id_type, '-'), COALESCE(v_parent_type, '-'), v_has_code, v_has_name_ro, v_has_name_hu, v_has_name, COALESCE(v_aliases_type, '-');

  IF v_id_type IS NULL THEN
    RAISE EXCEPTION 'FAIL: nincs id oszlop a kategória táblán.';
  END IF;
  IF NOT v_has_parent_id THEN
    RAISE EXCEPTION 'FAIL: nincs parent_id oszlop. Alkategória nem köthető fő kategóriához.';
  END IF;
  IF NOT (v_has_name_ro OR v_has_name) THEN
    RAISE EXCEPTION 'FAIL: nincs name_ro vagy name oszlop, így nem tudok kategória nevet menteni.';
  END IF;

  IF v_has_aliases THEN
    IF v_aliases_type LIKE '%[]' THEN
      v_alias_main := format('ARRAY[%L]::text[]', 'zz_test_main_' || v_ts);
      v_alias_sub := format('ARRAY[%L,%L]::text[]', 'zz_test_sub_' || v_ts, 'RODESCR_TEST_' || v_ts);
      v_alias_sub_edit := format('ARRAY[%L,%L]::text[]', 'zz_test_sub_edited_' || v_ts, 'RODESCR_TEST_EDITED_' || v_ts);
    ELSIF v_aliases_type IN ('json', 'jsonb') THEN
      v_alias_main := format('%L::%s', to_json(ARRAY['zz_test_main_' || v_ts])::text, v_aliases_type);
      v_alias_sub := format('%L::%s', to_json(ARRAY['zz_test_sub_' || v_ts, 'RODESCR_TEST_' || v_ts])::text, v_aliases_type);
      v_alias_sub_edit := format('%L::%s', to_json(ARRAY['zz_test_sub_edited_' || v_ts, 'RODESCR_TEST_EDITED_' || v_ts])::text, v_aliases_type);
    ELSE
      v_alias_main := format('%L', 'zz_test_main_' || v_ts);
      v_alias_sub := format('%L', 'zz_test_sub_' || v_ts || ', RODESCR_TEST_' || v_ts);
      v_alias_sub_edit := format('%L', 'zz_test_sub_edited_' || v_ts || ', RODESCR_TEST_EDITED_' || v_ts);
    END IF;
  END IF;

  -- Főkategória létrehozás
  v_cols := ARRAY[]::text[];
  v_vals := ARRAY[]::text[];

  IF v_id_default IS NULL AND v_id_nullable = 'NO' AND v_id_identity IS NULL THEN
    IF v_id_type = 'uuid' THEN
      v_cols := v_cols || quote_ident('id');
      v_vals := v_vals || format('%L::uuid', v_main_uuid);
    ELSIF v_id_type = 'text' OR v_id_type LIKE 'character varying%' THEN
      v_cols := v_cols || quote_ident('id');
      v_vals := v_vals || format('%L', 'ZZZ_TEST_MAIN_' || v_ts);
    ELSE
      RAISE EXCEPTION 'FAIL: az id oszlopnak nincs defaultja és nem tudok automatikusan értéket adni erre a típusra: %', v_id_type;
    END IF;
  END IF;

  IF v_has_code THEN
    v_cols := v_cols || quote_ident('code');
    v_vals := v_vals || format('%L', 'ZZZ_TEST_MAIN_' || v_ts);
  END IF;
  IF v_has_name_ro THEN
    v_cols := v_cols || quote_ident('name_ro');
    v_vals := v_vals || format('%L', 'ZZZ_TEST_MAIN_' || v_ts);
  ELSIF v_has_name THEN
    v_cols := v_cols || quote_ident('name');
    v_vals := v_vals || format('%L', 'ZZZ_TEST_MAIN_' || v_ts);
  END IF;
  IF v_has_name_hu THEN
    v_cols := v_cols || quote_ident('name_hu');
    v_vals := v_vals || format('%L', 'TESZT_FOKATEGORIA_' || v_ts);
  END IF;
  IF v_has_parent_id THEN
    v_cols := v_cols || quote_ident('parent_id');
    v_vals := v_vals || 'NULL';
  END IF;
  IF v_has_aliases THEN
    v_cols := v_cols || quote_ident('aliases');
    v_vals := v_vals || v_alias_main;
  END IF;
  IF v_has_sort_order THEN
    v_cols := v_cols || quote_ident('sort_order');
    v_vals := v_vals || '999991';
  END IF;
  IF v_has_is_active THEN
    v_cols := v_cols || quote_ident('is_active');
    v_vals := v_vals || 'true';
  END IF;

  v_sql := format('INSERT INTO %s (%s) VALUES (%s) RETURNING id::text', v_cat_table, array_to_string(v_cols, ', '), array_to_string(v_vals, ', '));
  EXECUTE v_sql INTO v_main_id;
  RAISE NOTICE 'PASS: főkategória menthető. main_id=%', v_main_id;

  -- Alkategória létrehozás
  v_cols := ARRAY[]::text[];
  v_vals := ARRAY[]::text[];

  IF v_id_default IS NULL AND v_id_nullable = 'NO' AND v_id_identity IS NULL THEN
    IF v_id_type = 'uuid' THEN
      v_cols := v_cols || quote_ident('id');
      v_vals := v_vals || format('%L::uuid', v_sub_uuid);
    ELSIF v_id_type = 'text' OR v_id_type LIKE 'character varying%' THEN
      v_cols := v_cols || quote_ident('id');
      v_vals := v_vals || format('%L', 'ZZZ_TEST_SUB_' || v_ts);
    END IF;
  END IF;

  IF v_has_code THEN
    v_cols := v_cols || quote_ident('code');
    v_vals := v_vals || format('%L', 'ZZZ_TEST_SUB_' || v_ts);
  END IF;
  IF v_has_name_ro THEN
    v_cols := v_cols || quote_ident('name_ro');
    v_vals := v_vals || format('%L', 'ZZZ_TEST_SUB_' || v_ts);
  ELSIF v_has_name THEN
    v_cols := v_cols || quote_ident('name');
    v_vals := v_vals || format('%L', 'ZZZ_TEST_SUB_' || v_ts);
  END IF;
  IF v_has_name_hu THEN
    v_cols := v_cols || quote_ident('name_hu');
    v_vals := v_vals || format('%L', 'TESZT_ALKATEGORIA_' || v_ts);
  END IF;
  IF v_has_parent_id THEN
    v_cols := v_cols || quote_ident('parent_id');
    IF v_parent_type = 'uuid' THEN
      v_vals := v_vals || format('%L::uuid', v_main_id);
    ELSIF v_parent_type IN ('integer', 'bigint', 'smallint') THEN
      v_vals := v_vals || format('%L::%s', v_main_id, v_parent_type);
    ELSE
      v_vals := v_vals || format('%L', v_main_id);
    END IF;
  END IF;
  IF v_has_aliases THEN
    v_cols := v_cols || quote_ident('aliases');
    v_vals := v_vals || v_alias_sub;
  END IF;
  IF v_has_sort_order THEN
    v_cols := v_cols || quote_ident('sort_order');
    v_vals := v_vals || '999992';
  END IF;
  IF v_has_is_active THEN
    v_cols := v_cols || quote_ident('is_active');
    v_vals := v_vals || 'true';
  END IF;

  v_sql := format('INSERT INTO %s (%s) VALUES (%s) RETURNING id::text', v_cat_table, array_to_string(v_cols, ', '), array_to_string(v_vals, ', '));
  EXECUTE v_sql INTO v_sub_id;
  RAISE NOTICE 'PASS: alkategória menthető. sub_id=%', v_sub_id;

  EXECUTE format('SELECT count(*) FROM %s WHERE id::text = %L AND parent_id::text = %L', v_cat_table, v_sub_id, v_main_id)
    INTO v_count;
  IF v_count = 1 THEN
    RAISE NOTICE 'PASS: alkategória fő kategóriához kötése OK.';
  ELSE
    RAISE EXCEPTION 'FAIL: az alkategória nem a létrehozott fő kategóriához kötődik.';
  END IF;

  -- Alkategória módosítás
  v_sets := ARRAY[]::text[];
  IF v_has_name_ro THEN
    v_sets := v_sets || format('%I = %L', 'name_ro', 'ZZZ_TEST_SUB_EDITED_' || v_ts);
  ELSIF v_has_name THEN
    v_sets := v_sets || format('%I = %L', 'name', 'ZZZ_TEST_SUB_EDITED_' || v_ts);
  END IF;
  IF v_has_name_hu THEN
    v_sets := v_sets || format('%I = %L', 'name_hu', 'TESZT_ALKATEGORIA_EDITED_' || v_ts);
  END IF;
  IF v_has_aliases THEN
    v_sets := v_sets || format('%I = %s', 'aliases', v_alias_sub_edit);
  END IF;
  IF v_has_sort_order THEN
    v_sets := v_sets || format('%I = %s', 'sort_order', '999993');
  END IF;

  v_sql := format('UPDATE %s SET %s WHERE id::text = %L', v_cat_table, array_to_string(v_sets, ', '), v_sub_id);
  EXECUTE v_sql;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 1 THEN
    RAISE NOTICE 'PASS: alkategória módosítható.';
  ELSE
    RAISE EXCEPTION 'FAIL: alkategória módosítás sikertelen.';
  END IF;

  -- Törlés teszt: először a gyerek, aztán a szülő. A végén ROLLBACK, így nem marad szemét.
  EXECUTE format('DELETE FROM %s WHERE id::text = %L', v_cat_table, v_sub_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 1 THEN
    RAISE NOTICE 'PASS: alkategória törölhető DB szinten.';
  ELSE
    RAISE EXCEPTION 'FAIL: alkategória törlés sikertelen.';
  END IF;

  EXECUTE format('DELETE FROM %s WHERE id::text = %L', v_cat_table, v_main_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 1 THEN
    RAISE NOTICE 'PASS: teszt főkategória törölhető DB szinten.';
  ELSE
    RAISE EXCEPTION 'FAIL: teszt főkategória törlés sikertelen.';
  END IF;

  RAISE NOTICE '--- Import / felismerés diagnosztika ---';

  -- Minden olyan táblát megnézünk, ahol subcategory_id van.
  FOR v_row IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('subcategory_id', 'sub_category_id', 'subCategoryId')
    ORDER BY table_name, column_name
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I.%I WHERE %I IS NOT NULL AND NULLIF(%I::text, '''') IS NOT NULL',
      v_row.table_schema, v_row.table_name, v_row.column_name, v_row.column_name
    ) INTO v_count;

    EXECUTE format(
      'SELECT count(*) FROM %I.%I t JOIN %s c ON t.%I::text = c.id::text WHERE t.%I IS NOT NULL AND c.parent_id IS NOT NULL',
      v_row.table_schema, v_row.table_name, v_cat_table, v_row.column_name, v_row.column_name
    ) INTO v_count2;

    v_status := CASE
      WHEN v_count2 > 0 THEN 'PASS: van valódi alkategória-kötés'
      WHEN v_count > 0 THEN 'WARN: van subcategory_id, de nem látszik parent_id-s alkategóriához kötve'
      ELSE 'INFO: oszlop van, adat még nincs'
    END;

    RAISE NOTICE '% %.%.% nonempty=% valid_subcategory_links=%', v_status, v_row.table_schema, v_row.table_name, v_row.column_name, v_count, v_count2;
  END LOOP;

  -- Import táblák sima oszlopos alkategória mezői.
  FOR v_row IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name ILIKE '%import%'
      AND column_name IN (
        'subcategory_id', 'sub_category_id', 'subCategoryId',
        'subcategory_code', 'sub_category_code', 'subCategoryCode',
        'subcategory_name_ro', 'subcategory_name', 'subCategoryName',
        'source_subcategory', 'sourceSubCategory'
      )
    ORDER BY table_name, column_name
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I.%I WHERE %I IS NOT NULL AND NULLIF(%I::text, '''') IS NOT NULL',
      v_row.table_schema, v_row.table_name, v_row.column_name, v_row.column_name
    ) INTO v_count;
    RAISE NOTICE 'IMPORT COLUMN %.%.% nonempty=%', v_row.table_schema, v_row.table_name, v_row.column_name, v_count;
  END LOOP;

  -- Import JSON mezőkben is keresünk, mert az emberiség kedvenc sportja a fontos adat JSON-ba dugása.
  FOR v_json_col IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name ILIKE '%import%'
      AND data_type IN ('json', 'jsonb')
      AND column_name IN ('raw', 'normalized', 'import_raw', 'import_normalized', 'data', 'payload')
    ORDER BY table_name, column_name
  LOOP
    EXECUTE format(
      $q$
      SELECT
        count(*) FILTER (WHERE %1$I::jsonb ? 'subcategoryId' OR %1$I::jsonb ? 'subCategoryId' OR %1$I::jsonb ? 'subcategory_id') AS id_like,
        count(*) FILTER (WHERE %1$I::jsonb ? 'subcategoryCode' OR %1$I::jsonb ? 'subCategoryCode' OR %1$I::jsonb ? 'subcategory_code') AS code_like,
        count(*) FILTER (WHERE %1$I::jsonb ? 'subcategoryName' OR %1$I::jsonb ? 'subCategoryName' OR %1$I::jsonb ? 'sourceSubCategory' OR %1$I::jsonb ? 'RODESCR') AS name_or_source_like
      FROM %2$I.%3$I
      WHERE %1$I IS NOT NULL
      $q$,
      v_json_col.column_name, v_json_col.table_schema, v_json_col.table_name
    ) INTO v_count, v_count2, v_count3;

    RAISE NOTICE 'IMPORT JSON %.%.% id_like=% code_like=% name/source_like=%',
      v_json_col.table_schema, v_json_col.table_name, v_json_col.column_name, v_count, v_count2, v_count3;
  END LOOP;

  -- Aliases gyors állapotjelzés
  IF v_has_aliases THEN
    IF v_aliases_type LIKE '%[]' THEN
      EXECUTE format('SELECT count(*) FROM %s WHERE aliases IS NOT NULL AND array_length(aliases, 1) > 0', v_cat_table) INTO v_count;
    ELSIF v_aliases_type IN ('json', 'jsonb') THEN
      EXECUTE format('SELECT count(*) FROM %s WHERE aliases IS NOT NULL AND jsonb_array_length(CASE WHEN jsonb_typeof(aliases::jsonb) = ''array'' THEN aliases::jsonb ELSE ''[]''::jsonb END) > 0', v_cat_table) INTO v_count;
    ELSE
      EXECUTE format('SELECT count(*) FROM %s WHERE aliases IS NOT NULL AND NULLIF(aliases::text, '''') IS NOT NULL', v_cat_table) INTO v_count;
    END IF;
    RAISE NOTICE 'ALIASES: %.% aliases mező kitöltött sorok=%', v_cat_schema, v_cat_name, v_count;
  ELSE
    RAISE NOTICE 'ALIASES: nincs aliases oszlop a kategória táblán.';
  END IF;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'KÉSZ: ha fent PASS van mentés/módosítás/törlésre, az Alkategóriák DB oldalon működik.';
  RAISE NOTICE 'Importnál a legerősebb bizonyíték: valid_subcategory_links > 0 vagy import subcategory_id nonempty > 0.';
  RAISE NOTICE 'Ha csak RODESCR/source név van, az még lehet fallback szöveg, nem biztos valódi törzsadat-kötés.';
  RAISE NOTICE 'ROLLBACK következik, a ZZZ_TEST sorok nem maradnak bent.';
  RAISE NOTICE '============================================================';
END $$;

ROLLBACK;

\echo 'A teszt rollbackkel zárt. A DB-ben nem maradt ZZZ_TEST kategória.'
