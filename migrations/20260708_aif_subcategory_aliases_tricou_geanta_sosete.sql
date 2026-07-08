\pset pager off
\echo '============================================================'
\echo 'AIF alkategória alias javítás: TRICOU / GEANTA / SOSETE'
\echo 'Mit csinál: meglévő alkategóriákhoz aliasokat ad, majd subcategory_id backfillt futtat.'
\echo 'Biztonság: csak akkor frissít aliasokat, ha egy import értékhez pontosan 1 aktív alkategória található.'
\echo '============================================================'

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.aif_norm_text(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(coalesce(value, '')),
      'ă','a'), 'â','a'), 'î','i'), 'ș','s'), 'ş','s'), 'ț','t'), 'ţ','t'),
      'á','a'), 'é','e'), 'í','i'), 'ó','o'), 'ö','o'), 'ő','o'), 'ú','u'), 'ü','u'), 'ű','u'), 'ș','s'), 'ț','t'),
    '[^a-z0-9]+', '', 'g'
  );
$$;

DROP TABLE IF EXISTS pg_temp.aif_subcategory_alias_plan;
CREATE TEMP TABLE pg_temp.aif_subcategory_alias_plan (
  import_value text PRIMARY KEY,
  match_tokens text[] NOT NULL,
  aliases_to_add text[] NOT NULL
) ON COMMIT DROP;

INSERT INTO pg_temp.aif_subcategory_alias_plan (import_value, match_tokens, aliases_to_add) VALUES
  ('TRICOU',
   ARRAY['TRICOU','TRICOURI','TRICOU BARBATI','TRICOU FEMEI','T-SHIRT','TSHIRT','TEE','POLOU','PÓLÓ','POLO'],
   ARRAY['TRICOU','TRICOURI','RODESCR:TRICOU','PRODUCT_TYPE:TRICOU','T-SHIRT','TSHIRT','POLOU','POLO']),
  ('GEANTA',
   ARRAY['GEANTA','GEANTĂ','GENTI','GENȚI','GEANTI','BAG','TASCA','TÁSKA'],
   ARRAY['GEANTA','GEANTĂ','GENTI','GENȚI','RODESCR:GEANTA','PRODUCT_TYPE:GEANTA','BAG','TASCA']),
  ('SOSETE',
   ARRAY['SOSETE','ȘOSETE','SOȘETE','SOSETA','ȘOSETĂ','CIORAPI','ZOKNI','SOCKS'],
   ARRAY['SOSETE','ȘOSETE','SOSETA','ȘOSETĂ','CIORAPI','RODESCR:SOSETE','PRODUCT_TYPE:SOSETE','SOCKS','ZOKNI']);

DROP TABLE IF EXISTS pg_temp.aif_subcategory_alias_matches;
CREATE TEMP TABLE pg_temp.aif_subcategory_alias_matches AS
WITH candidates AS (
  SELECT
    p.import_value,
    c.id AS subcategory_id,
    c.code,
    c.name_ro,
    c.name_hu,
    c.aliases,
    p.aliases_to_add,
    array_agg(DISTINCT token) FILTER (WHERE token IS NOT NULL) AS matched_tokens
  FROM pg_temp.aif_subcategory_alias_plan p
  JOIN public.aif_categories c
    ON c.parent_id IS NOT NULL
   AND coalesce(c.is_active, true) IS TRUE
  LEFT JOIN LATERAL unnest(p.match_tokens) AS token ON TRUE
  WHERE
    pg_temp.aif_norm_text(c.code) = pg_temp.aif_norm_text(token)
    OR pg_temp.aif_norm_text(c.name_ro) = pg_temp.aif_norm_text(token)
    OR pg_temp.aif_norm_text(c.name_hu) = pg_temp.aif_norm_text(token)
    OR pg_temp.aif_norm_text(c.name_ro) LIKE '%' || pg_temp.aif_norm_text(token) || '%'
    OR pg_temp.aif_norm_text(c.name_hu) LIKE '%' || pg_temp.aif_norm_text(token) || '%'
    OR EXISTS (
      SELECT 1
      FROM unnest(coalesce(c.aliases, ARRAY[]::text[])) AS a(alias_value)
      WHERE pg_temp.aif_norm_text(a.alias_value) = pg_temp.aif_norm_text(token)
         OR pg_temp.aif_norm_text(a.alias_value) LIKE '%' || pg_temp.aif_norm_text(token) || '%'
    )
  GROUP BY p.import_value, c.id, c.code, c.name_ro, c.name_hu, c.aliases, p.aliases_to_add
), ranked AS (
  SELECT
    candidates.*,
    count(*) OVER (PARTITION BY import_value) AS candidate_count
  FROM candidates
)
SELECT * FROM ranked;

