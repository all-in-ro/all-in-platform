BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

LOCK TABLE aif_product_variants IN SHARE ROW EXCLUSIVE MODE;

-- Biztonsági kompatibilitás: ha a régi név mégis táblakényszerként élne,
-- előbb azt bontjuk le, majd az alábbi blokk az expression indexet is eltávolítja.
ALTER TABLE aif_product_variants
  DROP CONSTRAINT IF EXISTS aif_variants_model_color_size_unique;

-- A régi adatbázisban volt egy globális egyedi index, amely a
-- modell + színkód + színnév + méret négyest védte. Ez az összevonás közben
-- megakadályozná, hogy a kanonikus sor megkapja a csoport legjobb színnevét,
-- miközben a régi duplikátum még létezik. Az új, helyes részleges indexeket
-- a migráció végén hozzuk létre: színkód esetén modell + színkód + méret,
-- színkód nélkül pedig modell + színnév + méret.
DO $drop_legacy_variant_identity$
DECLARE
  legacy_index record;
BEGIN
  FOR legacy_index IN
    SELECT schemaname, indexname
    FROM pg_indexes
    WHERE tablename='aif_product_variants'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND indexdef ILIKE '%model_id%'
      AND indexdef ILIKE '%color_code%'
      AND indexdef ILIKE '%color_name%'
      AND indexdef ILIKE '%size%'
  LOOP
    RAISE NOTICE 'Régi variáns-egyediség eltávolítása: %.%', legacy_index.schemaname, legacy_index.indexname;
    EXECUTE format('DROP INDEX IF EXISTS %I.%I', legacy_index.schemaname, legacy_index.indexname);
  END LOOP;
END
$drop_legacy_variant_identity$;

-- Ismert régi név külön is kezelve, ha az indexdef valamilyen régi PostgreSQL
-- formázás miatt nem került volna be a fenti listába.
DROP INDEX IF EXISTS aif_variants_model_color_size_unique;

CREATE TABLE IF NOT EXISTS aif_variant_merge_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_tag text NOT NULL,
  canonical_variant_id uuid NOT NULL,
  merged_variant_id uuid NOT NULL,
  model_id uuid NOT NULL,
  identity_color_kind text NOT NULL,
  identity_color_value text NOT NULL,
  identity_size text NOT NULL,
  variant_before jsonb NOT NULL DEFAULT '{}'::jsonb,
  stock_before jsonb NOT NULL DEFAULT '[]'::jsonb,
  merged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (migration_tag, merged_variant_id)
);

CREATE INDEX IF NOT EXISTS aif_variant_merge_audit_canonical_idx
  ON aif_variant_merge_audit (canonical_variant_id, merged_at DESC);

CREATE TEMP TABLE _aif_variant_ranked ON COMMIT DROP AS
WITH stock_totals AS (
  SELECT variant_id, COALESCE(sum(qty),0)::numeric AS stock_qty
  FROM aif_stock
  GROUP BY variant_id
)
SELECT
  v.id AS variant_id,
  v.model_id,
  CASE WHEN NULLIF(btrim(v.color_code),'') IS NOT NULL THEN 'code' ELSE 'name' END AS color_kind,
  lower(CASE
    WHEN NULLIF(btrim(v.color_code),'') IS NOT NULL THEN btrim(v.color_code)
    ELSE COALESCE(NULLIF(btrim(v.color_name),''), '')
  END) AS color_value,
  lower(COALESCE(NULLIF(btrim(v.size),''), '')) AS size_value,
  COALESCE(st.stock_qty,0) AS stock_qty,
  row_number() OVER (
    PARTITION BY
      v.model_id,
      CASE WHEN NULLIF(btrim(v.color_code),'') IS NOT NULL THEN 'code' ELSE 'name' END,
      lower(CASE
        WHEN NULLIF(btrim(v.color_code),'') IS NOT NULL THEN btrim(v.color_code)
        ELSE COALESCE(NULLIF(btrim(v.color_name),''), '')
      END),
      lower(COALESCE(NULLIF(btrim(v.size),''), ''))
    ORDER BY
      CASE
        WHEN NULLIF(btrim(v.barcode),'') IS NOT NULL AND v.barcode !~* '^AIF' THEN 0
        WHEN NULLIF(btrim(v.barcode),'') IS NOT NULL THEN 1
        ELSE 2
      END,
      COALESCE(st.stock_qty,0) DESC,
      v.created_at ASC NULLS LAST,
      v.id::text ASC
  ) AS rn,
  count(*) OVER (
    PARTITION BY
      v.model_id,
      CASE WHEN NULLIF(btrim(v.color_code),'') IS NOT NULL THEN 'code' ELSE 'name' END,
      lower(CASE
        WHEN NULLIF(btrim(v.color_code),'') IS NOT NULL THEN btrim(v.color_code)
        ELSE COALESCE(NULLIF(btrim(v.color_name),''), '')
      END),
      lower(COALESCE(NULLIF(btrim(v.size),''), ''))
  ) AS group_count
