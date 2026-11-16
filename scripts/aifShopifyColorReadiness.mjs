/**
 * ALLINFASHION / Shopify colour-family readiness audit
 *
 * READ ONLY. This script never invokes a Shopify mutation and only SELECTs
 * data from AllIn. It AUTOMATICALLY runs the read-only catalog audit first,
 * so a Render redeploy cannot leave it dependent on an expired reports JSON.
 * --use-existing-audit deliberately reuses report files, for offline review.
 *
 * node scripts/aifShopifyColorReadiness.mjs --self-test
 * node scripts/aifShopifyColorReadiness.mjs --all
 * node scripts/aifShopifyColorReadiness.mjs --all --details  // Print issues immediately, no JSON read step
 * node scripts/aifShopifyColorReadiness.mjs --model 1290261
 * node scripts/aifShopifyColorReadiness.mjs --all --out ./reports/aif-color-readiness
 * node scripts/aifShopifyColorReadiness.mjs --all --use-existing-audit
 *
 * A technically clean family is NOT an authorization to merge. Customer-facing
 * color names, color-code aliases, target choices, and images still require
 * explicitly checked per-family plans before any write.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { shopifyGraphql } from '../api/lib/aifShopify.js';

const str=x=>String(x ?? '').trim();
const norm=x=>str(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const int=x=>Number.isFinite(Number(x)) ? Math.trunc(Number(x)) : 0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const optionKind=name=>{
  const n=norm(name);
  return ['culoare','color','colour','szin'].includes(n) ? 'color' :
    ['marime','size','meret','taille'].includes(n) ? 'size' : '';
};
const option=(v,kind)=>str((v?.selectedOptions||[]).find(o=>optionKind(o.name)===kind)?.value);
const quantity=(level,name)=>int((level?.quantities||[]).find(x=>x.name===name)?.quantity);
const distinct=a=>[...new Set(a.map(str).filter(Boolean))];
const csvCell=x=>{
  const s=x == null ? '' : Array.isArray(x) ? x.join(' | ') : String(x);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
};
const makeCsv=(rows,columns)=>[
  columns.join(','),...rows.map(r=>columns.map(c=>csvCell(r[c])).join(','))
].join('\r\n')+'\r\n';

function parseArgs(argv){
  const args={all:false,model:null,source:'./reports/aif-shopify-catalog',out:'./reports/aif-color-readiness',selfTest:false,useExistingAudit:false,details:false};
  for(let i=0;i<argv.length;i++){
    const flag=argv[i];
    if(flag==='--all') args.all=true;
    else if(flag==='--model') args.model=str(argv[++i]);
    else if(flag==='--source') args.source=str(argv[++i]);
    else if(flag==='--out') args.out=str(argv[++i]);
    else if(flag==='--self-test') args.selfTest=true;
    else if(flag==='--details') args.details=true;
    else if(flag==='--use-existing-audit') args.useExistingAudit=true;
    else if(flag==='--help') args.help=true;
    else throw new Error(`Ismeretlen kapcsoló: ${flag}`);
  }
  if(args.all && args.model) throw new Error('--all és --model egyszerre nem használható.');
  if(!args.all && !args.model && !args.selfTest && !args.help) throw new Error('Add meg: --all vagy --model MODELL.');
  if(args.model && !/^[a-z0-9:_-]+$/i.test(args.model)) throw new Error('Hibás modellkód.');
  if(!args.source || !args.out) throw new Error('Hiányzó könyvtár.');
  return args;
}

// All input for an actual run is rebuilt in THIS Render instance. `reports/`
// is ephemeral, and even an existing report might describe a pre-merge catalog.
// Invoking the known read-only auditor eliminates both the missing-file and
// stale-product-ID cases without a separate manual command.
const AUDIT_SCRIPT=fileURLToPath(new URL('./aifShopifyCatalogAudit.mjs',import.meta.url));
async function runFreshAudit(outputDirectory){
  const out=path.resolve(outputDirectory);
  try{await fs.access(AUDIT_SCRIPT);}catch(error){
    if(error?.code==='ENOENT')
      throw new Error(`Hiányzik a katalógusaudit szkript: ${AUDIT_SCRIPT}. A két szkript legyen ugyanabban a scripts/ könyvtárban.`);
    throw error;
  }
  console.log('\n=== FRISS, CSAK OLVASÓ SHOPIFY + ALLIN KATALÓGUSAUDIT ===');
  console.log('Az előellenőrző automatikusan újragenerálja az átmeneti auditjelentést.');
  const result=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[AUDIT_SCRIPT,'--out',out],{
      cwd:process.cwd(),env:process.env,stdio:'inherit'
    });
    child.once('error',reject);
    child.once('close',(code,signal)=>resolve({code,signal}));
  });
  if(result.code!==0)
    throw new Error(`Az automatikus katalógusaudit nem sikerült (${result.signal||'kilépési kód: '+result.code}). Az előellenőrzés nem használ régi adatokat.`);
}
async function loadCatalogSnapshot(sourceDir,{useExistingAudit=false,refresh=runFreshAudit}={}){
  const folder=path.resolve(sourceDir);
  if(!useExistingAudit)await refresh(folder);
  const filenames=['model-colors-review.json','issues.json'];
  const contents=[];
  for(const name of filenames){
    let raw;
    try {raw=await fs.readFile(path.join(folder,name),'utf8');}
    catch(error){
      if(error?.code==='ENOENT')
        throw new Error(`Hiányzik: ${path.join(folder,name)}. A normál futás önállóan készíti el. A --use-existing-audit csak akkor használható, ha az auditfájlok valóban léteznek.`);
      throw error;
    }
    let parsed;
    try {parsed=JSON.parse(raw);}catch(error){
      throw new Error(`Sérült audit JSON: ${name}: ${error.message}`);
    }
    if(!Array.isArray(parsed))throw new Error(`Hibás auditfájl (tömböt várunk): ${name}`);
    contents.push(parsed);
  }
  return {families:contents[0],issues:contents[1]};
}

const PRODUCT_QUERY=`query AifColourFamilyReadOnly($id:ID!){
  product(id:$id) {
    id handle title vendor status productType category {id}
    featuredImage {id url}
    options {name values}
    media(first:100) {
      pageInfo{hasNextPage}
      nodes {id alt mediaContentType status ... on MediaImage {image{id url}}}
    }
    variants(first:100) {
      pageInfo{hasNextPage}
      nodes {
        id sku barcode title price compareAtPrice inventoryQuantity availableForSale
        selectedOptions{name value} image{id url}
        inventoryItem {id tracked inventoryLevels(first:50) {
          pageInfo{hasNextPage}
          nodes {location{id name} quantities(names:["available","committed"]) {name quantity}}
        }}
      }
    }
  }
}`;
async function readProduct(id){
  let r;
  for(let attempt=0;attempt<4;attempt++){
    try {
      r=await shopifyGraphql(PRODUCT_QUERY,{id});
      if(r.errors?.length) throw new Error(r.errors.map(x=>x.message).join(' | '));
      break;
    } catch(e) {
      if(attempt===3 || !/429|throttl|rate.limit|too.many/i.test(str(e.message))) throw e;
      await sleep(Math.min(12000,2000*2**attempt));
    }
  }
  const p=r.data?.product;
  if(!p || p.id!==id) throw new Error(`A Shopify termék nem olvasható: ${id}`);
  if(p.variants?.pageInfo?.hasNextPage) throw new Error(`100-nál több variáns: ${p.handle}`);
  if(p.media?.pageInfo?.hasNextPage) throw new Error(`100-nál több médiaelem: ${p.handle}`);
  for(const v of p.variants.nodes||[])if(v.inventoryItem?.inventoryLevels?.pageInfo?.hasNextPage)
    throw new Error(`Csonkolt helyszínlista: ${p.handle} / ${v.sku}`);
  return p;
}

async function readMappings(db,productIds){
  if(!productIds.length)return [];
  const r=await db.query(`
    SELECT mp.variant_id::text AS variant_id, mp.shopify_product_id,
      mp.shopify_variant_id,mp.shopify_inventory_item_id,mp.sku AS mapped_sku,
      v.barcode,v.color_code,v.color_name,v.size,v.status AS variant_status,
      pm.model_code,pm.status AS model_status,
      COALESCE(sc.supplier_color_code,'') AS supplier_color_code,
      COALESCE(sc.supplier_color_name,'') AS supplier_color_name,
      COALESCE(SUM(GREATEST(COALESCE(s.qty,0)-COALESCE(s.reserved_qty,0),0))
        FILTER(WHERE s.location_id::text=$2),0)::int AS ciuc,
      COALESCE(SUM(GREATEST(COALESCE(s.qty,0)-COALESCE(s.reserved_qty,0),0))
        FILTER(WHERE s.location_id::text=$3),0)::int AS kezdi,
      COALESCE(SUM(COALESCE(s.qty,0))
        FILTER(WHERE s.location_id::text NOT IN ($2,$3) AND COALESCE(l.code,'')<>'online_shop'),0)::int AS other_physical,
      COALESCE(SUM(COALESCE(s.reserved_qty,0))
        FILTER(WHERE s.location_id::text IN($2,$3)),0)::int AS reserved
    FROM aif_shopify_variant_map mp
    JOIN aif_product_variants v ON v.id=mp.variant_id
    JOIN aif_product_models pm ON pm.id=v.model_id
    LEFT JOIN LATERAL (
      SELECT supplier_color_code,supplier_color_name
      FROM aif_variant_supplier_codes sc
      WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
      ORDER BY sc.updated_at DESC NULLS LAST,sc.created_at DESC NULLS LAST LIMIT 1
    ) sc ON true
    LEFT JOIN aif_stock s ON s.variant_id=v.id
    LEFT JOIN aif_locations l ON l.id=s.location_id
    WHERE mp.shopify_product_id=ANY($1::text[])
    GROUP BY mp.variant_id,mp.sku,mp.shopify_product_id,mp.shopify_variant_id,
      mp.shopify_inventory_item_id,v.id,pm.id,sc.supplier_color_code,sc.supplier_color_name
  `,[productIds,str(process.env.AIF_LOCATION_CSIKSZEREDA_ID),str(process.env.AIF_LOCATION_KEZDI_ID)]);
  return r.rows;
}

function compareFamily(family,products,mappings,locs){
  const blockers=new Set(), reviews=new Set();
  const addBlock=s=>blockers.add(s), addReview=s=>reviews.add(s);
  const variants=products.flatMap(p=>(p.variants.nodes||[]).map(v=>({p,v})));
  const mapsById=new Map(), mapBySku=new Map();
  for(const m of mappings){
    const id=str(m.shopify_variant_id);
    if(mapsById.has(id))addBlock('TÖBBSZÖRÖS_ALLIN_PÁROSÍTÁS');
    mapsById.set(id,m);
    const sku=norm(m.barcode);
    if(mapBySku.has(sku))addBlock('TÖBBSZÖRÖS_ALLIN_SKU');
    mapBySku.set(sku,m);
  }
  const allSku=new Set(), byOptions=new Map();
  const byCode=new Map(), byName=new Map(), byMedia=new Map();
  const missing=[];
  let totalQty=0, totalAllIn=0, photos=0;
  const uniqueTitles=distinct(products.map(x=>norm(x.title)));
  const vendors=distinct(products.map(x=>norm(x.vendor)));
  const types=distinct(products.map(x=>norm(x.productType)));
  const categories=distinct(products.map(x=>str(x.category?.id)));
  const prices=distinct(variants.map(x=>x.v.price));
  const noImages=[];
  for(const p of products){
    if(p.status!=='ACTIVE')addBlock(`NEM_AKTÍV_TERMÉK:${p.handle}`);
    const images=p.media?.nodes?.filter(x=>x.mediaContentType==='IMAGE')||[];
    photos+=images.length;
    if(!images.length)addBlock(`TERMÉKFOTÓ_HIÁNY:${p.handle}`);
    if(images.some(x=>x.status!=='READY'))addBlock(`KÉP_NEM_READY:${p.handle}`);
    if(!p.featuredImage?.url)addBlock(`FŐKÉP_HIÁNY:${p.handle}`);
    for(const img of images){
      if(img.image?.url){
        const key=img.image.url.split('?')[0];
        const owners=byMedia.get(key)||new Set();
        owners.add(p.handle);byMedia.set(key,owners);
      }
    }
    for(const o of p.options||[])if(!optionKind(o.name))
      addReview(`EGYÉB_OPCIÓ:${p.handle}:${o.name}`);
  }
  if(uniqueTitles.length>1)addReview('ELTÉRŐ_TERMÉKNEVEK');
  if(vendors.length>1)addBlock('ELTÉRŐ_MÁRKÁK_A_SHOPIFYBAN');
  if(types.length>1)addReview('ELTÉRŐ_TERMÉKTÍPUSOK');
  if(categories.length>1)addReview('ELTÉRŐ_KATEGÓRIÁK');
  if(prices.length>1)addReview('ELTÉRŐ_ÁRAK_EGY_MODELLEN_BELÜL');
  if(products.length!==family.productCount)addBlock('TERMÉKSZÁM_ELTÉR_A_JELENTÉSTŐL');

  for(const {p,v} of variants){
    const sku=norm(v.sku);
    if(!sku)addBlock(`ÜRES_SKU:${p.handle}`);
    if(allSku.has(sku))addBlock(`DUPLIKÁLT_SHOPIFY_SKU:${v.sku}`);
    allSku.add(sku);
    totalQty+=int(v.inventoryQuantity);
    const mapping=mapsById.get(str(v.id));
    if(!mapping){addBlock(`HIÁNYZÓ_ALLIN_PÁROSÍTÁS:${v.sku}`);missing.push(v.sku);continue;}
    if(str(mapping.shopify_product_id)!==str(p.id))addBlock(`HIBÁS_TERMÉK_PÁROSÍTÁS:${v.sku}`);
    if(str(mapping.shopify_inventory_item_id)!==str(v.inventoryItem?.id))addBlock(`HIBÁS_INVENTORY_PÁROSÍTÁS:${v.sku}`);
    if(sku!==norm(mapping.barcode)||sku!==norm(mapping.mapped_sku)||sku!==norm(v.barcode))
      addBlock(`SKU_EAN_ELTÉRÉS:${v.sku}`);
    if(norm(mapping.variant_status)!=='active'||norm(mapping.model_status)!=='active')
      addReview(`INAKTÍV_ALLIN_VARIÁNS:${v.sku}`);
    if(!norm(mapping.model_code).endsWith(':'+norm(family.model).split(':').at(-1)))
      addBlock(`MÁSIK_ALLIN_MODELL:${v.sku}`);
    const color=option(v,'color'),size=option(v,'size');
    if(!color||!size)addBlock(`HIÁNYZÓ_SZÍN_VAGY_MÉRET:${v.sku}`);
    const optionKey=`${norm(color)}|${norm(size)}`;
    const previous=byOptions.get(optionKey);
    if(previous && previous!==sku)addReview(`AZONOS_SZÍN_MÉRET_MÁS_SKU:${v.sku}`);
    byOptions.set(optionKey,sku);
    if(size && norm(size)!==norm(mapping.size))addBlock(`MÉRET_ELTÉRÉS:${v.sku}`);
    const code=str(mapping.supplier_color_code||mapping.color_code||mapping.color_name);
    if(!code)addReview(`ALLIN_SZÍNKÓD_HIÁNY:${v.sku}`);
    const group=byCode.get(norm(code))||new Set();group.add(p.handle);byCode.set(norm(code),group);
    const nameGroup=byName.get(norm(color))||new Set();nameGroup.add(code);byName.set(norm(color),nameGroup);
    if(/^\d{1,4}$/.test(color))addReview(`GYÁRI_KÓD_A_SZÍNVÁLASZTÓBAN:${code}`);
    if(!v.image?.url){addBlock(`VARIÁNSFOTÓ_HIÁNY:${v.sku}`);noImages.push(v.sku);}
    else {
      const matchingMedia=(p.media?.nodes||[]).some(img=>
        img.id===v.image.id || str(img.image?.url).split('?')[0]===str(v.image.url).split('?')[0]);
      if(!matchingMedia)addBlock(`VARIÁNSFOTÓ_NEM_TARTOZIK_A_TERMÉKHEZ:${v.sku}`);
    }
    if(v.inventoryItem?.tracked===false)addBlock(`KÉSZLET_NEM_KÖVETETT:${v.sku}`);
    const aifQty=int(mapping.ciuc)+int(mapping.kezdi)+int(mapping.other_physical);
    const shopQty=int(v.inventoryQuantity);
    totalAllIn+=aifQty;
    if(aifQty!==shopQty)addBlock(`ÖSSZKÉSZLET_ELTÉRÉS:${v.sku}`);
    if(shopQty>0&&!v.availableForSale)addBlock(`KÉSZLETES_DE_NEM_ELADHATÓ:${v.sku}`);
    if(int(mapping.reserved)>0)addReview(`ALLIN_FOGLALÁS:${v.sku}`);
    for(const loc of locs){
      const level=(v.inventoryItem?.inventoryLevels?.nodes||[]).find(x=>x.location?.id===loc.shop);
      const actual=level?quantity(level,'available'):0;
      if(actual!==int(mapping[loc.key]))addBlock(`ÜZLETI_KÉSZLET_ELTÉRÉS:${v.sku}:${loc.key}`);
      if(level && quantity(level,'committed')!==0)addReview(`SHOPIFY_FOGLALÁS:${v.sku}:${loc.key}`);
    }
    if(int(mapping.other_physical)!==0)addReview(`EGYÉB_FIZIKAI_RAKTÁR:${v.sku}`);
  }
  if(mappings.length!==variants.length)addBlock('TÖBB_VAGY_KEVESEBB_ALLIN_PÁROSÍTÁS');
  for(const [code,owners] of byCode)if(owners.size>1)
    addReview(`UGYANAZ_A_SZÍNKÓD_TÖBB_TERMÉKEN:${code}`);
  const colors=distinct(family.colorCodes||[]);
  if(colors.some(c=>!/^\d{2,4}[a-z]?$/i.test(c)))addReview('SZÍNKÓD_ÉS_SZÍNNÉV_KEVEREDIK');
  if([...byName.values()].some(codes=>codes.size>1))addReview('AZONOS_SZÍNNÉV_ELTÉRŐ_KÓDOKKAL');
  if([...byMedia.values()].some(handles=>handles.size>1))addReview('AZONOS_FOTÓ_TÖBB_TERMÉKEN');
  if(missing.length)addBlock('MÁSOLÁS_ELŐTT_MINDEN_SKU_NAK_PÁROSÍTOTTNAK_KELL_LENNIE');
  return {
    brand:family.brand,model:family.model,modelKey:family.modelKey,
    productCount:products.length,colorCount:colors.length,variantCount:variants.length,
    mediaCount:photos,shopifyQty:totalQty,allInQty:totalAllIn,
    titles:uniqueTitles.length,prices:prices.length,
    technicalStatus:blockers.size?'BLOCKED':reviews.size?'REVIEW':'TECHNICAL_OK',
    blockers:[...blockers].sort(),reviews:[...reviews].sort(),
    products:products.map(p=>({id:p.id,handle:p.handle,title:p.title,status:p.status,
      productType:p.productType,category:p.category?.id||null,mediaCount:p.media.nodes.length,
      variants:p.variants.nodes.map(v=>({sku:v.sku,size:option(v,'size'),color:option(v,'color'),
        price:v.price,stock:v.inventoryQuantity,photo:v.image?.url||null,
        allInCode:str(mapsById.get(str(v.id))?.supplier_color_code||mapsById.get(str(v.id))?.color_code),
        ciuc:int(mapsById.get(str(v.id))?.ciuc),kezdi:int(mapsById.get(str(v.id))?.kezdi)}))})),
  };
}

/** Print model-specific blockers and review reasons during the SAME Render Shell run.
 * Report files on Render are ephemeral: a separate shell may be another instance.
 * This output is the durable user-visible result, requiring no later JSON read.
 */
