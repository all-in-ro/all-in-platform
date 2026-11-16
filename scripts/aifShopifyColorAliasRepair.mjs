/**
 * AllInFashion Shopify: ugyanazon TERMÉKEN belüli színfelirat-duplikációk.
 * Példa: VERDE INCHIS / Verde închis ugyanaz a szín, nem két szín.
 *
 * Terv és teljes audit: CSAK OLVASÁS.
 * Élesítés: SHA-256 tervmegerősítés + közös Shopify PostgreSQL-zár.
 * Csak a variáns meglévő Shopify opcióérték-ID-jét cseréli le;
 * SKU, EAN, készlet, ár, képek, AllIn variant mapping változatlan.
 * Ha a normalizálás után két SKU ugyanazt az opciókombinációt kapná,
 * a terméket BLOCKED-nak jelöli, nem próbálja meg eltüntetni a duplikációt.
 *
 * node scripts/aifShopifyColorAliasRepair.mjs --self-test
 * node scripts/aifShopifyColorAliasRepair.mjs --audit --all
 * node scripts/aifShopifyColorAliasRepair.mjs --plan --handle 4f-4fjwaw26tswsm2693
 * node scripts/aifShopifyColorAliasRepair.mjs --apply --handle 4f-4fjwaw26tswsm2693 --confirm <SHA>
 * node scripts/aifShopifyColorAliasRepair.mjs --plan --all
 * node scripts/aifShopifyColorAliasRepair.mjs --apply --all --confirm <GLOBAL_SHA>
 */
import { createHash } from 'node:crypto';
import pg from 'pg';
import { shopifyGraphql, acquireAifShopifyProcessLock } from '../api/lib/aifShopify.js';
import { colorIdentityKey, preferredColorLabel } from '../api/lib/aifShopifyColorNames.js';

const str = v => String(v ?? '').trim();
const sha = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const invariant = (condition, code, details) => {
  if (condition) return;
  const error = new Error(code);
  error.code = code;
  error.details = details;
  throw error;
};
const isColor = name => ['culoare','color','colour','szin'].includes(colorIdentityKey(name));
const isSize = name => ['marime','size','meret','taille'].includes(colorIdentityKey(name));
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

const LIST_QUERY = `query AifColorAliasList($after:String) {
  products(first:50,after:$after) {
    pageInfo {hasNextPage endCursor}
    nodes {id handle status title options {id name position optionValues {id name hasVariants}}}
  }
}`;
const PRODUCT_QUERY = `query AifColorAliasFull($id:ID!) {
  product(id:$id) {
    id handle title status
    options {id name position optionValues {id name hasVariants}}
    variants(first:250) {
      pageInfo {hasNextPage}
      nodes {
        id sku barcode price compareAtPrice inventoryQuantity
        inventoryItem {id}
        image {id}
        selectedOptions {name value}
      }
    }
  }
}`;

const UPDATE = `mutation AifColorAliasVariants($productId:ID!,$variants:[ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId:$productId,variants:$variants,allowPartialUpdates:false) {
    productVariants {id selectedOptions {name value}}
    userErrors {field message}
  }
}`;
const DELETE_UNUSED = `mutation AifColorAliasPrune($productId:ID!,$option:OptionUpdateInput!,$values:[ID!]!) {
  productOptionUpdate(productId:$productId,option:$option,optionValuesToDelete:$values,variantStrategy:LEAVE_AS_IS) {
    userErrors {field message code}
    product {id}
  }
}`;

async function graphql(query,vars) {
  const response=await shopifyGraphql(query,vars);
  invariant(response && !response.errors?.length,'GRAPHQL_ERROR',response?.errors || response);
  return response.data;
}

async function listActiveProducts() {
  const all=[];
  const seen=new Set();
  let after=null;
  for(let page=0;page<100;page++) {
    const data=await graphql(LIST_QUERY,{after});
    const conn=data?.products;
    invariant(conn?.pageInfo && Array.isArray(conn.nodes),'CATALOG_PAGE_MISSING',page);
    for(const p of conn.nodes) {
      if(p.status==='ACTIVE') all.push(p);
    }
    if(!conn.pageInfo.hasNextPage) return all;
    after=conn.pageInfo.endCursor;
    invariant(after && !seen.has(after),'CATALOG_CURSOR_INVALID',page);
    seen.add(after);
  }
  invariant(false,'CATALOG_PAGE_LIMIT');
}