FROM aif_product_variants v
LEFT JOIN stock_totals st ON st.variant_id=v.id
WHERE COALESCE(v.status,'active') <> 'archived';

CREATE TEMP TABLE _aif_variant_merge_map ON COMMIT DROP AS
SELECT
  canonical.variant_id AS canonical_id,
  duplicate.variant_id AS merged_id,
  canonical.model_id,
  canonical.color_kind,
  canonical.color_value,
  canonical.size_value
FROM _aif_variant_ranked canonical
JOIN _aif_variant_ranked duplicate
  ON duplicate.model_id=canonical.model_id
 AND duplicate.color_kind=canonical.color_kind
 AND duplicate.color_value=canonical.color_value
 AND duplicate.size_value=canonical.size_value
WHERE canonical.rn=1
  AND canonical.group_count>1
  AND duplicate.rn>1;

CREATE UNIQUE INDEX ON _aif_variant_merge_map (merged_id);
CREATE INDEX ON _aif_variant_merge_map (canonical_id);

CREATE TEMP TABLE _aif_variant_members ON COMMIT DROP AS
SELECT canonical_id, canonical_id AS variant_id
FROM _aif_variant_merge_map
GROUP BY canonical_id
UNION ALL
SELECT canonical_id, merged_id AS variant_id
FROM _aif_variant_merge_map;

CREATE UNIQUE INDEX ON _aif_variant_members (canonical_id, variant_id);
CREATE INDEX ON _aif_variant_members (variant_id);

INSERT INTO aif_variant_merge_audit (
  migration_tag,
  canonical_variant_id,
  merged_variant_id,
  model_id,
  identity_color_kind,
  identity_color_value,
  identity_size,
  variant_before,
  stock_before
)
SELECT
  '20260803_aif_merge_duplicate_variants',
  mm.canonical_id,
  mm.merged_id,
  mm.model_id,
  mm.color_kind,
  mm.color_value,
  mm.size_value,
  to_jsonb(v),
  COALESCE((
    SELECT jsonb_agg(to_jsonb(s) ORDER BY s.location_id::text)
    FROM aif_stock s
    WHERE s.variant_id=mm.merged_id
  ), '[]'::jsonb)
FROM _aif_variant_merge_map mm
JOIN aif_product_variants v ON v.id=mm.merged_id
ON CONFLICT (migration_tag, merged_variant_id) DO NOTHING;

-- Ha a kanonikus sor a duplikátum valódi vonalkódját kapja meg, a régi globális
-- barcode-egyediség addig ütközne, amíg ugyanaz a kód a duplikátumon is rajta van.
-- Az eredeti érték már bekerült az audit táblába, ezért itt biztonságosan felszabadítjuk.
UPDATE aif_product_variants duplicate
SET barcode=NULL,
    updated_at=now()
FROM _aif_variant_merge_map mm
WHERE duplicate.id=mm.merged_id
  AND duplicate.barcode IS NOT NULL;

