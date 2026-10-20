import { createHash } from 'node:crypto';
import { aifImageGallery } from './aifImageGallery.js';
import { ensureAifShopifyTables, getAifShopifyPublicConfig, shopifyGraphql } from './aifShopify.js';

// A termékképek szinkronja külön outbox. SOHA nem ír készletet, SKU-t vagy árat.
let schemaPromise = null;
export async function ensureAifShopifyImageSchema(client) {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await ensureAifShopifyTables(client);
      await client.query(`CREATE TABLE IF NOT EXISTS aif_shopify_image_outbox (
        shopify_product_id text PRIMARY KEY,
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','waiting','done','error')),
        generation uuid NOT NULL DEFAULT gen_random_uuid(),
        attempts int NOT NULL DEFAULT 0,
        bootstrap_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
        job_id text NULL,
        last_error text NULL,
        locked_at timestamptz NULL,
        next_attempt_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
      await client.query(`ALTER TABLE aif_shopify_image_outbox
        ADD COLUMN IF NOT EXISTS bootstrap_urls jsonb NOT NULL DEFAULT '[]'::jsonb`);
      await client.query(`CREATE INDEX IF NOT EXISTS aif_shopify_image_outbox_work_idx
        ON aif_shopify_image_outbox (status,next_attempt_at,updated_at)`);
      await client.query(`CREATE TABLE IF NOT EXISTS aif_shopify_image_links (
        shopify_product_id text NOT NULL,
        source_url text NOT NULL,
        media_id text NOT NULL,
        managed boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (shopify_product_id,source_url)
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS aif_shopify_image_links_media_idx
        ON aif_shopify_image_links (shopify_product_id,media_id)`);
      // AIF_SHOPIFY_IMAGE_V8: a kozvetlen SQL/import es az uj Shopify-pairing
      // is tartos kep-queue-t kap. Nem erinti a keszlet-queue-t.
      await client.query(`CREATE OR REPLACE FUNCTION aif_gallery_image_changed_enqueue_v8()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          INSERT INTO aif_shopify_image_outbox
            (shopify_product_id,status,generation,attempts,bootstrap_urls,
             job_id,last_error,locked_at,next_attempt_at,updated_at)
          SELECT DISTINCT svm.shopify_product_id,'pending',gen_random_uuid(),0,
            CASE WHEN OLD.images IS NOT NULL AND jsonb_typeof(OLD.images)='array'
              AND jsonb_array_length(OLD.images)>0 THEN OLD.images
              WHEN NULLIF(btrim(COALESCE(OLD.image_url,'')),'') IS NOT NULL
                THEN jsonb_build_array(OLD.image_url)
              ELSE '[]'::jsonb END,
            NULL,NULL,NULL,now()+interval '12 seconds',now()
          FROM aif_shopify_variant_map svm
          WHERE svm.variant_id=NEW.id
            AND NULLIF(btrim(svm.shopify_product_id),'') IS NOT NULL
          ON CONFLICT (shopify_product_id) DO UPDATE SET
            status='pending',generation=gen_random_uuid(),attempts=0,
            bootstrap_urls=CASE
              WHEN aif_shopify_image_outbox.status <> 'done'
                AND jsonb_array_length(aif_shopify_image_outbox.bootstrap_urls)>0
              THEN aif_shopify_image_outbox.bootstrap_urls
              ELSE EXCLUDED.bootstrap_urls END,
            job_id=NULL,last_error=NULL,locked_at=NULL,
            next_attempt_at=now()+interval '12 seconds',updated_at=now();
          RETURN NEW;
        END $$`);
      await client.query(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger
          WHERE tgname='aif_gallery_image_changed_enqueue_v8'
            AND tgrelid='aif_product_variants'::regclass) THEN
          CREATE TRIGGER aif_gallery_image_changed_enqueue_v8
          AFTER UPDATE OF image_url,images ON aif_product_variants
          FOR EACH ROW WHEN (OLD.image_url IS DISTINCT FROM NEW.image_url
            OR OLD.images IS DISTINCT FROM NEW.images)
          EXECUTE FUNCTION aif_gallery_image_changed_enqueue_v8();
        END IF;
      END $$`);
      await client.query(`CREATE OR REPLACE FUNCTION aif_gallery_mapping_changed_enqueue_v8()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF TG_OP='UPDATE' THEN
            IF OLD.shopify_product_id IS NOT DISTINCT FROM NEW.shopify_product_id
              THEN RETURN NEW; END IF;
          END IF;
          IF NULLIF(btrim(COALESCE(NEW.shopify_product_id,'')),'') IS NULL
            THEN RETURN NEW; END IF;
          IF NOT EXISTS (
            SELECT 1 FROM aif_product_variants v
            WHERE v.id=NEW.variant_id
              AND (NULLIF(btrim(COALESCE(v.image_url,'')),'') IS NOT NULL
                OR (CASE WHEN jsonb_typeof(v.images)='array'
                     THEN jsonb_array_length(v.images)>0 ELSE false END))
          ) THEN RETURN NEW; END IF;
          INSERT INTO aif_shopify_image_outbox
            (shopify_product_id,status,generation,attempts,bootstrap_urls,
             job_id,last_error,locked_at,next_attempt_at,updated_at)
          VALUES (NEW.shopify_product_id,'pending',gen_random_uuid(),0,
            '[]'::jsonb,NULL,NULL,NULL,now()+interval '90 seconds',now())
          ON CONFLICT (shopify_product_id) DO UPDATE SET
            status='pending',generation=gen_random_uuid(),attempts=0,
            job_id=NULL,last_error=NULL,locked_at=NULL,
            next_attempt_at=now()+interval '90 seconds',updated_at=now();
          RETURN NEW;
        END $$`);
      await client.query(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger
          WHERE tgname='aif_gallery_mapping_changed_enqueue_v8'
            AND tgrelid='aif_shopify_variant_map'::regclass) THEN
          CREATE TRIGGER aif_gallery_mapping_changed_enqueue_v8
          AFTER INSERT OR UPDATE OF shopify_product_id ON aif_shopify_variant_map
          FOR EACH ROW EXECUTE FUNCTION aif_gallery_mapping_changed_enqueue_v8();
        END IF;
      END $$`);
    })().catch((error) => { schemaPromise = null; throw error; });
  }
  return schemaPromise;
}

export async function enqueueAifShopifyImagesForVariant(client, variantId, previousGallery = []) {
  // A hívó ugyanabban a tranzakcióban változtatja a variáns galériáját.
  const result = await client.query(`
    INSERT INTO aif_shopify_image_outbox (
      shopify_product_id,status,generation,attempts,bootstrap_urls,job_id,last_error,locked_at,next_attempt_at,updated_at
    )
    SELECT DISTINCT shopify_product_id,'pending',gen_random_uuid(),0,$2::jsonb,NULL,NULL,NULL,now(),now()
    FROM aif_shopify_variant_map
    WHERE variant_id=$1::uuid AND NULLIF(btrim(shopify_product_id),'') IS NOT NULL
    ON CONFLICT (shopify_product_id) DO UPDATE SET
      status='pending',generation=gen_random_uuid(),attempts=0,job_id=NULL,
      bootstrap_urls=CASE
        WHEN aif_shopify_image_outbox.status<>'done'
          AND jsonb_array_length(aif_shopify_image_outbox.bootstrap_urls)>0
        THEN aif_shopify_image_outbox.bootstrap_urls
        ELSE EXCLUDED.bootstrap_urls
      END,
      last_error=NULL,locked_at=NULL,next_attempt_at=now(),updated_at=now()
    RETURNING shopify_product_id`, [variantId, JSON.stringify(aifImageGallery(previousGallery))]);
  return { queued: result.rowCount };
}

// Egyszeri, idempotens visszapótlás: a régi párosítások képszinkronja
// korábban nem kapott queue-sort. Nem küld Shopify-módosítást, csak sorba tesz.
export async function enqueueAifShopifyImageBacklog(client, { dryRun = false } = {}) {
  await ensureAifShopifyImageSchema(client);
  const candidatesSql = `SELECT DISTINCT svm.shopify_product_id
    FROM aif_shopify_variant_map svm
    JOIN aif_product_variants v ON v.id=svm.variant_id
    JOIN aif_product_models m ON m.id=v.model_id
    WHERE NULLIF(btrim(svm.shopify_product_id),'') IS NOT NULL
      AND COALESCE(v.status,'active')<>'archived'
      AND COALESCE(m.status,'active')<>'archived'
      AND (NULLIF(btrim(v.image_url),'') IS NOT NULL
        OR (CASE WHEN jsonb_typeof(v.images)='array'
            THEN jsonb_array_length(v.images)>0 ELSE false END))
      AND NOT EXISTS (SELECT 1 FROM aif_shopify_image_outbox o
        WHERE o.shopify_product_id=svm.shopify_product_id)`;
  if (dryRun) {
    const result=await client.query(`SELECT count(*)::int AS count FROM (${candidatesSql}) p`);
    return {dryRun:true,possible:Number(result.rows[0]?.count||0),queued:0};
  }
  const result=await client.query(`INSERT INTO aif_shopify_image_outbox
    (shopify_product_id,status,generation,attempts,bootstrap_urls,
     job_id,last_error,locked_at,next_attempt_at,updated_at)
    SELECT p.shopify_product_id,'pending',gen_random_uuid(),0,
      '[]'::jsonb,NULL,NULL,NULL,now(),now()
    FROM (${candidatesSql}) p
    WHERE true
    ON CONFLICT (shopify_product_id) DO NOTHING
    RETURNING shopify_product_id`);
  return {dryRun:false,queued:result.rowCount};
}

function text(value) { return String(value ?? '').trim(); }
function fingerprint(url) { return createHash('sha256').update(text(url)).digest('hex').slice(0,20); }
const marker = (url) => `AIFIMG:${fingerprint(url)}`;
function tagAlt(title,url,color='') {
  return `${[text(title),text(color)].filter(Boolean).join(' · ').slice(0,155)} | ${marker(url)}`;
}
function checkShopifyErrors(payload, action) {
  const errors = [...(payload?.userErrors || []), ...(payload?.mediaUserErrors || [])];
  if (errors.length) throw Object.assign(new Error(`${action}: ${errors.map((e)=>text(e?.message)).join(' | ')}`), { code:'shopify_image_mutation_failed' });
}
const PRODUCT_MEDIA_QUERY = `query AifGalleryRead($id: ID!) {
  product(id:$id) {
    id title
    media(first:250) {
      pageInfo { hasNextPage }
      nodes { id alt mediaContentType status ... on MediaImage { image { url } originalSource { url } } }
    }
  }
}`;
async function loadRemoteMedia(productId) {
  const response = await shopifyGraphql(PRODUCT_MEDIA_QUERY,{id:productId});
  const product = response.data?.product;
  if (!product?.id) throw Object.assign(new Error(`Shopify termék nem található: ${productId}`),{code:'shopify_image_product_missing'});
  if (product.media?.pageInfo?.hasNextPage) throw new Error('Túl sok Shopify médiaelem, 250 fölött kézi ellenőrzés szükséges.');
  return { title: text(product.title), nodes:(product.media?.nodes || []).filter((m)=>text(m?.id)) };
}

async function upsertLink(client, productId, url, mediaId, managed) {
  await client.query(`INSERT INTO aif_shopify_image_links (shopify_product_id,source_url,media_id,managed)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (shopify_product_id,source_url) DO UPDATE SET
      media_id=EXCLUDED.media_id,managed=aif_shopify_image_links.managed OR EXCLUDED.managed`,
    [productId,url,mediaId,managed]);
}

async function readDesired(client, productId) {
  const result = await client.query(`SELECT
     v.id::text AS variant_id, v.image_url,v.images,v.size,v.color_name,
     m.title_ro AS title, svm.shopify_variant_id
   FROM aif_shopify_variant_map svm
   JOIN aif_product_variants v ON v.id=svm.variant_id
   JOIN aif_product_models m ON m.id=v.model_id
   WHERE svm.shopify_product_id=$1
     AND COALESCE(v.status,'active') <> 'archived'
     AND COALESCE(m.status,'active') <> 'archived'
   ORDER BY lower(coalesce(v.color_name,'')),lower(coalesce(v.size,'')),v.id`,[productId]);
  const urls=[];const seen=new Set();
  for (const row of result.rows) {
    row.gallery=aifImageGallery(row.images,row.image_url);
    for (const url of row.gallery) if (!seen.has(url)) { urls.push(url);seen.add(url); }
  }
  if (urls.length>200) throw new Error('Egy Shopify-termék legfeljebb 200 automatikusan szinkronizált képet kezelhet.');
  return {urls,variants:result.rows};
}

async function readLinks(client,productId) {
  const r=await client.query(`SELECT source_url,media_id,managed FROM aif_shopify_image_links WHERE shopify_product_id=$1`,[productId]);
  return new Map(r.rows.map((row)=>[text(row.source_url),row]));
}

function aifAltKey(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}

// A regi CSV-export csak akkor jo bizonyitek a mar Shopify-on levo fo kephez,
// ha tenylegesen le lett toltve, es ugyanezt az URL-t ma is kerjuk.
async function readOriginalExportImage(client,productId,desiredUrls) {
  const result=await client.query(`SELECT ei.product_row, ei.snapshot
    FROM aif_shopify_product_export_items ei
    JOIN aif_shopify_product_exports ex ON ex.id=ei.export_id
    JOIN aif_shopify_variant_map svm ON svm.variant_id=ei.variant_id
    WHERE svm.shopify_product_id=$1
      AND ex.downloaded_at IS NOT NULL
      AND ei.product_row IS NOT NULL
    ORDER BY ex.created_at ASC,ei.created_at ASC,ei.variant_id
    LIMIT 120`,[productId]);
  for(const {product_row:row,snapshot} of result.rows){
    const url=text(row?.['Product image URL']);
    if(!url || !desiredUrls.includes(url)) continue;
    return {
      url,
      alt:aifAltKey(row?.['Image alt text']),
      title:aifAltKey(row?.Title || snapshot?.title),
    };
  }
  return null;
}

// AIF_SHOPIFY_LEGACY_DUPLICATE_GUARD_V9
function aifMediaFileKey(value) {
  try {
    const name=decodeURIComponent(new URL(text(value)).pathname.split('/').pop()||'');
    return name.replace(/\.[a-z0-9]{2,5}$/i,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  } catch {return '';}
}
function aifSpecificMediaKey(key) {
  return key.length>=15 && /[a-z]/.test(key) && /[0-9]/.test(key);
}
function aifLegacyDuplicatesCoveredByManaged(desired,remote,links) {
  const knownIds=new Set([...links.values()].map(link=>text(link.media_id)));
  const nodes=remote.nodes||[];
  const byId=new Map(nodes.map(node=>[text(node.id),node]));
  const legacy=nodes.filter(node=>
    node.mediaContentType==='IMAGE' &&
    !/AIFIMG:[a-f0-9]{20}/i.test(text(node.alt)) &&
    !knownIds.has(text(node.id)));
  if(!legacy.length) return false;
  for(const node of legacy) {
    const keys=new Set([aifMediaFileKey(node.image?.url),aifMediaFileKey(node.originalSource?.url)]
      .filter(aifSpecificMediaKey));
    const matches=desired.urls.filter(url=>keys.has(aifMediaFileKey(url)));
    if(matches.length!==1) return false;
    const url=matches[0];
    const link=links.get(url);
    if(!link || link.managed!==true || text(link.media_id)===text(node.id)) return false;
    const managed=byId.get(text(link.media_id));
    if(!managed || managed.mediaContentType!=='IMAGE' ||
      text(managed.status)!=='READY' ||
      !text(managed.alt).includes(marker(url))) return false;
  }
  return true;
}

// AIF_SHOPIFY_LEGACY_EXTRA_ALREADY_SYNCED_V10
// A regi, jeloles nelkuli Shopify-fotokat MEGORIZZUK. Ha az osszes jelenleg
// igenyelt AllInFashion-kep mar bizonyitottan fent van, es a sajat
// managed=true kepkapcsolata is a jelolt READY mediat mutatja, a regi extra
// kepek NEM blokkolhatjak a sorrendezest / variansok fokepeinek frissiteset.
// Semmilyen regi Shopify-media nem torlodik; a bizonytalan regi fotok
// tovabbra is teljesen erintetlenek maradnak.
function aifLegacyExtrasAlreadyCovered(desired,remote,links) {
  const urls=desired?.urls || [];
  const nodes=remote?.nodes || [];
  if(!urls.length || !nodes.length) return false;
  const knownIds=new Set([...links.values()].map(link=>text(link.media_id)));
  const oldExtras=nodes.filter(node=>
    node?.mediaContentType==='IMAGE' &&
    !/AIFIMG:[a-f0-9]{20}/i.test(text(node.alt)) &&
    !knownIds.has(text(node.id)));
  if(!oldExtras.length) return false;
  const byId=new Map(nodes.map(node=>[text(node.id),node]));
  const assignedIds=new Set();
  for(const url of urls) {
    const link=links.get(url);
    if(!link || link.managed!==true) return false;
    const mediaId=text(link.media_id);
    const media=byId.get(mediaId);
    if(!mediaId || assignedIds.has(mediaId) ||
       media?.mediaContentType!=='IMAGE' ||
       text(media.status)!=='READY' ||
       !text(media.alt).includes(marker(url))) return false;
    assignedIds.add(mediaId);
  }
  return true;
}

async function adoptUnmarkedLegacyPhoto(client,productId,desired,remote,links,bootstrapUrls){
  const knownIds=new Set([...links.values()].map(x=>text(x.media_id)));
  const legacy=(remote.nodes||[]).filter(n=>n.mediaContentType==='IMAGE'
    && !/AIFIMG:[a-f0-9]{20}/i.test(text(n.alt)) && !knownIds.has(text(n.id)));
  if(!legacy.length) return {adopted:0,unverified:0};
  // Több ismeretlen fotót nem párosítunk pozíció alapján, mert ettől
  // különböző színek, kézzel feltöltött fotók tévesen összekapcsolódhatnak.
  if(legacy.length!==1 || remote.nodes.filter(n=>n.mediaContentType==='IMAGE').length!==1){
    return {adopted:0,unverified:legacy.length};
  }
  const historic=await readOriginalExportImage(client,productId,desired.urls);
  const bootstrap=aifImageGallery(bootstrapUrls);
  const candidate=historic?.url || (bootstrap.length===1 && desired.urls.includes(bootstrap[0]) ? bootstrap[0] : '');
  if(!candidate) return {adopted:0,unverified:1};
  const remoteAlt=aifAltKey(legacy[0].alt);
  // A tenyleges korabbi CSV alt szoveg egyezzen. Ha megvaltozott a foto,
  // a Shopify legacy kepet nem tekintjuk bizonyitottnak.
  if(historic?.alt && remoteAlt!==historic.alt) return {adopted:0,unverified:1};
  if(!historic?.alt && (!remoteAlt || !aifAltKey(remote.title) ||
      !remoteAlt.includes(aifAltKey(remote.title)))) return {adopted:0,unverified:1};
  const colors=new Set(desired.variants.map(v=>aifAltKey(v.color_name)).filter(Boolean));
  // Többszínű Shopify terméknél a régi egyetlen foto színe nem bizonyított.
  if(colors.size>1) return {adopted:0,unverified:1};
  await upsertLink(client,productId,candidate,text(legacy[0].id),false);
  links.set(candidate,{source_url:candidate,media_id:text(legacy[0].id),managed:false});
  return {adopted:1,unverified:0};
}

async function updateVariantImages(productId, variants, links, remoteIds) {
  const mapped=[];const used=new Set();
  for (const row of variants) {
    const variantId=text(row.shopify_variant_id);
    const primary=text(row.gallery?.[0]);
    const mediaId=text(links.get(primary)?.media_id);
    if (!variantId||!primary||!remoteIds.has(mediaId)||used.has(variantId)) continue;
    used.add(variantId);
    mapped.push({id:variantId,mediaId});
  }
  for (let i=0;i<mapped.length;i+=50) {
    const group=mapped.slice(i,i+50);
    const response=await shopifyGraphql(`mutation AifGalleryVariantImage($productId:ID!,$variants:[ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId:$productId,variants:$variants) {
        userErrors { field message }
      }
    }`,{productId,variants:group});
    checkShopifyErrors(response.data?.productVariantsBulkUpdate,'Variáns főképek');
  }
  return mapped.length;
}

async function syncProductImages(client, row) {
  const productId=text(row.shopify_product_id);
  // Shopify-aszinkron sorrendezést nem kezdünk újra, amíg a korábbi job fut.
  if (row.job_id) {
    const status=await shopifyGraphql(`query AifGalleryJob($id:ID!) { job(id:$id) { id done } }`,{id:row.job_id});
    if (status.data?.job && !status.data.job.done) return {pendingJobId:row.job_id};
  }
  const desired=await readDesired(client,productId);
  let remote=await loadRemoteMedia(productId);
  let links=await readLinks(client,productId);
  let remoteIds=new Set(remote.nodes.map((m)=>text(m.id)));
  // Létező, korábban elmentett médiakapcsolat egy régi Shopify médiatörlés után érvénytelen.
  for(const [url,entry] of links) if(!remoteIds.has(text(entry.media_id))) links.delete(url);

  const byMarker=new Map();
  for(const node of remote.nodes) {
    const hit=text(node.alt).match(/AIFIMG:([a-f0-9]{20})/i);
    if(hit && !byMarker.has(hit[1].toLowerCase())) byMarker.set(hit[1].toLowerCase(),text(node.id));
  }
  // Egy megszakadt Shopify-művelet újrapróbálásakor az URL fingerprint megakadályozza a képek duplázását.
  for(const url of desired.urls) {
    if(links.has(url)) continue;
    const found=byMarker.get(fingerprint(url));
    if(found){ await upsertLink(client,productId,url,found,true);links.set(url,{source_url:url,media_id:found,managed:true}); }
  }

  // V8: a régi Shopify képeket csak bizonyított eredeti CSV URL és ALT
  // alapján párosítjuk. A bizonytalan legacy képek mellett TILOS új képet
  // feltölteni, mert 274 regi parositasnal kep-duplazast okozhatna.
  // A V9 a bizonyitott duplikalt regi kepet is kezeli.
  // A V10 az olyan regi extra fotokat is megorzi, amelyek mellett
  // az OSSZES jelenleg igenyelt kep mar bizonyitottan felkerult.
  const covered=aifLegacyDuplicatesCoveredByManaged(desired,remote,links) ||
    aifLegacyExtrasAlreadyCovered(desired,remote,links);
  const bootstrap=covered
    ? {adopted:0,unverified:0}
    : await adoptUnmarkedLegacyPhoto(client,productId,desired,remote,links,row.bootstrap_urls);
  if(bootstrap.unverified>0) {
    throw Object.assign(new Error(`Ellenorizetlen regi Shopify foto: ${bootstrap.unverified} db. Automatikus duplazast leallitottam.`),
      {code:'shopify_image_legacy_unverified'});
  }

  const missing=desired.urls.filter((url)=>!links.has(url));
  if(remote.nodes.length + missing.length > 250) {
    throw new Error('A Shopify-termék elérné a 250 médiaelemes korlátot. A meglévő képek kézi egyeztetése szükséges.');
  }
  if(missing.length) {
    for(let offset=0;offset<missing.length;offset+=20) {
      const batch=missing.slice(offset,offset+20);
      const response=await shopifyGraphql(`mutation AifGalleryAdd($product:ProductUpdateInput!,$media:[CreateMediaInput!]) {
        productUpdate(product:$product,media:$media) {
          product { id }
          userErrors { field message }
        }
      }`,{
        product:{id:productId},
        media:batch.map((url)=>({ originalSource:url,mediaContentType:'IMAGE',alt:tagAlt(remote.title||desired.variants[0]?.title,url,desired.variants[0]?.color_name) }))
      });
      checkShopifyErrors(response.data?.productUpdate,'Shopify képfeltöltés');
    }
    // Az új médiaelem ID-je késhet: fingerprint alapján következő próbában is biztonságosan visszakereshető.
    remote=await loadRemoteMedia(productId);
    remoteIds=new Set(remote.nodes.map((m)=>text(m.id)));
    for(const node of remote.nodes){
      const hit=text(node.alt).match(/AIFIMG:([a-f0-9]{20})/i);
      if(hit&&!byMarker.has(hit[1].toLowerCase()))byMarker.set(hit[1].toLowerCase(),text(node.id));
    }
    for(const url of missing){
      const found=byMarker.get(fingerprint(url));
      if(found){await upsertLink(client,productId,url,found,true);links.set(url,{source_url:url,media_id:found,managed:true});}
    }
    if(missing.some((url)=>!links.has(url))) throw new Error('A Shopify még feldolgozza az új képeket; a szinkron automatikusan újrapróbálja.');
  }

  const current=await readLinks(client,productId);
  // Torles csak akkor, ha a Shopify-on is megvan a pontos AIFIMG URL-jeloles.
  // Mas alt-nak / ID-nek megfelelo, kezzel kezelt fotot nem torlunk.
  const remoteById=new Map(remote.nodes.map(n=>[text(n.id),n]));
  const protectedLegacy=covered;
  const discarded=protectedLegacy ? [] : [...current.entries()].filter(([url,entry])=>
    !desired.urls.includes(url) && entry.managed &&
    remoteIds.has(text(entry.media_id)) &&
    text(remoteById.get(text(entry.media_id))?.alt).includes(marker(url)));
  if(discarded.length) {
    // Kizárólag a saját API-nkkal felvitt médiát töröljük, manuális Shopify fotót nem.
    const removeIds=[...new Set(discarded.map(([,entry])=>text(entry.media_id)))];
    const result=await shopifyGraphql(`mutation AifGalleryRemove($productId:ID!,$mediaIds:[ID!]!) {
      productDeleteMedia(productId:$productId,mediaIds:$mediaIds) {
        mediaUserErrors { field message }
      }
    }`,{productId,mediaIds:removeIds});
    checkShopifyErrors(result.data?.productDeleteMedia,'Shopify képtörlés');
  }
  if(!protectedLegacy) await client.query(`DELETE FROM aif_shopify_image_links WHERE shopify_product_id=$1 AND NOT (source_url=ANY($2::text[]))`,[productId,desired.urls]);
  remote=await loadRemoteMedia(productId);
  remoteIds=new Set(remote.nodes.map((m)=>text(m.id)));
  links=await readLinks(client,productId);
  const desiredIds=desired.urls.map((url)=>text(links.get(url)?.media_id)).filter((id)=>remoteIds.has(id));
  if(desiredIds.length!==desired.urls.length) throw new Error('Nem található a Shopify-ban minden galériakép.');
  // A kívánt sorrend mindig elöl, minden kézzel feltöltött extra kép érintetlen marad.
  const currentOrder=remote.nodes.map((m)=>text(m.id));
  const alreadyOrdered=desiredIds.every((id,index)=>currentOrder[index]===id);
  if(!alreadyOrdered && desiredIds.length) {
    const moves=desiredIds.map((id,index)=>({id,newPosition:String(index)}));
    const result=await shopifyGraphql(`mutation AifGalleryReorder($id:ID!,$moves:[MoveInput!]!) {
      productReorderMedia(id:$id,moves:$moves) {
        job { id }
        mediaUserErrors { field message }
      }
    }`,{id:productId,moves});
    checkShopifyErrors(result.data?.productReorderMedia,'Shopify képsorrend');
    const jobId=text(result.data?.productReorderMedia?.job?.id);
    if(jobId) return {pendingJobId:jobId,uploaded:missing.length,removed:discarded.length};
  }
  const updatedVariants=await updateVariantImages(productId,desired.variants,links,remoteIds);
  return {updatedVariants,desiredImages:desiredIds.length,uploaded:missing.length,removed:discarded.length};
}

async function claim(pool,limit) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const r=await client.query(`WITH due AS (
      SELECT shopify_product_id FROM aif_shopify_image_outbox
      WHERE ((status IN ('pending','error','waiting') AND next_attempt_at<=now())
          OR (status='processing' AND locked_at<now()-interval '10 minutes'))
      ORDER BY updated_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED
    ) UPDATE aif_shopify_image_outbox o SET status='processing',locked_at=now(),
      attempts=o.attempts+1,updated_at=now() FROM due d
      WHERE o.shopify_product_id=d.shopify_product_id RETURNING o.*`,[limit]);
    await client.query('COMMIT');
    return r.rows;
  } catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();}
}

export async function processAifShopifyImageOutboxBatch(pool,{limit=3}={}) {
  if(!getAifShopifyPublicConfig().enabled) return {enabled:false,processed:0,success:0,errors:0};
  await ensureAifShopifyImageSchema(pool);
  const jobs=await claim(pool,Math.min(10,Math.max(1,Number(limit)||3)));
  let success=0, waiting=0, errors=0;
  for(const row of jobs) {
    const client=await pool.connect();
    try {
      const result=await syncProductImages(client,row);
      if(result.pendingJobId){
        await client.query(`UPDATE aif_shopify_image_outbox SET status='waiting',job_id=$3,
          locked_at=NULL,next_attempt_at=now()+interval '10 seconds',last_error=NULL,updated_at=now()
          WHERE shopify_product_id=$1 AND generation=$2 AND status='processing'`,
          [row.shopify_product_id,row.generation,result.pendingJobId]);
        waiting++;
      } else {
        await client.query(`UPDATE aif_shopify_image_outbox SET status='done',job_id=NULL,
          locked_at=NULL,last_error=NULL,updated_at=now()
          WHERE shopify_product_id=$1 AND generation=$2 AND status='processing'`,
          [row.shopify_product_id,row.generation]);
        success++;
      }
    } catch(error) {
      errors++;
      const delay=Math.min(3600,Math.max(15,15*(2**Math.min(8,Number(row.attempts||1)-1))));
      console.error('AIF Shopify image sync:',row.shopify_product_id,error?.message||String(error));
      await client.query(`UPDATE aif_shopify_image_outbox SET status='error',job_id=NULL,
        locked_at=NULL,last_error=$3,next_attempt_at=now()+($4::text||' seconds')::interval,updated_at=now()
        WHERE shopify_product_id=$1 AND generation=$2 AND status='processing'`,
        [row.shopify_product_id,row.generation,text(error?.message||error).slice(0,1500),delay]);
    } finally{client.release();}
  }
  return {enabled:true,processed:jobs.length,success,waiting,errors};
}