async function loadFullProduct(id) {
  const p=(await graphql(PRODUCT_QUERY,{id}))?.product;
  invariant(p?.id === id,'PRODUCT_NOT_FOUND',id);
  invariant(!p.variants?.pageInfo?.hasNextPage,'VARIANT_PAGINATION',p.handle);
  invariant(Array.isArray(p.variants?.nodes),'VARIANTS_MISSING',p.handle);
  return p;
}

function colorOption(product) {
  const colorOpts=(product.options||[]).filter(x=>isColor(x.name));
  if(colorOpts.length !== 1) return null;
  return colorOpts[0];
}

function aliasGroups(product) {
  const option=colorOption(product);
  if(!option) return [];
  const groups=new Map();
  for(const value of option.optionValues||[]) {
    const key=colorIdentityKey(value.name);
    const list=groups.get(key)||[];
    list.push(value);
    groups.set(key,list);
  }
  return [...groups].filter(([,list])=>list.length>1).map(([key,values])=>({key,values}));
}

// Product ID + variánsazonosítók + SKU, ár, készlet, kép, opciók.
// Ezt a teljes pillanatképet újraellenőrzi az APPLY a jóváhagyott terv ellen.
function snapshot(product) {
  return {
    productId: product.id, handle:product.handle, status:product.status,
    options:(product.options||[]).map(o=>({
      id:o.id,name:o.name,position:o.position,
      values:(o.optionValues||[]).map(v=>({id:v.id,name:v.name,hasVariants:v.hasVariants})).sort((a,b)=>a.id.localeCompare(b.id)),
    })).sort((a,b)=>a.position-b.position),
    variants:product.variants.nodes.map(v=>({
      id:v.id, sku:v.sku, barcode:v.barcode, price:v.price,
      compareAtPrice:v.compareAtPrice,
      inventoryQuantity:v.inventoryQuantity,
      inventoryItemId:v.inventoryItem?.id||null,
      imageId:v.image?.id||null,
      selectedOptions:(v.selectedOptions||[]).map(o=>({name:o.name,value:o.value})),
    })).sort((a,b)=>a.id.localeCompare(b.id)),
  };
}

function chosenValues(product,variant) {
  const values=[];
  for(const option of [...product.options].sort((a,b)=>a.position-b.position)) {
    const chosen=(variant.selectedOptions||[]).find(o=>o.name===option.name);
    invariant(chosen,'MISSING_VARIANT_OPTION',{sku:variant.sku,option:option.name});
    const optionValue=(option.optionValues||[]).find(v=>v.name===chosen.value);
    invariant(optionValue,'MISSING_OPTION_VALUE',{sku:variant.sku,option:option.name,value:chosen.value});
    values.push({optionId:option.id,id:optionValue.id});
  }
  return values;
}

