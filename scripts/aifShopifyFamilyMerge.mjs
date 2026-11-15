/**
 * ALLINFASHION - Shopify fragmented product family consolidation (2026-11-15)
 *
 * PLAN by default. Live changes require --apply --family <key> --confirm <target handle>.
 * Run from project root: node scripts/aifShopifyFamilyMerge.mjs --plan
 *
 * NEVER deletes a product, an old variant, an AllIn stock row or an order.
 * Instead, creates equivalent variants in a selected survivor, remaps their
 * AllIn variant IDs, archives the abandoned products and zeroes the archived
 * Shopify inventory so quantities are not counted twice in Shopify.
 * Preserves legacy variant IDs in archived products for order-history tracing.
 *
 * Safety: exact Product ID allowlist, model/color audit, per-SKU mapping checks,
 * available/on_hand/committed cross-checks, post-create checks, a global Shopify
 * processor advisory lock and replay-safe per-variant operations.
 *
 * IMPORTANT: the script must run where the existing AllIn backend and its
 * Shopify credentials / DATABASE_URL are configured (Render Shell).
 */
import { createHash } from 'node:crypto';
import pg from 'pg';
import {
  shopifyGraphql,
  acquireAifShopifyProcessLock,
  ensureAifShopifyTables,
  enqueueAifShopifyVariant,
} from '../api/lib/aifShopify.js';
import { auditAifShopifyProductFamilies } from '../api/lib/aifShopifyExport.js';

const FAMILIES = Object.freeze({
  'under-armour::under-armour-1389889::410': {
    label: 'Under Armour Storm Drive - sapka (S/M, M/L, L/XL)',
    target: 'gid://shopify/Product/11160846238023',
    products: [
      'gid://shopify/Product/11160846172487',
      'gid://shopify/Product/11160846238023',
      'gid://shopify/Product/11160848105799',
    ],
  },
  'under-armour::under-armour-1290261::090': {
    label: 'Under Armour Sportstyle Tricot Jogger 090 - nadrag (S, M)',
    target: 'gid://shopify/Product/11160841257287',
    products: [
      'gid://shopify/Product/11160841257287',
      'gid://shopify/Product/11537890541895',
    ],
  },
  '4f::4f-4fjwss25ttshf1851::20s': {
    label: '4F TSHIRT F1851 / 20S (134, 140, 146)',
    target: 'gid://shopify/Product/11160960926023',
    products: [
      'gid://shopify/Product/11160960926023',
      'gid://shopify/Product/11160961024327',
    ],
  },
  // 62S = ROȘU, nem COBALT: a gyartoi cikkszamot es az EAN-t kulso
  // katalogusadat is megerositi. A roșu opcios termek lesz a megmarado.
  '4f::4f-4fjss23uswtm006::62s': {
    label: '4F SWIMMING TRUNKS M006 / 62S - roșu (146/152, 158/164)',
    target: 'gid://shopify/Product/11160956830023',
    products: [
      'gid://shopify/Product/11160956469575',
      'gid://shopify/Product/11160956830023',
    ],
    identity: {
      modelCode: '4f:4fjss23uswtm006',
      colorCode: '62S',
      targetColor: 'roșu',
      skuBySize: { '146/152': '5904698182022', '158/164': '5904698182039' },
      sourceTitles: {
        'gid://shopify/Product/11160956469575': '4F SWIMMING TRUNKS M006-COBALT',
        'gid://shopify/Product/11160956830023': '4F SWIMMING TRUNKS M006-COBALT',
      },
    },
    // A COBALT cimke bizonyithatoan hibas; a valodi 62S szin piros.
    correctedTitle: '4F SWIMMING TRUNKS M006 - Roșu',
  },
  // 25UUSHJ093-413: ugyanaz a 3 darabos, tobb szinu Performance
  // Cotton boxer-csomag M es XL meretben. A multicolor opcios marad.
  'under-armour::under-armour-25uushj093::413': {
    label: 'Under Armour Performance Cotton 6in 3PK / 413 (M, XL)',
    target: 'gid://shopify/Product/11359079694663',
    products: [
      'gid://shopify/Product/11160846500167',
      'gid://shopify/Product/11359079694663',
    ],
    identity: {
      modelCode: 'under_armour:25uushj093',
      colorCode: '413',
      targetColor: 'multicolor',
      skuBySize: { 'M': '1200122271855', 'XL': '1200122271879' },
      sourceTitles: {
        'gid://shopify/Product/11160846500167': 'Boxeri Bărbați Under Armour Perf Cotton 6in (Pachet 3 Perechi)',
        'gid://shopify/Product/11359079694663': 'UA PERFORMANCE COTTON - SOLID 6 3PK',
      },
    },
    correctedTitle: 'Boxeri Bărbați Under Armour Performance Cotton 6in (3 Perechi)',
  },
});

function str(x) { return String(x ?? '').trim(); }
function norm(x) { return str(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' '); }
function fail(code, message, details) { const e = new Error(message); e.code = code; e.details = details; throw e; }
function assert(ok, code, message, details) { if (!ok) fail(code, message, details); }
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function identityOfOption(name) {
  const x = norm(name);
  if (['marime', 'size', 'sizes', 'meret', 'taille'].includes(x)) return 'size';
  if (['culoare', 'color', 'colour', 'szin'].includes(x)) return 'color';
  return '';
}
function selectedByKind(variant, kind) {
  return (variant?.selectedOptions || []).find(x => identityOfOption(x.name) === kind)?.value || '';
}
function moneyAmount(value) { return value == null || value === '' ? null : String(value); }
function totalQuantity(level, name) {
  const q = (level?.quantities || []).find(x => x.name === name);
  return q ? Number(q.quantity) : 0;
}
function equalIds(a, b) { return a.length === b.length && a.every(x => b.includes(x)); }
function compactOptions(product) { return (product.options || []).map(x => ({ id: x.id, name: x.name, kind: identityOfOption(x.name), values: x.values })); }
function logJson(title, data) { console.log(`\n${title}\n${JSON.stringify(data, null, 2)}`); }

const PRODUCT_QUERY = `query AifMergeProducts($ids:[ID!]!) {
  nodes(ids:$ids) {
    ... on Product {
      id handle title vendor status productType category { id }
      featuredImage { id url }
      options { id name position values }
      variants(first:100) {
        pageInfo { hasNextPage }
        nodes {
          id title sku barcode price compareAtPrice taxable inventoryPolicy
          image { id url }
          metafields(first:1) { pageInfo { hasNextPage } nodes { id } }
          selectedOptions { name value }
          inventoryItem {
            id sku tracked requiresShipping
            harmonizedSystemCode countryCodeOfOrigin provinceCodeOfOrigin
            unitCost { amount currencyCode }
            measurement { weight { value unit } }
            inventoryLevels(first:50) {
              pageInfo { hasNextPage }
              nodes { location { id name } quantities(names:["available","on_hand","committed"]) { name quantity } }
            }
          }
        }
      }
    }
  }
}`;

