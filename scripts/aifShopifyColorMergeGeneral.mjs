/**
 * AllInFashion Shopify színcsaládok általános, célzott egyesítése.
 *
 * 2026-11-16: kizárólag a hat, élő adatokkal TECHNICAL_OK állapotú
 * Under Armour modell engedélyezett, nem a 28 család vak összevonására való.
 *
 * A család termékazonosítóit/friss színeit Shopify + AllIn mapping alapján
 * fedezi fel, ezért nem támaszkodik a Render ideiglenes reports/ könyvtárára.
 * PLAN read-only; APPLY csak aktuális SHA-256 tervvel, DB advisory lock alatt.
 * Félbeszakadt műveletek felismerése és folytatása a kipróbált sapka-egyesítő
 * biztonsági ellenőrzéseivel. A forrás termékek csak teljes verifikáció után
 * kerülnek archiválásra, SKU/ár/készlet/variánsfotó megőrzésével.
 *
 * node scripts/aifShopifyColorMergeGeneral.mjs --self-test
 * node scripts/aifShopifyColorMergeGeneral.mjs --plan --model 1373126
 * node scripts/aifShopifyColorMergeGeneral.mjs --apply --model 1373126 --confirm <terv SHA-256>
 */
import { createHash } from 'node:crypto';
import pg from 'pg';
import {
  shopifyGraphql,
  acquireAifShopifyProcessLock,
  ensureAifShopifyTables,
  enqueueAifShopifyVariant,
} from '../api/lib/aifShopify.js';

