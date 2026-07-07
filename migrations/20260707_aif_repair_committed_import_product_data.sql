BEGIN;

WITH src AS (
  SELECT DISTINCT ON (rw.variant_id)
    rw.variant_id,
    v.model_id,
    rw.raw,
    rw.normalized,
    rw.sn_cod,
    rw.supplier_product_code,
    rw.supplier_color_code,
    rw.supplier_size,
    rw.buy_price_ron,
    rw.buy_price,
    rw.sell_price_ron,
    rw.sell_price,
    COALESCE(NULLIF(rw.normalized->>'brandName',''), NULLIF(rw.raw->>'BRAND','')) AS brand_name,
    COALESCE(NULLIF(rw.normalized->>'brandCode',''), lower(regexp_replace(COALESCE(NULLIF(rw.raw->>'BRAND',''), ''), '[^a-zA-Z0-9]+', '_', 'g'))) AS brand_code,
    COALESCE(NULLIF(rw.normalized->>'titleRo',''), NULLIF(rw.normalized->>'productName',''), NULLIF(rw.raw->>'ARTICOL',''), rw.supplier_product_code) AS title_ro,
    COALESCE(NULLIF(rw.normalized->>'descriptionRo',''), NULLIF(rw.raw->>'RODESCR','')) AS description_ro,
    COALESCE(NULLIF(rw.normalized->>'productType',''), NULLIF(rw.raw->>'RODESCR','')) AS product_type,
    COALESCE(NULLIF(rw.normalized->>'categoryName',''), NULLIF(rw.normalized->>'categoryCode',''), NULLIF(rw.raw->>'RODESCR',''), NULLIF(rw.raw->>'CATEGORIE','')) AS category_candidate,
    CASE lower(COALESCE(NULLIF(rw.normalized->>'gender',''), NULLIF(rw.raw->>'GEN',''), 'unisex'))
      WHEN 'mens' THEN 'men'
      WHEN 'men' THEN 'men'
      WHEN 'barbati' THEN 'men'
      WHEN 'férfi' THEN 'men'
      WHEN 'ferfi' THEN 'men'
      WHEN 'womens' THEN 'women'
      WHEN 'women' THEN 'women'
      WHEN 'dama' THEN 'women'
      WHEN 'női' THEN 'women'
      WHEN 'noi' THEN 'women'
      WHEN 'unisex' THEN 'unisex'
      ELSE COALESCE(NULLIF(rw.normalized->>'gender',''), 'unisex')
    END AS gender,
    COALESCE(NULLIF(rw.normalized->>'material',''), NULLIF(rw.normalized->>'composition',''), NULLIF(rw.raw->>'COMPOZITIE','')) AS material,
    COALESCE(NULLIF(rw.normalized->>'season',''), NULLIF(rw.normalized->>'collection',''), NULLIF(rw.raw->>'COLECTIE','')) AS season,
    COALESCE(NULLIF(rw.normalized->>'colorCode',''), NULLIF(rw.normalized->>'supplierColorCode',''), rw.supplier_color_code) AS color_code,
    COALESCE(NULLIF(rw.normalized->>'colorName','')) AS color_name,
    COALESCE(NULLIF(rw.normalized->>'colorHex','')) AS color_hex,
    COALESCE(NULLIF(rw.normalized->>'size',''), rw.supplier_size, NULLIF(rw.raw->>'MARIME','')) AS size,
    COALESCE(NULLIF(rw.normalized->>'customsTariffCode',''), NULLIF(rw.normalized->>'customs_tariff_code',''), NULLIF(rw.normalized->>'hsCode',''), NULLIF(rw.raw->>'INTRASTAT','')) AS customs_tariff_code,
    COALESCE(NULLIF(rw.normalized->>'imageUrl',''), NULLIF(rw.normalized->>'image_url','')) AS image_url,
    COALESCE(b.committed_at, b.updated_at, b.created_at, rw.updated_at) AS import_at
  FROM aif_import_rows rw
  JOIN aif_import_batches b ON b.id = rw.batch_id
  JOIN aif_product_variants v ON v.id = rw.variant_id
  WHERE rw.status = 'committed'
    AND rw.variant_id IS NOT NULL
  ORDER BY rw.variant_id, COALESCE(b.committed_at, b.updated_at, b.created_at, rw.updated_at) DESC, rw.updated_at DESC NULLS LAST, rw.row_no DESC
), src_resolved AS (
  SELECT
    src.*,
    br.id AS resolved_brand_id,
    cat.id AS resolved_category_id,
    ct.name_ro AS resolved_color_name,
    ct.hex AS resolved_color_hex
  FROM src
  LEFT JOIN LATERAL (
    SELECT id
    FROM aif_brands br
    WHERE br.is_active = true
      AND (
        lower(br.name) = lower(src.brand_name)
        OR lower(br.code) = lower(src.brand_code)
      )
    ORDER BY br.is_active DESC, br.name ASC
    LIMIT 1
  ) br ON true
  LEFT JOIN LATERAL (
    SELECT c.id
    FROM aif_categories c
    WHERE c.is_active = true
      AND src.category_candidate IS NOT NULL
      AND (
        lower(c.code) = lower(src.category_candidate)
        OR lower(c.name_ro) = lower(src.category_candidate)
        OR lower(COALESCE(c.name_hu,'')) = lower(src.category_candidate)
        OR EXISTS (
          SELECT 1 FROM unnest(COALESCE(c.aliases, '{}'::text[])) a
          WHERE lower(a) = lower(src.category_candidate)
        )
      )
    ORDER BY c.sort_order ASC, c.name_ro ASC
    LIMIT 1
  ) cat ON true
  LEFT JOIN LATERAL (
    SELECT color.name_ro, color.hex
    FROM aif_brand_color_codes bcc
    JOIN aif_color_types color ON color.id = bcc.color_type_id
    WHERE bcc.is_active = true
      AND color.is_active = true
      AND bcc.brand_id = br.id
      AND lower(bcc.color_code) = lower(src.color_code)
    LIMIT 1
  ) ct ON true
)
UPDATE aif_product_models m
SET
  brand_id = COALESCE(m.brand_id, src_resolved.resolved_brand_id),
  category_id = COALESCE(m.category_id, src_resolved.resolved_category_id),
  title_ro = CASE WHEN NULLIF(NULLIF(trim(COALESCE(m.title_ro,'')), ''), '-') IS NULL THEN src_resolved.title_ro ELSE m.title_ro END,
  description_ro = CASE WHEN NULLIF(NULLIF(trim(COALESCE(m.description_ro,'')), ''), '-') IS NULL THEN src_resolved.description_ro ELSE m.description_ro END,
  gender = CASE WHEN NULLIF(NULLIF(trim(COALESCE(m.gender,'')), ''), '-') IS NULL THEN COALESCE(src_resolved.gender, 'unisex') ELSE m.gender END,
  product_type = CASE WHEN NULLIF(NULLIF(trim(COALESCE(m.product_type,'')), ''), '-') IS NULL THEN src_resolved.product_type ELSE m.product_type END,
  season = CASE WHEN NULLIF(NULLIF(trim(COALESCE(m.season,'')), ''), '-') IS NULL THEN src_resolved.season ELSE m.season END,
  material = CASE WHEN NULLIF(NULLIF(trim(COALESCE(m.material,'')), ''), '-') IS NULL THEN src_resolved.material ELSE m.material END,
  shopify_title = CASE WHEN NULLIF(NULLIF(trim(COALESCE(m.shopify_title,'')), ''), '-') IS NULL THEN src_resolved.title_ro ELSE m.shopify_title END,
  updated_at = now()