async function getProducts(ids) {
  const r = await shopifyGraphql(PRODUCT_QUERY, { ids });
  const byId = new Map((r.data?.nodes || []).filter(Boolean).map(x => [x.id, x]));
  assert(ids.every(x => byId.has(x)), 'PRODUCT_MISSING', 'Shopify-termekazonosito nem talalhato.', ids.filter(x => !byId.has(x)));
  for (const p of byId.values()) {
    assert(!p.variants.pageInfo.hasNextPage, 'TOO_MANY_VARIANTS', '100-nal tobb varians, nem biztonsagos a reszleges lekerdezes.', p.id);
    for (const v of p.variants.nodes) {
      assert(!v.inventoryItem?.inventoryLevels?.pageInfo?.hasNextPage, 'TOO_MANY_LOCATIONS', 'Helyszinlista csonkolodhat.', v.id);
    }
  }
  return byId;
}

const VARIANTS_BY_SKU_QUERY = `query AifMergeExactSku($query:String!) {
  productVariants(first:50,query:$query) {
    pageInfo { hasNextPage }
    nodes { id sku product { id status handle } }
  }
}`;
async function findExactSku(sku) {
  const q = `sku:"${str(sku).replaceAll('\\', '\\\\').replaceAll('"','\\"')}"`;
  const r = await shopifyGraphql(VARIANTS_BY_SKU_QUERY, {query:q});
  const c = r.data?.productVariants;
  assert(c && !c.pageInfo?.hasNextPage, 'SKU_LOOKUP_INCOMPLETE', 'Shopify SKU keresesi eredmeny csonkolodhat.', sku);
  return (c.nodes || []).filter(v => norm(v.sku) === norm(sku));
}

async function loadMappings(db, allInVariantIds) {
  const res = await db.query(`
    SELECT m.variant_id::text, m.sku AS mapped_sku,
           m.shopify_product_id,m.shopify_variant_id,m.shopify_inventory_item_id,
           v.barcode, v.size,v.color_code,v.color_name,v.status AS variant_status,
           pm.status AS model_status, pm.model_code,
           COALESCE(sum(GREATEST(COALESCE(s.qty,0)-COALESCE(s.reserved_qty,0),0))
              FILTER (WHERE s.location_id::text=$2),0)::int AS ciuc,
           COALESCE(sum(GREATEST(COALESCE(s.qty,0)-COALESCE(s.reserved_qty,0),0))
              FILTER (WHERE s.location_id::text=$3),0)::int AS kezdi,
           COALESCE(sum(COALESCE(s.reserved_qty,0)) FILTER (WHERE s.location_id::text IN ($2,$3)),0)::int AS reserved,
           COALESCE(sum(GREATEST(COALESCE(s.qty,0),0))
             FILTER (WHERE s.location_id::text NOT IN ($2,$3) AND COALESCE(l.code,'') <> 'online_shop'),0)::int AS outside
      FROM aif_shopify_variant_map m
      JOIN aif_product_variants v ON v.id=m.variant_id
      JOIN aif_product_models pm ON pm.id=v.model_id
      LEFT JOIN aif_stock s ON s.variant_id=m.variant_id
      LEFT JOIN aif_locations l ON l.id=s.location_id
      WHERE m.variant_id::text=ANY($1::text[])
      GROUP BY m.variant_id,m.sku,m.shopify_product_id,m.shopify_variant_id,m.shopify_inventory_item_id,v.id,pm.id
  `, [allInVariantIds, process.env.AIF_LOCATION_CSIKSZEREDA_ID, process.env.AIF_LOCATION_KEZDI_ID]);
  return new Map(res.rows.map(x => [x.variant_id, x]));
}

function managedLocations() {
  const locations = [
    { allIn: 'ciuc', shopify: str(process.env.SHOPIFY_LOCATION_CSIKSZEREDA_ID) },
    { allIn: 'kezdi', shopify: str(process.env.SHOPIFY_LOCATION_KEZDI_ID) },
  ];
  assert(locations.every(x => x.shopify), 'LOCATION_ENV_MISSING', 'Shopify helyszinazonosito hianyzik.');
  assert(process.env.AIF_LOCATION_CSIKSZEREDA_ID && process.env.AIF_LOCATION_KEZDI_ID, 'ALLIN_LOCATION_ENV_MISSING', 'AllIn helyszinazonosito hianyzik.');
  return locations;
}

function validateInventoryAndMap({variant, mapped, fromProduct, locations, allInId}) {
  assert(mapped, 'MAPPING_MISSING', `AllIn mapping hianyzik: ${allInId}`);
  assert(mapped.shopify_product_id === fromProduct.id && mapped.shopify_variant_id === variant.id,
    'MAPPING_MISMATCH', 'AllIn -> Shopify kapcsolatok nem a vart termekre mutatnak.', {allInId, mapped, variantId:variant.id});
  assert(mapped.shopify_inventory_item_id === variant.inventoryItem?.id,
    'INVENTORY_MAPPING_MISMATCH', 'InventoryItem ID nem egyezik.', allInId);
  assert(norm(mapped.barcode) === norm(variant.sku) && norm(mapped.mapped_sku) === norm(variant.sku),
    'SKU_MISMATCH', 'SKU / EAN elteres, nem egyesitheto.', {allInId, sku:variant.sku});
  assert(mapped.variant_status === 'active' && mapped.model_status === 'active',
    'INACTIVE_ALLIN', 'Az AllIn termek nem aktiv.', allInId);
  assert(variant.inventoryItem?.tracked && variant.inventoryItem?.requiresShipping,
    'INVENTORY_UNTRACKED', 'Nem keszletkezelt / nem szallithato varians.', variant.id);
  assert(variant.inventoryPolicy === 'DENY', 'POLICY_MISMATCH', 'Eltérő inventoryPolicy, kezi ellenorzes.', variant.id);
  assert(Number(mapped.reserved) === 0 && Number(mapped.outside) === 0,
    'STOCK_RESERVED_OR_OUTSIDE', 'Van lefoglalt vagy nem felugyelt raktarkeszlet.', mapped);
  const levels = variant.inventoryItem.inventoryLevels.nodes;
  const allowed = new Set(locations.map(x => x.shopify));
  for (const level of levels) {
    const loc = level.location.id;
    if (!allowed.has(loc)) {
      assert(totalQuantity(level,'on_hand')===0 && totalQuantity(level,'committed')===0,
        'STOCK_AT_UNKNOWN_LOCATION', 'Masik Shopify raktarban is van keszlet.', {variantId:variant.id,loc});
    }
  }
  for (const location of locations) {
    const level = levels.find(x => x.location.id === location.shopify);
    const quantity = level ? totalQuantity(level,'available') : 0;
    const committed = level ? totalQuantity(level,'committed') : 0;
    const onHand = level ? totalQuantity(level,'on_hand') : 0;
    assert(committed===0 && onHand===quantity && quantity===Number(mapped[location.allIn]),
      'SHOPIFY_STOCK_DIFFERS', 'A Shopify es AllIn keszlet most nem egyezik; ne egyesitsunk keszletmozgast.',
      {variantId:variant.id,location:location.shopify,allIn:mapped[location.allIn],onHand,available:quantity,committed});
  }
}

