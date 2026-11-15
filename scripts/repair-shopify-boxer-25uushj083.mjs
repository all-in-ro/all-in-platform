import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const gid = (kind, id) => `gid://shopify/${kind}/${id}`;
export const KEEP = gid('Product', '11359066784071');
export const OLD = [gid('Product', '11160846434631'), gid('Product', '11359079268679')];
export const ITEMS = [
  {size:'S', id:'95f729fb-b8c2-496d-95dd-047c87460db9', sku:'1200122271039', target:'55478252077383', duplicate:'55478295855431'},
  {size:'M', id:'7d475adb-6e5e-4bcc-a104-60b28f21b870', sku:'1200122271046', target:'55478252044615', duplicate:'55478295822663'},
  {size:'L', id:'3cafc812-9f78-4a7a-855a-cb8376f3a229', sku:'1200122271053', target:'55478252011847', duplicate:'55478295789895'},
  {size:'XL', id:'c45c06b5-b7c2-4cea-ae11-bc00c1cfa43e', sku:'1200122271060', target:'55478252110151', duplicate:'55478295888199'},
];
const OLD_M = gid('ProductVariant', '55023007826247');
const ids = ITEMS.map(x => x.id);
function requireThat(ok, message) { if (!ok) throw new Error(message); }

export async function loadProducts(api) {
  const products = [];
  for (const id of [KEEP, ...OLD]) {
    const r = await api.shopifyGraphql(`query BoxerRepairProduct($id:ID!) {
      product(id:$id) { id title handle status
        variants(first:100) { pageInfo { hasNextPage } nodes {
          id sku barcode title selectedOptions { name value }
          inventoryItem { id tracked inventoryLevels(first:100) {
            pageInfo { hasNextPage } nodes { location { id name }
              quantities(names:["available","committed"]) { name quantity }
            }
          } }
        } }
      }
    }`, {id});
    const p = r.data?.product;
    requireThat(p?.id === id && Array.isArray(p.variants?.nodes) && p.variants.pageInfo?.hasNextPage === false,
      `Hiányos Shopify-termék vagy túl sok variáns: ${id}`);
    products.push(p);
  }
  validateProducts(products);
  return products;
}

export function validateProducts(products) {
  for (const [index,p] of products.entries()) {
    requireThat(p.id === [KEEP,...OLD][index], 'Váratlan terméksorrend.');
    requireThat(index === 0 ? p.status === 'ACTIVE' : ['ACTIVE','ARCHIVED'].includes(p.status), 'Váratlan termékállapot.');
    const expected = index === 1 ? ITEMS.filter(x=>x.size==='M') : ITEMS;
    requireThat(p.variants.nodes.length === expected.length, `Megváltozott a variánslista: ${p.id}`);
    for (const x of expected) {
      const vid = index === 0 ? gid('ProductVariant',x.target) : index === 1 ? OLD_M : gid('ProductVariant',x.duplicate);
      const v = p.variants.nodes.find(v=>v.id === vid);
      requireThat(v && v.sku === x.sku && (!v.barcode || v.barcode === x.sku), `Eltérő SKU/vonalkód: ${x.size}, ${p.id}`);
      const options = v.selectedOptions?.map(o=>String(o.value).trim().toLowerCase()) || [];
      requireThat(options.length === 2 && options.includes('negru') && options.includes(x.size.toLowerCase()), `Eltérő szín/méret: ${vid}`);
      const inv = v.inventoryItem;
      requireThat(inv?.id && inv.tracked === true && Array.isArray(inv.inventoryLevels?.nodes) && inv.inventoryLevels.pageInfo?.hasNextPage === false,
        `Hiányos készletadat: ${vid}`);
      for (const level of inv.inventoryLevels.nodes) {
        for (const name of ['available','committed']) {
          requireThat(Number.isInteger(level.quantities?.find(q=>q.name===name)?.quantity), `Hiányzó ${name} készlet: ${vid}`);
        }
      }
    }
  }
}

