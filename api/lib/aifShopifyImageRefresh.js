import { aifImageGallery } from './aifImageGallery.js';
import { shopifyGraphql, getAifShopifyPublicConfig } from './aifShopify.js';
import { ensureAifShopifyImageSchema } from './aifShopifyImages.js';

const txt = v => String(v ?? '').trim();
const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const validId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function findImageRefreshVariant(identity, graphql = shopifyGraphql) {
  const local = typeof identity === 'string' ? {barcode:identity} : identity;
  const barcode = txt(local.barcode);
  const skus = [...new Set([barcode,txt(local.internal_sku),txt(local.mapped_sku)].filter(Boolean))];
  const fields = `id sku barcode title inventoryItem { id } product { id title status }`;
  const complete = remote => {
    if (!remote?.id || !remote.product?.id || !remote.inventoryItem?.id) throw fail('Hiányos Shopify-termékadat.',502);
    if (barcode && txt(remote.barcode) && txt(remote.barcode)!==barcode) {
      throw fail('A Shopify-variáns vonalkódja eltér a belső termékétől. Ellenőrizd a párosítást.');
    }
    return remote;
  };
  if (txt(local.shopify_variant_id)) {
    const response = await graphql(`query AifImageRefreshStored($id:ID!) { productVariant(id:$id) { ${fields} } }`, {id:local.shopify_variant_id});
    if (response.errors?.length || !response.data || !('productVariant' in response.data)) throw fail('A tárolt Shopify-kapcsolat nem ellenőrizhető.',502);
    if (response.data.productVariant) return complete(response.data.productVariant);
    throw fail('A párosított Shopify-variáns már nem található. Ellenőrizd a párosítást.');
  }
  if (!skus.length) throw fail('Hiányzik a vonalkód és az SKU; a Shopify-termék nem azonosítható.');
  const query = [...skus.map(sku=>`sku:${JSON.stringify(sku)}`), ...(barcode?[`barcode:${JSON.stringify(barcode)}`]:[])].join(' OR ');
  const matches = new Map();
  let after=null;
  for (let page=0;page<10;page++) {
    const response = await graphql(`query AifImageRefreshMatch($query:String!,$after:String) {
      productVariants(first:100,query:$query,after:$after) {
        nodes { ${fields} }
        pageInfo { hasNextPage endCursor }
      }
    }`, {query,after});
    const result = response.data?.productVariants;
    if (response.errors?.length || !Array.isArray(result?.nodes)) throw fail('A Shopify-találatok nem ellenőrizhetők teljesen. Próbáld újra később.',502);
    for (const remote of result.nodes) {
      if ((barcode && txt(remote.barcode)===barcode) || skus.includes(txt(remote.sku))) matches.set(remote.id,remote);
    }
    if (!result.pageInfo?.hasNextPage) {
      if (matches.size!==1) throw fail(matches.size
        ? 'Több Shopify-variáns egyezik az azonosítókkal. A párosítást javítani kell.'
        : `Nem található élő Shopify-variáns. Ellenőrzött vonalkód/SKU: ${skus.join(', ')}. A régi exportbejegyzés önmagában nem igazolja a Shopify-importot.`);
      return complete([...matches.values()][0]);
    }
    if (!result.pageInfo.endCursor || result.pageInfo.endCursor===after) break;
    after=result.pageInfo.endCursor;
  }
  throw fail('A Shopify-találatok nem ellenőrizhetők teljesen. Próbáld újra később.',502);
}

export async function getImageRefreshStatus(pool, variantId) {
  if (!validId(variantId)) throw fail('Érvénytelen termékazonosító.', 400);
  const exists = await pool.query("SELECT to_regclass('public.aif_shopify_image_outbox') AS name");
  if (!exists.rows[0]?.name) return {ok:true,status:'not_queued'};
  const result = await pool.query(`SELECT o.status,o.last_error,o.updated_at,o.generation
    FROM aif_shopify_variant_map m
    JOIN aif_shopify_image_outbox o ON o.shopify_product_id=m.shopify_product_id
    WHERE m.variant_id=$1::uuid`, [variantId]);
  return { ok: true, ...(result.rows[0] || { status: 'not_queued' }) };
}