function buildDetailsLines(models){
  const lines=[];
  const groups=[
    ['BLOCKED','BLOKKOLT MODELLEK: PONTOS OKOK'],
    ['REVIEW','FELÜLVIZSGÁLANDÓ MODELLEK: PONTOS OKOK'],
  ];
  for(const [status,title] of groups){
    const selected=models.filter(m=>m.technicalStatus===status);
    lines.push(`\n=== ${title} (${selected.length}) ===`);
    for(const m of selected){
      lines.push(`\n${str(m.model)} | ${m.productCount} termék / ${m.variantCount} SKU | Shopify: ${m.shopifyQty} db | AllIn: ${m.allInQty} db`);
      for(const b of m.blockers||[])lines.push(`  BLOKK: ${b}`);
      for(const r of m.reviews||[])lines.push(`  ELLENŐRIZENDŐ: ${r}`);
    }
  }
  const passed=models.filter(m=>m.technicalStatus==='TECHNICAL_OK');
  lines.push(`\n=== TECHNICAL_OK (${passed.length}) ===`);
  for(const m of passed)lines.push(`  ${str(m.model)} | ${m.productCount} termék / ${m.variantCount} SKU | Shopify: ${m.shopifyQty} db | AllIn: ${m.allInQty} db`);
  lines.push('\nA fentiek az aktuális előellenőrzésből származnak. Egyesítés nem történt.');
  return lines;
}

