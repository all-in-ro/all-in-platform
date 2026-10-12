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
      nodes { id alt mediaContentType status }
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

  // Az első szinkron előtt a Shopify-on már meglévő képekhez a mentés ELŐTTI
  // galériát párosítjuk. Ha közben új fő képet választottak, nem szabad azt
  // a régi Shopify fotóhoz rendelni (különben hibás kép lesz a fő kép).
  if(!links.size && remote.nodes.length) {
    const previous=aifImageGallery(row.bootstrap_urls);
    let legacy=remote.nodes.filter((m)=>m.mediaContentType==='IMAGE' && !text(m.alt).includes('AIFIMG:'));
    // Többszínű Shopify-terméknél a galéria első képe gyakran MÁSIK színű.
    // Ilyenkor csak kifejezett, egyértelmű alt/szín egyezés mellett párosítunk.
    const colors=new Set(desired.variants.map((v)=>text(v.color_name).toLocaleLowerCase('ro')).filter(Boolean));
    if(colors.size>1) {
      const sourceRow=desired.variants.find((v)=>previous.some((url)=>v.gallery.includes(url)));
      const color=text(sourceRow?.color_name).toLocaleLowerCase('ro');
      const matches=color ? legacy.filter((m)=>text(m.alt).toLocaleLowerCase('ro').includes(color)) : [];
      legacy=matches.length===previous.length ? matches : [];
    }
    for(let i=0;i<Math.min(previous.length,legacy.length);i++) {
      const url=previous[i],node=legacy[i];
      if(links.has(url)) continue;
      await upsertLink(client,productId,url,text(node.id),false);
      links.set(url,{source_url:url,media_id:text(node.id),managed:false});
    }
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
  const discarded=[...current.entries()].filter(([url,entry])=>!desired.urls.includes(url) && entry.managed && remoteIds.has(text(entry.media_id)));
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
  await client.query(`DELETE FROM aif_shopify_image_links WHERE shopify_product_id=$1 AND NOT (source_url=ANY($2::text[]))`,[productId,desired.urls]);
  remote=await loadRemoteMedia(productId);
  remoteIds=new Set(remote.nodes.map((m)=>text(m.id)));
  links=await readLinks(client,productId);
  const desiredIds=desired.urls.map((url)=>text(links.get(url)?.media_id)).filter((id)=>remoteIds.has(id));
  if(desiredIds.length!==desired.urls.length) throw new Error('Nem található a Shopify-ban minden galériakép.');
  // A kívánt sorrend mindig elöl, minden kézzel feltöltött extra kép érintetlen marad.
  const currentOrder=remote.nodes.map((m)=>text(m.id));
  const alreadyOrdered=desiredIds.every((id,index)=>currentOrder[index]===id);
  if(!alreadyOrdered && desiredIds.length) {
    const moves=desiredIds.map((id,index)=>({id,newPosition:index}));
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