async function localState(db, config) {
  const variants = (await db.query(`SELECT v.id::text,v.barcode,v.status,m.status AS model_status
    FROM aif_product_variants v JOIN aif_product_models m ON m.id=v.model_id
    WHERE v.id=ANY($1::uuid[])`,[ids])).rows;
  requireThat(variants.length===4, 'Hiányzik belső variáns.');
  for (const x of ITEMS) {
    const v = variants.find(v=>v.id===x.id);
    requireThat(v?.status === 'active' && v.model_status==='active' && v.barcode===x.sku, `Megváltozott belső variáns: ${x.size}`);
  }
  const maps = (await db.query(`SELECT * FROM aif_shopify_variant_map WHERE
    variant_id=ANY($1::uuid[]) OR shopify_product_id=ANY($2::text[]) OR sku=ANY($3::text[])`,
    [ids,[KEEP,...OLD],ITEMS.map(x=>x.sku)])).rows;
  requireThat(maps.length===4, 'Váratlan vagy hiányzó párosítás; automatikus javítás leállítva.');
  for (const x of ITEMS) {
    const m = maps.find(m=>m.variant_id===x.id);
    const target = m?.shopify_product_id===KEEP && m.shopify_variant_id===gid('ProductVariant',x.target);
    const oldM = x.size==='M' && m?.shopify_product_id===OLD[0] && m.shopify_variant_id===OLD_M;
    requireThat(m && m.sku===x.sku && (target || oldM), `Váratlan párosítás: ${x.size}`);
  }
  const stock = (await db.query(`SELECT variant_id::text,
    COALESCE(sum(GREATEST(COALESCE(qty,0)-COALESCE(reserved_qty,0),0)) FILTER (WHERE location_id::text=$2),0)::int AS ciuc,
    COALESCE(sum(GREATEST(COALESCE(qty,0)-COALESCE(reserved_qty,0),0)) FILTER (WHERE location_id::text=$3),0)::int AS kezdi
    FROM aif_stock WHERE variant_id=ANY($1::uuid[]) GROUP BY variant_id`,
    [ids,config.aifLocations.csikszereda.id,config.aifLocations.kezdi.id])).rows;
  const outbox = (await db.query('SELECT * FROM aif_shopify_sync_outbox WHERE variant_id=ANY($1::uuid[])',[ids])).rows;
  return {variants,maps,stock,outbox};
}

function quantity(v,location,name='available') {
  const q = v.inventoryItem.inventoryLevels.nodes.find(l=>l.location.id===location)?.quantities.find(q=>q.name===name)?.quantity;
  requireThat(Number.isInteger(q), `Hiányzó Shopify-helyszín/készlet: ${v.sku} ${location}`);
  return q;
}

export function verify(state, products, config) {
  for (const x of ITEMS) {
    const m = state.maps.find(m=>m.variant_id===x.id);
    const v = products[0].variants.nodes.find(v=>v.id===gid('ProductVariant',x.target));
    const s = state.stock.find(s=>s.variant_id===x.id) || {ciuc:0,kezdi:0};
    requireThat(m.shopify_variant_id===v.id && m.shopify_inventory_item_id===v.inventoryItem.id, `${x.size}: még nincs célpárosítás.`);
    const o = state.outbox.find(o=>o.variant_id===x.id);
    requireThat(o?.status==='done' && m.sync_status==='synced' && m.last_synced_at, `${x.size}: a készletszinkron még nem kész.`);
    requireThat(o.desired_csikszereda_qty===s.ciuc && o.desired_kezdi_qty===s.kezdi &&
      m.last_synced_csikszereda_qty===s.ciuc && m.last_synced_kezdi_qty===s.kezdi,
      `${x.size}: a szinkronált és aktuális belső készlet eltér.`);
    requireThat(quantity(v,config.shopifyLocations.csikszereda)===s.ciuc && quantity(v,config.shopifyLocations.kezdi)===s.kezdi,
      `${x.size}: a Shopify készlete még eltér.`);
  }
}