function createVariantInput(oldVariant, desiredOptions, mapped, locations) {
  const item = {
    sku: oldVariant.sku,
    tracked: true,
    requiresShipping: true,
  };
  if (oldVariant.inventoryItem.unitCost?.amount != null) item.cost = oldVariant.inventoryItem.unitCost.amount;
  for(const key of ['harmonizedSystemCode','countryCodeOfOrigin','provinceCodeOfOrigin']) {
    if(oldVariant.inventoryItem[key]) item[key]=oldVariant.inventoryItem[key];
  }
  if (oldVariant.inventoryItem.measurement?.weight?.value != null) {
    item.measurement = {weight:oldVariant.inventoryItem.measurement.weight};
  }
  return {
    barcode: oldVariant.barcode || oldVariant.sku,
    price: moneyAmount(oldVariant.price),
    ...(moneyAmount(oldVariant.compareAtPrice) != null ? {compareAtPrice:moneyAmount(oldVariant.compareAtPrice)} : {}),
    taxable: oldVariant.taxable !== false,
    inventoryPolicy: oldVariant.inventoryPolicy,
    inventoryItem: item,
    optionValues: desiredOptions,
    inventoryQuantities: locations.map(loc => ({locationId:loc.shopify,availableQuantity:Number(mapped[loc.allIn])})),
  };
}

function targetOptionPlan(target, targetEntries, sourceSize) {
  const options = compactOptions(target);
  assert(options.length >= 1 && options.length <= 2 && options.every(x => x.kind),
    'UNSUPPORTED_OPTIONS', 'A celtermek opcioi nem egyertelmuek: csak Szín+Méret vagy Méret lehet.', options);
  assert(options.some(x => x.kind==='size') && new Set(options.map(x => x.kind)).size === options.length,
    'UNSUPPORTED_OPTIONS', 'Hianyzik a meret vagy duplazott az opcionev.', options);
  const knownColors = [...new Set(targetEntries.map(v=>norm(selectedByKind(v,'color'))).filter(Boolean))];
  assert(knownColors.length <= 1, 'MULTICOLOR_TARGET', 'A celnal mas szinek is vannak: ezt nem vonjuk ossze.', knownColors);
  const canonicalColor = targetEntries.map(v=>selectedByKind(v,'color')).find(Boolean) || '';
  if (options.some(x=>x.kind==='color')) assert(canonicalColor,'COLOR_UNKNOWN','A termeknek van szinopcioja, de nincs erteke.');
  const targetSizeKeys = new Set(targetEntries.map(v => norm(selectedByKind(v,'size'))));
  assert(!targetSizeKeys.has(norm(sourceSize)), 'SIZE_ALREADY_ON_TARGET',
    'A celtermeken mar van ilyen meret, manuális ellenorzes kell.',sourceSize);
  return options.map(opt => ({optionId:opt.id, name:opt.kind==='size'?sourceSize:canonicalColor}));
}

const CREATE_MUTATION = `mutation AifMergeCreateVariant($productId:ID!,$variants:[ProductVariantsBulkInput!]!) {
  productVariantsBulkCreate(productId:$productId,strategy:PRESERVE_STANDALONE_VARIANT,variants:$variants) {
    productVariants { id sku barcode title inventoryItem { id sku tracked } selectedOptions { name value } }
    userErrors { field message code }
  }
}`;
async function createVariant(targetId, input, expectedSku) {
  const result = await shopifyGraphql(CREATE_MUTATION, {productId:targetId, variants:[input]});
  const payload = result.data?.productVariantsBulkCreate;
  if (payload?.userErrors?.length) fail('CREATE_VARIANT_FAILED',payload.userErrors.map(x=>x.message).join(' | '),payload.userErrors);
  const created = payload?.productVariants || [];
  assert(created.length===1 && norm(created[0]?.sku)===norm(expectedSku) && created[0]?.inventoryItem?.id,
    'CREATE_RESULT_UNEXPECTED','Shopify nem adta vissza a vart SKU-t/inventoryItem-et.',payload);
  return created[0];
}

const ARCHIVE_MUTATION = `mutation AifMergeArchive($product:ProductUpdateInput!) {
 productUpdate(product:$product) { product {id handle status} userErrors { field message } }
}`;
async function archiveProduct(product) {
  const result=await shopifyGraphql(ARCHIVE_MUTATION,{product:{id:product.id,status:'ARCHIVED'}});
  const info=result.data?.productUpdate;
  if(info?.userErrors?.length) fail('ARCHIVE_FAILED',info.userErrors.map(x=>x.message).join(' | '),info.userErrors);
  assert(info?.product?.status==='ARCHIVED','ARCHIVE_UNVERIFIED','Archiválás nem igazolható.',product.id);
}