function analyze(product) {
  const color=colorOption(product);
  const groups=aliasGroups(product);
  const snap=snapshot(product);
  const details=[];
  const toCanonical=new Map();
  const oldValues=[];
  const errors=[];
  if(!color) return {status:'CLEAN',handle:product.handle,productId:product.id,hash:sha(snap),variants:snap.variants.length,groups:[],updates:[],collisions:[],deletions:[]};

  for(const {key,values} of groups) {
    const canonicalName=preferredColorLabel(values.map(v=>v.name));
    const canonical=values.find(v=>v.name===canonicalName) || values.find(v=>colorIdentityKey(v.name)===key);
    invariant(canonical,'NO_CANONICAL_VALUE',key);
    const extras=values.filter(v=>v.id!==canonical.id);
    details.push({identity:key,canonical:canonical.name,canonicalValueId:canonical.id,
      variantsBefore:values.map(v=>({name:v.name,id:v.id,hasVariants:v.hasVariants})),
      renameToPolishedName:canonical.name!==canonicalName,aliases:extras.map(v=>v.name)});
    // Meglévő optionValue ID-t használunk, új opciót nem generálunk.
    for(const extra of extras) {
      toCanonical.set(extra.id,canonical.id);
      oldValues.push(extra);
    }
  }

  const updates=[];
  const projectedCombination=new Map();
  const collisions=[];
  for(const v of product.variants.nodes) {
    const optionValues=chosenValues(product,v);
    const corrected=optionValues.map(opt=>({...opt,id:toCanonical.get(opt.id)||opt.id}));
    const key=corrected.map(x=>x.id).join('::');
    const entry=projectedCombination.get(key)||[];
    entry.push({sku:v.sku,id:v.id});
    projectedCombination.set(key,entry);
    if(!same(optionValues,corrected)) {
      const before=(v.selectedOptions||[]).find(o=>isColor(o.name))?.value;
      const canon=details.find(d=>d.variantsBefore.some(z=>z.name===before));
      updates.push({id:v.id,sku:v.sku,from:before,to:canon?.canonical||before,
        size:(v.selectedOptions||[]).find(o=>isSize(o.name))?.value||'',
        optionValues:corrected});
    }
  }
  for(const values of projectedCombination.values()) if(values.length>1) collisions.push(values);
  if(collisions.length) errors.push('AZONOS_SZIN_MERET_TO_BB_SKU: az összevonás után ugyanaz az opciókombináció többször szerepelne.');
  if(details.some(d=>d.renameToPolishedName)) {
    // Ha csak a nagybetűs verzió létezik az opciócsoport egyik tagjaként,
    // akkor sem cserélünk itt opcióérték-ID-t átnevezés céljából.
    // Egy későbbi külön, ellenőrzött címkeátnevezés kezelheti.
    errors.push('PREFERRED_NAME_NOT_EXISTING: a választott színnév még nem létezik.');
  }
  const seenSku=new Set();
  for(const v of product.variants.nodes) {
    const s=str(v.sku);
    if(!s || seenSku.has(s)) errors.push('DUPLICATE_OR_MISSING_SKU');
    seenSku.add(s);
  }
  const state=errors.length ? 'BLOCKED' : (updates.length || oldValues.length ? 'READY' : 'CLEAN');
  const guard={snap,details,updates,oldValues:oldValues.map(v=>({id:v.id,name:v.name}))};
  return {
    status:state,handle:product.handle,productId:product.id,
    totalStock:product.variants.nodes.reduce((acc,v)=>acc+Number(v.inventoryQuantity||0),0),
    variants:product.variants.nodes.length,
    groups:details,updates,collisions,errors,
    deletions:oldValues.map(v=>({id:v.id,name:v.name})),hash:sha(guard),
  };
}

// A terv célja CSAK meglevő opcióértékek átkötése, nem SKU- vagy készletmódosítás.
function identityAfter(snap, plan) {
  const fromTo=new Map(plan.updates.map(u=>[u.id,u.to]));
  return snap.variants.map(v=>({
    ...v,
    selectedOptions:v.selectedOptions.map(o=>isColor(o.name)&&fromTo.has(v.id)
      ? {...o,value:fromTo.get(v.id)} : o),
  }));
}

function verifyAfter(before,after,plan) {
  const a=snapshot(before),b=snapshot(after);
  const expected=identityAfter(a,plan);
  invariant(same(expected,b.variants),'POST_VERIFY_VARIANTS_CHANGED',{
    expected,actual:b.variants,
  });
  invariant(a.productId===b.productId&&a.handle===b.handle&&a.status===b.status,
    'POST_VERIFY_PRODUCT_CHANGED');
}

