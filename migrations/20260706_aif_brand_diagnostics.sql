-- AIF brand/supplier duplicate diagnostics. Read-only, nem módosít semmit.
\echo '--- Duplicate active brands by normalized name ---'
WITH b AS (
  SELECT
    id,
    code,
    name,
    is_active,
    lower(regexp_replace(trim(coalesce(name, code, '')), '\s+', ' ', 'g')) AS name_key
  FROM aif_brands
)
SELECT
  name_key,
  count(*) AS total_rows,
  count(*) FILTER (WHERE is_active) AS active_rows,
  jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'active', is_active) ORDER BY is_active DESC, name, code) AS rows
FROM b
GROUP BY name_key
HAVING count(*) > 1 OR count(*) FILTER (WHERE is_active) > 1
ORDER BY active_rows DESC, total_rows DESC, name_key;

\echo '--- Duplicate active suppliers by normalized name ---'
WITH s AS (
  SELECT
    id,
    code,
    name,
    is_active,
    lower(regexp_replace(trim(coalesce(name, code, '')), '\s+', ' ', 'g')) AS name_key
  FROM aif_suppliers
)
SELECT
  name_key,
  count(*) AS total_rows,
  count(*) FILTER (WHERE is_active) AS active_rows,
  jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'active', is_active) ORDER BY is_active DESC, name, code) AS rows
FROM s
GROUP BY name_key
HAVING count(*) > 1 OR count(*) FILTER (WHERE is_active) > 1
ORDER BY active_rows DESC, total_rows DESC, name_key;

\echo '--- Brand usage details for duplicated brand names ---'
WITH dup_keys AS (
  SELECT lower(regexp_replace(trim(coalesce(name, code, '')), '\s+', ' ', 'g')) AS name_key
  FROM aif_brands
  WHERE is_active=true
  GROUP BY 1
  HAVING count(*) > 1
)
SELECT
  b.name,
  b.code,
  b.id,
  b.is_active,
  (SELECT count(*) FROM aif_product_models m WHERE m.brand_id=b.id) AS product_models,
  (SELECT count(*) FROM aif_supplier_brands sb WHERE sb.brand_id=b.id) AS supplier_links,
  (SELECT count(*) FROM aif_brand_color_codes bcc WHERE bcc.brand_id=b.id) AS color_codes,
  (SELECT count(*) FROM aif_brand_size_codes bsc WHERE bsc.brand_id=b.id) AS size_codes
FROM aif_brands b
JOIN dup_keys d ON d.name_key=lower(regexp_replace(trim(coalesce(b.name, b.code, '')), '\s+', ' ', 'g'))
ORDER BY b.name, b.is_active DESC, product_models DESC, supplier_links DESC, b.code;
