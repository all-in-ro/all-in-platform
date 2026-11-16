/**
 * AllInFashion / Shopify - missing VARIANT photo associations, 2026-11-16.
 *
 * Exactly seven SKU values from the live colour-readiness audit are allowed.
 * --plan reads Shopify + AllIn; --apply needs the SHA-256 plan and takes the
 * same PostgreSQL advisory lock as the stock processor. It ONLY associates
 * already-existing READY product media with an existing variant. It NEVER
 * uploads/deletes media, changes SKU, price, product, mapping or inventory.
 *
 * Render Shell:
 *   node scripts/aifShopifyVariantPhotoRepair.mjs --self-test
 *   node scripts/aifShopifyVariantPhotoRepair.mjs --plan --all
 *   node scripts/aifShopifyVariantPhotoRepair.mjs --plan --model 1326799
 *   node scripts/aifShopifyVariantPhotoRepair.mjs --apply --model 1326799 --confirm SHA256_FROM_PLAN
 */
import { createHash } from 'node:crypto';
import pg from 'pg';
import {shopifyGraphql,acquireAifShopifyProcessLock} from '../api/lib/aifShopify.js';

const ALLOWLIST=Object.freeze({
  '1326799': Object.freeze(['192007421329','192007421343','192007421350','192007421404','192007421428']),
  '1370076': Object.freeze(['195252565848']),
  '1290261': Object.freeze(['1900850935998']),
});
const txt=x=>String(x??'').trim();
const norm=x=>txt(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const baseUrl=x=>txt(x).split('?')[0];
const int=x=>Number.isFinite(Number(x))?Math.trunc(Number(x)):0;
const qty=(level,name)=>int((level?.quantities||[]).find(x=>x.name===name)?.quantity);
const fingerprint=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function error(code,message,details){const e=new Error(message);e.code=code;e.details=details;throw e;}
function check(condition,code,message,details){if(!condition)error(code,message,details);}
function optionKind(name){
  const n=norm(name);
  return ['culoare','color','colour','szin'].includes(n)?'color':
    ['marime','size','meret','taille'].includes(n)?'size':'';
}
function option(v,kind){return txt((v.selectedOptions||[]).find(x=>optionKind(x.name)===kind)?.value);}
function parseArgs(argv){
  const a={model:null,all:false,plan:false,apply:false,confirm:null,selfTest:false,help:false};
  for(let i=0;i<argv.length;i++){
    const f=argv[i];
    if(f==='--model')a.model=txt(argv[++i]);
    else if(f==='--all')a.all=true;
    else if(f==='--plan')a.plan=true;
    else if(f==='--apply')a.apply=true;
    else if(f==='--confirm')a.confirm=txt(argv[++i]);
    else if(f==='--self-test')a.selfTest=true;
    else if(f==='--help')a.help=true;
    else error('UNKNOWN_ARG',`Ismeretlen kapcsoló: ${f}`);
  }
  if(a.selfTest||a.help)return a;
  check(a.plan!==a.apply,'MODE_REQUIRED','Pontosan egy üzemmódot adj meg: --plan vagy --apply.');
  check(Boolean(a.model)!==a.all,'SELECTOR_REQUIRED','Pontosan egyet adj meg: --model MODELL vagy --all.');
  if(a.model)check(Object.hasOwn(ALLOWLIST,a.model),'MODEL_NOT_ALLOWED','A modell nincs a 7 SKU biztonsági listáján.');
  if(a.apply){
    check(Boolean(a.model)&&!a.all,'APPLY_ONE_MODEL','Éles javítás egyszerre csak egy modellre engedélyezett.');
    check(/^[a-f0-9]{64}$/.test(a.confirm||''),'CONFIRM_REQUIRED','Éles futáshoz a terv teljes 64 karakteres SHA-256 kódja kell.');
  } else check(!a.confirm,'CONFIRM_WITHOUT_APPLY','A --confirm csak --apply mellett használható.');
  return a;
}

const EXACT_SKU=`query AifVariantPhotoExactSku($query:String!){
  productVariants(first:50,query:$query){pageInfo{hasNextPage} nodes{
    id sku product{id handle status}
  }}
}`;
const PRODUCT=`query AifVariantPhotoRead($id:ID!){
  product(id:$id){
    id handle title vendor status featuredImage{url}
    media(first:100){pageInfo{hasNextPage} nodes{
      id alt status mediaContentType ... on MediaImage{image{id url}}
    }}
    variants(first:100){pageInfo{hasNextPage} nodes{
      id sku barcode price inventoryQuantity availableForSale
      selectedOptions{name value} image{url}
      inventoryItem{id tracked inventoryLevels(first:50){pageInfo{hasNextPage} nodes{
        location{id name} quantities(names:["available","committed"]){name quantity}
      }}}
    }}
  }
}`;
const APPEND=`mutation AifVariantPhotoAppend($productId:ID!,$variantMedia:[ProductVariantAppendMediaInput!]!){
  productVariantAppendMedia(productId:$productId,variantMedia:$variantMedia){
    product{id} userErrors{field message}
  }
}`;
async function gqlRead(query,vars){
  for(let retry=0;retry<4;retry++){
    try{return await shopifyGraphql(query,vars);}catch(e){
      if(retry===3||!/429|too many|throttl|rate.limit/i.test(txt(e.message)))throw e;
      await sleep(1500*(2**retry));
    }
  }
}
async function searchSku(sku){
  const q=`sku:"${sku.replaceAll('\\','\\\\').replaceAll('"','\\"')}"`;
  const response=await gqlRead(EXACT_SKU,{query:q});
  const c=response.data?.productVariants;
  check(c&&!c.pageInfo?.hasNextPage,'SKU_LIST_INCOMPLETE','Shopify SKU keresés csonkolt.',sku);
  const active=(c.nodes||[]).filter(v=>txt(v.sku)===sku&&v.product?.status==='ACTIVE');
  check(active.length===1,'SKU_ACTIVE_COUNT','Pontosan egy aktív Shopify variánst várunk a SKU-hoz.',
    {sku,found:active.map(x=>({id:x.id,product:x.product?.handle}))});
  return active[0];
}
async function readProduct(id){
  const r=await gqlRead(PRODUCT,{id});const p=r.data?.product;
  check(p?.id===id,'PRODUCT_NOT_FOUND','A Shopify-termék nem található.',id);
  check(!p.media?.pageInfo?.hasNextPage&&!p.variants?.pageInfo?.hasNextPage,
    'PRODUCT_PAGINATION','Csonkolt Shopify termék (100-nál több fotó vagy variáns).',p.handle);
  for(const v of p.variants.nodes||[])check(!v.inventoryItem?.inventoryLevels?.pageInfo?.hasNextPage,
    'LOCATION_PAGINATION','Csonkolt Shopify helyszínlista.',v.sku);
  return p;
}

async function readMapping(db,variantId,locs){
  const r=await db.query(`
    SELECT mp.variant_id::text AS variant_id,mp.sku AS mapped_sku,
      mp.shopify_product_id,mp.shopify_variant_id,mp.shopify_inventory_item_id,
      v.barcode,v.size,v.color_code,v.status AS variant_status,
      pm.model_code,pm.status AS model_status,
      COALESCE(SUM(GREATEST(COALESCE(s.qty,0)-COALESCE(s.reserved_qty,0),0))
        FILTER(WHERE s.location_id::text=$2),0)::int AS ciuc,
      COALESCE(SUM(GREATEST(COALESCE(s.qty,0)-COALESCE(s.reserved_qty,0),0))
        FILTER(WHERE s.location_id::text=$3),0)::int AS kezdi,
      COALESCE(SUM(COALESCE(s.qty,0))
        FILTER(WHERE s.location_id::text NOT IN($2,$3) AND COALESCE(l.code,'')<>'online_shop'),0)::int AS other_physical,
      COALESCE(SUM(COALESCE(s.reserved_qty,0))
        FILTER(WHERE s.location_id::text IN($2,$3)),0)::int AS reserved
    FROM aif_shopify_variant_map mp
    JOIN aif_product_variants v ON v.id=mp.variant_id
    JOIN aif_product_models pm ON pm.id=v.model_id
    LEFT JOIN aif_stock s ON s.variant_id=v.id
    LEFT JOIN aif_locations l ON l.id=s.location_id
    WHERE mp.shopify_variant_id=$1
    GROUP BY mp.variant_id,mp.sku,mp.shopify_product_id,mp.shopify_variant_id,
      mp.shopify_inventory_item_id,v.id,pm.id
  `,[variantId,locs[0].aif,locs[1].aif]);
  check(r.rows.length===1,'ALLIN_MAPPING_MISSING','Hiányzik vagy ismétlődik az AllIn-párosítás.',variantId);
  return r.rows[0];
}
function getLocations(){
  const rows=[
    {key:'ciuc',aif:txt(process.env.AIF_LOCATION_CSIKSZEREDA_ID),shop:txt(process.env.SHOPIFY_LOCATION_CSIKSZEREDA_ID)},
    {key:'kezdi',aif:txt(process.env.AIF_LOCATION_KEZDI_ID),shop:txt(process.env.SHOPIFY_LOCATION_KEZDI_ID)}
  ];
  check(rows.every(x=>x.aif&&x.shop),'LOCATIONS_MISSING','A két üzlet Shopify/AllIn helyszínazonosítója szükséges.');
  return rows;
}
function validateIdentity(model,p,v,m,locs){
  check(p.status==='ACTIVE'&&norm(p.vendor)==='under armour','PRODUCT_IDENTITY','Nem aktív Under Armour termék.',p.handle);
  check(new RegExp(`(^|\\D)${model}(\\D|$)`).test(p.handle),'PRODUCT_MODEL_HANDLE','A termékhandle nem azonosítja a kért modellt.',p.handle);
  check(norm(m.model_code).endsWith(':'+model),'ALLIN_MODEL','Az AllIn-modellkód eltér.',m.model_code);
  check(norm(m.variant_status)==='active'&&norm(m.model_status)==='active','ALLIN_INACTIVE','Inaktív AllIn modell/variáns.',v.sku);
  check(txt(m.shopify_variant_id)===v.id&&txt(m.shopify_product_id)===p.id&&
    txt(m.shopify_inventory_item_id)===v.inventoryItem?.id,'MAPPING_CHANGED','AllIn-Shopify variánspárosítás eltér.',v.sku);
  check(txt(v.sku)===txt(v.barcode)&&txt(v.sku)===txt(m.barcode)&&txt(v.sku)===txt(m.mapped_sku),
    'BARCODE_MISMATCH','SKU/EAN eltérés; a fotót nem állítjuk.',v.sku);
  check(Boolean(option(v,'color'))&&Boolean(option(v,'size'))&&norm(option(v,'size'))===norm(m.size),
    'OPTION_MISMATCH','A szín- vagy méretopció eltér az AllIn-től.',v.sku);
  check(v.inventoryItem?.tracked===true,'UNTRACKED_STOCK','A Shopify nem követi a készletet.',v.sku);
  check(int(m.other_physical)===0&&int(m.reserved)===0,'RESERVED_OR_OTHER_STOCK','Foglalás vagy más fizikai raktár szerepel.',v.sku);
  const physically=int(m.ciuc)+int(m.kezdi);
  check(physically===int(v.inventoryQuantity),'TOTAL_STOCK_MISMATCH','A készletek eltérnek.',{sku:v.sku,shop:v.inventoryQuantity,aif:physically});
  for(const loc of locs){
    const level=(v.inventoryItem?.inventoryLevels?.nodes||[]).find(x=>x.location?.id===loc.shop);
    const available=level?qty(level,'available'):0;
    check(available===int(m[loc.key])&&(!level||qty(level,'committed')===0),
      'LOCATION_STOCK_MISMATCH','Eltérő vagy foglalt helyszíni készlet.',{sku:v.sku,location:loc.key,shop:available,aif:m[loc.key]});
  }
  if(physically>0)check(v.availableForSale===true,'NOT_FOR_SALE','A készletes variáns nem vásárolható.',v.sku);
}
/** Pick only a photo already on this product. Same-colour sibling image wins;
 * otherwise the featured photo is safe ONLY if ALL variants share one colour.
 */
function choosePhoto(product,variant){
  const media=(product.media?.nodes||[]).filter(m=>
    m.mediaContentType==='IMAGE'&&m.status==='READY'&&Boolean(m.image?.url));
  const color=norm(option(variant,'color'));
  check(color,'COLOR_MISSING','A variáns színe hiányzik.',variant.sku);
  const siblings=(product.variants?.nodes||[]).filter(v=>
    v.id!==variant.id && norm(option(v,'color'))===color && Boolean(v.image?.url));
  const siblingUrls=[...new Set(siblings.map(v=>baseUrl(v.image.url)))];
  let source,chosen;
  if(siblingUrls.length>1)error('AMBIGUOUS_SIBLING_IMAGES','Azonos színű méretek különböző képekhez vannak kötve.',
    {sku:variant.sku,images:siblingUrls});
  if(siblingUrls.length===1){
    chosen=media.find(m=>baseUrl(m.image.url)===siblingUrls[0]);
    check(chosen,'SIBLING_PHOTO_NOT_ON_PRODUCT','A testvérvariáns fotója nincs a termék médiái között.',variant.sku);
    source='azonos_szinu_testvervarians';
  } else {
    const allColors=[...new Set((product.variants?.nodes||[]).map(v=>norm(option(v,'color'))))];
    check(allColors.length===1 && allColors[0]===color,'MULTICOLOR_NO_SIBLING',
      'Többszínű terméknél testvérfotó nélkül nem találgatunk.',{sku:variant.sku,colors:allColors});
    chosen=media.find(m=>baseUrl(m.image.url)===baseUrl(product.featuredImage?.url));
    check(chosen,'FEATURED_PHOTO_NOT_READY','Nincs READY állapotú, a termékhez tartozó főkép.',variant.sku);
    source='egyszinu_termek_fokepe';
  }
  check(chosen?.id&&chosen?.image?.url,'PHOTO_NOT_READY','Nem rendelhető hozzá kész fotó.',variant.sku);
  return {mediaId:chosen.id,url:chosen.image.url,method:source};
}

async function planModel(db,model,locs){
  const items=[];
  const products=new Map();
  for(const sku of ALLOWLIST[model]){
    let row={sku,status:'BLOCKED'};
    try{
      const found=await searchSku(sku);
      const pid=found.product.id;
      let p=products.get(pid);
      if(!p){p=await readProduct(pid);products.set(pid,p);}
      const v=p.variants.nodes.find(x=>x.id===found.id);
      check(v,'VARIANT_MISSING','A variáns nincs a termékben.',sku);
      const m=await readMapping(db,v.id,locs);
      validateIdentity(model,p,v,m,locs);
      const summary={
        sku,productId:pid,handle:p.handle,variantId:v.id,inventoryItemId:v.inventoryItem.id,
        allInVariantId:m.variant_id,modelCode:m.model_code,color:option(v,'color'),size:option(v,'size'),
        stock:int(v.inventoryQuantity),ciuc:int(m.ciuc),kezdi:int(m.kezdi),price:txt(v.price),
        currentPhoto:v.image?.url||null
      };
      if(v.image?.url)row={...summary,status:'ALREADY_HAS_PHOTO'};
      else row={...summary,status:'READY',photo:choosePhoto(p,v)};
    }catch(e){row={...row,errorCode:e.code||'ERROR',error:txt(e.message),details:e.details||null};}
    items.push(row);
  }
  const problems=items.filter(x=>x.status==='BLOCKED');
  const ready=items.filter(x=>x.status==='READY');
  const plan={model,status:problems.length?'BLOCKED':ready.length?'READY':'ALREADY_DONE',
    total:items.length,toFix:ready.length,alreadyDone:items.filter(x=>x.status==='ALREADY_HAS_PHOTO').length,
    blocked:problems.length,items};
  plan.hash=fingerprint(plan);
  return plan;
}

async function applyModel(db,model,plan,locs){
  const results=[];
  for(const step of plan.items.filter(x=>x.status==='READY')){
    // Before EVERY write, verify that the product, options, mapping and stock
    // are still the same as the confirmed plan. Nothing outside photo links is touched.
    const p=await readProduct(step.productId);
    const v=p.variants.nodes.find(x=>x.id===step.variantId);
    check(v&&txt(v.sku)===step.sku,'VARIANT_CHANGED','A variáns megváltozott.',step.sku);
    check(!v.image?.url,'PHOTO_ALREADY_ASSIGNED','Közben valaki képet rendelt a variánshoz. Kérj új tervet.',step.sku);
    const m=await readMapping(db,v.id,locs);
    validateIdentity(model,p,v,m,locs);
    check(txt(v.price)===step.price&&option(v,'color')===step.color&&option(v,'size')===step.size&&
      int(v.inventoryQuantity)===step.stock&&int(m.ciuc)===step.ciuc&&int(m.kezdi)===step.kezdi,
      'PLAN_ITEM_CHANGED','Változtak a megerősített adatok.',step.sku);
    const newPhoto=choosePhoto(p,v);
    check(newPhoto.mediaId===step.photo.mediaId&&baseUrl(newPhoto.url)===baseUrl(step.photo.url),
      'PHOTO_SELECTION_CHANGED','Időközben megváltozott a kiválasztott kép.',step.sku);
    const r=await shopifyGraphql(APPEND,{productId:step.productId,
      variantMedia:[{variantId:step.variantId,mediaIds:[step.photo.mediaId]}]});
    const output=r.data?.productVariantAppendMedia;
    check(output&&!output.userErrors?.length&&output.product?.id===step.productId,
      'APPEND_FAILED','A Shopify nem igazolta a fotó hozzárendelését.',{sku:step.sku,errors:output?.userErrors});
    const after=await readProduct(step.productId);
    const live=after.variants.nodes.find(x=>x.id===step.variantId);
    check(live&&baseUrl(live.image?.url)===baseUrl(step.photo.url),'PHOTO_NOT_VERIFIED',
      'A Shopify visszaolvasva nem a várt képet mutatja.',{sku:step.sku,expected:step.photo.url,actual:live?.image?.url});
    const still=await readMapping(db,step.variantId,locs);
    validateIdentity(model,after,live,still,locs);
    results.push({sku:step.sku,handle:step.handle,image:live.image.url,method:step.photo.method});
    console.log(`OK variánsfotó: ${step.sku} (${step.color} / ${step.size})`);
  }
  return {model,updated:results.length,results};
}
function selfTest(){
  const media=(id,name)=>({id,mediaContentType:'IMAGE',status:'READY',image:{url:`https://cdn.example/${name}.jpg`}});
  const variant=(id,color,image=null)=>({id,sku:id,selectedOptions:[{name:'Culoare',value:color},{name:'Mărime',value:'M'}],image});
  const p={featuredImage:{url:'https://cdn.example/black.jpg'},media:{nodes:[media('m1','black'),media('m2','blue')]},
    variants:{nodes:[variant('v1','negru'),variant('v2','negru',{url:'https://cdn.example/black.jpg'})]}};
  const sibling=choosePhoto(p,p.variants.nodes[0]);
  check(sibling.mediaId==='m1'&&sibling.method==='azonos_szinu_testvervarians','TEST_SIBLING','Testvérkép választás hibás.');
  p.variants.nodes=[variant('v1','negru')];
  const featured=choosePhoto(p,p.variants.nodes[0]);
  check(featured.mediaId==='m1'&&featured.method==='egyszinu_termek_fokepe','TEST_FEATURED','Egyszínű termék főkép választás hibás.');
  p.variants.nodes=[variant('v1','negru'),variant('v2','albastru')];
  let blocked=false;
  try{choosePhoto(p,p.variants.nodes[0]);}catch(e){blocked=e.code==='MULTICOLOR_NO_SIBLING';}
  check(blocked,'TEST_MULTICOLOR_BLOCK','Többszínű termék blokkolása hibás.');
  p.variants.nodes=[variant('v1','negru'),variant('v2','negru',{url:'https://cdn.example/black.jpg'}),
    variant('v3','negru',{url:'https://cdn.example/blue.jpg'})];
  blocked=false;
  try{choosePhoto(p,p.variants.nodes[0]);}catch(e){blocked=e.code==='AMBIGUOUS_SIBLING_IMAGES';}
  check(blocked,'TEST_AMBIGUITY_BLOCK','Eltérő testvérfotók blokkolása hibás.');
  check(parseArgs(['--plan','--all']).all,'TEST_PLAN','Katalógus tervkapcsoló hibás.');
  let refused=false;
  try{parseArgs(['--apply','--all','--confirm','a'.repeat(64)]);}catch(e){refused=e.code==='APPLY_ONE_MODEL';}
  check(refused,'TEST_APPLY_GUARD','Tömeges éles javítás tiltása hibás.');
  check(Object.values(ALLOWLIST).flat().length===7,'TEST_SKU_ALLOWLIST','Hibás 7-es SKU engedélylista.');
  check(fingerprint({a:1})===fingerprint({a:1})&&fingerprint({a:1})!==fingerprint({a:2}),
    'TEST_HASH','Nem determinisztikus tervujjlenyomat.');
  console.log('ÖNELLENŐRZÉS: OK (7 SKU, egyszínű főkép, testvérfotó, kétértelműség tiltása, zárolt éles mód)');
}
async function main(){
  const a=parseArgs(process.argv.slice(2));
  if(a.help){
    console.log('node scripts/aifShopifyVariantPhotoRepair.mjs --self-test');
    console.log('node scripts/aifShopifyVariantPhotoRepair.mjs --plan --all');
    console.log('node scripts/aifShopifyVariantPhotoRepair.mjs --plan --model 1326799');
    console.log('node scripts/aifShopifyVariantPhotoRepair.mjs --apply --model 1326799 --confirm <64-karakteres-SHA256>');
    return;
  }
  if(a.selfTest){selfTest();return;}
  check(Boolean(process.env.DATABASE_URL),'DATABASE_URL_MISSING','DATABASE_URL hiányzik.');
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});
  let lock=null;
  try{
    const locs=getLocations();
    if(a.apply){
      check(['1','true','yes','on'].includes(norm(process.env.SHOPIFY_SYNC_ENABLED)),
        'SYNC_DISABLED','Shopify készletszinkron kikapcsolva, nem írunk.');
      lock=await acquireAifShopifyProcessLock(pool);
      check(lock?.locked,'PROCESSOR_BUSY','Shopify-szinkron éppen használja a közös zárolást.');
    }
    const models=a.all?Object.keys(ALLOWLIST):[a.model];
    for(const model of models){
      const plan=await planModel(pool,model,locs);
      console.log(`\n=== VARIÁNSFOTÓ-JAVÍTÁS: ${model} ===`);
      console.log(JSON.stringify(plan,null,2));
      if(a.plan){
        if(plan.status==='READY')console.log(`\nÉLES JAVÍTÁS CSAK ÁTNÉZETT TERV UTÁN: node scripts/aifShopifyVariantPhotoRepair.mjs --apply --model ${model} --confirm ${plan.hash}`);
        continue;
      }
      check(plan.status==='READY','NOT_READY','Ez a modell most nem javítható automatikusan.',plan.items.filter(x=>x.status==='BLOCKED'));
      check(plan.hash===a.confirm,'PLAN_CHANGED','A terv megváltozott az ellenőrzés óta; új --plan szükséges.',
        {expected:plan.hash,provided:a.confirm});
      const out=await applyModel(pool,model,plan,locs);
      console.log('\nVARIÁNSFOTÓ-JAVÍTÁS EREDMÉNYE\n'+JSON.stringify(out,null,2));
    }
  }finally{
    if(lock)await lock.release();
    await pool.end();
  }
}
main().catch(e=>{
  console.error('\nVARIÁNSFOTÓ-JAVÍTÁS BLOKKOLVA:',e.code||'ERROR',e.message);
  if(e.details)console.dir(e.details,{depth:5});
  process.exitCode=1;
});