async function applyOne(productId,expectedHash,preloaded=null) {
  let product=preloaded || await loadFullProduct(productId);
  let plan=analyze(product);
  invariant(plan.hash===expectedHash,'PLAN_CHANGED',{expectedHash,actualHash:plan.hash,plan});
  invariant(plan.status==='READY','NOT_READY',plan);
  const before=product;
  if(plan.updates.length) {
    const result=(await graphql(UPDATE,{
      productId,
      variants:plan.updates.map(u=>({id:u.id,optionValues:u.optionValues})),
    }))?.productVariantsBulkUpdate;
    invariant(result && !result.userErrors?.length,'UPDATE_FAILED',result?.userErrors||result);
    invariant(result.productVariants?.length===plan.updates.length,
      'UPDATE_COUNT_MISMATCH',result?.productVariants);
    product=await loadFullProduct(productId);
    verifyAfter(before,product,plan);
  }
  // A korábbi alias opcióértéknek a variánsváltás után üresnek kell lennie.
  const option=colorOption(product);
  const removed=plan.deletions.filter(d=>(option?.optionValues||[]).some(v=>v.id===d.id));
  const deletable=removed.filter(d=>(option.optionValues||[]).find(v=>v.id===d.id)?.hasVariants===false);
  invariant(deletable.length===removed.length,'OLD_VALUES_STILL_IN_USE',removed);
  if(deletable.length) {
    const result=(await graphql(DELETE_UNUSED,{
      productId,option:{id:option.id},values:deletable.map(v=>v.id),
    }))?.productOptionUpdate;
    invariant(result && !result.userErrors?.length,'DELETE_UNUSED_FAILED',result?.userErrors||result);
    const final=await loadFullProduct(productId);
    verifyAfter(before,final,plan);
    const colorFinal=colorOption(final);
    invariant(deletable.every(d=>!colorFinal.optionValues.some(v=>v.id===d.id)),
      'ORPHAN_VALUES_REMAIN',deletable);
    product=final;
  }
  return {
    handle:plan.handle,updatedVariants:plan.updates.map(v=>v.sku),
    mergedColorGroups:plan.groups.map(g=>({from:g.aliases,to:g.canonical})),
    removedUnusedOptionValues:deletable.map(v=>v.name),
    variantCount:product.variants.nodes.length,
    totalStock:product.variants.nodes.reduce((s,v)=>s+Number(v.inventoryQuantity||0),0),
    warnings:[],
  };
}

// A teljes Shopify-lista színopcióit már a gyors lekérdezésben megvizsgáljuk.
// A drágább részletes variánslekérdezésre csak a tényleges aliasjelöltek kerülnek.
// Így a CLEAN nem marad hamisan 0, amikor nincs javítandó termék.
function catalogAuditSummary(activeProducts, candidateProducts, plans) {
  const withColorOption = activeProducts.filter((product) => Boolean(colorOption(product))).length;
  const noColorOption = activeProducts.length - withColorOption;
  const counts = {
    READY: 0,
    BLOCKED: 0,
    CLEAN: withColorOption - candidateProducts.length,
  };
  for (const plan of plans) {
    invariant(Object.hasOwn(counts, plan.status), 'UNKNOWN_PLAN_STATUS', plan.status);
    counts[plan.status] += 1;
  }
  invariant(
    counts.READY + counts.BLOCKED + counts.CLEAN === withColorOption,
    'AUDIT_TOTAL_MISMATCH',
    { counts, withColorOption, candidates: candidateProducts.length },
  );
  return {
    activeProductsScanned: activeProducts.length,
    productsWithColorOption: withColorOption,
    productsWithoutColorOption: noColorOption,
    candidateProducts: candidateProducts.length,
    detailedProductsChecked: plans.length,
    counts,
  };
}

async function buildAllPlans() {
  const activeProducts = await listActiveProducts();
  const candidates = activeProducts
    .filter((product) => aliasGroups(product).length > 0)
    .sort((a, b) => a.handle.localeCompare(b.handle));
  const plans = [];
  for (const short of candidates) {
    try { plans.push(analyze(await loadFullProduct(short.id))); }
    catch (error) {
      plans.push({
        productId: short.id,
        handle: short.handle,
        status: 'BLOCKED',
        errors: [error.code || error.message],
      });
    }
  }
  const ready = plans.filter((plan) => plan.status === 'READY');
  const summary = catalogAuditSummary(activeProducts, candidates, plans);
  // A korábbi SHA-képzés változatlan: az éles művelet csak a részletes tervekhez kötött.
  const fingerprint = sha(plans.map(p=>({id:p.productId,status:p.status,hash:p.hash||null,errors:p.errors||[]})));
  return { plans, ready, fingerprint, summary };
}

function printPlan(plan) {
  console.log(JSON.stringify({
    handle:plan.handle,status:plan.status,variants:plan.variants,totalStock:plan.totalStock,
    groups:plan.groups,updates:plan.updates?.map(u=>({sku:u.sku,size:u.size,from:u.from,to:u.to})),
    collisions:plan.collisions,errors:plan.errors,deletions:plan.deletions,hash:plan.hash,
  },null,2));
}

