import {mkdir,readFile,writeFile,open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const check=(ok,msg)=>{if(!ok)throw Error(msg);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function throttle(response) {
  const cost=response.extensions?.cost, t=cost?.throttleStatus;
  const delay=t?.restoreRate>0 ? Math.max(350,Math.ceil((Number(cost.requestedQueryCost||200)+50-Number(t.currentlyAvailable||0))/t.restoreRate*1000)) : 500;
  await pause(Math.min(30000,delay));
}
export function cents(value) {
  const s=String(value??'').trim(),m=/^(\d+)(?:\.(\d+))?$/.exec(s);
  check(m && !/[1-9]/.test((m[2]||'').slice(2)),`Érvénytelen pénzösszeg: ${s}`);
  const n=Number(m[1])*100+Number(((m[2]||'')+'00').slice(0,2));
  check(Number.isSafeInteger(n),'Túl nagy pénzösszeg.');return n;
}
export const money=n=>(n/100).toFixed(2);
const fields=`id sku barcode price compareAtPrice product { id title status }`;
export const localSQL=`SELECT v.id::text AS variant_id,v.barcode,v.internal_sku,v.size,v.color_code,
  v.sell_price,v.status AS variant_status,p.status AS model_status,p.title_ro AS title,
  m.sku AS mapped_sku,m.shopify_product_id,m.shopify_variant_id,m.shopify_inventory_item_id
  FROM aif_product_variants v JOIN aif_product_models p ON p.id=v.model_id
  LEFT JOIN aif_shopify_variant_map m ON m.variant_id=v.id`;
function remoteValid(v) {
  check(v && /^gid:\/\/shopify\/ProductVariant\/\d+$/.test(v.id) &&
    /^gid:\/\/shopify\/Product\/\d+$/.test(v.product?.id) && typeof v.sku==='string' &&
    ['ACTIVE','ARCHIVED','DRAFT','UNLISTED'].includes(v.product.status),'Hiányos Shopify-variánsválasz.');
  cents(v.price);if(v.compareAtPrice!==null)cents(v.compareAtPrice);
}
export async function allRemote(api) {
  const out=[],seen=new Set(),cursors=new Set();let after=null;
  for(let page=0;page<10000;page++) {
    const r=await api.shopifyGraphql(`query PriceRaiseCatalog($after:String) {
      productVariants(first:100,after:$after) { nodes { ${fields} } pageInfo { hasNextPage endCursor } }
    }`,{after});
    const c=r.data?.productVariants;
    check(Array.isArray(c?.nodes) && typeof c.pageInfo?.hasNextPage==='boolean','Hiányos Shopify-lap; nincs ármódosítás.');
    for(const v of c.nodes){remoteValid(v);check(!seen.has(v.id),'Ismétlődő Shopify-azonosító a lapozásban.');seen.add(v.id);out.push(v);}
    if(!c.pageInfo.hasNextPage)return out;
    after=c.pageInfo.endCursor;check(after && !cursors.has(after),'Hibás Shopify-lapozás.');cursors.add(after);
    if(page%10===0)console.log(`Shopify árak beolvasva: ${out.length} variáns...`);
    await throttle(r);
  }
  throw Error('Túl sok Shopify-lap; nincs részleges terv.');
}
export function identity(local,remote) {
  check(local.variant_status==='active' && local.model_status==='active','Inaktív belső termék/variáns.');
  check(local.shopify_variant_id && local.shopify_product_id,'Nincs tárolt Shopify-párosítás.');
  remoteValid(remote);
  check(remote.id===local.shopify_variant_id && remote.product.id===local.shopify_product_id,'Eltérő Shopify-párosítás.');
  check(remote.product.status==='ACTIVE','A Shopify-termék nem aktív.');
  const aliases=[local.barcode,local.internal_sku].map(x=>String(x||'').trim()).filter(Boolean);
  check(remote.sku && aliases.includes(remote.sku),'Az élő SKU nem egyezik a belső vonalkóddal/SKU-val.');
  check(!remote.barcode || (local.barcode && remote.barcode===local.barcode),'Eltérő Shopify-vonalkód.');
}
export function buildPlan(locals,remotes,shop,now=new Date()) {
  const byId=new Map(remotes.map(v=>[v.id,v]));
  const activeSku=new Map();
  for(const v of remotes)if(v.product.status==='ACTIVE')activeSku.set(v.sku,(activeSku.get(v.sku)||0)+1);
  const localBarcode=new Map(),mappedIds=new Map();
  for(const l of locals){if(l.barcode)localBarcode.set(l.barcode,(localBarcode.get(l.barcode)||0)+1);
    if(l.shopify_variant_id)mappedIds.set(l.shopify_variant_id,(mappedIds.get(l.shopify_variant_id)||0)+1);}
  const items=[],skipped=[],counts={equal:0,internalLower:0,raise:0,blocked:0};
  for(const l of locals) {
    try {
      const v=byId.get(l.shopify_variant_id);identity(l,v);
      check(mappedIds.get(v.id)===1,'Több belső variáns ugyanarra a Shopify-variánsra mutat.');
      check(!l.barcode || localBarcode.get(l.barcode)===1,'Többszörös belső vonalkód.');
      check(activeSku.get(v.sku)===1,'Több aktív Shopify-variáns használja ezt az SKU-t.');
      const from=cents(v.price),to=cents(l.sell_price);check(to>0,'Hiányzó/nulla belső eladási ár.');
      if(to===from){counts.equal++;continue;}
      if(to<from){counts.internalLower++;continue;}
      // Preserve compare-at prices. Conflicting sale metadata requires a separate decision.
      check(v.compareAtPrice===null || cents(v.compareAtPrice)>to,'Az áthúzott Shopify-ár nem lenne magasabb az új árnál. Külön rendezendő.');
      items.push({variantId:l.variant_id,productId:v.product.id,shopifyVariantId:v.id,sku:v.sku,
        barcode:l.barcode||null,internalSku:l.internal_sku||null,title:l.title||v.product.title,size:l.size,color:l.color_code,
        from:money(from),to:money(to),compareAtPrice:v.compareAtPrice===null?null:money(cents(v.compareAtPrice))});counts.raise++;
    }catch(e){skipped.push({variantId:l.variant_id,sku:l.barcode||l.internal_sku,title:l.title,reason:e.message});counts.blocked++;}
  }
  return {version:1,kind:'allin-shopify-price-raise',createdAt:now.toISOString(),shop,currency:'RON',counts,items,skipped};
}
const digest=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
export function wrapPlan(plan){return {sha256:digest(plan),plan};}
export function validatePlan(envelope,shop) {
  const p=envelope?.plan;
  check(p && envelope.sha256===digest(p),'A tervfájl sérült vagy megváltozott.');
  check(p.version===1 && p.kind==='allin-shopify-price-raise' && p.shop===shop && p.currency==='RON' && Array.isArray(p.items),'Másik bolt vagy érvénytelen terv.');
  const age=Date.now()-Date.parse(p.createdAt);check(Number.isFinite(age)&&age>=-300000&&age<=86400000,'A terv 24 óránál régebbi; készíts új ellenőrzést.');
  const local=new Set(),remote=new Set();
  for(const x of p.items){check(!local.has(x.variantId)&&!remote.has(x.shopifyVariantId),'Duplikált sor a tervben.');local.add(x.variantId);remote.add(x.shopifyVariantId);
    check(cents(x.to)>cents(x.from),'A terv árcsökkentést vagy változatlan árat tartalmaz.');}
  return p;
}
async function freshRemote(api,item) {
  const r=await api.shopifyGraphql(`query PriceRaiseOne($id:ID!,$query:String!) {
    productVariant(id:$id) { ${fields} }
    productVariants(first:100,query:$query) { nodes { id sku product { status } } pageInfo { hasNextPage } }
  }`,{id:item.shopifyVariantId,query:`sku:${JSON.stringify(item.sku)}`});
  const c=r.data?.productVariants;
  check(Array.isArray(c?.nodes)&&c.pageInfo?.hasNextPage===false,'Hiányos/túl sok SKU-találat.');
  check(c.nodes.every(v=>v?.id && typeof v.sku==='string' && ['ACTIVE','ARCHIVED','DRAFT','UNLISTED'].includes(v.product?.status)), 'Hiányos SKU-találat.');
  const matches=c.nodes.filter(v=>v.sku===item.sku && v.product?.status==='ACTIVE');
  check(matches.length===1 && matches[0].id===item.shopifyVariantId,'Az SKU élő találata nem egyedi vagy megváltozott.');
  const v=r.data?.productVariant;remoteValid(v);return v;
}
export async function applyOne(db,api,item,journal) {
  await db.query('BEGIN');let attempted=false;
  try {
    await db.query("SET LOCAL lock_timeout='5s'");
    // Lock only the affected rows; local prices/mappings cannot change during this write.
    const result=await db.query(localSQL.replace('LEFT JOIN','JOIN')+' WHERE v.id=$1::uuid FOR UPDATE OF v,p,m',[item.variantId]);
    check(result.rows.length===1,'Hiányzó belső variáns/párosítás.');const l=result.rows[0];
    check(l.shopify_variant_id===item.shopifyVariantId && l.shopify_product_id===item.productId,'A párosítás a terv óta megváltozott.');
    check(cents(l.sell_price)===cents(item.to),'A belső ár a terv óta megváltozott.');
    const duplicates=await db.query(`SELECT count(*)::int AS n FROM aif_product_variants
      WHERE barcode=$1 AND id<>$2::uuid`,[l.barcode,item.variantId]);
    check(duplicates.rows[0]?.n===0,'Többszörös belső vonalkód.');
    const v=await freshRemote(api,item);identity(l,v);
    const current=cents(v.price),target=cents(item.to);
    if(current===target){await db.query('ROLLBACK');await journal({status:'already_correct',item});return 'already_correct';}
    check(current===cents(item.from),'A Shopify-ár a terv óta megváltozott; új ellenőrzés szükséges.');
    check(target>current,'Árcsökkentés tiltva.');
    const compare=v.compareAtPrice===null?null:money(cents(v.compareAtPrice));
    check(compare===item.compareAtPrice,'Az áthúzott ár a terv óta megváltozott.');
    check(compare===null || cents(compare)>target,'Az áthúzott ár ütközik az új árral.');
    await journal({status:'before',item,observed:v});
    attempted=true;
    const r=await api.shopifyGraphql(`mutation PriceRaise($productId:ID!,$variants:[ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId:$productId,variants:$variants,allowPartialUpdates:false) {
        productVariants { id price compareAtPrice } userErrors { field message }
      }
    }`,{productId:item.productId,variants:[{id:item.shopifyVariantId,price:item.to}]});
    const p=r.data?.productVariantsBulkUpdate;
    check(p && Array.isArray(p.userErrors) && p.userErrors.length===0,`Shopify árírási hiba: ${JSON.stringify(p?.userErrors||[])}`);
    check(p.productVariants?.length===1 && p.productVariants[0].id===item.shopifyVariantId && cents(p.productVariants[0].price)===target,'Hiányos/eltérő árírási válasz.');
    const verified=await freshRemote(api,item);identity(l,verified);
    check(cents(verified.price)===target && (verified.compareAtPrice===null?null:money(cents(verified.compareAtPrice)))===compare,'A visszaolvasott ár/áthúzott ár eltér.');
    await journal({status:'verified',item,price:verified.price});
    await db.query('COMMIT');return 'updated';
  }catch(e){await db.query('ROLLBACK').catch(()=>{});await journal({status:attempted?'needs_recheck':'blocked',item,error:e.message});
    if(attempted)e.message+=' A Shopify-írás megtörténhetett; nem vonható vissza DB-rollbackkel. Újraellenőrzés szükséges.';throw e;}
}
async function lock(api,pool) {
  for(let i=0;i<20;i++){const l=await api.acquireAifShopifyProcessLock(pool);if(l.locked)return l;await pause(2000);}
  throw Error('A Shopify feldolgozó foglalt. Később futtasd újra.');
}
async function durable(path,value,exclusive=false) {
  const f=await open(path,exclusive?'wx':'a',0o600);try{await f.writeFile(value);await f.sync();}finally{await f.close();}
}
async function main() {
  const args=process.argv.slice(2),mode=args.find(a=>['--check','--apply'].includes(a))||'--check';
  check(args.every(a=>['--check','--apply'].includes(a)||a.startsWith('--plan=')) &&
    args.filter(a=>['--check','--apply'].includes(a)).length<=1 && args.filter(a=>a.startsWith('--plan=')).length<=1,'Ismeretlen/ismételt paraméter.');
  const pathArg=args.find(a=>a.startsWith('--plan='))?.slice(7);
  check(mode==='--apply'?!!pathArg:!pathArg,'--apply mellé --plan=FÁJL kell. A --check nem kér tervfájlt.');
  const {default:pg}=await import('pg');const api=await import('../api/lib/aifShopify.js');
  const config=api.getAifShopifyPublicConfig();check(config.shopDomain,'Hiányzik a Shopify bolt beállítása.');
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:20000,max:3});
  try {
    const info=await api.shopifyGraphql('query PriceRaiseShop { shop { myshopifyDomain currencyCode } }');
    check(info.data?.shop?.currencyCode==='RON','A Shopify alapdeviza nem RON vagy hiányzik.');
    const shop=info.data.shop.myshopifyDomain;check(typeof shop==='string'&&shop.endsWith('.myshopify.com'),'Hiányos boltazonosító.');
    await mkdir('shopify-price-audit',{recursive:true,mode:0o700});
    if(mode==='--check') {
      const locals=(await pool.query(localSQL)).rows;
      console.log(`Belső variánsok: ${locals.length}; Shopify árak lekérése...`);
      const remotes=await allRemote(api);const plan=buildPlan(locals,remotes,shop);
      const filename=`shopify-price-audit/raise-plan-${Date.now()}.json`;
      await durable(filename,JSON.stringify(wrapPlan(plan),null,2),true);
      console.table(plan.items.map(x=>({sku:x.sku,termek:x.title,meret:x.size,Shopify:x.from,belso:x.to,emeles:money(cents(x.to)-cents(x.from))})));
      const groups={};for(const s of plan.skipped)groups[s.reason]=(groups[s.reason]||0)+1;
      console.table(Object.entries(groups).map(([ok,darab])=>({ok,darab})));
      console.log('ÖSSZESÍTÉS:',JSON.stringify(plan.counts));
      console.log('TELJES TERV ÉS KIHAGYOTT SOROK:',filename);
      console.log('Nem történt ár-, készlet- vagy párosításmódosítás.');
      if(plan.items.length)console.log(`Javítás ehhez a tervhez: node scripts/shopify-price-raise.mjs --apply --plan=${filename}`);
    }else{
      const p=validatePlan(JSON.parse(await readFile(resolve(pathArg),'utf8')),shop);
      const journalPath=`shopify-price-audit/raise-results-${Date.now()}.jsonl`;
      await durable(journalPath,JSON.stringify({status:'start',sha256:digest(p),plan:p})+'\n',true);
      const journal=event=>durable(journalPath,JSON.stringify({at:new Date().toISOString(),...event})+'\n');
      console.log('MENTÉS ÉS EREDMÉNYNAPLÓ:',journalPath);
      let updated=0,already=0;
      for(const [i,item]of p.items.entries()) {
        let guard,db;
        try{guard=await lock(api,pool);db=await pool.connect();
          const result=await applyOne(db,api,item,journal);if(result==='updated')updated++;else already++;
          console.log(`${i+1}/${p.items.length} ${item.sku}: ${result} (${item.from} → ${item.to} RON)`);
        }finally{db?.release();await guard?.release();}
        await pause(350);
      }
      console.log(`KÉSZ: ${updated} áremelés visszaellenőrizve; ${already} már helyes. Készletet és belső árat nem módosított.`);
    }
  }finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error('LEÁLLÍTVA:',e.message);process.exitCode=1;});
