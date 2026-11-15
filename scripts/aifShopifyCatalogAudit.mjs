/**
 * ALLINFASHION Shopify full catalog audit, 2026-11-15.
 * READ ONLY against Shopify and AllIn. Creates LOCAL reports only.
 *
 * Usage:
 *   node scripts/aifShopifyCatalogAudit.mjs
 *   node scripts/aifShopifyCatalogAudit.mjs --storefront
 *   node scripts/aifShopifyCatalogAudit.mjs --storefront --out ./reports/shopify-catalog
 *
 * Shopify Admin inventory and the public Online Store can disagree because of
 * publication, Markets, shipping groups or fulfillment availability. Never
 * modify inventories to 'fix' a public storefront discrepancy.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { shopifyGraphql, ensureAifShopifyTables } from '../api/lib/aifShopify.js';

const str = (x) => String(x ?? '').trim();
const norm = (x) => str(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const slug = (x) => norm(x).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const integer = (x) => Number.isFinite(Number(x)) ? Math.trunc(Number(x)) : 0;
const escapeCsv = (x) => {
  const raw = x == null ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x);
  return /[",\r\n;]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
};
const csv = (rows, cols) => [cols.join(','), ...rows.map(row => cols.map(col => escapeCsv(row[col])).join(','))].join('\r\n') + '\r\n';
const optionKind = name => {
  const n = norm(name);
  return ['size','sizes','marime','meret','taille'].includes(n) ? 'size'
    : ['color','colour','culoare','szin'].includes(n) ? 'color' : '';
};
const selectOption = (v, type) => (v?.selectedOptions || []).find(o => optionKind(o?.name) === type)?.value || '';
const issue = (type, severity, payload = {}) => ({type, severity, ...payload});
const keys = (arr) => [...new Set(arr.filter(Boolean))];

function parseArgs(argv) {
  const a = { storefront: false, out: './reports/aif-shopify-catalog', storefrontDelayMs: 1500, help: false };
  for (let i=0; i<argv.length; i++) {
    if (argv[i] === '--storefront') a.storefront = true;
    else if (argv[i] === '--out') a.out = argv[++i];
    else if (argv[i] === '--storefront-delay-ms') a.storefrontDelayMs = Number(argv[++i]);
    else if (argv[i] === '--help') a.help = true;
    else throw new Error(`Ismeretlen kapcsoló: ${argv[i]}`);
  }
  if (!str(a.out)) throw new Error('Hiányzik a kimeneti könyvtár.');
  if (!Number.isInteger(a.storefrontDelayMs) || a.storefrontDelayMs < 500 || a.storefrontDelayMs > 20000)
    throw new Error('--storefront-delay-ms: egész szám, 500 és 20000 között.');
  return a;
}

async function readOnlinePublicationId() {
  const fromEnv = str(process.env.SHOPIFY_ONLINE_STORE_PUBLICATION_ID);
  if (fromEnv) return { id: fromEnv, source: 'env' };
  try {
    const r = await shopifyGraphql(`query AifAuditPublications {
      publications(first:100) { nodes { id catalog { title } } }
    }`);
    const candidates = (r.data?.publications?.nodes || []).filter(x =>
      /online\s*store|online\s*aruhaz|magazin\s*online|boutique\s*en\s*ligne/i.test(str(x.catalog?.title)));
    if (candidates.length === 1) return {id: candidates[0].id, source: 'shopify_publications'};
    return { id: null, source: 'unknown', candidates: (r.data?.publications?.nodes || []).map(x => ({id:x.id,name:x.catalog?.title})) };
  } catch (error) {
    return { id:null, source:'unavailable', error: error?.message };
  }
}

async function loadShopifyVariants(publicationId) {
  const includePub = Boolean(publicationId);
  const query = `query AifFullCatalog($first:Int!, $after:String${includePub ? ', $pub:ID!' : ''}) {
    productVariants(first:$first, after:$after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id sku barcode title price inventoryQuantity sellableOnlineQuantity availableForSale
        selectedOptions { name value }
        inventoryItem { id tracked requiresShipping }
        product {
          id title handle vendor status productType
          ${includePub ? 'publishedOnPublication(publicationId:$pub)' : ''}
        }
      }
    }
  }`;
  const variants = [];
  const cursors = new Set();
  let after = null;
  for (let page=0; page<500; page++) {
    const res = await shopifyGraphql(query, {...{first:100,after},...(includePub ? {pub: publicationId} : {})});
    const connection = res.data?.productVariants;
    if (!connection) throw new Error('Shopify productVariants eredmény hiányzik. Az auditot nem tekintjük teljesnek.');
    variants.push(...(connection.nodes || []));
    if (!connection.pageInfo?.hasNextPage) return variants;
    const next = str(connection.pageInfo?.endCursor);
    if (!next || cursors.has(next)) throw new Error('Shopify pagination elakadt; az audit csonka lenne.');
    cursors.add(next);
    after = next;
    if ((page+1)%10===0) console.log(`Shopify variánsok beolvasva: ${variants.length}`);
  }
  throw new Error('Shopify 50 000 variáns felett: audit lapozáskorlát elérve, nem adunk részleges eredményt.');
}

async function loadAllIn(db) {
  // Every size, including inactive variants, is loaded to diagnose stock and mapping gaps.
  const r = await db.query(`
    SELECT v.id::text AS variant_id,
      NULLIF(btrim(v.barcode),'') AS barcode, v.internal_sku,
      v.size, v.color_name,v.color_code, v.status AS variant_status,
      m.id::text AS model_id, m.model_code, m.title_ro, m.status AS model_status,
      b.name AS brand,
      sc.supplier_product_code,sc.supplier_color_code,sc.supplier_color_name,
      mp.sku AS mapped_sku,mp.shopify_product_id,mp.shopify_variant_id,
      mp.shopify_inventory_item_id,mp.sync_status,mp.last_synced_at,mp.last_error,
      o.status AS outbox_status,o.last_error AS outbox_error,o.reason AS outbox_reason,
      o.desired_csikszereda_qty,o.desired_kezdi_qty,
      COALESCE(SUM(GREATEST(COALESCE(s.qty,0)-COALESCE(s.reserved_qty,0),0))
        FILTER (WHERE s.location_id::text=$1),0)::int AS ciuc_available,
      COALESCE(SUM(GREATEST(COALESCE(s.qty,0)-COALESCE(s.reserved_qty,0),0))
        FILTER (WHERE s.location_id::text=$2),0)::int AS kezdi_available,
      COALESCE(SUM(COALESCE(s.qty,0))
        FILTER (WHERE s.location_id::text NOT IN ($1,$2) AND COALESCE(l.code,'') <> 'online_shop'),0)::int AS other_physical,
      COALESCE(SUM(COALESCE(s.reserved_qty,0))
        FILTER (WHERE s.location_id::text IN ($1,$2)),0)::int AS reserved
    FROM aif_product_variants v
    JOIN aif_product_models m ON m.id=v.model_id
    LEFT JOIN aif_brands b ON b.id=m.brand_id
    LEFT JOIN LATERAL (
      SELECT supplier_product_code,supplier_color_code,supplier_color_name
      FROM aif_variant_supplier_codes sc
      WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
      ORDER BY sc.updated_at DESC NULLS LAST,sc.created_at DESC NULLS LAST LIMIT 1
    ) sc ON true
    LEFT JOIN aif_shopify_variant_map mp ON mp.variant_id=v.id
    LEFT JOIN aif_shopify_sync_outbox o ON o.variant_id=v.id
    LEFT JOIN aif_stock s ON s.variant_id=v.id
    LEFT JOIN aif_locations l ON l.id=s.location_id
    GROUP BY v.id,m.id,b.id,sc.supplier_product_code,sc.supplier_color_code,sc.supplier_color_name,
             mp.variant_id,mp.sku,mp.shopify_product_id,mp.shopify_variant_id,mp.shopify_inventory_item_id,
             mp.sync_status,mp.last_synced_at,mp.last_error, o.variant_id
    ORDER BY b.name,m.model_code,v.color_code,v.size,v.id
  `, [str(process.env.AIF_LOCATION_CSIKSZEREDA_ID),str(process.env.AIF_LOCATION_KEZDI_ID)]);
  return r.rows;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));

function retryAfterMs(headers) {
  const raw = str(headers?.get?.('retry-after'));
  if (!raw) return 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const deadline = Date.parse(raw);
  return Number.isFinite(deadline) ? Math.max(0, deadline - Date.now()) : 0;
}

async function readStorefront(handle) {
  const safeHandle = str(handle);
  if (!/^[a-z0-9][a-z0-9-]{0,240}$/i.test(safeHandle)) return {error:'invalid_handle',status:null};
  // Only serial, gently paced public reads. This is NOT an inventory write.
  // 429 means throttling, NOT "out of stock" or a missing product.
  // Render IP/market may differ from an actual Romanian buyer.
  const url = `https://allinfashion.ro/products/${encodeURIComponent(safeHandle)}.js`;
  let lastError = '';
  let lastStatus = null;
  const maxAttempts = 5;
  for (let attempt=0; attempt<maxAttempts; attempt++) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(14000),
        headers: {Accept:'application/json','Accept-Language':'ro-RO,ro;q=0.9'},
      });
      lastStatus = r.status;
      if (r.status === 429 || r.status >= 500) {
        lastError = `HTTP ${r.status}`;
        if (attempt + 1 >= maxAttempts) break;
        const exponential = (r.status === 429 ? 4000 : 1200) * (2 ** attempt);
        const delay = Math.min(90000, Math.max(retryAfterMs(r.headers), exponential));
        if (r.status === 429) console.log(`Shopify HTTP 429 (${safeHandle}): újrapróbálás ${Math.ceil(delay/1000)} mp múlva`);
        await sleep(delay);
        continue;
      }
      if (!r.ok) return {status:r.status,error:`http_${r.status}`};
      const product = await r.json();
      if (!Array.isArray(product?.variants)) return {status:r.status,error:'not_a_product_json'};
      return { status:r.status, available:product.available, variants:product.variants.map(v=>({
        id:String(v.id || ''), sku:str(v.sku),title:str(v.title),available:v.available===true,
      })) };
    } catch (e) {
      lastError = e?.message || String(e);
      if (attempt + 1 >= maxAttempts) break;
      await sleep(Math.min(30000, 1200 * (2 ** attempt)));
    }
  }
  return {status:lastStatus,error:lastError || 'storefront_unavailable'};
}

async function storefrontProductStates(products, delayMs = 1500) {
  const entries = [...products.values()].filter(p=>p.status==='ACTIVE' && p.needsStorefront);
  const output = new Map();
  // One worker, one request at a time. The old 4 workers + 120ms delay
  // caused 69 storefront HTTP 429 errors in the 2026-11-15 audit.
  for (let i=0; i<entries.length; i++) {
    const p=entries[i];
    output.set(p.id, await readStorefront(p.handle));
    if ((i+1)%25===0 || i+1===entries.length)
      console.log(`Webshop elérhetőség: ${i+1}/${entries.length}`);
    if (i+1<entries.length) await sleep(delayMs);
  }
  return output;
}

function summarize(allIn, remote, publication, storefront = new Map(), storefrontIncluded = false) {
  const bySku = new Map(), remoteById = new Map(), byProduct = new Map();
  const issues = [], familyByColor = new Map(), familyByModel = new Map();
  const add = (type,severity,row,extra={}) => issues.push(issue(type,severity,{
    brand:row?.brand || '',model:row?.model_code || '', color:row?.color_name || row?.color_code || '',
    size:row?.size || '', sku:row?.barcode || '', allInVariantId:row?.variant_id || '',
    productId:row?.shopify_product_id || '',...extra,
  }));
  for(const v of remote) {
    const sku = norm(v.sku), id = str(v.id);
    if(id) remoteById.set(id,v);
    if(sku) {const list=bySku.get(sku)||[];list.push(v);bySku.set(sku,list);}
    const p=v.product;
    if (p?.id) {
      const item=byProduct.get(p.id) || {
        id:p.id,handle:p.handle,title:p.title,status:p.status,vendor:p.vendor,
        published: typeof p.publishedOnPublication==='boolean' ? p.publishedOnPublication : null,
        variants:[],needsStorefront:false,
      };
      item.variants.push(v);
      byProduct.set(p.id,item);
    }
  }
  const allBySku = new Map(), mappedByRemote = new Map();
  for(const x of allIn) {
    const sku = norm(x.barcode);
    if(sku) {const list=allBySku.get(sku)||[];list.push(x);allBySku.set(sku,list);}
    if(x.shopify_variant_id) {
      const list=mappedByRemote.get(x.shopify_variant_id)||[];list.push(x);mappedByRemote.set(x.shopify_variant_id,list);
    }
  }
  const mappedPositiveProducts = new Set();
  for(const row of allIn) {
    const active = norm(row.variant_status || 'active')==='active' && norm(row.model_status || 'active')==='active';
    const count = integer(row.ciuc_available)+integer(row.kezdi_available)+integer(row.other_physical);
    const match = remoteById.get(str(row.shopify_variant_id));
    const skuMatches = bySku.get(norm(row.barcode)) || [];
    if(!active && count>0) add('INACTIVE_WITH_PHYSICAL_STOCK','review',row,{allInAvailable:count});
    if(!active) continue;
    if(!str(row.barcode)) {add('ACTIVE_SKU_MISSING','critical',row,{allInAvailable:count});continue;}
    if(allBySku.get(norm(row.barcode))?.length>1) add('ALLIN_DUPLICATE_BARCODE','critical',row,{allInAvailable:count});
    if(!row.shopify_variant_id) {
      if(count>0) add(skuMatches.length ? 'MAPPING_MISSING_BUT_SKU_IN_SHOPIFY':'STOCKED_PRODUCT_NOT_IN_SHOPIFY',
        skuMatches.length ? 'critical' : 'coverage',row,
        {allInAvailable:count,shopifyProductIds:keys(skuMatches.map(v=>v.product?.id))});
      continue;
    }
    if(!match) {
      add('MAPPED_VARIANT_NOT_FOUND_IN_SHOPIFY','critical',row,{allInAvailable:count});
      continue;
    }
    if(norm(match.sku)!==norm(row.barcode) || norm(row.mapped_sku)!==norm(row.barcode) ||
      str(match.product?.id)!==str(row.shopify_product_id) ||
      str(match.inventoryItem?.id)!==str(row.shopify_inventory_item_id)) {
      add('MAPPING_IDENTITY_MISMATCH','critical',row,{allInAvailable:count,
        remoteSku:match.sku,remoteProductId:match.product?.id,remoteInventoryId:match.inventoryItem?.id});
    }
    if (match.product?.status !== 'ACTIVE' && count>0) add('STOCKED_BUT_SHOPIFY_PRODUCT_INACTIVE','critical',row,{allInAvailable:count,shopifyStatus:match.product?.status});
    if (count>0 && match.product?.status === 'ACTIVE') mappedPositiveProducts.add(match.product.id);
    if (publication.id && match.product?.publishedOnPublication === false && count>0)
      add('STOCKED_BUT_NOT_PUBLISHED_ONLINE','critical',row,{allInAvailable:count,handle:match.product?.handle});
    if(count>0 && match.inventoryItem?.tracked===false) add('SHOPIFY_INVENTORY_NOT_TRACKED','critical',row,{allInAvailable:count});
    if(row.last_error || row.outbox_error || ['error','blocked'].includes(row.outbox_status))
      add('SYNC_ERROR','critical',row,{status:row.outbox_status,syncStatus:row.sync_status,error:row.last_error||row.outbox_error});
    if(!row.last_synced_at && count>0) add('NEVER_SYNCED','review',row,{allInAvailable:count});
    if(match.product?.status === 'ACTIVE' && match.inventoryItem?.tracked!==false && match.inventoryQuantity!=null &&
      integer(match.inventoryQuantity)!==count) add('INVENTORY_TOTAL_DIFFERS','critical',row,{
        allInAvailable:count,adminInventory:match.inventoryQuantity,handle:match.product.handle,
      });
    if(count>0 && match.product?.status==='ACTIVE' && !match.availableForSale) add('SHOPIFY_ADMIN_NOT_SELLABLE','critical',row,{
      allInAvailable:count,sellableOnlineQuantity:match.sellableOnlineQuantity,handle:match.product.handle,
    });
    if(count>0 && match.product?.status==='ACTIVE' && integer(match.sellableOnlineQuantity)===0)
      add('ONLINE_SELLABLE_ZERO_WHILE_STOCKED','critical',row,{
        allInAvailable:count,adminInventory:match.inventoryQuantity,handle:match.product.handle,
      });
    if(count===0 && integer(match.inventoryQuantity)>0) add('SHOPIFY_STOCK_WITHOUT_ALLIN','critical',row,{
      allInAvailable:count,adminInventory:match.inventoryQuantity,handle:match.product?.handle,
    });
    if (count>0) { const p=byProduct.get(match.product?.id); if(p) p.needsStorefront=true; }
    const model= `${slug(row.brand)}::${slug(row.model_code || row.model_id)}`;
    const color=slug(row.supplier_color_code || row.color_code || row.color_name);
    if(!model || model==='::') continue;
    const m=familyByModel.get(model)||{key:model,brand:row.brand,model:row.model_code,colors:new Set(),products:new Map(),titles:new Set()};
    if(color) m.colors.add(color);
    if(match.product?.status==='ACTIVE') {
      m.products.set(match.product.id,match.product.handle);
      m.titles.add(norm(match.product.title));
    }
    familyByModel.set(model,m);
    if(!color || match.product?.status!=='ACTIVE') continue;
    const fk=`${model}::${color}`;
    const f=familyByColor.get(fk)||{familyKey:fk,brand:row.brand,model:row.model_code,colorCode:color,products:new Map(),sizes:new Set()};
    f.products.set(match.product.id,{id:match.product.id,handle:match.product.handle,title:match.product.title});
    f.sizes.add(row.size);
    familyByColor.set(fk,f);
  }
  // Shopify-only products and broken mapping are a separate class of issue.
  // We do not delete them: some may be intentionally managed outside AllIn.
  for(const [sku,rows] of bySku) {
    const active=rows.filter(v=>v.product?.status==='ACTIVE');
    if(!active.length) continue;
    const allRows=allBySku.get(sku)||[];
    const matchedId=allRows.some(row=>active.some(v=>v.id===row.shopify_variant_id));
    if(!allRows.length) {
      for(const v of active) issues.push(issue('SHOPIFY_ACTIVE_SKU_NOT_IN_ALLIN','review',{
        sku:v.sku,productId:v.product?.id,handle:v.product?.handle,adminInventory:v.inventoryQuantity,
      }));
    } else if(!matchedId) {
      issues.push(issue('SHOPIFY_ACTIVE_SKU_WITHOUT_VALID_MAPPING','critical',{
        sku,productIds:active.map(v=>v.product?.id),
        handles:active.map(v=>v.product?.handle),adminInventory:active.map(v=>v.inventoryQuantity),
      }));
    }
  }
  for(const [sku, rows] of bySku) {
    const active = rows.filter(x=>x.product?.status==='ACTIVE');
    if(active.length>1) issues.push(issue('SHOPIFY_DUPLICATE_ACTIVE_SKU','critical',{
      sku, productIds:active.map(v=>v.product?.id),handles:active.map(v=>v.product?.handle),
    }));
  }
  for(const [remoteId,rows] of mappedByRemote) {
    if(rows.length>1) issues.push(issue('MULTIPLE_ALLIN_VARIANTS_SAME_SHOPIFY_ID','critical',{
      remoteVariantId:remoteId,allInVariantIds:rows.map(x=>x.variant_id),skus:rows.map(x=>x.barcode),
    }));
  }
  const duplicateColorFamilies = [...familyByColor.values()].filter(x=>x.products.size>1)
    .map(x=>({familyKey:x.familyKey,brand:x.brand,model:x.model,color:x.colorCode,
      productCount:x.products.size,sizes:keys([...x.sizes]),products:[...x.products.values()]}))
    .sort((a,b)=>b.productCount-a.productCount || a.familyKey.localeCompare(b.familyKey));
  // Repeated storefront titles can conceal separate genuine colorways or models.
  // Listing them for review catches the 10+ visually identical cap cards without
  // ever assuming that their SKU/color/photographs are interchangeable.
  const byTitle = new Map();
  for(const p of byProduct.values()) {
    if(p.status!=='ACTIVE') continue;
    const key=`${slug(p.vendor)}::${norm(p.title)}`;
    if(!norm(p.title)) continue;
    const list=byTitle.get(key)||[];list.push(p);byTitle.set(key,list);
  }
  const repeatedTitles = [...byTitle.entries()].filter(([,v])=>v.length>1)
    .map(([key,products])=>({key,title:products[0].title,brand:products[0].vendor,
      productCount:products.length,products:products.map(p=>({id:p.id,handle:p.handle,variantCount:p.variants.length}))}))
    .sort((a,b)=>b.productCount-a.productCount);
  const modelColorSplits = [...familyByModel.values()].filter(x=>x.products.size>1 && x.colors.size>1)
    .map(x=>({brand:x.brand,model:x.model,modelKey:x.key,colorCodes:[...x.colors].sort(),
      productCount:x.products.size,products:[...x.products.entries()].map(([id,handle])=>({id,handle})),
      titleCount:x.titles.size,
      recommendation:'REVIEW_GROUP_COLORS_AS_VARIANTS_WITH_IMAGES'}))
    .sort((a,b)=>b.productCount-a.productCount);
  for(const f of duplicateColorFamilies) issues.push(issue('SAME_MODEL_COLOR_MULTIPLE_ACTIVE_PRODUCTS','critical',{
    brand:f.brand,model:f.model,color:f.color,productCount:f.productCount,handles:f.products.map(x=>x.handle),familyKey:f.familyKey,
  }));
  for(const f of repeatedTitles) issues.push(issue('SAME_TITLE_ON_MULTIPLE_SHOPIFY_PRODUCTS','review',{
    brand:f.brand,title:f.title,productCount:f.productCount,handles:f.products.map(p=>p.handle),
  }));
  for(const f of modelColorSplits) issues.push(issue('MODEL_SCATTERED_ACROSS_COLORS','review',{
    brand:f.brand,model:f.model,productCount:f.productCount,colorCount:f.colorCodes.length,modelKey:f.modelKey,
  }));

  if (storefrontIncluded) {
    for(const [productId, p] of byProduct) {
      if(!p.needsStorefront || p.status!=='ACTIVE') continue;
      const page=storefront.get(productId);
      if(!page || page.error) {
        issues.push(issue('STOREFRONT_FETCH_FAILED','review',{
          productId,handle:p.handle,error:page?.error||'not_checked',httpStatus:page?.status||null,
        }));
        continue;
      }
      const shopBySku=new Map((page.variants||[]).map(x=>[norm(x.sku),x]));
      for(const v of p.variants) {
        const rows=mappedByRemote.get(v.id)||[];
        for(const row of rows) {
          if(norm(row.variant_status)!=='active' || norm(row.model_status)!=='active')continue;
          const available=integer(row.ciuc_available)+integer(row.kezdi_available)+integer(row.other_physical);
          if(available<=0)continue;
          const sv=shopBySku.get(norm(v.sku));
          if(!sv) add('STOREFRONT_VARIANT_NOT_LISTED','critical',row,{productId,handle:p.handle,allInAvailable:available});
          else if(sv.available===false) add('STOREFRONT_NOT_SELLABLE_WITH_STOCK','critical',row,{
            productId,handle:p.handle,allInAvailable:available,adminAvailableForSale:v.availableForSale,
            sellableOnlineQuantity:v.sellableOnlineQuantity,storefrontAvailable:false,
          });
        }
      }
    }
  }
  const severityCount = issues.reduce((a,x)=>(a[x.severity]=(a[x.severity]||0)+1,a),{});
  const storefrontErrors = [...storefront.values()].filter(x => !x || x.error);
  const storefrontRateLimits = storefrontErrors.filter(x => x?.status === 429);
  return {
    summary:{ generatedAt:new Date().toISOString(),readOnly:true,
      allInVariants:allIn.length, shopifyVariants:remote.length, shopifyProducts:byProduct.size,
      mappedAllInVariants:allIn.filter(x=>x.shopify_variant_id).length,
      activeShopifyProducts:[...byProduct.values()].filter(x=>x.status==='ACTIVE').length,
      auditedStorefrontProducts:storefront.size,
      storefrontVerifiedProducts:storefront.size - storefrontErrors.length,
      storefrontFailedProducts:storefrontErrors.length,
      storefrontRateLimitedProducts:storefrontRateLimits.length,
      storefrontAuditComplete: !storefrontIncluded || storefrontErrors.length === 0,
      storefrontMode:storefrontIncluded, publication,
      duplicateColorFamilyCount:duplicateColorFamilies.length,
      splitColorModelCount:modelColorSplits.length,
      repeatedTitleCount:repeatedTitles.length,
      criticalCount:severityCount.critical||0, reviewCount:severityCount.review||0,
      coverageCount:severityCount.coverage||0,
    },
    issues, duplicateColorFamilies, modelColorSplits, repeatedTitles,
  };
}

async function main() {
  const args=parseArgs(process.argv.slice(2));
  if(args.help){console.log('node scripts/aifShopifyCatalogAudit.mjs [--storefront] [--storefront-delay-ms 1500] [--out ./reports/aif-shopify-catalog]');return;}
  const db = new pg.Pool({connectionString:process.env.DATABASE_URL});
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL hiányzik.');
    await ensureAifShopifyTables(db);
    const publication=await readOnlinePublicationId();
    const [rows, shopify]=await Promise.all([loadAllIn(db),loadShopifyVariants(publication.id)]);
    const initial=summarize(rows,shopify,publication);
    console.log('Katalógus beolvasva:',initial.summary.shopifyProducts,'Shopify termék /',rows.length,'AllIn variáns');
    let output=initial;
    if(args.storefront) {
      const byProduct=new Map();
      const activeMappedPositive=new Set(rows.filter(x=>
        x.shopify_product_id && norm(x.variant_status)==='active' && norm(x.model_status)==='active' &&
        integer(x.ciuc_available)+integer(x.kezdi_available)+integer(x.other_physical)>0)
        .map(x=>x.shopify_product_id));
      for(const v of shopify)if(v.product?.id && !byProduct.has(v.product.id))
        byProduct.set(v.product.id,{...v.product,needsStorefront:activeMappedPositive.has(v.product.id)});
      const statuses=await storefrontProductStates(byProduct,args.storefrontDelayMs);
      output=summarize(rows,shopify,publication,statuses,true);
    }
    const dir=path.resolve(args.out);
    await fs.mkdir(dir,{recursive:true});
    await fs.writeFile(path.join(dir,'summary.json'),JSON.stringify(output.summary,null,2)+'\n');
    await fs.writeFile(path.join(dir,'issues.json'),JSON.stringify(output.issues,null,2)+'\n');
    await fs.writeFile(path.join(dir,'issues.csv'),csv(output.issues,['type','severity','brand','model','color','size','sku','allInVariantId',
      'productId','handle','allInAvailable','adminInventory','sellableOnlineQuantity','httpStatus','error','familyKey','productCount','handles']));
    await fs.writeFile(path.join(dir,'duplicate-families.json'),JSON.stringify(output.duplicateColorFamilies,null,2)+'\n');
    await fs.writeFile(path.join(dir,'model-colors-review.json'),JSON.stringify(output.modelColorSplits,null,2)+'\n');
    await fs.writeFile(path.join(dir,'repeated-titles.json'),JSON.stringify(output.repeatedTitles,null,2)+'\n');
    await fs.writeFile(path.join(dir,'repeated-titles.csv'),csv(output.repeatedTitles,['brand','title','productCount','products']));
    await fs.writeFile(path.join(dir,'model-colors-review.csv'),csv(output.modelColorSplits,['brand','model','modelKey','productCount','colorCodes','products','recommendation']));
    console.log('\n=== ALLINFASHION KATALÓGUS AUDIT ===');
    console.table(output.summary);
    const byType=new Map();for(const i of output.issues)byType.set(i.type,(byType.get(i.type)||0)+1);
    console.table([...byType].map(([type,count])=>({hiba:type,darab:count})).sort((a,b)=>b.darab-a.darab));
    console.log('\nELSŐ KOCKÁZATOS SOROK:');
    console.table(output.issues.filter(x=>x.severity==='critical').slice(0,30).map(x=>({
      hiba:x.type,sku:x.sku||'',modell:x.model||'',keszlet:x.allInAvailable??'',handle:x.handle||'',
    })));
    if(args.storefront && !output.summary.storefrontAuditComplete) {
      console.log(`WEBÁRUHÁZ ELLENŐRZÉS NEM TELJES: ${output.summary.storefrontFailedProducts} sikertelen (${output.summary.storefrontRateLimitedProducts} HTTP 429).`);
      console.log('A sikertelen lekérdezések nem számítanak elfogyott terméknek. Újrafuttatáskor növelhető: --storefront-delay-ms 3000');
    }
    console.log(`\nJELENTÉSEK: ${dir}`);
    console.log('Ez a program semmilyen Shopify/AllIn adatot nem módosított.');
  } catch (error) {
    console.error('AUDIT HIBA:',error.message);
    process.exitCode=1;
  } finally {await db.end();}
}
if (process.argv[1] && path.resolve(process.argv[1])===new URL(import.meta.url).pathname) await main();
export { summarize, parseArgs, selectOption, readStorefront };