function parseArgs(argv) {
  const args={};
  for(let i=0;i<argv.length;i++) {
    const a=argv[i];
    if(['--self-test','--audit','--plan','--apply','--all'].includes(a)) args[a==='--self-test'?'selfTest':a.slice(2)]=true;
    else if(['--handle','--confirm'].includes(a)) args[a.slice(2)]=argv[++i];
    else invariant(false,'UNKNOWN_ARG',a);
  }
  invariant(args.selfTest || Number(!!args.audit)+Number(!!args.plan)+Number(!!args.apply)===1,
    'ONE_MODE_REQUIRED');
  invariant(args.selfTest || (!!args.all !== !!args.handle),'CHOOSE_HANDLE_OR_ALL');
  invariant(!args.apply || /^[a-f0-9]{64}$/i.test(str(args.confirm)),'CONFIRM_SHA_REQUIRED');
  return args;
}

function selfTest() {
  const sample=(size1='128',size2='158')=>({
    id:'gid://shopify/Product/1',handle:'4f-4fjwaw26tswsm2693',status:'ACTIVE',
    options:[
      {id:'gid://shopify/ProductOption/10',name:'Culoare',position:1,optionValues:[
        {id:'gid://shopify/ProductOptionValue/1',name:'VERDE INCHIS',hasVariants:true},
        {id:'gid://shopify/ProductOptionValue/2',name:'Verde închis',hasVariants:true},
      ]},
      {id:'gid://shopify/ProductOption/11',name:'Mărime',position:2,optionValues:[
        {id:'gid://shopify/ProductOptionValue/3',name:'128',hasVariants:true},
        {id:'gid://shopify/ProductOptionValue/4',name:'158',hasVariants:true},
      ]},
    ],
    variants:{pageInfo:{hasNextPage:false},nodes:[
      {id:'gid://shopify/ProductVariant/1',sku:'SKU1',barcode:'SKU1',price:'89.50',compareAtPrice:null,inventoryQuantity:1,inventoryItem:{id:'ii1'},image:{id:'im1'},selectedOptions:[{name:'Culoare',value:'VERDE INCHIS'},{name:'Mărime',value:size1}]},
      {id:'gid://shopify/ProductVariant/2',sku:'SKU2',barcode:'SKU2',price:'89.50',compareAtPrice:null,inventoryQuantity:2,inventoryItem:{id:'ii2'},image:{id:'im1'},selectedOptions:[{name:'Culoare',value:'Verde închis'},{name:'Mărime',value:size2}]},
    ]},
  });
  const good=sample();
  const plan=analyze(good);
  invariant(plan.status==='READY'&&plan.updates.length===1&&plan.updates[0].to==='Verde închis',
    'TEST_ALIAS_MERGE',plan);
  const after=structuredClone(good);
  after.variants.nodes[0].selectedOptions[0].value='Verde închis';
  verifyAfter(good,after,plan);
  const collision=analyze(sample('158','158'));
  invariant(collision.status==='BLOCKED'&&collision.collisions.length===1,'TEST_COLLISION',collision);
  const copy=structuredClone(good);
  copy.variants.nodes[1].inventoryQuantity=3;
  invariant(analyze(copy).hash!==plan.hash,'TEST_STOCK_FINGERPRINT');
  invariant(colorIdentityKey('VERDE INCHIS')===colorIdentityKey('Verde închis'),'TEST_COLOR_KEY');
  const cleanColorProduct = { options: [
    { name: 'Culoare', optionValues: [{ name: 'Verde închis' }] },
  ] };
  const noColorProduct = { options: [{ name: 'Mărime', optionValues: [{ name: '128' }] }] };
  const candidateProduct = { options: [
    { name: 'Culoare', optionValues: [{ name: 'VERDE INCHIS' }, { name: 'Verde închis' }] },
  ] };
  const summary = catalogAuditSummary(
    [cleanColorProduct, noColorProduct, candidateProduct],
    [candidateProduct],
    [{ status: 'READY' }],
  );
  invariant(
    summary.activeProductsScanned === 3 &&
    summary.productsWithColorOption === 2 &&
    summary.productsWithoutColorOption === 1 &&
    summary.counts.CLEAN === 1 &&
    summary.counts.READY === 1,
    'TEST_AUDIT_SUMMARY', summary,
  );
  console.log('ÖNELLENŐRZÉS: OK (színékezet, ütközés tiltva, készlet/SKU/kép verifikáció, SHA-256, valódi auditösszesítés)');
}