// A 2026-11-16-i készlet- és fotóaudit alapján TECHNICAL_OK modellek.
// A felhasználó által jóváhagyott terv nélkül egyik sem módosítható.
const ELIGIBLE_MODELS = Object.freeze([
  '1326799', '1373126', '1383648', '1386793', '6000211', '6012778',
]);
const FAMILIES = Object.create(null);
const ID = 'gid://shopify/Product/';
const str = v => String(v ?? '').trim();
const norm = v => str(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const money = v => v === null || v === undefined || v === '' ? null : String(v);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const checksum = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fail(code, message, details) { const e=new Error(message);e.code=code;e.details=details;throw e; }
function ensure(ok, code, message, details) { if(!ok) fail(code,message,details); }
function optionKind(name) {
  const n=norm(name);
  return ['culoare','color','colour','szin'].includes(n) ? 'color' :
    ['marime','size','meret','taille'].includes(n) ? 'size' : '';
}
function optionOf(v,kind) { return str((v?.selectedOptions || []).find(o=>optionKind(o.name)===kind)?.value); }
function qty(level,name) { return Number((level?.quantities||[]).find(x=>x.name===name)?.quantity || 0); }
const baseUrl = v => str(v).split('?')[0];
function locations() {
  const list=[
    {key:'ciuc', shop: str(process.env.SHOPIFY_LOCATION_CSIKSZEREDA_ID), aif:str(process.env.AIF_LOCATION_CSIKSZEREDA_ID)},
    {key:'kezdi', shop:str(process.env.SHOPIFY_LOCATION_KEZDI_ID), aif:str(process.env.AIF_LOCATION_KEZDI_ID)},
  ];
  ensure(list.every(x=>x.aif&&x.shop),'LOCATION_MISSING','A két üzlet Shopify/AllIn helyszínazonosítója szükséges.');
  return list;
}
const PRODUCTS = `query AifColourMergeProduct($id:ID!) {
  product(id:$id) {
    id handle title vendor status productType tags category { id }
    featuredImage { id url }
    options { id name position values }
    media(first:100) { pageInfo {hasNextPage} nodes {
      id alt mediaContentType status
      ... on MediaImage { image {id url} }
    } }
    variants(first:100) { pageInfo {hasNextPage} nodes {
      id sku barcode title price compareAtPrice taxable inventoryPolicy
      image {id url}
      selectedOptions {name value}
      metafields(first:1) {pageInfo {hasNextPage} nodes {id}}
      inventoryItem {
        id sku tracked requiresShipping harmonizedSystemCode
        countryCodeOfOrigin provinceCodeOfOrigin
        unitCost {amount currencyCode}
        measurement {weight {value unit}}
        inventoryLevels(first:50) {pageInfo {hasNextPage} nodes {
          location {id name}
          quantities(names:["available","on_hand","committed"]) {name quantity}
        }}
      }
    }}
  }
}`;
async function readProduct(id) {
  const r=await shopifyGraphql(PRODUCTS,{id});
  const p=r.data?.product;
  ensure(p?.id===id,'PRODUCT_NOT_FOUND','Shopify termék nem található.',id);
  ensure(!p.variants?.pageInfo?.hasNextPage,'VARIANT_PAGINATION','100-nál több variáns: hiányos lenne az ellenőrzés.',p.handle);
  ensure(!p.media?.pageInfo?.hasNextPage,'MEDIA_PAGINATION','100-nál több kép: hiányos lenne a lista.',p.handle);
  for(const v of p.variants.nodes) ensure(!v.inventoryItem?.inventoryLevels?.pageInfo?.hasNextPage,
    'LOCATION_PAGINATION','Helyszínlista csonkolódna.',v.id);
  return p;
}
async function activeModelProducts(family) {
  const actual=[];
  let after=null;
  const cursors=new Set();
  for(let page=0;page<100;page++) {
    const r=await shopifyGraphql(`query AifColourMergeList($after:String) {
      products(first:250,after:$after) { pageInfo{hasNextPage endCursor} nodes {id handle status} }
    }`,{after});
    const group=r.data?.products;
    ensure(group?.pageInfo,'CATALOG_SCAN_FAILED','Nem sikerült a teljes Shopify-katalógust beolvasni.');
    const model=family.modelCode.split(':')[1];
    const pattern=new RegExp(`(^|[^0-9])${model}([^0-9]|$)`);
    for(const p of group.nodes||[]) if(p.status==='ACTIVE' && pattern.test(p.handle||'')) actual.push(p);
    if(!group.pageInfo.hasNextPage) return actual;
    after=group.pageInfo.endCursor;
    ensure(after && !cursors.has(after),'CATALOG_SCAN_INCOMPLETE','Ismétlődő Shopify lapozási kurzor.');
    cursors.add(after);
  }
  fail('CATALOG_SCAN_LIMIT','Nem olvasható be a teljes Shopify-katalógus.');
}
const EXACT_SKU = `query AifColourMergeSku($query:String!) {
  productVariants(first:50,query:$query) {pageInfo{hasNextPage} nodes{id sku product{id status}}}
}`;
async function exactSku(sku) {
  const r=await shopifyGraphql(EXACT_SKU,{query:`sku:"${str(sku).replaceAll('\\','\\\\').replaceAll('"','\\"')}"`});
  const connection=r.data?.productVariants;
  ensure(connection && !connection.pageInfo.hasNextPage,'SKU_SEARCH_INCOMPLETE','SKU keresés túl sok találat.',sku);
  return (connection.nodes||[]).filter(x=>norm(x.sku)===norm(sku));
}
async function readMappings(db,variantIds,locs) {
  const r=await db.query(`SELECT m.variant_id::text AS variant_id, m.sku AS mapped_sku,
    m.shopify_product_id,m.shopify_variant_id,m.shopify_inventory_item_id,
    v.barcode,v.size,v.color_code,v.color_name, v.status AS variant_status,
    pm.model_code,pm.status AS model_status,
    COALESCE(sum(GREATEST(COALESCE(s.qty,0)-COALESCE(s.reserved_qty,0),0)) FILTER(WHERE s.location_id::text=$2),0)::int AS ciuc,
    COALESCE(sum(GREATEST(COALESCE(s.qty,0)-COALESCE(s.reserved_qty,0),0)) FILTER(WHERE s.location_id::text=$3),0)::int AS kezdi,
    COALESCE(sum(GREATEST(COALESCE(s.qty,0),0)) FILTER(WHERE COALESCE(l.code,'')<>'online_shop' AND s.location_id::text NOT IN($2,$3)),0)::int AS other_qty,
    COALESCE(sum(COALESCE(s.reserved_qty,0)),0)::int AS reserved
    FROM aif_shopify_variant_map m
    JOIN aif_product_variants v ON v.id=m.variant_id
    JOIN aif_product_models pm ON pm.id=v.model_id
    LEFT JOIN aif_stock s ON s.variant_id=m.variant_id
    LEFT JOIN aif_locations l ON l.id=s.location_id
    WHERE m.variant_id::text=ANY($1::text[])
    GROUP BY m.variant_id,m.sku,m.shopify_product_id,m.shopify_variant_id,m.shopify_inventory_item_id,v.id,pm.id`,
    [variantIds,locs[0].aif,locs[1].aif]);
  return new Map(r.rows.map(x=>[x.variant_id,x]));
}
async function readMappingsByShopify(db, productIds, locs) {
  const r=await db.query(`SELECT m.variant_id::text AS variant_id, m.sku AS mapped_sku,
    m.shopify_product_id,m.shopify_variant_id,m.shopify_inventory_item_id,
    v.barcode,v.size,v.color_code,v.color_name, v.status AS variant_status,
    pm.model_code,pm.status AS model_status,
    COALESCE(sum(GREATEST(COALESCE(s.qty,0)-COALESCE(s.reserved_qty,0),0)) FILTER(WHERE s.location_id::text=$2),0)::int AS ciuc,
    COALESCE(sum(GREATEST(COALESCE(s.qty,0)-COALESCE(s.reserved_qty,0),0)) FILTER(WHERE s.location_id::text=$3),0)::int AS kezdi,
    COALESCE(sum(GREATEST(COALESCE(s.qty,0),0)) FILTER(WHERE COALESCE(l.code,'')<>'online_shop' AND s.location_id::text NOT IN($2,$3)),0)::int AS other_qty,
    COALESCE(sum(COALESCE(s.reserved_qty,0)),0)::int AS reserved
    FROM aif_shopify_variant_map m
    JOIN aif_product_variants v ON v.id=m.variant_id
    JOIN aif_product_models pm ON pm.id=v.model_id
    LEFT JOIN aif_stock s ON s.variant_id=m.variant_id
    LEFT JOIN aif_locations l ON l.id=s.location_id
    WHERE m.shopify_product_id=ANY($1::text[])
    GROUP BY m.variant_id,m.sku,m.shopify_product_id,m.shopify_variant_id,m.shopify_inventory_item_id,v.id,pm.id`,
    [productIds,locs[0].aif,locs[1].aif]);
  return r.rows;
}
// Discover exact source product IDs at execution time. No ephemeral JSON files,
// no name-only family matching; every Shopify SKU must belong to the same AllIn
// model and exact supplier colour code, including already archived sources.
function pickTarget(entries) {
  const preferred=entries.find(x=>x.code==='001');
  return preferred || [...entries].sort((a,b)=>a.code.localeCompare(b.code,'en',{numeric:true}) || a.product.id.localeCompare(b.product.id))[0];
}
async function discoverFamily(db, model, locs) {
  ensure(ELIGIBLE_MODELS.includes(model),'MODEL_NOT_ALLOWED',
    'Csak a hat ellenőrzött modell támogatott.');
  const pattern=new RegExp(`^under-armour-${model}-([a-z0-9]+)$`,'i');
  const candidates=[];
  const known=new Set();
  let after=null;
  for(let page=0;page<100;page++) {
    const r=await shopifyGraphql(`query AifGeneralColorDiscovery($after:String){
      products(first:250,after:$after){pageInfo{hasNextPage endCursor}nodes{id handle status}}
    }`,{after});
    const conn=r.data?.products;
    ensure(conn?.pageInfo,'CATALOG_DISCOVERY_FAILED','A Shopify terméklista nem olvasható.');
    for(const product of conn.nodes||[]) {
      const hit=pattern.exec(str(product.handle));
      if(hit) {
        ensure(!known.has(product.id),'DUPLICATE_PRODUCT_ID','Termékazonosító ismétlődött.',product.id);
        known.add(product.id);
        candidates.push({...product,code:hit[1].toLowerCase()});
      }
    }
    if(!conn.pageInfo.hasNextPage)break;
    after=conn.pageInfo.endCursor;
    ensure(after && page<99,'PRODUCT_SCAN_PAGINATION','Csonkolt Shopify-terméklista.');
  }
  ensure(candidates.length>=2 && candidates.length<=20,'UNEXPECTED_FAMILY_SIZE',
    'A modellhez nem 2–20 pontosan azonosított termék tartozik.',
    {model,products:candidates});
  const codes=new Set();
  for(const c of candidates) {
    ensure(!codes.has(c.code),'DUPLICATE_COLOR_CODE','Két termék ugyanazt a színkódot viseli.',c.code);
    codes.add(c.code);
    ensure(['ACTIVE','ARCHIVED'].includes(c.status),'MODEL_PRODUCT_NOT_ACTIVE',
      'Draft vagy más státuszú modelltermék van, kézi ellenőrzés kell.',c);
  }
  const targetEntry=pickTarget(candidates.map(c=>({code:c.code,product:c})));
  ensure(targetEntry.product.status==='ACTIVE','TARGET_ARCHIVED','A kiválasztott főtermék már archivált.',targetEntry);
  const products=[];
  for(const c of candidates) {
    const p=await readProduct(c.id);
    ensure(p.id===c.id && p.handle===c.handle && p.status===c.status,
      'DISCOVERY_CHANGED','A termék a lista beolvasása közben megváltozott.',c);
    products.push({...c,product:p});
  }
  const mappings=await readMappingsByShopify(db,candidates.map(x=>x.id),locs);
  const bySku=new Map();
  for(const m of mappings) {
    const sku=norm(m.mapped_sku);
    ensure(sku && !bySku.has(sku),'SKU_MAPPING_DUPLICATE',
      'Az AllIn több variánst köt ugyanahhoz az SKU-hoz.',sku);
    bySku.set(sku,m);
  }
  const modelCode=`under_armour:${model}`;
  const pTarget=products.find(x=>x.id===targetEntry.product.id)?.product;
  ensure(pTarget,'TARGET_MISSING','A főtermék eltűnt.');
  for(const x of products) {
    const {product:p,code}=x;
    ensure(norm(p.vendor).replace(/[^a-z0-9]/g,'').includes('underarmour'),
      'BRAND_MISMATCH','A modellhez idegen márkájú termék került.',p.handle);
    ensure(norm(p.title)===norm(pTarget.title),'TITLE_REVIEW_REQUIRED',
      'Eltérő terméknevek: a család még nem ellenőrzött.',
      {handle:p.handle,title:p.title,targetTitle:pTarget.title});
    ensure(p.variants.nodes.length>0,'EMPTY_MODEL_PRODUCT','Üres Shopify-termék.',p.handle);
    for(const v of p.variants.nodes) {
      const m=bySku.get(norm(v.sku));
      ensure(m && norm(m.model_code)===norm(modelCode),'UNMAPPED_MODEL_VARIANT',
        'SKU másik modellhez tartozik vagy nincs AllIn-ben.',{product:p.handle,sku:v.sku});
      if(p.id!==pTarget.id) ensure(norm(m.color_code)===norm(code),'SOURCE_COLOUR_CODE_MISMATCH',
        'A régi termék színkódja és az AllIn színkódja nem egyezik.',
        {handle:p.handle,sku:v.sku,handleColor:code,allInColor:m.color_code});
    }
  }
  const sourceProducts=products.filter(x=>x.id!==pTarget.id);
  ensure(sourceProducts.length>=1 && sourceProducts.some(x=>x.status==='ACTIVE') ||
    sourceProducts.every(x=>x.status==='ARCHIVED'),
    'SOURCE_STATUS_INVALID','Hiányzó vagy nem várt forrástermék-állapot.');
  return {
    label:`Under Armour ${model} színcsoport (ellenőrzött)`,
    modelCode,
    targetId:pTarget.id,targetHandle:pTarget.handle,title:pTarget.title,
    verifiedColorLabels:{},
    codes:Object.fromEntries(products.map(x=>[x.code,x.id.slice(ID.length)])),
  };
}

function checkedStock(v,m,locs,{sourceCheck=true}={}) {
  ensure(m && m.variant_status==='active' && m.model_status==='active','INACTIVE_MAPPING','AllIn variáns inaktív.',v.sku);
  ensure(Number(m.reserved)===0 && Number(m.other_qty)===0,'RESERVATION_OR_OUTSIDE_STOCK',
    'Lefoglalt vagy a két bolton kívüli készlet van. Egyesítés tiltva.',{sku:v.sku,reserved:m.reserved,other:m.other_qty});
  ensure(v.inventoryPolicy==='DENY' && v.inventoryItem?.tracked && v.inventoryItem?.requiresShipping,
    'INVENTORY_RULES','Nem megfelelő Shopify készletkövetés.',v.sku);
  const levels=v.inventoryItem.inventoryLevels.nodes;
  const allowed=new Set(locs.map(x=>x.shop));
  for(const lvl of levels) if(!allowed.has(lvl.location.id)) ensure(qty(lvl,'on_hand')===0&&qty(lvl,'committed')===0,
    'UNMANAGED_STOCK','Nem kezelt Shopify-helyszínen készlet vagy foglalás található.',{sku:v.sku,location:lvl.location.name});
  for(const loc of locs) {
    const lvl=levels.find(x=>x.location.id===loc.shop);
    const actual=lvl?qty(lvl,'available'):0;
    const onHand=lvl?qty(lvl,'on_hand'):0;
    const committed=lvl?qty(lvl,'committed'):0;
    ensure(!sourceCheck || (committed===0&&onHand===actual&&actual===Number(m[loc.key])),
      'STOCK_MISMATCH','Shopify és AllIn mennyiség nem egyezik, vagy rendelés foglalja.',
      {sku:v.sku,location:loc.key,allin:m[loc.key],actual,onHand,committed});
  }
}
function imageForVariant(p,v) {
  const u=baseUrl(v.image?.url || p.featuredImage?.url);
  const m=(p.media?.nodes||[]).find(x=>x.mediaContentType==='IMAGE' && baseUrl(x.image?.url)===u);
  ensure(u && m?.id && m?.image?.url,'VARIANT_PHOTO_UNKNOWN',
    'A variáns fotója nem azonosítható a termék képgalériájában.',{sku:v.sku,url:u});
  return m;
}
function mediaTag(model,sourceId,mediaId) {
  return `AIF-COLOR-${model}-${sourceId.split('/').pop()}-${mediaId.split('/').pop()}`;
}
function chooseColorLabels(colors, trustedNames = {}) {
  const groups=new Map();
  for(const c of colors) {
    const clean=str(c.colorOption);
    const recognized=clean && norm(clean)!==norm(c.code) && !/^\d{1,4}$/.test(clean);
    const db=str(c.dbName);
    const dbHuman=db && !/^\d{1,4}$/.test(db);
    const trusted=str(trustedNames[c.code]);
    const human=recognized?clean: (dbHuman?db: (trusted||c.code));
    c.label=human;
    const key=norm(human);
    groups.set(key,[...(groups.get(key)||[]),c]);
  }
  for(const group of groups.values()) if(group.length>1) {
    for(const c of group) c.label=`${c.label} (${c.code})`;
  }
  const seen=new Set();
  for(const c of colors) {
    ensure(c.label && !seen.has(norm(c.label)),'COLOR_LABEL_COLLISION','Két színváltozat azonos opciócímkét kapna.',c);
    seen.add(norm(c.label));
  }
  return colors;
}
function variantInput(v,m,optionValues,locs,mediaId) {
  const inventoryItem={sku:v.sku,tracked:true,requiresShipping:true};
  if(v.inventoryItem.unitCost?.amount!=null) inventoryItem.cost=v.inventoryItem.unitCost.amount;
  for(const name of ['harmonizedSystemCode','countryCodeOfOrigin','provinceCodeOfOrigin'])
    if(v.inventoryItem[name]) inventoryItem[name]=v.inventoryItem[name];
  if(v.inventoryItem.measurement?.weight?.value!=null)
    inventoryItem.measurement={weight:v.inventoryItem.measurement.weight};
  return {
    barcode:v.barcode || v.sku,
    price:money(v.price),
    ...(money(v.compareAtPrice)!==null?{compareAtPrice:money(v.compareAtPrice)}:{}),
    taxable:v.taxable!==false,
    inventoryPolicy:v.inventoryPolicy,
    inventoryItem,
    optionValues,
    mediaId,
    inventoryQuantities:locs.map(loc=>({locationId:loc.shop,availableQuantity:Number(m[loc.key])})),
  };
}
function parseArgs(args) {
  const out={model:'',plan:false,apply:false,confirm:'',selfTest:false};
  for(let i=0;i<args.length;i++) {
    const x=args[i];
    if(x==='--model') out.model=args[++i] || '';
    else if(x==='--plan') out.plan=true;
    else if(x==='--apply') out.apply=true;
    else if(x==='--confirm') out.confirm=args[++i] || '';
    else if(x==='--self-test') out.selfTest=true;
    else if(x==='--help') out.help=true;
    else fail('BAD_ARGUMENT',`Ismeretlen paraméter: ${x}`);
  }
  if(!out.help && !out.selfTest) {
    ensure(ELIGIBLE_MODELS.includes(out.model),'UNKNOWN_MODEL',`Csak a hat ellenőrzött modell támogatott: ${ELIGIBLE_MODELS.join(', ')}`);
    ensure(!(out.plan && out.apply),'BAD_MODE','A --plan és --apply nem használható együtt.');
    if(out.apply) ensure(/^[a-f0-9]{64}$/.test(out.confirm),'PLAN_HASH_REQUIRED','A --apply futtatásához --confirm <terv SHA-256> kell.');
  }
  return out;
}
function compact(p) {return {id:p.id,handle:p.handle,variantCount:p.variants.nodes.length};}
async function makePlan(db, model, locs) {
  const family=FAMILIES[model];
  const expected=Object.entries(family.codes).map(([code,uid])=>({code,id:ID+uid,handle:`under-armour-${model}-${code}`}));
  const active=await activeModelProducts(family);
  const expectedActive=expected.map(x=>x.id).sort();
  // After a partial run some products may have been archived; every remaining
  // ACTIVE product must still be from the exact verified allowlist.
  ensure(active.every(x=>expectedActive.includes(x.id)),'UNKNOWN_ACTIVE_PRODUCT',
    'Új Shopify-terméket találtunk a modellben; új audit szükséges.',active);
  const all=[];
  for(const ex of expected) {
    const p=await readProduct(ex.id);
    ensure(p.handle===ex.handle,'PRODUCT_HANDLE_CHANGED','Termékhandle megváltozott.',{expected:ex.handle,actual:p.handle});
    ensure(p.title===family.title,'PRODUCT_NAME_CHANGED','Terméknév megváltozott, nem automatikus egyesítés.',p.handle);
    ensure(p.vendor && norm(p.vendor).includes('under armour'),'VENDOR_UNEXPECTED','Márka eltér.',p.vendor);
    ensure(p.status==='ACTIVE' || p.status==='ARCHIVED','PRODUCT_STATUS_UNEXPECTED','Ismeretlen Shopify státusz.',p.handle);
    ensure(p.options?.length===2 && optionKind(p.options[0].name)==='color' && optionKind(p.options[1].name)==='size',
      'PRODUCT_OPTION_UNEXPECTED','Nem Szín + Méret opciókat tartalmaz.',{handle:p.handle,options:p.options});
    ensure(p.variants.nodes.length>=1,'EMPTY_PRODUCT','Üres színváltozatú termék.',p.handle);
    ensure((p.media?.nodes||[]).every(m=>m.mediaContentType==='IMAGE'),
      'NON_IMAGE_MEDIA','Nem képalapú médiát nem archiválunk másolás nélkül.',p.handle);
    ensure((p.media?.nodes||[]).filter(m=>m.mediaContentType==='IMAGE').length>=1,'IMAGE_MISSING','Hiányzik a termékfotó.',p.handle);
    all.push({...ex,product:p});
  }
  const target=all.find(x=>x.id===family.targetId).product;
  ensure(target.status==='ACTIVE','TARGET_INACTIVE','A kijelölt főtermék nem aktív.');
  const categories=new Set(all.map(x=>str(x.product.category?.id)));
  const types=new Set(all.map(x=>norm(x.product.productType)));
  ensure(categories.size===1 && types.size===1,'DIFFERENT_PRODUCT_CLASS','Különböző termékkategória vagy terméktípus.');
  const oldPairs=[];
  const targetSkus=new Map(target.variants.nodes.map(v=>[norm(v.sku),v]));
  ensure(targetSkus.size===target.variants.nodes.length,'TARGET_DUPLICATE_SKU','Ugyanaz az SKU a céltermékben kétszer.');
  const allKnownIds=all.flatMap(x=>x.product.variants.nodes.map(v=>v.id));
  ensure(new Set(allKnownIds).size===allKnownIds.length,'VARIANT_ID_DUPLICATE','Shopify variánsazonosító ütközés.');
  // Reverse lookup of mappings for source and already-created destination variants.
  const mRows=await readMappingsByShopify(db,expected.map(x=>x.id),locs);
  const mappingBySku=new Map();
  for(const m of mRows) {
    const k=norm(m.mapped_sku);
    ensure(!mappingBySku.has(k),'MAPPED_SKU_DUPLICATE','Azonos SKU többször AllIn-hez kötve.',k);
    mappingBySku.set(k,m);
  }
  const sourceSkus=new Set();
  const groupedColors=[];
  for(const {code,product:p} of all) {
    const cLabels=new Set(p.variants.nodes.map(v=>norm(optionOf(v,'color'))));
    // During a resumed merge the target may contain several colours; skip this
    // single-colour invariant ONLY for the selected destination product.
    if(p.id!==target.id) ensure(cLabels.size===1 && !cLabels.has(''),'COLOR_OPTION_AMBIGUOUS',
      'Egy régi Shopify-terméken több szín található.',{handle:p.handle,colors:[...cLabels]});
    if(p.id!==target.id) {
      const sourcePhotos=[];
      for(const media of p.media.nodes) {
        ensure(media.image?.url && /^https:\/\//.test(media.image.url),'MEDIA_SOURCE_MISSING','A termékkép nem publikus HTTPS URL.',p.handle);
        sourcePhotos.push({id:media.id,url:media.image.url,alt:media.alt || '',tag:mediaTag(model,p.id,media.id)});
      }
      const perColor=[];
      for(const v of p.variants.nodes) {
        const m=mappingBySku.get(norm(v.sku));
        ensure(v.sku && v.barcode && norm(v.sku)===norm(v.barcode),
          'SKU_EAN_DIFFER','SKU és vonalkód különbözik vagy hiányzik.',v.id);
        ensure(m && norm(m.barcode)===norm(v.sku) && norm(m.mapped_sku)===norm(v.sku),
          'MAPPING_MISSING','Nincs pontos AllIn összerendelés.',v.sku);
        ensure(norm(m.model_code)===norm(family.modelCode) && norm(m.color_code)===norm(code) && norm(m.size)===norm(optionOf(v,'size')),
          'SOURCE_IDENTITY_MISMATCH','AllIn modell–szín–méret eltérés.',{sku:v.sku,expectedCode:code,actual:m});
        ensure(m.shopify_variant_id===v.id || targetSkus.get(norm(v.sku))?.id===m.shopify_variant_id,
          'MAPPING_MOVED_ELSEWHERE','A Shopify variánstérkép más termékre mutat.',v.sku);
        ensure(m.shopify_product_id===p.id || m.shopify_product_id===target.id,'PRODUCT_MAP_CHANGED',
          'A variáns másik termékhez van párosítva.',v.sku);
        ensure(m.variant_status==='active' && m.model_status==='active','INACTIVE_ALLIN','Inaktív AllIn változat.',v.sku);
        ensure(Number(m.reserved)===0 && Number(m.other_qty)===0,'RESERVED_OR_OTHER_STOCK','Nem kezelt vagy foglalt készlet.',v.sku);
        ensure(v.inventoryItem?.id && v.inventoryItem.tracked && v.inventoryItem.requiresShipping && v.inventoryPolicy==='DENY',
          'SOURCE_INVENTORY_RULES','Nem standard készletkezelt variáns.',v.sku);
        ensure(!(v.metafields?.nodes?.length || v.metafields?.pageInfo?.hasNextPage),
          'SOURCE_VARIANT_METAFIELDS','Variáns-metafield van, melyet külön át kellene vezetni.',v.sku);
        const alreadyTarget=targetSkus.get(norm(v.sku)) || null;
        if(m.shopify_product_id===p.id) {
          ensure(m.shopify_inventory_item_id===v.inventoryItem.id && m.shopify_variant_id===v.id,
            'SOURCE_MAP_CHANGED','Forrás SKU/InventoryItem párosítás eltér.',v.sku);
          checkedStock(v,m,locs);
        } else {
          ensure(alreadyTarget?.id===m.shopify_variant_id && alreadyTarget?.inventoryItem?.id===m.shopify_inventory_item_id,
            'REPLAY_TARGET_MISMATCH','Korábbi egyesítés célvariánsa hibás.',v.sku);
          checkedStock(alreadyTarget,m,locs);
        }
        const image=imageForVariant(p,v);
        const ref=sourcePhotos.find(x=>x.id===image.id);
        ensure(ref,'SOURCE_PHOTO_UNMAPPED','Nem található a variáns eredeti fotója.',v.sku);
        const skuKey=norm(v.sku);
        ensure(!sourceSkus.has(skuKey),'SOURCE_SKU_DUPLICATED','Két színben azonos SKU szerepel.',v.sku);
        sourceSkus.add(skuKey);
        perColor.push({sku:v.sku,size:optionOf(v,'size'),price:v.price,compareAtPrice:v.compareAtPrice,photoUrl:ref.url,allInVariantId:m.variant_id,
          ciuc:m.ciuc,kezdi:m.kezdi, sourceVariantId:v.id, sourceInventoryId:v.inventoryItem.id,
          existingTargetVariantId:alreadyTarget?.id||null, alreadyMoved:m.shopify_product_id===target.id,
          imageSourceId:image.id,imageTag:ref.tag});
        oldPairs.push({code,product:p,variant:v,mapping:m,sourcePhotos,photo:ref,alreadyTarget});
      }
      groupedColors.push({code,sourceProductId:p.id,handle:p.handle,colorOption:optionOf(p.variants.nodes[0],'color'),
        dbName:str(mappingBySku.get(norm(p.variants.nodes[0].sku))?.color_name),photos:sourcePhotos,variants:perColor});
    } else {
      // Existing target includes the original 001 variants and possibly
      // previously copied variants from interrupted runs. Every SKU must map
      // either to its own original model colour or to an approved source SKU.
      for(const v of p.variants.nodes) {
        const m=mappingBySku.get(norm(v.sku));
        ensure(m && norm(m.barcode)===norm(v.sku),'TARGET_MAPPING_MISSING','Célterméken nem ismert SKU található.',v.sku);
        ensure(norm(m.model_code)===norm(family.modelCode),'TARGET_MODEL_MISMATCH','Más modell a célterméken.',v.sku);
        ensure(m.shopify_product_id===target.id || all.some(x=>x.id===m.shopify_product_id && x.id!==target.id),
          'TARGET_MAP_OUTSIDE_FAMILY','Más családhoz tartozó SKU a célterméken.',v.sku);
        checkedStock(v,m,locs,{sourceCheck:m.shopify_product_id===target.id});
      }
    }
  }
  // Every active source must contain exactly the approved variants; a half
  // completed run may have already archived one or more source products.
  const sourceSum=all.filter(x=>x.id!==target.id).reduce((n,x)=>n+x.product.variants.nodes.length,0);
  ensure(sourceSum===oldPairs.length,'SOURCE_COUNT_MISMATCH','Kihagyott forrásvariáns.');
  const colorList=chooseColorLabels(groupedColors,family.verifiedColorLabels);
  // A successful merge must never put supplier stock codes (012, 400, etc.)
  // into the customer-facing colour selector. Stop BEFORE any write if an
  // unverified label remains.
  for(const c of colorList) ensure(!/^\d{1,4}$/.test(str(c.label)),
    'COLOR_LABEL_UNVERIFIED','Az egyik Shopify-szín csak gyári kód. Ellenőrzött színnév szükséges.',
    {model,code:c.code,shopifyValue:c.colorOption,allInValue:c.dbName});
  // The surviving black colour is already in the target. A newly imported
  // colour with the same human label must keep its distinct supplier code.
  const targetColourLabels=new Set(target.variants.nodes
    .filter(v=>!sourceSkus.has(norm(v.sku)))
    .map(v=>norm(optionOf(v,'color'))));
  for(const color of colorList) if(targetColourLabels.has(norm(color.label))) {
    color.label=`${color.label} (${color.code})`;
  }
  const labelsByCode=new Map(colorList.map(x=>[x.code,x.label]));
  const seenOptions=new Map();
  for(const v of target.variants.nodes) {
    const key=`${norm(optionOf(v,'color'))}|${norm(optionOf(v,'size'))}`;
    ensure(!seenOptions.has(key),'DUPLICATE_TARGET_OPTIONS','Két azonos szín/méret a célterméken.',{sku:v.sku,key});
    seenOptions.set(key,v.sku);
  }
  for(const x of oldPairs) {
    const label=labelsByCode.get(x.code);
    const optKey=`${norm(label)}|${norm(optionOf(x.variant,'size'))}`;
    const existing=targetSkus.get(norm(x.variant.sku));
    if(existing) ensure(norm(optionOf(existing,'color'))===norm(label) && norm(optionOf(existing,'size'))===norm(optionOf(x.variant,'size')),
      'REPLAY_OPTION_MISMATCH','Már létrehozott variáns más szín/méret opciót kapott.',x.variant.sku);
    else ensure(!seenOptions.has(optKey),'OPTION_COLLISION','A célterméken azonos szín/méret, de más SKU található.',{sku:x.variant.sku,key:optKey});
    seenOptions.set(optKey,x.variant.sku);
  }
  const expectedSourceKeys=new Set(Object.keys(family.codes));
  ensure(all.length===expectedSourceKeys.size,'MODEL_COLOR_COUNT_CHANGED','A termékek száma nem egyezik az ellenőrzött listával.');
  const colorKeys=new Set(colorList.map(x=>x.code));
  ensure(colorKeys.size===all.length-1,'SOURCE_COLOR_COUNT_CHANGED','Hiányos színlista.',[...colorKeys]);
  ensure(target.variants.nodes.length + oldPairs.filter(x=>!x.alreadyTarget).length<=2048,
    'SHOPIFY_VARIANT_LIMIT','A Shopify termékvariáns-limit túllépve.');
  const snapshot={model,target:target.id,handle:target.handle,
    products:all.map(x=>({id:x.id,handle:x.handle,title:x.product.title,status:x.product.status,
      vendor:x.product.vendor,category:x.product.category?.id||null,productType:x.product.productType,
      tags:x.product.tags||[],
      variants:x.product.variants.nodes.map(v=>({id:v.id,sku:v.sku,barcode:v.barcode,
        price:v.price,compareAtPrice:v.compareAtPrice,taxable:v.taxable,
        inventoryPolicy:v.inventoryPolicy,inventoryItemId:v.inventoryItem?.id,
        size:optionOf(v,'size'),color:optionOf(v,'color'),image:baseUrl(v.image?.url),
        stock:(v.inventoryItem?.inventoryLevels?.nodes||[]).map(l=>({id:l.location.id,
          available:qty(l,'available'),onHand:qty(l,'on_hand'),committed:qty(l,'committed')}))
          .sort((a,b)=>a.id.localeCompare(b.id))})).sort((a,b)=>a.sku.localeCompare(b.sku))})),
    colorSteps:colorList.map(x=>({code:x.code,label:x.label,photoUrls:x.photos.map(p=>baseUrl(p.url)),
      variants:x.variants.map(v=>({sku:v.sku,size:v.size,ciuc:v.ciuc,kezdi:v.kezdi,alreadyMoved:v.alreadyMoved}))})),
  };
  const hash=checksum(snapshot);
  const finished=all.filter(x=>x.id!==target.id).every(x=>x.product.status==='ARCHIVED')
    && oldPairs.every(x=>x.mapping.shopify_product_id===target.id
      && x.variant.inventoryItem.inventoryLevels.nodes.every(l=>qty(l,'on_hand')===0));
  return {model, label:family.label, status:finished?'already_completed':'ready',
    target:{id:target.id,handle:target.handle,title:target.title,variants:target.variants.nodes.length},
    colors:colorList.map(x=>({code:x.code,label:x.label,from:x.handle,images:x.photos.length,
      variants:x.variants.map(v=>({sku:v.sku,size:v.size,price:v.price,stock:v.ciuc+v.kezdi,ciuc:v.ciuc,kezdi:v.kezdi,photo:v.photoUrl,alreadyMoved:v.alreadyMoved}))})),
    products:all.length, totalVariants:target.variants.nodes.length+oldPairs.filter(x=>!x.alreadyTarget).length,
    sourceProducts:all.filter(x=>x.id!==target.id).map(x=>({id:x.id,handle:x.handle,status:x.product.status})),
    hash, _all:all,_target:target,_oldPairs:oldPairs,_labels:labelsByCode,_locs:locs};
}

const UPDATE_MEDIA = `mutation AifColourMergeMedia($product:ProductUpdateInput!,$media:[CreateMediaInput!]) {
  productUpdate(product:$product,media:$media) {product{id} userErrors{field message}}
}`;
const CREATE_VARIANT = `mutation AifColourMergeCreate($id:ID!,$variants:[ProductVariantsBulkInput!]!) {
  productVariantsBulkCreate(productId:$id,strategy:PRESERVE_STANDALONE_VARIANT,variants:$variants) {
    productVariants {id sku barcode title selectedOptions{name value} inventoryItem{id}}
    userErrors {field message code}
  }
}`;
const ARCHIVE = `mutation AifColourMergeArchive($product:ProductUpdateInput!) {
  productUpdate(product:$product) {product{id status} userErrors{field message}}
}`;
const ZERO = `mutation AifColourMergeRetireStock($input:InventorySetQuantitiesInput!,$key:String!) {
  inventorySetQuantities(input:$input) @idempotent(key:$key) {
    inventoryAdjustmentGroup {createdAt}
    userErrors {field message code}
  }
}`;
const REDIRECT = `mutation AifColourMergeRedirect($urlRedirect:UrlRedirectInput!) {
  urlRedirectCreate(urlRedirect:$urlRedirect) {urlRedirect{id path target} userErrors{field message}}
}`;
const TAGS_ADD = `mutation AifColourMergeTags($id:ID!,$tags:[String!]!) {
  tagsAdd(id:$id,tags:$tags) {node{id} userErrors{field message}}
}`;
async function ensureImageOnTarget(model,targetId,src,sourceProductId,label) {
  const tag=mediaTag(model,sourceProductId,src.id);
  const matching=async()=>{
    const p=await readProduct(targetId);
    const candidates=p.media.nodes.filter(m=>m.mediaContentType==='IMAGE' && (
      str(m.alt).includes(tag) || baseUrl(m.image?.url)===baseUrl(src.url)
    ));
    ensure(candidates.length<=1,'MEDIA_DUPLICATED_ON_TARGET','Ugyanaz a forráskép többször a célterméken.',{tag,ids:candidates.map(x=>x.id)});
    return candidates[0] || null;
  };
  let media=await matching();
  if(!media) {
    const alt=`${FAMILIES[model].title} - ${label} [${tag}]`;
    const r=await shopifyGraphql(UPDATE_MEDIA,{product:{id:targetId},media:[{mediaContentType:'IMAGE',originalSource:src.url,alt}]});
    const p=r.data?.productUpdate;
    if(p?.userErrors?.length) fail('MEDIA_IMPORT_FAILED',p.userErrors.map(x=>x.message).join(' | '),p.userErrors);
    ensure(p?.product?.id===targetId,'MEDIA_IMPORT_UNVERIFIED','Nem sikerült a kép feltöltését elfogadtatni.');
  }
  for(let attempt=0;attempt<25;attempt++) {
    media=await matching();
    if(media && media.status==='READY' && media.image?.url) return media;
    if(media?.status==='FAILED') fail('IMAGE_PROCESSING_FAILED','A Shopify képfeldolgozás sikertelen.',tag);
    await sleep(1700);
  }
  fail('IMAGE_NOT_READY','A Shopify még nem készítette el a képvariánst; később a friss tervvel biztonságosan folytatható.',tag);
}
async function makeVariant(targetId,old,inp,srcId) {
  const r=await shopifyGraphql(CREATE_VARIANT,{id:targetId,variants:[inp]});
  const p=r.data?.productVariantsBulkCreate;
  if(p?.userErrors?.length) fail('VARIANT_CREATION_FAILED',p.userErrors.map(x=>x.message).join(' | '),p.userErrors);
  const v=p?.productVariants?.[0];
  ensure(p?.productVariants?.length===1 && norm(v?.sku)===norm(old.sku) && v?.inventoryItem?.id,
    'VARIANT_CREATION_UNVERIFIED','Nem igazolt a variánslétrehozás.',{sku:old.sku,source:srcId,p});
  return v;
}
async function verifyTargetVariant(targetId, old, mapped, expectedColor, mediaId, locs) {
  let p=null,v=null;
  for(let retry=0;retry<12;retry++) {
    p=await readProduct(targetId);
    v=p.variants.nodes.find(x=>norm(x.sku)===norm(old.sku));
    const img=p.media.nodes.find(x=>x.id===mediaId);
    if(v && v.inventoryItem?.inventoryLevels?.nodes?.length
      && img?.status==='READY' && baseUrl(v.image?.url)===baseUrl(img.image?.url)) break;
    await sleep(1200);
  }
  ensure(v && v.barcode===old.barcode && optionOf(v,'color')===expectedColor && optionOf(v,'size')===optionOf(old,'size'),
    'TARGET_VARIANT_CHANGED','Az új variáns EAN/szín/méret adata nem egyezik.',{sku:old.sku,v,expectedColor});
  const media=p.media.nodes.find(x=>x.id===mediaId);
  ensure(media && media.status==='READY','TARGET_MEDIA_MISSING','A céltermék képe eltűnt.',mediaId);
  ensure(baseUrl(v.image?.url)===baseUrl(media.image?.url),'VARIANT_IMAGE_NOT_LINKED',
    'A variánsnál nem a megfelelő szín képe látható.',{sku:v.sku,expected:media.image?.url,actual:v.image?.url});
  for(const loc of locs) {
    const level=v.inventoryItem.inventoryLevels.nodes.find(x=>x.location.id===loc.shop);
    ensure((level?qty(level,'available'):0)===Number(mapped[loc.key]) && (level?qty(level,'committed'):0)===0,
      'NEW_STOCK_MISMATCH','Új variáns készlete eltér az AllIn-től.',{sku:v.sku,location:loc.key});
  }
  return v;
}
async function ensureMediaAttached(targetId,variantId,mediaId) {
  const r=await shopifyGraphql(`mutation AifColourMergeMediaAttach($productId:ID!,$variantMedia:[ProductVariantAppendMediaInput!]!) {
    productVariantAppendMedia(productId:$productId,variantMedia:$variantMedia) {product{id} userErrors{field message}}
  }`,{productId:targetId,variantMedia:[{variantId,mediaIds:[mediaId]}]});
  const p=r.data?.productVariantAppendMedia;
  if(p?.userErrors?.length) fail('ATTACH_MEDIA_FAILED',p.userErrors.map(x=>x.message).join(' | '),p.userErrors);
  ensure(p?.product?.id===targetId,'ATTACH_MEDIA_UNVERIFIED','Nem ellenőrizhető a kép csatolása.',variantId);
}
async function upsertMappedVariant(db,model,target,source,oldV,newV,m) {
  if(m.shopify_product_id===target.id && m.shopify_variant_id===newV.id && m.shopify_inventory_item_id===newV.inventoryItem.id) return false;
  await db.query('BEGIN');
  try {
    const r=await db.query(`UPDATE aif_shopify_variant_map SET
      shopify_product_id=$2,shopify_variant_id=$3,shopify_inventory_item_id=$4,
      shopify_product_title=$5,shopify_variant_title=$6,shopify_product_status='ACTIVE',
      sync_status='mapped',last_error=NULL,
      last_synced_at=NULL,last_synced_csikszereda_qty=NULL,last_synced_kezdi_qty=NULL,
      raw=COALESCE(raw,'{}'::jsonb)||$10::jsonb,updated_at=now()
      WHERE variant_id=$1::uuid AND shopify_product_id=$7
        AND shopify_variant_id=$8 AND shopify_inventory_item_id=$9 RETURNING variant_id`,[
      m.variant_id,target.id,newV.id,newV.inventoryItem.id,target.title,newV.title,
      source.id,oldV.id,oldV.inventoryItem.id,
      JSON.stringify({colorMerge:{at:new Date().toISOString(),model,oldProductId:source.id,
        oldVariantId:oldV.id,oldInventoryItemId:oldV.inventoryItem.id,newVariantId:newV.id,
        newInventoryItemId:newV.inventoryItem.id}}),
    ]);
    ensure(r.rowCount===1,'MAPPING_UPDATE_FAILED','Párhuzamos módosítás vagy hibás AllIn-párosítás.',m.variant_id);
    const queued=await enqueueAifShopifyVariant(db,m.variant_id,'color_model_merge',{schemaReady:true});
    ensure(queued.queued,'OUTBOX_FAILED','A készletszinkron nem került sorba.',queued);
    await db.query('COMMIT');
    return true;
  } catch(e) {await db.query('ROLLBACK').catch(()=>{});throw e;}
}
async function clearOldStock(v) {
  const levels=v.inventoryItem.inventoryLevels.nodes;
  ensure(levels.every(x=>qty(x,'committed')===0),'SOURCE_HAS_ORDER','Régi terméken rendelési foglalás van.',v.sku);
  const quantities=levels.filter(x=>qty(x,'on_hand')!==0).map(x=>({
    inventoryItemId:v.inventoryItem.id,locationId:x.location.id,
    quantity:0,changeFromQuantity:qty(x,'on_hand'),
  }));
  if(!quantities.length) return false;
  const key=checksum(`aif-color-merge-clear-v1:${v.inventoryItem.id}`);
  const r=await shopifyGraphql(ZERO,{key,input:{name:'on_hand',reason:'correction',
    referenceDocumentUri:`gid://allinfashion/ColorMerge/${v.inventoryItem.id.split('/').pop()}`,quantities}});
  const p=r.data?.inventorySetQuantities;
  if(p?.userErrors?.length) fail('SOURCE_CLEAR_FAILED',p.userErrors.map(x=>x.message).join(' | '),p.userErrors);
  ensure(p?.inventoryAdjustmentGroup,'SOURCE_CLEAR_UNVERIFIED','Régi készlet nullázása nem ellenőrizhető.',v.sku);
  return true;
}
async function ensureArchived(p) {
  if(p.status==='ARCHIVED') return;
  const r=await shopifyGraphql(ARCHIVE,{product:{id:p.id,status:'ARCHIVED'}});
  const result=r.data?.productUpdate;
  if(result?.userErrors?.length) fail('ARCHIVE_FAILED',result.userErrors.map(x=>x.message).join(' | '),result.userErrors);
  ensure(result?.product?.id===p.id && result?.product?.status==='ARCHIVED','ARCHIVE_UNVERIFIED','Nem igazolható az archiválás.',p.handle);
}
async function ensureRedirect(from,to) {
  if(from===to) return null;
  const fromPath=`/products/${from}`;
  const toPath=`/products/${to}`;
  const lookup=async()=>{
    const r=await shopifyGraphql(`query AifColourMergeRedirectCheck($query:String!) {
      urlRedirects(first:50,query:$query) {pageInfo{hasNextPage} nodes{id path target}}
    }`,{query:`path:${fromPath}`});
    const items=r.data?.urlRedirects;
    ensure(items && !items.pageInfo?.hasNextPage,'REDIRECT_SEARCH_TRUNCATED',
      'Az URL-átirányítás ellenőrzése hiányos.',fromPath);
    const match=items.nodes.filter(x=>x.path===fromPath);
    ensure(match.length<=1,'REDIRECT_DUPLICATED','Több átirányítás ugyanarra a régi útvonalra.',fromPath);
    return match[0]||null;
  };
  const before=await lookup();
  if(before?.target===toPath) return null;
  if(before && before.target!==toPath) return `ÜTKÖZÉS: már más célra mutat (${before.target})`;
  const r=await shopifyGraphql(REDIRECT,{urlRedirect:{path:fromPath,target:toPath}});
  const p=r.data?.urlRedirectCreate;
  if(p?.userErrors?.length) {
    // A korábbi HTTP válasz elveszhetett, miközben a mutation sikeres volt.
    const recheck=await lookup();
    if(recheck?.target===toPath) return null;
    return p.userErrors.map(x=>x.message).join(' | ');
  }
  const found=await lookup();
  return p?.urlRedirect?.id && found?.target===toPath ? null : 'Nem sikerült igazolni az átirányítást.';
}
async function mergeColourTags(targetId, products) {
  const current=await readProduct(targetId);
  const existing=new Set((current.tags||[]).map(norm));
  const toAdd=[];
  for(const p of products) for(const t of p.tags||[]) {
    if(!str(t) || existing.has(norm(t))) continue;
    existing.add(norm(t));
    toAdd.push(t);
  }
  if(!toAdd.length) return 0;
  const r=await shopifyGraphql(TAGS_ADD,{id:targetId,tags:toAdd});
  const p=r.data?.tagsAdd;
  if(p?.userErrors?.length) fail('TAGS_MERGE_FAILED',p.userErrors.map(x=>x.message).join(' | '),p.userErrors);
  ensure(p?.node?.id===targetId,'TAGS_MERGE_UNVERIFIED','A termékcímkék átvezetése nem igazolható.');
  const updated=await readProduct(targetId);
  const names=new Set((updated.tags||[]).map(norm));
  ensure(toAdd.every(t=>names.has(norm(t))),'TAGS_READBACK_FAILED','Hiányzó termékcímkék a Shopify-ban.',toAdd);
  return toAdd.length;
}
async function apply(db,plan,locs) {
  const result={model:plan.model,target:plan.target.handle,moved:[],images:[],archived:[],redirects:[],warnings:[]};
  const targetId=plan._target.id;
  const family=FAMILIES[plan.model];
  for(const color of plan.colors) {
    const source=plan._all.find(x=>x.code===color.code);
    ensure(source?.product && source.product.id!==targetId,'SOURCE_NOT_FOUND','Hiányzó színforrás.',color.code);
    const images=new Map();
    for(const sourceImg of plan._oldPairs.filter(x=>x.code===color.code)[0]?.sourcePhotos||[]) {
      const m=await ensureImageOnTarget(plan.model,targetId,sourceImg,source.product.id,color.label);
      images.set(sourceImg.id,m);
      result.images.push({code:color.code,source:sourceImg.url,targetMediaId:m.id});
    }
    for(const step of plan._oldPairs.filter(x=>x.code===color.code)) {
      // Re-read the current mapping and original variant for every write.
      const freshSource=await readProduct(source.id);
      const old=freshSource.variants.nodes.find(v=>v.id===step.variant.id);
      ensure(old,'SOURCE_VARIANT_DISAPPEARED','A forrásvariáns eltűnt.',step.variant.sku);
      const freshMappings=await readMappings(db,[step.mapping.variant_id],locs);
      const m=freshMappings.get(step.mapping.variant_id);
      ensure(m && norm(m.mapped_sku)===norm(old.sku),'MAPPING_CHANGED','AllIn-párosítás eltért.',old.sku);
      const media=images.get(step.photo.id);
      ensure(media?.id,'MEDIA_NOT_PREPARED','A szín fotója nem készült el.',old.sku);
      const beforeTarget=await readProduct(targetId);
      let newV=beforeTarget.variants.nodes.find(v=>norm(v.sku)===norm(old.sku));
      if(!newV) {
        ensure(m.shopify_product_id===source.id && m.shopify_variant_id===old.id,'SOURCE_ALREADY_MOVED_NO_TARGET',
          'A térkép már átvezetve, de hiányzik az új variáns.',old.sku);
        checkedStock(old,m,locs);
        const remote=await exactSku(old.sku);
        ensure(remote.length===1 && remote[0].id===old.id,'SKU_GLOBAL_COLLISION',
          'Az SKU másik Shopify-termékben is szerepel.',{sku:old.sku,remote});
        const optionValues=beforeTarget.options.map(o=>({optionId:o.id,
          name:optionKind(o.name)==='color'?color.label:optionOf(old,'size')}));
        const input=variantInput(old,m,optionValues,locs,media.id);
        // If a previous API request succeeded but its HTTP response was lost,
        // do NOT blindly retry a write. Next --plan safely discovers the SKU.
        try {await makeVariant(targetId,old,input,source.id);}
        catch(err) {
          const retryRead=await readProduct(targetId);
          if(!retryRead.variants.nodes.some(v=>norm(v.sku)===norm(old.sku))) throw err;
        }
        const afterCreate=await readProduct(targetId);
        newV=afterCreate.variants.nodes.find(v=>norm(v.sku)===norm(old.sku));
      }
      ensure(newV,'NEW_VARIANT_MISSING','Új variáns nem található.',old.sku);
      const liveMediaImage=baseUrl(newV.image?.url);
      if(liveMediaImage!==baseUrl(media.image?.url)) await ensureMediaAttached(targetId,newV.id,media.id);
      const verified=await verifyTargetVariant(targetId,old,m,color.label,media.id,locs);
      await upsertMappedVariant(db,plan.model,plan._target,source.product,old,verified,m);
      result.moved.push({sku:old.sku,size:optionOf(old,'size'),color:color.label,variantId:verified.id,stock:Number(m.ciuc)+Number(m.kezdi)});
      console.log('OK szín/méret:', color.code, optionOf(old,'size'), old.sku);
    }
  }
  // No source may be archived until EVERY source SKU maps to a verified
  // destination variant with its own image and correct inventory.
  const finalTarget=await readProduct(targetId);
  const allFinalMappings=await readMappings(db,plan._oldPairs.map(x=>x.mapping.variant_id),locs);
  for(const step of plan._oldPairs) {
    const m=allFinalMappings.get(step.mapping.variant_id);
    const newV=finalTarget.variants.nodes.find(v=>norm(v.sku)===norm(step.variant.sku));
    ensure(newV && m?.shopify_product_id===targetId && m?.shopify_variant_id===newV.id && m?.shopify_inventory_item_id===newV.inventoryItem.id,
      'ARCHIVE_GATE_MAPPING','Egyik variáns még nincs átvezetve; nem archiválunk.',step.variant.sku);
    const mediaId=finalTarget.media.nodes.find(x=>str(x.alt).includes(step.photo.tag) ||
      baseUrl(x.image?.url)===baseUrl(step.photo.url))?.id;
    ensure(mediaId && baseUrl(newV.image?.url)===baseUrl(finalTarget.media.nodes.find(x=>x.id===mediaId)?.image?.url),
      'ARCHIVE_GATE_IMAGE','A színfotó hiányzik, nem archiválunk.',step.variant.sku);
  }
  // Dynamic/automated collections can depend on colour tags. Preserve the
  // union of existing tags before retiring any colour-specific product.
  result.tagsAdded=await mergeColourTags(targetId,plan._all.map(x=>x.product));
  for(const source of plan._all.filter(x=>x.id!==targetId)) {
    const mapped=await db.query('SELECT count(*)::int AS n FROM aif_shopify_variant_map WHERE shopify_product_id=$1',[source.id]);
    ensure(Number(mapped.rows[0]?.n)===0,'SOURCE_STILL_MAPPED','Régi termékhez még élő AllIn mapping tartozik.',source.handle);
    const live=await readProduct(source.id);
    await ensureArchived(live);
    for(const v of live.variants.nodes) await clearOldStock(v);
    const check=await readProduct(source.id);
    ensure(check.status==='ARCHIVED' && check.variants.nodes.every(v=>v.inventoryItem.inventoryLevels.nodes.every(l=>qty(l,'on_hand')===0)),
      'OLD_PRODUCT_NOT_CLEARED','Régi termék archiválása vagy készlet nullázása nem teljes.',source.handle);
    const redirectError=await ensureRedirect(source.handle,family.targetHandle);
    if(redirectError) result.warnings.push(`REDIRECT ${source.handle}: ${redirectError}`);
    else result.redirects.push(`${source.handle} -> ${family.targetHandle}`);
    result.archived.push(source.handle);
  }
  return result;
}
function selfTest() {
  ensure(ELIGIBLE_MODELS.length===6 && new Set(ELIGIBLE_MODELS).size===6,
    'SELFTEST_ALLOWLIST','Hat egyedi modell szükséges.');
  const target=pickTarget([{code:'100',product:{id:'b'}},{code:'001',product:{id:'a'}}]);
  ensure(target.code==='001','SELFTEST_TARGET','A 001-es szín maradjon főtermék.');
  const fallback=pickTarget([{code:'648',product:{id:'b'}},{code:'100',product:{id:'a'}}]);
  ensure(fallback.code==='100','SELFTEST_FALLBACK','Az alternatív célpont nem determinisztikus.');
  const colors=chooseColorLabels([
    {code:'001',colorOption:'Negru',dbName:'negru'},
    {code:'100',colorOption:'Alb',dbName:'alb'},
    {code:'011',colorOption:'Gri',dbName:'gri'},
  ]);
  ensure(colors.map(x=>x.label).join('|')==='Negru|Alb|Gri',
    'SELFTEST_COLOR','Az olvasható román színnevek nem maradtak meg.');
  const dup=chooseColorLabels([{code:'002',colorOption:'Gri'},
    {code:'003',colorOption:'Gri'}]);
  ensure(dup[0].label==='Gri (002)' && dup[1].label==='Gri (003)',
    'SELFTEST_DUP','Színnévütközés nincs kezelve.');
  ensure(optionKind('Mărime')==='size' && optionKind('Culoare')==='color',
    'SELFTEST_OPTIONS','Román opció-felismerés hibás.');
  ensure(checksum({x:1})!==checksum({x:2}),
    'SELFTEST_HASH','Terv-ujjlenyomat hibás.');
  console.log('ÖNELLENŐRZÉS: OK (6 modell engedélylistán, célpont, színfeliratok, SHA-256, csak tervvel élesítve)');
}
async function main() {
  const a=parseArgs(process.argv.slice(2));
  if(a.help) {
    console.log('node scripts/aifShopifyColorMergeGeneral.mjs --self-test');
    console.log('node scripts/aifShopifyColorMergeGeneral.mjs --plan --model 1373126');
    console.log('node scripts/aifShopifyColorMergeGeneral.mjs --apply --model 1373126 --confirm <64 karakteres terv hash>');
    return;
  }
  if(a.selfTest) {selfTest();return;}
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
  let lock=null;
  try {
    const locs=locations();
    if(a.apply) {
      ensure(['1','true','yes','on'].includes(norm(process.env.SHOPIFY_SYNC_ENABLED)),
        'SYNC_DISABLED','Készletszinkron kikapcsolva, nem módosítunk.');
      lock=await acquireAifShopifyProcessLock(pool);
      ensure(lock?.locked,'PROCESSOR_BUSY','A Shopify-szinkron most foglalt. A zárolást nem kerüljük meg.');
      await ensureAifShopifyTables(pool);
    }
    FAMILIES[a.model]=await discoverFamily(pool,a.model,locs);
    const plan=await makePlan(pool,a.model,locs);
    const {_all,_target,_oldPairs,_labels,_locs,...report}=plan;
    if(!a.apply) {
      console.log('\nSZÍNCSOPORTOS EGYESÍTÉS TERVE');
      console.log(JSON.stringify(report,null,2));
      if(plan.status==='ready') console.log(`\nÉLES FUTTATÁS (csak ellenőrzés után): node scripts/aifShopifyColorMergeGeneral.mjs --apply --model ${a.model} --confirm ${plan.hash}`);
      return;
    }
    ensure(plan.status==='ready','ALREADY_MERGED','A család már egyesített vagy nem módosítható.');
    ensure(a.confirm===plan.hash,'PLAN_CHANGED','Az élő termék/készlet módosult a terv óta. Friss --plan kell.',{
      current:plan.hash,provided:a.confirm,
    });
    const r=await apply(pool,plan,locs);
    console.log('\nSZÍNCSOPORTOS EGYESÍTÉS EREDMÉNYE\n'+JSON.stringify(r,null,2));
    if(r.warnings.length) process.exitCode=2;
  } catch(err) {
    console.error('\nEGYESÍTÉS BLOKKOLVA:',err.code||'ERROR',err.message);
    if(err.details) console.dir(err.details,{depth:5});
    process.exitCode=1;
  } finally {
    if(lock) await lock.release();
    await pool.end();
  }
}
await main();