FROM src_resolved
WHERE m.id = src_resolved.model_id;

WITH src AS (
  SELECT DISTINCT ON (rw.variant_id)
    rw.variant_id,
    v.model_id,
    rw.raw,
    rw.normalized,
    rw.sn_cod,
    rw.supplier_color_code,
    rw.supplier_size,
    rw.buy_price_ron,
    rw.buy_price,
    rw.sell_price_ron,
    rw.sell_price,
    COALESCE(NULLIF(rw.normalized->>'brandName',''), NULLIF(rw.raw->>'BRAND','')) AS brand_name,
    COALESCE(NULLIF(rw.normalized->>'brandCode',''), lower(regexp_replace(COALESCE(NULLIF(rw.raw->>'BRAND',''), ''), '[^a-zA-Z0-9]+', '_', 'g'))) AS brand_code,
    COALESCE(NULLIF(rw.normalized->>'colorCode',''), NULLIF(rw.normalized->>'supplierColorCode',''), rw.supplier_color_code) AS color_code,
    COALESCE(NULLIF(rw.normalized->>'colorName','')) AS color_name,
    COALESCE(NULLIF(rw.normalized->>'colorHex','')) AS color_hex,
    COALESCE(NULLIF(rw.normalized->>'size',''), rw.supplier_size, NULLIF(rw.raw->>'MARIME','')) AS size,
    COALESCE(NULLIF(rw.normalized->>'customsTariffCode',''), NULLIF(rw.normalized->>'customs_tariff_code',''), NULLIF(rw.normalized->>'hsCode',''), NULLIF(rw.raw->>'INTRASTAT','')) AS customs_tariff_code,
    COALESCE(NULLIF(rw.normalized->>'imageUrl',''), NULLIF(rw.normalized->>'image_url','')) AS image_url,
    COALESCE(b.committed_at, b.updated_at, b.created_at, rw.updated_at) AS import_at
  FROM aif_import_rows rw
  JOIN aif_import_batches b ON b.id = rw.batch_id
  JOIN aif_product_variants v ON v.id = rw.variant_id
  WHERE rw.status = 'committed'
    AND rw.variant_id IS NOT NULL
  ORDER BY rw.variant_id, COALESCE(b.committed_at, b.updated_at, b.created_at, rw.updated_at) DESC, rw.updated_at DESC NULLS LAST, rw.row_no DESC
), src_resolved AS (
  SELECT src.*, ct.name_ro AS resolved_color_name, ct.hex AS resolved_color_hex
  FROM src
  LEFT JOIN LATERAL (
    SELECT br.id
    FROM aif_brands br
    WHERE br.is_active = true
      AND (lower(br.name) = lower(src.brand_name) OR lower(br.code) = lower(src.brand_code))
    LIMIT 1
  ) br ON true
  LEFT JOIN LATERAL (
    SELECT color.name_ro, color.hex
    FROM aif_brand_color_codes bcc
    JOIN aif_color_types color ON color.id = bcc.color_type_id
    WHERE bcc.is_active = true
      AND color.is_active = true
      AND bcc.brand_id = br.id
      AND lower(bcc.color_code) = lower(src.color_code)
    LIMIT 1
  ) ct ON true
)
UPDATE aif_product_variants v
SET
  color_code = CASE WHEN NULLIF(NULLIF(trim(COALESCE(v.color_code,'')), ''), '-') IS NULL THEN src_resolved.color_code ELSE v.color_code END,
  color_name = CASE WHEN NULLIF(NULLIF(trim(COALESCE(v.color_name,'')), ''), '-') IS NULL THEN COALESCE(src_resolved.resolved_color_name, src_resolved.color_name) ELSE v.color_name END,
  color_hex = COALESCE(v.color_hex, src_resolved.resolved_color_hex, src_resolved.color_hex),
  size = CASE WHEN NULLIF(NULLIF(trim(COALESCE(v.size,'')), ''), '-') IS NULL THEN src_resolved.size ELSE v.size END,
  buy_price = COALESCE(v.buy_price, src_resolved.buy_price_ron, src_resolved.buy_price),
  sell_price = COALESCE(v.sell_price, src_resolved.sell_price_ron, src_resolved.sell_price),
  image_url = COALESCE(v.image_url, src_resolved.image_url),
  sn_cod = CASE WHEN NULLIF(NULLIF(trim(COALESCE(v.sn_cod,'')), ''), '-') IS NULL THEN src_resolved.sn_cod ELSE v.sn_cod END,
  attributes = CASE
    WHEN src_resolved.customs_tariff_code IS NULL THEN COALESCE(v.attributes, '{}'::jsonb)
    ELSE COALESCE(v.attributes, '{}'::jsonb) || jsonb_build_object(
      'customsTariffCode', src_resolved.customs_tariff_code,
      'customs_tariff_code', src_resolved.customs_tariff_code,
      'tariffCode', src_resolved.customs_tariff_code,
      'hsCode', src_resolved.customs_tariff_code
    )
  END,
  status = CASE WHEN v.status = 'archived' THEN v.status ELSE 'active' END,
  updated_at = now()
FROM src_resolved
WHERE v.id = src_resolved.variant_id;

COMMIT;