async function main() {
  const args=parseArgs(process.argv.slice(2));
  if(args.selfTest) {selfTest();return;}

  if(args.apply) {
    const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
    let lock;
    try {
      lock=await acquireAifShopifyProcessLock(pool);
      invariant(lock?.locked,'PROCESSOR_BUSY','Shopify-szinkron foglalt, nincs módosítás.');
      if(args.all) {
        const report=await buildAllPlans();
        invariant(report.fingerprint===args.confirm,'PLAN_CHANGED',{
          expected:args.confirm,actual:report.fingerprint,
          readyProducts:report.ready.map(p=>p.handle),
        });
        console.log(`JÓVÁHAGYOTT CSOPORT: ${report.ready.length} termék; BLOCKED: ${report.plans.length-report.ready.length}`);
        for(const p of report.ready) {
          const result=await applyOne(p.productId,p.hash);
          console.log('OK TERMÉK:',JSON.stringify(result));
        }
      } else {
        const listed=(await listActiveProducts()).find(p=>p.handle===args.handle);
        invariant(listed,'UNKNOWN_HANDLE',args.handle);
        const result=await applyOne(listed.id,args.confirm);
        console.log('SZÍNNÉV-EGYESÍTÉS EREDMÉNYE\n'+JSON.stringify(result,null,2));
      }
    } finally {
      if(lock) await lock.release();
      await pool.end();
    }
    return;
  }
  if(args.handle) {
    const listed=(await listActiveProducts()).find(p=>p.handle===args.handle);
    invariant(listed,'UNKNOWN_HANDLE',args.handle);
    const plan=analyze(await loadFullProduct(listed.id));
    console.log('\nSZÍNNÉV-EGYESÍTÉS TERVE (NINCS MÓDOSÍTÁS)');
    printPlan(plan);
    if(plan.status==='READY') console.log(`\nÉLES FUTTATÁS:\nnode scripts/aifShopifyColorAliasRepair.mjs --apply --handle ${plan.handle} --confirm ${plan.hash}`);
    return;
  }
  const report=await buildAllPlans();
  const summary=report.summary;
  console.log('\nSHOPIFY SZÍNELNEVEZÉS-AUDIT (CSAK OLVASÁS)');
  console.log(`Aktív Shopify-termékek átvizsgálva: ${summary.activeProductsScanned}`);
  console.log(`Színopcióval rendelkező termékek: ${summary.productsWithColorOption}`);
  console.log(`Színopció nélküli termékek: ${summary.productsWithoutColorOption}`);
  console.log(`Részletesen ellenőrzött aliasjelöltek: ${summary.detailedProductsChecked}`);
  if (report.plans.length) {
    console.table(report.plans.map(p=>({
      handle:p.handle,status:p.status,colors:p.groups?.map(g=>g.variantsBefore.map(v=>v.name).join(' / ')).join(' | ')||'',
      updates:p.updates?.length||0,collisions:p.collisions?.length||0,
    })));
  } else {
    console.log('Nem található azonos terméken belüli, csak írásmódban eltérő színpár.');
  }
  console.log('ÖSSZESEN:', summary.counts, '| Aliasjelöltek:', summary.candidateProducts);
  console.log('CLEAN = ellenőrzött színopciókban nincs duplikált színnév; nem a teljes SKU- vagy készletaudit eredménye.');
  console.log('Külön Shopify-termékek összevonását ez az ellenőrzés nem vizsgálja.');
  if(args.plan) {
    for(const p of report.plans.filter(p=>p.status==='BLOCKED')) {
      console.log(`\nBLOKKOLT: ${p.handle}`);printPlan(p);
    }
    if(report.ready.length) {
      console.log('\nTELJES BIZTONSÁGOS TERV UJJLENYOMATA:',report.fingerprint);
      console.log(`ÉLES FUTTATÁS CSAK A READY TERMÉKEKHEZ:\nnode scripts/aifShopifyColorAliasRepair.mjs --apply --all --confirm ${report.fingerprint}`);
    } else {
      console.log('\nNincs biztonságosan egyesíthető termék. Éles futtatás nem indokolt.');
    }
  }
}

main().catch(error=>{
  console.error('\nSZÍNNÉV ELLENŐRZÉS / JAVÍTÁS BLOKKOLVA:',error.code||'ERROR',error.message);
  if(error.details) console.dir(error.details,{depth:6});
  process.exitCode=1;
});