\echo ''
\echo '============================================================'
\echo 'Talált alkategória jelöltek'
\echo 'candidate_count = 1 esetén az SQL automatikusan hozzáadja az aliasokat.'
\echo 'candidate_count = 0 vagy több találat esetén kézzel kell egyértelműsíteni.'
\echo '============================================================'

SELECT
  p.import_value,
  coalesce(m.candidate_count, 0) AS candidate_count,
  m.subcategory_id,
  m.code,
  m.name_ro,
  m.name_hu,
  m.matched_tokens
FROM pg_temp.aif_subcategory_alias_plan p
LEFT JOIN pg_temp.aif_subcategory_alias_matches m ON m.import_value = p.import_value
ORDER BY p.import_value, m.name_ro;

\echo ''
\echo '============================================================'
\echo 'Aliasok hozzáadása az egyértelmű találatokhoz'
\echo '============================================================'

WITH unique_matches AS (
  SELECT *
  FROM pg_temp.aif_subcategory_alias_matches
  WHERE candidate_count = 1
), updated AS (
  UPDATE public.aif_categories c
  SET aliases = (
    SELECT ARRAY(
      SELECT DISTINCT clean_alias
      FROM (
        SELECT trim(x) AS clean_alias
        FROM unnest(coalesce(c.aliases, ARRAY[]::text[]) || u.aliases_to_add) AS x
      ) s
      WHERE clean_alias <> ''
      ORDER BY clean_alias
    )
  )
  FROM unique_matches u
  WHERE c.id = u.subcategory_id
  RETURNING u.import_value, c.id AS subcategory_id, c.code, c.name_ro, c.name_hu, c.aliases
)
SELECT * FROM updated ORDER BY import_value;

\echo ''
\echo '============================================================'
\echo 'Backfill: product_models.subcategory_id kitöltése product_type alapján'
\echo '============================================================'

WITH resolved AS (
  SELECT
    m.id AS model_id,
    m.product_type,
    public.aif_resolve_subcategory_id(m.product_type) AS resolved_subcategory_id
  FROM public.aif_product_models m
  WHERE m.subcategory_id IS NULL
    AND nullif(trim(coalesce(m.product_type, '')), '') IS NOT NULL
), updated AS (
  UPDATE public.aif_product_models m
  SET subcategory_id = r.resolved_subcategory_id
  FROM resolved r
  WHERE m.id = r.model_id
    AND r.resolved_subcategory_id IS NOT NULL
  RETURNING m.id, m.product_type, m.subcategory_id
)
SELECT
  count(*) AS backfilled_models
FROM updated;

\echo ''
\echo '============================================================'
\echo 'Aktív alkategória linkek a modelleken'
\echo '============================================================'

SELECT
  m.product_type,
  c.id AS subcategory_id,
  c.name_ro AS subcategory_name_ro,
  c.name_hu AS subcategory_name_hu,
  count(*) AS linked_models
FROM public.aif_product_models m
LEFT JOIN public.aif_categories c ON c.id = m.subcategory_id
WHERE nullif(trim(coalesce(m.product_type, '')), '') IS NOT NULL
GROUP BY m.product_type, c.id, c.name_ro, c.name_hu
ORDER BY m.product_type, c.name_ro NULLS LAST;

\echo ''
\echo '============================================================'
\echo 'Még nem feloldott product_type értékek'
\echo 'Ha itt marad sor, ahhoz nincs egyértelmű aktív alkategória alias.'
\echo '============================================================'

SELECT
  m.product_type,
  count(*) AS model_count,
  public.aif_resolve_subcategory_id(m.product_type) AS would_match_subcategory_id
FROM public.aif_product_models m
WHERE nullif(trim(coalesce(m.product_type, '')), '') IS NOT NULL
  AND m.subcategory_id IS NULL
GROUP BY m.product_type
ORDER BY model_count DESC, m.product_type;

COMMIT;

\echo ''
\echo 'KÉSZ: alias javítás + backfill lefutott.'