-- A kanonikus variáns megkapja a csoport legjobb azonosítóit és a legfrissebb termékadatait.
WITH patch AS (
  SELECT
    members.canonical_id,
    (array_agg(
      NULLIF(btrim(COALESCE(v.barcode, audit.variant_before->>'barcode')),'')
      ORDER BY
        CASE
          WHEN NULLIF(btrim(COALESCE(v.barcode, audit.variant_before->>'barcode')),'') IS NOT NULL
               AND COALESCE(v.barcode, audit.variant_before->>'barcode') !~* '^AIF' THEN 0
          WHEN NULLIF(btrim(COALESCE(v.barcode, audit.variant_before->>'barcode')),'') IS NOT NULL THEN 1
          ELSE 2
        END,
        (v.id=members.canonical_id) DESC,
        v.updated_at DESC NULLS LAST,
        v.created_at ASC NULLS LAST
    ) FILTER (
      WHERE NULLIF(btrim(COALESCE(v.barcode, audit.variant_before->>'barcode')),'') IS NOT NULL
    ))[1] AS barcode,
    (array_agg(NULLIF(btrim(v.sn_cod),'') ORDER BY v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST)
      FILTER (WHERE NULLIF(btrim(v.sn_cod),'') IS NOT NULL))[1] AS sn_cod,
    (array_agg(NULLIF(btrim(v.color_code),'') ORDER BY v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST)
      FILTER (WHERE NULLIF(btrim(v.color_code),'') IS NOT NULL))[1] AS color_code,
    (array_agg(NULLIF(btrim(v.color_name),'') ORDER BY v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST)
      FILTER (WHERE NULLIF(btrim(v.color_name),'') IS NOT NULL))[1] AS color_name,
    (array_agg(NULLIF(btrim(v.color_hex),'') ORDER BY v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST)
      FILTER (WHERE NULLIF(btrim(v.color_hex),'') IS NOT NULL))[1] AS color_hex,
    (array_agg(v.buy_price ORDER BY v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST)
      FILTER (WHERE v.buy_price IS NOT NULL))[1] AS buy_price,
    (array_agg(v.sell_price ORDER BY v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST)
      FILTER (WHERE v.sell_price IS NOT NULL))[1] AS sell_price,
    (array_agg(v.compare_at_price ORDER BY v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST)
      FILTER (WHERE v.compare_at_price IS NOT NULL))[1] AS compare_at_price,
    (array_agg(v.weight_grams ORDER BY v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST)
      FILTER (WHERE v.weight_grams IS NOT NULL))[1] AS weight_grams,
    (array_agg(NULLIF(btrim(v.image_url),'') ORDER BY v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST)
      FILTER (WHERE NULLIF(btrim(v.image_url),'') IS NOT NULL))[1] AS image_url,
    (array_agg(v.attributes ORDER BY v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST)
      FILTER (WHERE v.attributes IS NOT NULL))[1] AS latest_attributes,
    CASE
      WHEN bool_or(v.status='active') THEN 'active'
      WHEN bool_or(v.status='inactive') THEN 'inactive'
      ELSE 'draft'
    END AS status,
    jsonb_agg(v.id::text ORDER BY v.created_at ASC NULLS LAST, v.id::text)
      FILTER (WHERE v.id<>members.canonical_id) AS merged_variant_ids,
    jsonb_agg(COALESCE(v.barcode, audit.variant_before->>'barcode') ORDER BY v.created_at ASC NULLS LAST, v.id::text)
      FILTER (
        WHERE v.id<>members.canonical_id
          AND NULLIF(btrim(COALESCE(v.barcode, audit.variant_before->>'barcode')),'') IS NOT NULL
      ) AS merged_barcodes
  FROM _aif_variant_members members
  JOIN aif_product_variants v ON v.id=members.variant_id
  LEFT JOIN aif_variant_merge_audit audit
    ON audit.migration_tag='20260803_aif_merge_duplicate_variants'
   AND audit.merged_variant_id=v.id
  GROUP BY members.canonical_id
)
UPDATE aif_product_variants canonical
SET barcode=COALESCE(patch.barcode, canonical.barcode),
    sn_cod=COALESCE(patch.sn_cod, canonical.sn_cod),
    color_code=COALESCE(patch.color_code, canonical.color_code),
    color_name=COALESCE(patch.color_name, canonical.color_name),
    color_hex=COALESCE(patch.color_hex, canonical.color_hex),
    buy_price=COALESCE(patch.buy_price, canonical.buy_price),
    sell_price=COALESCE(patch.sell_price, canonical.sell_price),
    compare_at_price=COALESCE(patch.compare_at_price, canonical.compare_at_price),
    weight_grams=COALESCE(patch.weight_grams, canonical.weight_grams),
    image_url=COALESCE(patch.image_url, canonical.image_url),
    attributes=COALESCE(canonical.attributes,'{}'::jsonb)
      || COALESCE(patch.latest_attributes,'{}'::jsonb)
      || jsonb_build_object(
           'variantMergeAt', now()::text,
           'variantMergeMigration', '20260803_aif_merge_duplicate_variants',
           'mergedVariantIds', COALESCE(patch.merged_variant_ids,'[]'::jsonb),
           'mergedBarcodes', COALESCE(patch.merged_barcodes,'[]'::jsonb)
         ),
    status=patch.status,
    updated_at=now()