const TITLE_UPDATE_MUTATION = `mutation AifMergeCorrectProductTitle($product:ProductUpdateInput!) {
  productUpdate(product:$product) { product { id title handle status seo { title } } userErrors { field message } }
}`;
async function correctProductTitle(targetId, expectedHandle, expectedTitle) {
  if(!expectedTitle) return false;
  const live=(await getProducts([targetId])).get(targetId);
  assert(live && live.handle===expectedHandle && live.status==='ACTIVE',
    'TITLE_TARGET_CHANGED','A celfulek neve/statusza kozben megvaltozott.');
  if(live.title===expectedTitle) return false;
  const r=await shopifyGraphql(TITLE_UPDATE_MUTATION,{
    product:{id:targetId,title:expectedTitle,handle:expectedHandle,seo:{title:expectedTitle.slice(0,70)}}
  });
  const payload=r.data?.productUpdate;
  if(payload?.userErrors?.length) fail('TITLE_UPDATE_FAILED',
    payload.userErrors.map(x=>x.message).join(' | '),payload.userErrors);
  assert(payload?.product?.id===targetId && payload?.product?.title===expectedTitle
    && payload?.product?.handle===expectedHandle && payload?.product?.status==='ACTIVE'
    && payload?.product?.seo?.title===expectedTitle.slice(0,70),
    'TITLE_UPDATE_UNVERIFIED','A termeknev / SEO cim / handle nem egyezik.',payload);
  return true;
}

const STOCK_SET = `mutation AifMergeRetireStock($input:InventorySetQuantitiesInput!,$key:String!) {
 inventorySetQuantities(input:$input) @idempotent(key:$key) {
  inventoryAdjustmentGroup { createdAt }
  userErrors { code field message }
 }
}`;
async function zeroArchivedSourceStock(variant) {
  const item=variant.inventoryItem;
  const levels=item.inventoryLevels.nodes;
  assert(levels.every(x=>totalQuantity(x,'committed')===0),'OLD_ORDERS_COMMITTED',
    'Régi archivált terméken rendelés foglal készletet; nem nullázzuk.',variant.id);
  const quantities=levels.filter(x=>totalQuantity(x,'on_hand')!==0).map(x=>({
    inventoryItemId:item.id,locationId:x.location.id,quantity:0,changeFromQuantity:totalQuantity(x,'on_hand'),
  }));
  if (!quantities.length) return false;
  const key=createHash('sha256').update(`aif-archive-stock-v1:${item.id}`).digest('hex');
  const r=await shopifyGraphql(STOCK_SET,{
    key,
    input:{name:'on_hand',reason:'correction',referenceDocumentUri:`gid://allinfashion/CatalogMerge/${item.id.split('/').pop()}`,quantities},
  });
  const errors=r.data?.inventorySetQuantities?.userErrors || [];
  if (errors.length) fail('OLD_INVENTORY_NOT_CLEARED',errors.map(x=>x.message).join(' | '), errors);
  return true;
}

const REDIRECT_MUTATION = `mutation AifMergeRedirect($urlRedirect:UrlRedirectInput!) {
 urlRedirectCreate(urlRedirect:$urlRedirect) { urlRedirect {id path target} userErrors {field message} }
}`;
async function redirectArchivedProduct(fromHandle, toHandle) {
  if (!fromHandle || !toHandle || fromHandle === toHandle) return null;
  const r=await shopifyGraphql(REDIRECT_MUTATION,{
    urlRedirect:{path:`/products/${fromHandle}`,target:`/products/${toHandle}`},
  });
  const p=r.data?.urlRedirectCreate;
  if (p?.userErrors?.length) return p.userErrors.map(x=>x.message).join(' | ');
  return null;
}

function parseArgs(argv) {
  const a={apply:false, family:'', confirm:'', plan:false, planAuto:false, applyAuto:false, maxAuto:5};
  for(let i=0;i<argv.length;i++) {
    const v=argv[i];
    if(v==='--apply') a.apply=true;
    else if(v==='--plan') a.plan=true;
    else if(v==='--plan-auto') a.planAuto=true;
    else if(v==='--apply-auto') a.applyAuto=true;
    else if(v==='--max-auto') a.maxAuto=Number(argv[++i]);
    else if(v==='--family') a.family=argv[++i] || '';
    else if(v==='--confirm') a.confirm=argv[++i] || '';
    else if(v==='--help') a.help=true;
    else fail('BAD_OPTION',`Ismeretlen parameter: ${v}`);
  }
  if(a.apply && (!a.family || !a.confirm)) fail('CONFIRM_REQUIRED','A módosításhoz --apply --family <kulcs> --confirm <cél-handle> szükséges.');
  if(a.applyAuto && (a.apply || a.family || a.plan)) fail('AUTO_CONFLICT','Az --apply-auto külön üzemmód.');
  if(a.planAuto && (a.apply || a.family || a.applyAuto)) fail('AUTO_CONFLICT','A --plan-auto külön üzemmód.');
  if(!Number.isInteger(a.maxAuto) || a.maxAuto<1 || a.maxAuto>20) fail('BAD_BATCH_SIZE','--max-auto 1 és 20 között lehet.');
  if(a.applyAuto && !/^[a-f0-9]{64}$/.test(a.confirm)) fail('BATCH_HASH_REQUIRED','Az --apply-auto futtatáshoz 64 karakteres --confirm <terv-ujjlenyomat> kell.');
  return a;
}