export async function requestImageRefresh(pool, variantId) {
  if (!validId(variantId)) throw fail('Érvénytelen termékazonosító.', 400);
  if (!getAifShopifyPublicConfig().enabled) throw fail('A Shopify-kapcsolat nincs bekapcsolva.');
  await ensureAifShopifyImageSchema(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`SELECT v.id,v.barcode,v.internal_sku,v.images,v.image_url
      FROM aif_product_variants v JOIN aif_product_models p ON p.id=v.model_id
      WHERE v.id=$1::uuid AND COALESCE(v.status,'active')<>'archived'
        AND COALESCE(p.status,'active')<>'archived' FOR UPDATE OF v`, [variantId]);
    const local = found.rows[0];
    if (!local) throw fail('A termék nem található vagy archivált.', 404);
    const gallery = aifImageGallery(local.images, local.image_url);
    if (!gallery.length) throw fail('A termékhez még nincs feltöltött kép.');
    if (gallery.some(url => { try { return new URL(url).protocol !== 'https:'; } catch { return true; } })) {
      throw fail('A képekhez nyilvános HTTPS-cím szükséges.');
    }
    const existing = await client.query(`SELECT sku AS mapped_sku,shopify_variant_id
      FROM aif_shopify_variant_map WHERE variant_id=$1::uuid`,[variantId]);
    const remote = await findImageRefreshVariant({...local,...existing.rows[0]});
    // Serialize matching/queue requests for the same remote product. The worker
    // retains its existing SKIP LOCKED claim mechanism; active jobs are not reset.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['image-refresh:' + remote.product.id]);
    const maps = await client.query(`SELECT variant_id::text,shopify_variant_id,shopify_product_id
      FROM aif_shopify_variant_map WHERE variant_id=$1::uuid OR shopify_variant_id=$2 FOR UPDATE`, [variantId,remote.id]);
    if (maps.rows.some(m => m.variant_id !== variantId || m.shopify_variant_id !== remote.id || m.shopify_product_id !== remote.product.id)) {
      throw fail('A meglévő Shopify-párosítás eltér a találattól. Előbb ellenőrizd a párosítást.');
    }
    if (!maps.rows.length) {
      const duplicates = await client.query(`SELECT id FROM aif_product_variants WHERE id<>$2::uuid AND ((NULLIF(btrim(barcode),'') IS NOT NULL AND btrim(barcode)=$1) OR (NULLIF(btrim(internal_sku),'') IS NOT NULL AND btrim(internal_sku)=$3))`, [txt(local.barcode),variantId,txt(local.internal_sku)]);
      if (duplicates.rows.length) throw fail('Ez az azonosító több belső terméknél szerepel. A párosítás nem egyértelmű.');
      await client.query(`INSERT INTO aif_shopify_variant_map
        (variant_id,sku,shopify_product_id,shopify_variant_id,shopify_inventory_item_id,
         shopify_product_title,shopify_variant_title,shopify_product_status,sync_status,raw,updated_at)
        VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,'mapped','{"source":"image_refresh"}'::jsonb,now())`,
        [variantId,txt(remote.sku) || txt(local.barcode),remote.product.id,remote.id,remote.inventoryItem.id,remote.product.title,remote.title,remote.product.status]);
    }
    await client.query(`INSERT INTO aif_shopify_image_outbox (shopify_product_id)
      VALUES ($1) ON CONFLICT (shopify_product_id) DO NOTHING`, [remote.product.id]);
    // The mapping trigger can have just created a pending job. Bring that job
    // forward without replacing its generation or an in-flight worker's lock.
    await client.query(`UPDATE aif_shopify_image_outbox SET
      status='pending',generation=gen_random_uuid(),attempts=0,job_id=NULL,
      last_error=NULL,locked_at=NULL,next_attempt_at=now(),updated_at=now()
      WHERE shopify_product_id=$1 AND status IN ('done','error')`, [remote.product.id]);
    await client.query(`UPDATE aif_shopify_image_outbox SET next_attempt_at=now()
      WHERE shopify_product_id=$1 AND status='pending'`, [remote.product.id]);
    const status = await getImageRefreshStatus(client, variantId);
    await client.query('COMMIT');
    return { ...status, productTitle: remote.product.title };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

export function registerImageRefreshRoutes(router, pool, requireAdminOrSecret) {
  const handle = action => async (req,res) => {
    try { res.json(await action(pool,txt(req.params.variantId))); }
    catch (error) { res.status(Number(error.statusCode) || 500).json({error:error.message || 'A képfrissítés nem sikerült.'}); }
  };
  router.post('/shopify/images/:variantId/refresh',requireAdminOrSecret,handle(requestImageRefresh));
  router.get('/shopify/images/:variantId/status',requireAdminOrSecret,handle(getImageRefreshStatus));
}