FROM patch
WHERE canonical.id=patch.canonical_id;

-- Készlet helyenként összeadva kerül a kanonikus variánsra.
CREATE TEMP TABLE _aif_stock_merged ON COMMIT DROP AS
SELECT
  members.canonical_id AS variant_id,
  s.location_id,
  COALESCE(sum(s.qty),0) AS qty,
  COALESCE(sum(s.reserved_qty),0) AS reserved_qty,
  max(s.updated_at) AS updated_at
FROM aif_stock s
JOIN _aif_variant_members members ON members.variant_id=s.variant_id
GROUP BY members.canonical_id, s.location_id;

DELETE FROM aif_stock s
USING _aif_variant_members members
WHERE s.variant_id=members.variant_id;

INSERT INTO aif_stock (location_id, variant_id, qty, reserved_qty, updated_at)
SELECT location_id, variant_id, qty, reserved_qty, COALESCE(updated_at,now())
FROM _aif_stock_merged
ON CONFLICT (location_id, variant_id) DO UPDATE
SET qty=EXCLUDED.qty,
    reserved_qty=EXCLUDED.reserved_qty,
    updated_at=EXCLUDED.updated_at;

-- A készlet- és importtörténet egyetlen variáns alatt marad meg.
UPDATE aif_stock_movements sm
SET variant_id=mm.canonical_id
FROM _aif_variant_merge_map mm
WHERE sm.variant_id=mm.merged_id;

UPDATE aif_import_rows rw
SET variant_id=mm.canonical_id,
    normalized=COALESCE(rw.normalized,'{}'::jsonb) || jsonb_build_object(
      'mergedFromVariantId', mm.merged_id::text,
      'mergedIntoVariantId', mm.canonical_id::text,
      'variantMergedAt', now()::text
    ),
    updated_at=now()
FROM _aif_variant_merge_map mm
WHERE rw.variant_id=mm.merged_id;

-- Beszállítói kódok: ugyanaz a beszállító + termékkód + szín + méret csak egyszer marad.
CREATE TEMP TABLE _aif_supplier_code_rank ON COMMIT DROP AS
SELECT
  sc.id,
  members.canonical_id,
  row_number() OVER (
    PARTITION BY
      members.canonical_id,
      sc.supplier_id,
      lower(btrim(COALESCE(sc.supplier_product_code,''))),
      lower(btrim(COALESCE(sc.supplier_variant_code,''))),
      lower(btrim(COALESCE(sc.supplier_color_code,''))),
      lower(btrim(COALESCE(sc.supplier_size,'')))
    ORDER BY
      COALESCE(sc.is_active,true) DESC,
      CASE
        WHEN NULLIF(btrim(sc.supplier_barcode),'') IS NOT NULL AND sc.supplier_barcode !~* '^AIF' THEN 0
        WHEN NULLIF(btrim(sc.supplier_barcode),'') IS NOT NULL THEN 1
        ELSE 2
      END,
      sc.updated_at DESC NULLS LAST,
      sc.created_at DESC NULLS LAST,
      sc.id::text ASC
  ) AS rn