export async function runRepair(db,api,mode,backup) {
  requireThat(['check','apply','verify','archive'].includes(mode),'Ismeretlen művelet.');
  const config = api.getAifShopifyPublicConfig();
  requireThat(config.enabled && config.missing.length===0, 'A Shopify-szinkron nincs bekapcsolva vagy hiányos a konfiguráció.');
  requireThat(config.aifLocations.csikszereda.id!==config.aifLocations.kezdi.id &&
    config.shopifyLocations.csikszereda!==config.shopifyLocations.kezdi,'A két üzlet helyszínazonosítója azonos.');
  await db.query(mode==='check' || mode==='verify' ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
  const archived=[];
  try {
    await db.query("SET LOCAL lock_timeout='5s'");
    if (mode==='apply' || mode==='archive') {
      // Short exclusive maintenance window; serializes mappings and stock writes.
      await db.query('LOCK TABLE aif_product_models, aif_product_variants, aif_shopify_variant_map, aif_shopify_sync_outbox, aif_stock IN SHARE ROW EXCLUSIVE MODE');
    }
    const state = await localState(db,config);
    const products = await loadProducts(api);
    console.table(products.map(p=>({termek:p.id.split('/').at(-1),nev:p.title,allapot:p.status,
      szerep:p.id===KEEP?'megtartandó':'régi példány',variansok:p.variants.nodes.length})));
    for (const m of state.maps) {
      const p=products.find(p=>p.id===m.shopify_product_id);
      requireThat(p?.variants.nodes.find(v=>v.id===m.shopify_variant_id)?.inventoryItem.id===m.shopify_inventory_item_id,
        'A tárolt inventory item nem egyezik az élő variánssal.');
    }
    console.table(ITEMS.map(x=>{
      const v=products[0].variants.nodes.find(v=>v.sku===x.sku);
      const s=state.stock.find(s=>s.variant_id===x.id)||{ciuc:0,kezdi:0};
      return {meret:x.size,sku:x.sku,belso_Ciuc:s.ciuc,belso_Kezdi:s.kezdi,
        Shopify_Ciuc:quantity(v,config.shopifyLocations.csikszereda),Shopify_Kezdi:quantity(v,config.shopifyLocations.kezdi),
        parositas:state.maps.find(m=>m.variant_id===x.id).shopify_product_id===KEEP?'céltermék':'külön M termék'};
    }));
    if(mode==='check') { await db.query('ROLLBACK'); console.log('ELLENŐRZÉS KÉSZ. Nem történt módosítás.'); return; }
    const safety=await api.getAifShopifySyncBlockers(db);
    requireThat(!safety.global && !safety.variantIds.some(id=>ids.includes(id)), `Rendelésfeldolgozás blokkolja a műveletet: ${safety.reason}`);
    if(mode==='verify' || mode==='archive') verify(state,products,config);
    if(mode==='verify') { await db.query('ROLLBACK'); console.log('OK: mind a 4 párosítás és mindkét üzlet élő készlete egyezik.'); return; }
    await backup({at:new Date().toISOString(),mode,shop:config.shopDomain,config,state,products});
    if(mode==='apply') {
      const x=ITEMS.find(x=>x.size==='M');
      const v=products[0].variants.nodes.find(v=>v.sku===x.sku);
      const m=state.maps.find(m=>m.variant_id===x.id);
      if(m.shopify_variant_id!==v.id) {
        const changed=await db.query(`UPDATE aif_shopify_variant_map SET shopify_product_id=$2,shopify_variant_id=$3,
          shopify_inventory_item_id=$4,shopify_product_title=$5,shopify_variant_title=$6,
          shopify_product_status='ACTIVE',sync_status='mapped',last_error=NULL,
          last_synced_csikszereda_qty=NULL,last_synced_kezdi_qty=NULL,last_synced_at=NULL,
          raw=COALESCE(raw,'{}'::jsonb)||$7::jsonb,updated_at=now()
          WHERE variant_id=$1::uuid AND shopify_variant_id=$8 RETURNING variant_id`,
          [x.id,KEEP,v.id,v.inventoryItem.id,products[0].title,v.title,JSON.stringify({boxerRepair:{at:new Date().toISOString(),previousVariant:OLD_M}}),OLD_M]);
        requireThat(changed.rowCount===1,'Az M párosítása közben megváltozott.');
      }
      for(const item of ITEMS) {
        const result=await api.enqueueAifShopifyVariant(db,item.id,'boxer_duplicate_repair_20261115',{schemaReady:true});
        requireThat(result.queued && result.syncEnabled, `Nem sikerült sorba tenni: ${item.size}`);
      }
      await db.query('COMMIT');
      console.log('KÉSZ: M párosítás rendezve; 4 méret készletszinkronja sorba téve. Ez még nem jelenti a Shopify-szinkron befejezését. Futtasd a --verify parancsot.');
    } else {
      requireThat(!state.maps.some(m=>OLD.includes(m.shopify_product_id)), 'Régi termékre mutató párosítás maradt.');
      for(const p of products.slice(1)) {
        for(const v of p.variants.nodes) for(const l of v.inventoryItem.inventoryLevels.nodes) {
          requireThat(l.quantities.find(q=>q.name==='committed').quantity===0, `Foglalt Shopify-készlet a régi terméken: ${v.sku}`);
        }
      }
      for(const p of products.slice(1)) {
        if(p.status==='ARCHIVED') continue;
        const result=await api.shopifyGraphql(`mutation BoxerArchive($product:ProductUpdateInput!) {
          productUpdate(product:$product) { product { id status } userErrors { field message } }
        }`, {product:{id:p.id,status:'ARCHIVED'}});
        const payload=result.data?.productUpdate;
        requireThat(payload && Array.isArray(payload.userErrors) && payload.userErrors.length===0 &&
          payload.product?.id===p.id && payload.product.status==='ARCHIVED',
          `Archiválás nem igazolt: ${p.id}; ${JSON.stringify(payload?.userErrors||[])}`);
        archived.push(p.id);
        console.log('Archiválva:',p.id);
      }
      await db.query('COMMIT');
      console.log('KÉSZ: a két régi termék archiválva. Termék- vagy rendeléstörlés nem történt.');
    }
  } catch(e) {
    await db.query('ROLLBACK').catch(()=>{});
    if(mode==='archive') console.error('A Shopify archiválása nem vonható vissza DB-rollbackkel. Igazolt archiválások:',archived,
      'Hálózati hibánál a legutóbbi kérés eredménye bizonytalan lehet. A --check ellenőriz, a --archive biztonságosan újrafuttatható.');
    throw e;
  }
}

async function main() {
  const args=process.argv.slice(2);
  requireThat(args.length<=1 && (!args.length || ['--check','--apply','--verify','--archive'].includes(args[0])),
    'Használat: node scripts/repair-shopify-boxer-25uushj083.mjs [--check|--apply|--verify|--archive]');
  const mode=(args[0]||'--check').slice(2);
  const {default:pg}=await import('pg');
  const api=await import('../api/lib/aifShopify.js');
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:20000,max:3});
  let lock,db;
  try {
    lock=await api.acquireAifShopifyProcessLock(pool);
    requireThat(lock.locked,'A Shopify feldolgozó foglalt. Próbáld újra pár másodperc múlva.');
    db=await pool.connect();
    await runRepair(db,api,mode,async snapshot=>{
      await mkdir('shopify-repair-backups',{recursive:true,mode:0o700});
      const path=resolve('shopify-repair-backups',`boxer-${mode}-${Date.now()}.json`);
      await writeFile(path,JSON.stringify(snapshot,null,2),{flag:'wx',mode:0o600});
      console.log('Módosítás előtti mentés:',path);
    });
  } finally { db?.release(); await lock?.release(); await pool.end(); }
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(e=>{console.error('LEÁLLÍTVA:',e.message);process.exitCode=1;});
}