async function buildFamilyPlan(db,familyKey,settings,locations,auditOverride=null) {
  const audit=auditOverride || await auditAifShopifyProductFamilies(db,{limit:5000});
  const family=audit.duplicates.find(x=>x.familyKey===familyKey);
  if(!family) return {familyKey,label:settings.label,status:'not_duplicated_or_already_archived',instructions:'Az aktiv termekek kozott nem talalhato a korabbi duplikacio.'};
  const actualIds=family.products.map(x=>x.productId).sort();
  const expectedIds=[...settings.products].sort();
  assert(actualIds.includes(settings.target) && equalIds(actualIds,expectedIds),
    'UNEXPECTED_FAMILY_PRODUCTS',
    'Az auditban nem a várt Shopify termékek szerepelnek; kódmódosítás nélkül nem egyesítünk.',{actualIds,expectedIds});
  const products=await getProducts(expectedIds);
  const target=products.get(settings.target);
  assert(target && target.status==='ACTIVE','TARGET_INACTIVE','A kijelolt celtermek nem aktiv.');
  if(settings.identity) {
    // Az egyszer megerositett, valodi SKU-k es szinkodok jelentik a guardot;
    // nev/foto hasonlosag alapjan soha nem egyesitunk automatikusan.
    for(const [productId,expectedTitle] of Object.entries(settings.identity.sourceTitles || {})) {
      const p=products.get(productId);
      const allowed=[expectedTitle, settings.correctedTitle].map(norm);
      assert(p && allowed.includes(norm(p.title)),'PRODUCT_TITLE_CHANGED',
        'A cel/forras Shopify nev megvaltozott. Ujra kell ellenorizni.',
        {productId,actual:p?.title,expected:expectedTitle});
    }
    const targetColors=[...new Set(target.variants.nodes.map(v=>norm(selectedByKind(v,'color'))))];
    assert(targetColors.length===1 && targetColors[0]===norm(settings.identity.targetColor),
      'TARGET_COLOR_CHANGED','A celtermek szinopcioja nem a jovahagyott szin.',
      {actual:targetColors,expected:settings.identity.targetColor});
  }
  const allProducts=[...products.values()];
  assert(allProducts.every(p=>p.status==='ACTIVE'),'SOURCE_ALREADY_ARCHIVED',
    'A termekcsalad egy resze mar archivalt; uj tervet kell kesziteni.');
  const reportedVariantMap=new Map(family.products.flatMap(p=>p.variants.map(v=>[v.variantId,{...v,productId:p.productId}])));
  for (const p of allProducts) {
    assert(p.variants.nodes.every(v=>reportedVariantMap.has(v.id)), 'EXTRA_SHOPIFY_VARIANTS',
      'A termek olyan Shopify variansokat tartalmaz, amiket az AllIn audit nem ismer. Megallunk.',p.handle);
  }
  const allInIds=family.products.flatMap(p=>p.variants.map(v=>v.allInVariantId));
  const maps=await loadMappings(db,allInIds);
  if(settings.identity) {
    const required=settings.identity.skuBySize;
    const actual=[];
    for(const p of allProducts) {
      for(const variant of p.variants.nodes) {
        const reported=reportedVariantMap.get(variant.id);
        const mapping=maps.get(reported?.allInVariantId);
        const size=str(reported?.size);
        actual.push(size);
        assert(mapping && norm(mapping.model_code)===norm(settings.identity.modelCode)
          && norm(mapping.color_code)===norm(settings.identity.colorCode),
          'FAMILY_IDENTITY_CHANGED','AllIn modell- vagy szinkod elteres: egyesites tiltva.',
          {sku:variant.sku,actualModel:mapping?.model_code,actualColor:mapping?.color_code,
            expectedModel:settings.identity.modelCode,expectedColor:settings.identity.colorCode});
        assert(str(required[size]) && norm(variant.sku)===norm(required[size])
          && norm(mapping.barcode)===norm(required[size]),
          'SKU_SIZE_IDENTITY_CHANGED','Az SKU / EAN / meret parositasa nem a jovahagyott.',
          {size,sku:variant.sku,barcode:mapping.barcode,expected:required[size]});
      }
    }
    assert(actual.length===Object.keys(required).length && actual.every(x=>actual.filter(y=>y===x).length===1),
      'UNEXPECTED_FAMILY_SIZES','A termekcsalad meretei megvaltoztak.',{actual,expected:Object.keys(required)});
  }
  const targetEntries=target.variants.nodes;
  assert(targetEntries.length>=1,'EMPTY_TARGET','A celtermeken nincs meret.');
  const toMove=[];
  for(const p of allProducts.filter(x=>x.id!==settings.target)) {
    for(const variant of p.variants.nodes) {
      const reported=reportedVariantMap.get(variant.id);
      const mapped=maps.get(reported.allInVariantId);
      assert(mapped,'MAPPING_MISSING','AllIn mapping hianyzik.',reported);
      assert(str(variant.sku) && str(reported.size),'MISSING_SKU_OR_SIZE','Hianyzik a SKU vagy meret.',reported);
      const targetSkuMatches=targetEntries.filter(v=>norm(v.sku)===norm(variant.sku));
      assert(targetSkuMatches.length<=1,'TARGET_DUPLICATE_SKU','A céltermékben duplikált SKU.',variant.sku);
      const already=targetSkuMatches[0] || null;
      const alreadyMoved=Boolean(already && mapped.shopify_product_id===target.id && mapped.shopify_variant_id===already.id);
      if(!alreadyMoved) validateInventoryAndMap({variant,mapped,fromProduct:p,locations,allInId:reported.allInVariantId});
      if(already) {
        assert(norm(already.barcode)===norm(variant.barcode||variant.sku) && norm(selectedByKind(already,'size'))===norm(reported.size),
          'PARTIAL_MERGE_VARIANT_MISMATCH','A korabbi reszleges merge variansa nem egyezik.',{sku:variant.sku,targetVariantId:already.id});
      }
      const opt=already ? [] : targetOptionPlan(target,targetEntries,reported.size);
      const existingMatches=await findExactSku(variant.sku);
      assert(existingMatches.every(x=>[settings.target,p.id].includes(x.product.id)),
        'SKU_IN_UNRELATED_PRODUCT','SKU egy harmadik termekben is megjelenik.',{sku:variant.sku,matches:existingMatches});
      toMove.push({sku:variant.sku,size:reported.size,source:p.handle,sourceProductId:p.id,
        oldVariantId:variant.id,oldInventoryItemId:variant.inventoryItem.id,
        allInVariantId:reported.allInVariantId,optionValues:opt,existingTargetVariantId:already?.id||null,
        alreadyMoved,ciuc:Number(mapped.ciuc),kezdi:Number(mapped.kezdi),price:variant.price,
        compareAtPrice:variant.compareAtPrice});
    }
  }
  // Sanity check also on the variants that stay on the destination product.
  for(const variant of targetEntries) {
    const row=reportedVariantMap.get(variant.id);
    const mapping=maps.get(row.allInVariantId);
    if(mapping?.shopify_variant_id===variant.id) {
      validateInventoryAndMap({variant,mapped:mapping,fromProduct:target,locations,allInId:row.allInVariantId});
    } else {
      const copy=toMove.find(x=>x.existingTargetVariantId===variant.id);
      assert(copy && mapping?.shopify_variant_id===copy.oldVariantId,'UNEXPECTED_TARGET_VARIANT',
        'Célnál lévő variáns mappingja nem egyezik.',variant.id);
      for(const loc of locations) {
        const lev=variant.inventoryItem?.inventoryLevels?.nodes?.find(x=>x.location.id===loc.shopify);
        assert(lev && totalQuantity(lev,'available')===Number(copy[loc.allIn]),
          'ORPHAN_STOCK_DIFFERS','A reszleges merge varians készlete nem egyezik.',variant.id);
      }
    }
  }
  const combined=[...targetEntries.map(v=>({size:norm(selectedByKind(v,'size')),sku:norm(v.sku)})),
    ...toMove.map(v=>({size:norm(v.size),sku:norm(v.sku)}))];
  const uniqueSizes=new Map();
  for (const x of combined) {
    if(uniqueSizes.has(x.size)) assert(uniqueSizes.get(x.size)===x.sku,'SIZE_COLLISION',
      'Ugyanaz a meret ket kulonbozo SKU-val.',combined);
    else uniqueSizes.set(x.size,x.sku);
  }
  assert(new Set(toMove.map(x=>norm(x.sku))).size===toMove.length,'SKU_COLLISION','Azonos SKU szerepel ket helyen.');
  return {familyKey,label:settings.label,status:'ready',target:{id:target.id,handle:target.handle,title:target.title,
    options:compactOptions(target),existingVariants:targetEntries.length},
    oldProducts:allProducts.filter(x=>x.id!==target.id).map(x=>({id:x.id,handle:x.handle,variants:x.variants.nodes.length})),
    toMove, correctedTitle:settings.correctedTitle || null,
    shopifyProductSnapshots:allProducts, auditProductCount:family.productCount};
}