FROM aif_variant_supplier_codes sc
JOIN _aif_variant_members members ON members.variant_id=sc.variant_id;

DELETE FROM aif_variant_supplier_codes sc
USING _aif_supplier_code_rank ranked
WHERE sc.id=ranked.id
  AND ranked.rn>1;

UPDATE aif_variant_supplier_codes sc
SET variant_id=ranked.canonical_id,
    is_active=true,
    updated_at=now()
FROM _aif_supplier_code_rank ranked
WHERE sc.id=ranked.id
  AND ranked.rn=1
  AND sc.variant_id<>ranked.canonical_id;

-- Leltársorok összevonása, hogy a count_id + variant_id egyediség megmaradjon.
DO $migration$
BEGIN
  IF to_regclass('public.aif_inventory_count_lines') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO aif_inventory_count_lines (
        count_id, variant_id, expected_qty, expected_reserved_qty, counted_qty,
        buy_price, sell_price, note, raw, created_at, updated_at
      )
      SELECT
        line.count_id,
        members.canonical_id,
        sum(line.expected_qty),
        sum(line.expected_reserved_qty),
        CASE WHEN count(line.counted_qty)=0 THEN NULL ELSE sum(line.counted_qty) END,
        (array_agg(line.buy_price ORDER BY line.updated_at DESC NULLS LAST) FILTER (WHERE line.buy_price IS NOT NULL))[1],
        (array_agg(line.sell_price ORDER BY line.updated_at DESC NULLS LAST) FILTER (WHERE line.sell_price IS NOT NULL))[1],
        (array_agg(line.note ORDER BY line.updated_at DESC NULLS LAST) FILTER (WHERE NULLIF(btrim(line.note),'') IS NOT NULL))[1],
        jsonb_build_object(
          'variantMergeMigration','20260803_aif_merge_duplicate_variants',
          'mergedVariantIds',jsonb_agg(line.variant_id::text ORDER BY line.variant_id::text)
        ),
        min(line.created_at),
        max(line.updated_at)
      FROM aif_inventory_count_lines line
      JOIN _aif_variant_members members ON members.variant_id=line.variant_id
      GROUP BY line.count_id, members.canonical_id
      ON CONFLICT (count_id, variant_id) DO UPDATE SET
        expected_qty=EXCLUDED.expected_qty,
        expected_reserved_qty=EXCLUDED.expected_reserved_qty,
        counted_qty=EXCLUDED.counted_qty,
        buy_price=COALESCE(EXCLUDED.buy_price,aif_inventory_count_lines.buy_price),
        sell_price=COALESCE(EXCLUDED.sell_price,aif_inventory_count_lines.sell_price),
        note=COALESCE(EXCLUDED.note,aif_inventory_count_lines.note),
        raw=COALESCE(aif_inventory_count_lines.raw,'{}'::jsonb) || EXCLUDED.raw,
        updated_at=GREATEST(aif_inventory_count_lines.updated_at,EXCLUDED.updated_at)
    $sql$;

    EXECUTE $sql$
      DELETE FROM aif_inventory_count_lines line
      USING _aif_variant_merge_map mm
      WHERE line.variant_id=mm.merged_id
    $sql$;
  END IF;
END
$migration$;