function selfTest(){
  const tests=[
    [optionKind('Mărime')==='size','Ékezetes méret'],
    [optionKind('Culoare')==='color','Román szín'],
    [option({selectedOptions:[{name:'Mărime',value:'S/M'}]},'size')==='S/M','Méret kiolvasás'],
    [parseArgs(['--all']).all===true,'Kapcsolók'],
    [parseArgs(['--all','--details']).details===true,'Részletek közvetlen kiírása'],
    [parseArgs(['--model','1290261']).model==='1290261','Célzott modell'],
    [parseArgs(['--all']).useExistingAudit===false,'Friss audit alapértelmezés'],
    [parseArgs(['--all','--use-existing-audit']).useExistingAudit===true,'Létező audit használata'],
    [makeCsv([{name:'a,b'}],['name']).includes('"a,b"'),'CSV escape'],
  ];
  for(const [ok,label] of tests)if(!ok)throw new Error('ÖNELLENŐRZÉS SIKERTELEN: '+label);
  // Deterministic synthetic audit: never contacts Shopify or Postgres.
  const fakeFamily={brand:'Under Armour',model:'under_armour:1290261',
    modelKey:'under-armour::under-armour-1290261',productCount:2,colorCodes:['001','090']};
  const fakeLocs=[{key:'ciuc',shop:'shC'},{key:'kezdi',shop:'shK'}];
  const fakeProducts=['Negru','Gri'].map((color,i)=>({
    id:`product-${i}`,handle:`ua-1290261-${i}`,title:'UA product',vendor:'Under Armour',
    status:'ACTIVE',productType:'Pants',category:{id:'category-1'},
    featuredImage:{url:`https://cdn.example.com/${i}.jpg`},
    options:[{name:'Culoare',values:[color]},{name:'Mărime',values:['M']}],
    media:{nodes:[{id:`image-${i}`,mediaContentType:'IMAGE',status:'READY',
      image:{url:`https://cdn.example.com/${i}.jpg`}}]},
    variants:{nodes:[{id:`variant-${i}`,sku:`barcode-${i}`,barcode:`barcode-${i}`,
      price:'79.00',inventoryQuantity:i+1,availableForSale:true,
      selectedOptions:[{name:'Culoare',value:color},{name:'Mărime',value:'M'}],
      image:{id:`image-${i}`,url:`https://cdn.example.com/${i}.jpg`},
      inventoryItem:{id:`inventory-${i}`,tracked:true,inventoryLevels:{nodes:[
        {location:{id:'shC'},quantities:[{name:'available',quantity:i+1},{name:'committed',quantity:0}]},
        {location:{id:'shK'},quantities:[{name:'available',quantity:0},{name:'committed',quantity:0}]}
      ]}}
    }]}
  }));
  const fakeMaps=fakeProducts.map((p,i)=>({shopify_product_id:p.id,
    shopify_variant_id:`variant-${i}`,shopify_inventory_item_id:`inventory-${i}`,
    mapped_sku:`barcode-${i}`,barcode:`barcode-${i}`,variant_status:'active',model_status:'active',
    model_code:'under_armour:1290261',size:'M',supplier_color_code:i?'090':'001',
    ciuc:i+1,kezdi:0,other_physical:0,reserved:0}));
  const clean=compareFamily(fakeFamily,fakeProducts,fakeMaps,fakeLocs);
  if(clean.technicalStatus!=='TECHNICAL_OK' || clean.shopifyQty!==3)
    throw new Error('ÖNELLENŐRZÉS SIKERTELEN: tiszta, kétszínes modell');
  fakeProducts[1].variants.nodes[0].image=null;
  const damaged=compareFamily(fakeFamily,fakeProducts,fakeMaps,fakeLocs);
  if(damaged.technicalStatus!=='BLOCKED' || !damaged.blockers.some(x=>x.startsWith('VARIÁNSFOTÓ_HIÁNY')))
    throw new Error('ÖNELLENŐRZÉS SIKERTELEN: hiányzó variánsfotó blokkolása');
  fakeProducts[1].variants.nodes[0].image={id:'image-1',url:'https://cdn.example.com/1.jpg'};
  fakeProducts[1].variants.nodes[0].selectedOptions[0].value='090';
  const unlabeled=compareFamily(fakeFamily,fakeProducts,fakeMaps,fakeLocs);
  if(unlabeled.technicalStatus!=='REVIEW' || !unlabeled.reviews.some(x=>x.startsWith('GYÁRI_KÓD_A_SZÍNVÁLASZTÓBAN')))
    throw new Error('ÖNELLENŐRZÉS SIKERTELEN: numerikus szín felülvizsgálata');
  const lines=buildDetailsLines([{technicalStatus:'BLOCKED',model:'test-model',productCount:2,variantCount:2,shopifyQty:1,allInQty:1,blockers:['TEST_BLOCK'],reviews:['TEST_REVIEW']}]);
  if(!lines.join('\n').includes('BLOKK: TEST_BLOCK') || !lines.join('\n').includes('ELLENŐRIZENDŐ: TEST_REVIEW'))
    throw new Error('ÖNELLENŐRZÉS SIKERTELEN: inline hibakimenet');
  console.log('ÖNELLENŐRZÉS: OK (read-only, készlet, képek, blokk, színcímke, CSV, közvetlen részletes kimenet)');
}