async function applyPlan(db,plan,locations) {
  const client=await db.connect();
  const result={familyKey:plan.familyKey,target:plan.target.handle,created:[],mapped:[],archived:[],inventoryCleared:[],redirects:[],warnings:[],titleCorrected:false};
  try {
    // AllIn DB remains source of truth. Every mutation is followed by exact checks.
    for(const step of plan.toMove) {
      const products=await getProducts([plan.target.id,step.sourceProductId]);
      const target=products.get(plan.target.id);
      const source=products.get(step.sourceProductId);
      const oldVariant=source.variants.nodes.find(x=>x.id===step.oldVariantId);
      assert(oldVariant,'ORIGINAL_VARIANT_CHANGED','A forrasvarians kozben megvaltozott.',step.sku);
      const sourceNow=await loadMappings(client,[step.allInVariantId]);
      const currentMap=sourceNow.get(step.allInVariantId);
      if(!step.alreadyMoved) validateInventoryAndMap({variant:oldVariant,mapped:currentMap,fromProduct:source,
        locations,allInId:step.allInVariantId});
      const newer=target.variants.nodes.filter(x=>norm(x.sku)===norm(step.sku));
      assert(newer.length<=1,'DUPLICATED_DESTINATION_SKU','A celtermekben ugyanaz az SKU ketszer szerepel.',step.sku);
      let created=newer[0]||null;
      if(!created) {
        assert(!step.alreadyMoved,'MAPPED_VARIANT_MISSING','Az AllIn mar uj variansra mutat, de a celtermekben nem talalhato.',step.sku);
        const options=targetOptionPlan(target,target.variants.nodes,step.size);
        const input=createVariantInput(oldVariant,options,currentMap,locations);
        created=await createVariant(target.id,input,step.sku);
        result.created.push({sku:step.sku,id:created.id,inventoryItemId:created.inventoryItem.id});
      }
      let liveNew=null;
      for(let retry=0;retry<6;retry++) {
        const fresh=await getProducts([target.id]);
        liveNew=fresh.get(target.id).variants.nodes.find(x=>x.id===created.id);
        if(liveNew?.inventoryItem?.inventoryLevels?.nodes) break;
        await wait(800);
      }
      assert(liveNew && norm(liveNew.sku)===norm(step.sku) && norm(liveNew.barcode)===norm(oldVariant.barcode||oldVariant.sku),
        'NEW_VARIANT_VERIFY_FAILED','Uj varians SKU/EAN visszaellenorzes hibas.',step.sku);
      assert(liveNew.inventoryItem.id===created.inventoryItem.id,'NEW_INVENTORY_VERIFY_FAILED','InventoryItem azonosito elteres.',step.sku);
      // This read-only quantity verification happens before AllIn maps to the new ID.
      for (const loc of locations) {
        const level=liveNew.inventoryItem.inventoryLevels.nodes.find(x=>x.location.id===loc.shopify);
        assert(level && totalQuantity(level,'available')===Number(step[loc.allIn]),
          'NEW_STOCK_VERIFY_FAILED','Uj varians Shopify készlete eltér az AllIn készlettől.',{sku:step.sku,location:loc.shopify});
      }
      if(currentMap.shopify_product_id===target.id && currentMap.shopify_variant_id===created.id) {
        result.mapped.push({sku:step.sku,allInVariantId:step.allInVariantId,newVariantId:created.id,already:true});
        continue;
      }
      await client.query('BEGIN');
      try {
        const saved=await client.query(`UPDATE aif_shopify_variant_map SET
          shopify_product_id=$2, shopify_variant_id=$3, shopify_inventory_item_id=$4,
          shopify_product_title=$5, shopify_variant_title=$6, shopify_product_status='ACTIVE',
          sync_status='mapped', last_error=NULL,
          last_synced_at=NULL, last_synced_csikszereda_qty=NULL, last_synced_kezdi_qty=NULL,
          raw=COALESCE(raw,'{}'::jsonb)||$10::jsonb,updated_at=now()
          WHERE variant_id=$1::uuid AND shopify_product_id=$7 AND shopify_variant_id=$8 AND shopify_inventory_item_id=$9
          RETURNING variant_id`,[
          step.allInVariantId,target.id,created.id,created.inventoryItem.id,target.title,liveNew.title,
          step.sourceProductId,step.oldVariantId,step.oldInventoryItemId,
          JSON.stringify({catalogMerge:{at:new Date().toISOString(),familyKey:plan.familyKey,oldProductId:step.sourceProductId,
            oldVariantId:step.oldVariantId,oldInventoryItemId:step.oldInventoryItemId,newVariantId:created.id,newInventoryItemId:created.inventoryItem.id}}),
        ]);
        assert(saved.rowCount===1,'MAPPING_UPDATE_FAILED','AllIn mapping megvaltozott a muvelet kozben.',step.sku);
        const queued=await enqueueAifShopifyVariant(client,step.allInVariantId,'catalog_family_merge',{schemaReady:true});
        assert(queued.queued,'STOCK_QUEUE_FAILED','A készlet újraszinkronizálása nem került sorba.',queued);
        await client.query('COMMIT');
      } catch(err) {await client.query('ROLLBACK').catch(()=>{});throw err;}
      result.mapped.push({sku:step.sku,allInVariantId:step.allInVariantId,newVariantId:created.id});
      console.log('OK variant:',step.sku, '->',created.id);
    }
    // Ha az osszes SKU mar jol kapcsolodik, helyesbitjuk a korabbi hibas
    // vasarloi cimket. Sikertelen nevatiras eseten NEM archiválunk forrast.
    if(plan.correctedTitle) {
      result.titleCorrected=await correctProductTitle(plan.target.id,plan.target.handle,plan.correctedTitle);
      // Csak a megjelenitendo Shopify nevet frissitjuk az AllIn mappingban;
      // sem SKU, sem keszlet, sem belso termeknev nem valtozik.
      await client.query(`UPDATE aif_shopify_variant_map
        SET shopify_product_title=$2, updated_at=now()
        WHERE shopify_product_id=$1 AND shopify_product_title IS DISTINCT FROM $2`,
        [plan.target.id,plan.correctedTitle]);
    }
    // Source products are archived only once EVERY original SKU is safely remapped.
    for(const old of plan.oldProducts) {
      const stock=await client.query(`SELECT count(*)::int AS n FROM aif_shopify_variant_map WHERE shopify_product_id=$1`,[old.id]);
      assert(Number(stock.rows[0]?.n)===0,'SOURCE_STILL_MAPPED','Egy régi termékhez még AllIn mapping tartozik.',old.id);
      const products=await getProducts([old.id]);
      const live=products.get(old.id);
      if(live.status==='ACTIVE') await archiveProduct(live);
      result.archived.push({id:old.id,handle:old.handle});
      for(const v of live.variants.nodes) {
        try {
          if (await zeroArchivedSourceStock(v)) result.inventoryCleared.push(v.sku);
        } catch(err) {
          result.warnings.push(`ARCHIVED_OLD_STOCK ${v.sku}: ${err.message}`);
        }
      }
      try {
        const warning=await redirectArchivedProduct(old.handle,plan.target.handle);
        if(warning) result.warnings.push(`REDIRECT ${old.handle}: ${warning}`);
        else result.redirects.push(`${old.handle} -> ${plan.target.handle}`);
      } catch(err) {result.warnings.push(`REDIRECT ${old.handle}: ${err.message}`);}
    }
    return result;
  } finally {client.release();}
}