-- Közös kijelölési munkalista összevonása.
DO $migration$
BEGIN
  IF to_regclass('public.aif_user_selected_variants') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO aif_user_selected_variants (
        owner_key, variant_id, action, sort_order, raw, created_at, updated_at
      )
      SELECT
        selected.owner_key,
        members.canonical_id::text,
        (array_agg(selected.action ORDER BY selected.updated_at DESC NULLS LAST)
          FILTER (WHERE selected.action IS NOT NULL))[1],
        min(selected.sort_order),
        jsonb_build_object(
          'variantMergeMigration','20260803_aif_merge_duplicate_variants',
          'mergedVariantIds',jsonb_agg(selected.variant_id ORDER BY selected.variant_id)
        ),
        min(selected.created_at),
        max(selected.updated_at)
      FROM aif_user_selected_variants selected
      JOIN _aif_variant_members members ON selected.variant_id=members.variant_id::text
      GROUP BY selected.owner_key, members.canonical_id
      ON CONFLICT (owner_key, variant_id) DO UPDATE SET
        action=COALESCE(EXCLUDED.action,aif_user_selected_variants.action),
        sort_order=LEAST(EXCLUDED.sort_order,aif_user_selected_variants.sort_order),
        raw=COALESCE(aif_user_selected_variants.raw,'{}'::jsonb) || EXCLUDED.raw,
        updated_at=GREATEST(aif_user_selected_variants.updated_at,EXCLUDED.updated_at)
    $sql$;

    EXECUTE $sql$
      DELETE FROM aif_user_selected_variants selected
      USING _aif_variant_merge_map mm
      WHERE selected.variant_id=mm.merged_id::text
    $sql$;
  END IF;
END
$migration$;

-- Egyszerű hivatkozások átvezetése. Ezekben nincs variant_id szerinti egyedi kulcs.
DO $migration$
BEGIN
  IF to_regclass('public.aif_purchase_order_lines') IS NOT NULL THEN
    EXECUTE 'UPDATE aif_purchase_order_lines x SET variant_id=m.canonical_id FROM _aif_variant_merge_map m WHERE x.variant_id=m.merged_id';
  END IF;
  IF to_regclass('public.aif_shop_sale_lines') IS NOT NULL THEN
    EXECUTE 'UPDATE aif_shop_sale_lines x SET variant_id=m.canonical_id FROM _aif_variant_merge_map m WHERE x.variant_id=m.merged_id';
  END IF;
  IF to_regclass('public.aif_stock_transfer_document_lines') IS NOT NULL THEN
    EXECUTE 'UPDATE aif_stock_transfer_document_lines x SET variant_id=m.canonical_id::text FROM _aif_variant_merge_map m WHERE x.variant_id=m.merged_id::text';
  END IF;
END
$migration$;

-- Shopify mapping: csoportonként csak egy mapping/outbox rekord marad, azt vezetjük a kanonikus variánsra.
DO $migration$
BEGIN
  IF to_regclass('public.aif_shopify_variant_map') IS NOT NULL THEN
    EXECUTE $sql$
      WITH ranked AS (
        SELECT map.ctid AS row_ctid, members.canonical_id,
               row_number() OVER (
                 PARTITION BY members.canonical_id
                 ORDER BY (map.variant_id=members.canonical_id) DESC, map.ctid
               ) AS rn
        FROM aif_shopify_variant_map map
        JOIN _aif_variant_members members ON members.variant_id=map.variant_id
      )
      DELETE FROM aif_shopify_variant_map map
      USING ranked
      WHERE map.ctid=ranked.row_ctid AND ranked.rn>1
    $sql$;

    EXECUTE $sql$
      UPDATE aif_shopify_variant_map map
      SET variant_id=members.canonical_id,
          updated_at=now()
      FROM _aif_variant_members members
      WHERE map.variant_id=members.variant_id
        AND map.variant_id<>members.canonical_id
    $sql$;
  END IF;

  IF to_regclass('public.aif_shopify_sync_outbox') IS NOT NULL THEN
    EXECUTE $sql$
      WITH ranked AS (
        SELECT outbox.ctid AS row_ctid, members.canonical_id,
               row_number() OVER (
                 PARTITION BY members.canonical_id
                 ORDER BY (outbox.variant_id=members.canonical_id) DESC, outbox.ctid
               ) AS rn
        FROM aif_shopify_sync_outbox outbox
        JOIN _aif_variant_members members ON members.variant_id=outbox.variant_id
      )
      DELETE FROM aif_shopify_sync_outbox outbox
      USING ranked
      WHERE outbox.ctid=ranked.row_ctid AND ranked.rn>1
    $sql$;

    EXECUTE $sql$
      UPDATE aif_shopify_sync_outbox outbox
      SET variant_id=members.canonical_id,
          updated_at=now()
      FROM _aif_variant_members members
      WHERE outbox.variant_id=members.variant_id
        AND outbox.variant_id<>members.canonical_id
    $sql$;
  END IF;

  IF to_regclass('public.aif_shopify_product_export_items') IS NOT NULL THEN
    EXECUTE $sql$
      WITH ranked AS (
        SELECT item.ctid AS row_ctid, item.export_id, members.canonical_id,
               row_number() OVER (
                 PARTITION BY item.export_id, members.canonical_id
                 ORDER BY (item.variant_id=members.canonical_id) DESC, item.ctid
               ) AS rn
        FROM aif_shopify_product_export_items item
        JOIN _aif_variant_members members ON members.variant_id=item.variant_id
      )
      DELETE FROM aif_shopify_product_export_items item
      USING ranked
      WHERE item.ctid=ranked.row_ctid AND ranked.rn>1
    $sql$;

    EXECUTE $sql$
      UPDATE aif_shopify_product_export_items item
      SET variant_id=members.canonical_id
      FROM _aif_variant_members members
      WHERE item.variant_id=members.variant_id
        AND item.variant_id<>members.canonical_id
    $sql$;
  END IF;