async function main(){
  const args=parseArgs(process.argv.slice(2));
  if(args.help){
    console.log('Használat: node scripts/aifShopifyColorReadiness.mjs --self-test | --all | --model 1290261');
    console.log('Alapból friss Shopify+AllIn audit készül ugyanebben a futásban.');
    console.log('Opciók: --details (a konkrét hibákat azonnal a konzolra írja), --source ./reports/aif-shopify-catalog --out ./reports/aif-color-readiness --use-existing-audit');
    return;
  }
  if(args.selfTest){selfTest();return;}
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL hiányzik.');
  const locs=[
    {key:'ciuc',shop:str(process.env.SHOPIFY_LOCATION_CSIKSZEREDA_ID)},
    {key:'kezdi',shop:str(process.env.SHOPIFY_LOCATION_KEZDI_ID)}
  ];
  if(locs.some(x=>!x.shop) || !process.env.AIF_LOCATION_CSIKSZEREDA_ID || !process.env.AIF_LOCATION_KEZDI_ID)
    throw new Error('A két Shopify és AllIn üzletazonosítója hiányzik a környezeti változókból.');
  const {families:raw,issues}=await loadCatalogSnapshot(args.source,{useExistingAudit:args.useExistingAudit});
  console.log(`\nAktuálisan több színre bontott modellcsaládok: ${raw.length}`);
  const familyList=raw.filter(x=>!args.model || norm(x.model).split(':').at(-1)===norm(args.model).split(':').at(-1));
  if(!familyList.length)throw new Error('A megadott modell nem szerepel az aktuális auditban.');
  const names=new Set(familyList.map(x=>x.modelKey));
  if(names.size!==familyList.length)throw new Error('Ismétlődő család az auditban.');
  const report=[];
  const db=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});
  try{
    for(let i=0;i<familyList.length;i++){
      const family=familyList[i];
      try {
        const live=[];
        for(const item of family.products||[]){
          live.push(await readProduct(item.id));
          await sleep(250);
        }
        const maps=await readMappings(db,live.map(x=>x.id));
        const detail=compareFamily(family,live,maps,locs);
        report.push(detail);
        console.log(`[${i+1}/${familyList.length}] ${detail.modelKey}: ${detail.technicalStatus} | ${detail.productCount} termék, ${detail.variantCount} SKU, ${detail.blockers.length} blokk, ${detail.reviews.length} felülvizsgálat`);
      } catch(error) {
        const failed={brand:family.brand,model:family.model,modelKey:family.modelKey,
          productCount:family.productCount,colorCount:(family.colorCodes||[]).length,
          variantCount:0,mediaCount:0,shopifyQty:0,allInQty:0,
          technicalStatus:'BLOCKED',blockers:[`READ_OR_DB_FAILED:${str(error.message)}`],reviews:[],products:[]};
        report.push(failed);
        console.log(`[${i+1}/${familyList.length}] ${family.modelKey}: BLOCKED (lekérdezési hiba, a többi modellt folytatjuk)`);
      }
    }
    const out=path.resolve(args.out);
    await fs.mkdir(out,{recursive:true});
    const unknownSku=issues.filter(x=>x.type==='SHOPIFY_ACTIVE_SKU_NOT_IN_ALLIN')
      .map(x=>({sku:x.sku,handle:x.handle,productId:x.productId,adminInventory:x.adminInventory}));
    await fs.writeFile(path.join(out,'families.json'),JSON.stringify({generatedAt:new Date().toISOString(),readOnly:true,models:report},null,2)+'\n');
    const compact=report.map(r=>({
      marka:r.brand,modell:r.model,termekek:r.productCount,szinek:r.colorCount,
      sku:r.variantCount,shopifyKeszlet:r.shopifyQty,allInKeszlet:r.allInQty,
      status:r.technicalStatus,blokk:r.blockers.join(' | '),ellenorizendo:r.reviews.join(' | ')
    }));
    await fs.writeFile(path.join(out,'families.csv'),makeCsv(compact,
      ['marka','modell','termekek','szinek','sku','shopifyKeszlet','allInKeszlet','status','blokk','ellenorizendo']));
    await fs.writeFile(path.join(out,'shopify-sku-without-allin.json'),JSON.stringify(unknownSku,null,2)+'\n');
    console.log('\n=== MODELLCSALÁDOK ELŐELLENŐRZÉSE (NINCS ÍRÁS) ===');
    if(args.details){
      // Readable in Render Shell and its logs; no follow-up families.json read.
      for(const line of buildDetailsLines(report))console.log(line);
    }else{
      console.table(compact.map(x=>({
        marka:x.marka,modell:x.modell,termekek:x.termekek,variansok:x.sku,
        shopify:x.shopifyKeszlet,allIn:x.allInKeszlet,
        allapot:x.status,blokkok:x.blokk?x.blokk.split(' | ').length:0,
        vizsgalat:x.ellenorizendo?x.ellenorizendo.split(' | ').length:0
      })));
    }
    console.log(`\n=== ${unknownSku.length} ELLENŐRZENDŐ, ALLIN-BEN NEM TALÁLT AKTÍV SHOPIFY SKU ===`);
    console.table(unknownSku);
    console.log('Jelentések:',out);
    console.log('Minden lekérdezés OLVASÁSI művelet. TECHNICAL_OK sem jogosít éles egyesítésre.');
  } finally {await db.end();}
}

if(process.argv[1] && path.resolve(process.argv[1])===new URL(import.meta.url).pathname)
  main().catch(error=>{console.error('ELŐELLENŐRZÉS HIBA:',error.message);process.exitCode=1;});
export { parseArgs,optionKind,option,compareFamily,makeCsv,loadCatalogSnapshot,runFreshAudit };