/*
 * Catalog-wide safe candidates. Uncertain models, different colorways,
 * different image sets or name/product-type conflicts are always REVIEW.
 * Identical title alone is NEVER enough to merge two Shopify products.
 */
function automaticCandidate(family) {
  const products=(family.products || []).filter(x=>x.status==='ACTIVE');
  if(products.length<2) return {block:'not_duplicate'};
  if(products.length>12) return {block:'too_many_products'};
  if(products.some(p=>!(p.variants||[]).length)) return {block:'missing_family_variants'};
  const titles=new Set(products.map(p=>norm(p.title)));
  if(titles.size!==1 || ![...titles][0]) return {block:'different_titles'};
  const sizes=products.flatMap(p=>p.variants||[]).map(v=>norm(v.size));
  const skus=products.flatMap(p=>p.variants||[]).map(v=>norm(v.sku));
  if(sizes.some(x=>!x) || new Set(sizes).size!==sizes.length) return {block:'size_collision'};
  if(skus.some(x=>!x) || new Set(skus).size!==skus.length) return {block:'sku_collision'};
  const sorted=[...products].sort((a,b)=>
    (b.variants?.length||0)-(a.variants?.length||0) || a.handle.localeCompare(b.handle));
  return {settings:{
    label:`AUTO: ${sorted[0].title} / ${family.color || family.familyKey}`,
    target:sorted[0].productId,
    products:products.map(x=>x.productId),
    auto:true,
  }};
}

function assertAutomaticProductIdentity(plan) {
  const all=plan.shopifyProductSnapshots || [];
  assert(all.length>=2,'AUTO_FEW_PRODUCTS','Keves termek egyesiteshez.');
  const values=key=>new Set(all.map(x=>norm(x[key])));
  assert(values('title').size===1 && values('vendor').size===1 && values('productType').size===1,
    'AUTO_PRODUCT_DETAILS_DIFFER','Cim, marka vagy termektipus elter; kezi ellenorzes szukseges.');
  const categories=new Set(all.map(x=>str(x.category?.id)));
  assert(categories.size===1,'AUTO_CATEGORY_DIFFER','A Shopify termekkategoria nem egyezik.');
  const canonicalOptions=all.map(p=>(p.options||[]).map(o=>identityOfOption(o.name)).join('|'));
  assert(new Set(canonicalOptions).size===1 && canonicalOptions.every(x=>x==='color|size' || x==='size'),
    'AUTO_OPTIONS_DIFFER','A termekopciok szerkezete nem egyezik.');
  const colors=[...new Set(all.flatMap(p=>p.variants.nodes.map(v=>norm(selectedByKind(v,'color')))))];
  if(canonicalOptions[0]==='color|size') {
    assert(colors.length===1 && colors[0], 'AUTO_COLOR_NAMES_DIFFER',
      'Azonos modell-szinkod mellett Shopify szinmegnevezes elter; kezi ellenorzes.');
  }
  // Unlike an interactive merge, an automatic merge must never discard a
  // distinct source image. Variant-specific images and product hero photos
  // can have other product IDs; matching CDN URL is the safe subset.
  const heroUrls=new Set(all.map(p=>str(p.featuredImage?.url).split('?')[0]));
  assert(heroUrls.size===1,'AUTO_IMAGES_DIFFER',
    'A termekfotok elternek; automatikusan nem dobunk el kepet.');
  const hero=[...heroUrls][0];
  assert(hero,'AUTO_IMAGES_UNKNOWN','Termekkep hianyzik.');
  for(const product of all) for(const variant of product.variants.nodes) {
    assert(variant.metafields && variant.metafields.nodes?.length===0 && !variant.metafields.pageInfo?.hasNextPage,
      'AUTO_VARIANT_METAFIELDS', 'A variansnak kulon Shopify metafieldje van; automatikusan nem veszitjuk el.');
    const u=str(variant.image?.url).split('?')[0];
    assert(!u || u===hero,'AUTO_VARIANT_IMAGE_DIFFERS',
      'Kulon variansfoto van; kezi kep-egyesites kell.', {sku:variant.sku,image:u});
    assert(norm(variant.barcode)===norm(variant.sku) && str(variant.barcode),
      'AUTO_BARCODE_MISMATCH','SKU nem egyezik vonalkoddal.');
  }
  return true;
}