END
$migration$;

-- A duplikátumok auditálható archív sorok maradnak, de készletük és aktív kapcsolataik már nincsenek.
UPDATE aif_product_variants duplicate
SET status='archived',
    barcode=NULL,
    attributes=COALESCE(duplicate.attributes,'{}'::jsonb) || jsonb_build_object(
      'mergedIntoVariantId',mm.canonical_id::text,
      'mergedAt',now()::text,
      'variantMergeMigration','20260803_aif_merge_duplicate_variants',
      'mergedBarcode',NULLIF(audit.variant_before->>'barcode','')
    ),
    updated_at=now()
FROM _aif_variant_merge_map mm
LEFT JOIN aif_variant_merge_audit audit
  ON audit.migration_tag='20260803_aif_merge_duplicate_variants'
 AND audit.merged_variant_id=mm.merged_id
WHERE duplicate.id=mm.merged_id;

-- Adatbázis-szintű védelem: ugyanaz az aktív modell + színkód + méret nem jöhet létre kétszer.
CREATE UNIQUE INDEX IF NOT EXISTS aif_product_variants_active_color_code_size_uq
  ON aif_product_variants (
    model_id,
    lower(btrim(color_code)),
    lower(COALESCE(NULLIF(btrim(size),''),''))
  )
  WHERE COALESCE(status,'active') <> 'archived'
    AND NULLIF(btrim(color_code),'') IS NOT NULL;

-- Ha nincs színkód, a normalizált színnév + méret a tartalék variánskulcs.
CREATE UNIQUE INDEX IF NOT EXISTS aif_product_variants_active_color_name_size_uq
  ON aif_product_variants (
    model_id,
    lower(COALESCE(NULLIF(btrim(color_name),''),'')),
    lower(COALESCE(NULLIF(btrim(size),''),''))
  )
  WHERE COALESCE(status,'active') <> 'archived'
    AND NULLIF(btrim(color_code),'') IS NULL;

DO $validation$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM aif_product_variants v
    WHERE COALESCE(v.status,'active') <> 'archived'
    GROUP BY
      v.model_id,
      CASE WHEN NULLIF(btrim(v.color_code),'') IS NOT NULL THEN 'code' ELSE 'name' END,
      lower(CASE
        WHEN NULLIF(btrim(v.color_code),'') IS NOT NULL THEN btrim(v.color_code)
        ELSE COALESCE(NULLIF(btrim(v.color_name),''), '')
      END),
      lower(COALESCE(NULLIF(btrim(v.size),''), ''))
    HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'A variáns-összevonás után aktív duplikáció maradt. A tranzakció visszagörgetve.';
  END IF;
END
$validation$;

SELECT
  count(*)::int AS merged_variant_count,
  count(DISTINCT canonical_id)::int AS affected_variant_groups
FROM _aif_variant_merge_map;

COMMIT;