function batchFingerprint(plans) {
  const snapshot=plans.map(p=>({
    familyKey:p.familyKey,
    target:p.target.id,
    targetHandle:p.target.handle,
    oldProducts:p.oldProducts.map(x=>({id:x.id,handle:x.handle})).sort((a,b)=>a.id.localeCompare(b.id)),
    toMove:p.toMove.map(v=>({sku:v.sku,source:v.sourceProductId,size:v.size,
      ciuc:v.ciuc,kezdi:v.kezdi,oldVariantId:v.oldVariantId,oldInventoryItemId:v.oldInventoryItemId,
      allInVariantId:v.allInVariantId})).sort((a,b)=>a.sku.localeCompare(b.sku)),
  }));
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

async function autoBatchPlans(pool,locations,maxAuto) {
  const audit=await auditAifShopifyProductFamilies(pool,{limit:5000});
  // Audit exposes all active, confidently mapped model+color collisions.
  const candidates=[], review=[];
  for(const family of (audit.duplicates||[]).sort((a,b)=>a.familyKey.localeCompare(b.familyKey))) {
    const extracted=automaticCandidate(family);
    if(!extracted.settings) {
      review.push({familyKey:family.familyKey,reason:extracted.block,products:family.productCount});
      continue;
    }
    try {
      const plan=await buildFamilyPlan(pool,family.familyKey,extracted.settings,locations,audit);
      if(plan.status!=='ready') throw Object.assign(new Error(plan.status),{code:'NO_READY_PLAN'});
      assertAutomaticProductIdentity(plan);
      candidates.push(plan);
    } catch(e) {
      review.push({familyKey:family.familyKey,reason:e.code||'CHECK_FAILED',message:e.message,products:family.productCount});
    }
  }
  const selected=candidates.slice(0,maxAuto);
  return {audit,count: candidates.length,selected,skipped: candidates.slice(maxAuto).length,
    review,fingerprint:batchFingerprint(selected)};
}

async function runAutomaticBatch(pool,locations,args) {
  const batch=await autoBatchPlans(pool,locations,args.maxAuto);
  console.log('\n=== TELJES KATALÓGUS: BIZTOS EGYESÍTÉSEK ===');
  console.table(batch.selected.map(x=>({
    csalad:x.familyKey,termek:x.target.handle,atvezetendo:x.toMove.length,
    archivalt:x.oldProducts.length,
  })));
  console.log('Tovabbi biztos jeloltek:',batch.skipped);
  console.log('Kezi vizsgalatos csaladok:',batch.review.length);
  console.table(batch.review.slice(0,35));
  console.log('TERV UJJLENYOMAT:',batch.fingerprint);
  if(!args.applyAuto) {
    if(batch.selected.length) {
      console.log(`Csak a biztos jeloltek futtatasahoz: node scripts/aifShopifyFamilyMerge.mjs --apply-auto --max-auto ${args.maxAuto} --confirm ${batch.fingerprint}`);
    } else {
      console.log('NINCS automatikusan biztonságosan egyesíthető család. Az üres terv hash-e NEM végrehajtási engedély.');
    }
    for(const row of batch.review) {
      if(FAMILIES[row.familyKey]) {
        console.log(`Külön, felügyelt tervellenőrzés: node scripts/aifShopifyFamilyMerge.mjs --plan --family '${row.familyKey}'`);
      }
    }
    return;
  }
  assert(batch.selected.length,'NO_SAFE_CANDIDATES','Nincs automatikusan biztonsagos csalad.');
  assert(args.confirm===batch.fingerprint,'BATCH_CHANGED',
    'A katalógus vagy készlet megvaltozott a terv ota; uj tervellenorzes szukseges.',{
      expected:batch.fingerprint,provided:args.confirm,
    });
  const outcomes=[];
  for(const plan of batch.selected) {
    console.log('\nEGYESITES:',plan.familyKey);
    // Source, mapping and stock are re-read in applyPlan before every write.
    const result=await applyPlan(pool,plan,locations);
    outcomes.push({familyKey:plan.familyKey,result});
    if(result.warnings.length) {
      console.error('FIGYELMEZTETES - a tobbi csaladot nem inditom el.');
      process.exitCode=2;
      break;
    }
  }
  logJson('CSOPORTOS EGYESITES EREDMENYE',outcomes);
}

async function main(){
  const args=parseArgs(process.argv.slice(2));
  if(args.help){
    console.log('node scripts/aifShopifyFamilyMerge.mjs --plan [--family <familyKey>]');
    console.log('node scripts/aifShopifyFamilyMerge.mjs --apply --family <familyKey> --confirm <target-handle>');
    console.log('node scripts/aifShopifyFamilyMerge.mjs --plan-auto [--max-auto 5]');
    console.log('node scripts/aifShopifyFamilyMerge.mjs --apply-auto --max-auto 5 --confirm <64-character plan hash>');
    return;
  }
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
  let lock=null;
  try {
    const locations=managedLocations();
    if(args.apply || args.applyAuto) {
      assert(['1','true','yes','on'].includes(norm(process.env.SHOPIFY_SYNC_ENABLED)),
        'SHOPIFY_SYNC_DISABLED','A készletszinkron nincs bekapcsolva, nem végzünk átállítást.');
      lock=await acquireAifShopifyProcessLock(pool);
      assert(lock?.locked,'PROCESSOR_BUSY','Shopify szinkron masik instance-on fut; most ne egyesits.');
      await ensureAifShopifyTables(pool);
    }
    if(args.planAuto || args.applyAuto) {
      await runAutomaticBatch(pool,locations,args);
      return;
    }
    const keys=args.family ? [args.family] : Object.keys(FAMILIES);
    for(const key of keys){
      const setting=FAMILIES[key];
      assert(setting,'UNKNOWN_FAMILY','Ismeretlen termekcsalad.',key);
      let plan;
      try {
        plan=await buildFamilyPlan(pool,key,setting,locations);
      } catch(error) {
        if(args.apply) throw error;
        logJson(`BLOKKOLT TERV: ${setting.label}`,{
          familyKey:key, status:'blocked',code:error.code||'error',error:error.message,details:error.details||null,
        });
        process.exitCode=2;
        continue;
      }
      if(!args.apply) {
        const {shopifyProductSnapshots,...safe}=plan;
        logJson(`TERV: ${setting.label}`,safe);
        continue;
      }
      assert(plan.status==='ready','PLAN_NOT_READY','A terv nem biztonsagos / a duplikacio mar nem aktiv.',plan);
      assert(args.confirm===plan.target.handle,'BAD_CONFIRM',`Pontos handle megerosites szukseges: --confirm ${plan.target.handle}`);
      const outcome=await applyPlan(pool,plan,locations);
      logJson('EGYESITES EREDMENYE',outcome);
      if(outcome.warnings.length) process.exitCode=2;
    }
  } catch(err) {
    console.error('\nEGYESITES BLOKKOLVA:',err.code||'ERROR',err.message);
    if(err.details) console.dir(err.details,{depth:5});
    process.exitCode=1;
  } finally {
    if(lock) await lock.release();
    await pool.end();
  }
}
await main();
