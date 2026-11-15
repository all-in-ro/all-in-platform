// Only raises Shopify base prices to the current internal RON sell_price.
// Durable polling outbox; independent of stock outbox and stock quantities.
const bool=(v,f=false)=>v==null||v===''?f:['1','true','yes','on','igen'].includes(String(v).trim().toLowerCase());
const fail=(message,permanent=false)=>{throw Object.assign(new Error(message),{pricePermanent:permanent});};
const requireValue=(ok,message,permanent=false)=>{if(!ok)fail(message,permanent);};
export function priceCents(value) {
  const m=/^(\d+)(?:\.(\d+))?$/.exec(String(value??'').trim());
  requireValue(m && !/[1-9]/.test((m[2]||'').slice(2)),'Érvénytelen eladási ár.',true);
  const n=Number(m[1])*100+Number(((m[2]||'')+'00').slice(0,2));
  requireValue(Number.isSafeInteger(n),'Túl nagy ár.',true);return n;
}
const money=n=>(n/100).toFixed(2);
export const priceSourceSQL=`jsonb_build_object(
  'price',v.sell_price::text,'barcode',v.barcode,'internalSku',v.internal_sku,
  'variantStatus',v.status,'modelStatus',p.status,
  'productId',m.shopify_product_id,'variantId',m.shopify_variant_id,
  'inventoryItemId',m.shopify_inventory_item_id)`;
export const priceLocalSQL=`SELECT v.id::text AS id,${priceSourceSQL} AS source
  FROM aif_product_variants v JOIN aif_product_models p ON p.id=v.model_id
  JOIN aif_shopify_variant_map m ON m.variant_id=v.id WHERE v.id=$1::uuid`;
export const priceDDL=[
  `CREATE TABLE IF NOT EXISTS aif_shopify_price_sync_state (
    variant_id uuid PRIMARY KEY REFERENCES aif_product_variants(id) ON DELETE CASCADE,
    source jsonb NOT NULL,status text NOT NULL DEFAULT 'pending',attempts integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),last_checked_at timestamptz,
    last_remote_price numeric(18,2),last_error text,updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK(status IN ('pending','done','retry','blocked','skipped'))
  )`,
  `CREATE INDEX IF NOT EXISTS aif_shopify_price_sync_due ON aif_shopify_price_sync_state(status,next_attempt_at)`,
  `CREATE TABLE IF NOT EXISTS aif_shopify_price_sync_meta (
    id integer PRIMARY KEY CHECK(id=1),last_scan_at timestamptz,last_batch_at timestamptz,last_error text
  )`,
  `INSERT INTO aif_shopify_price_sync_meta(id) VALUES(1) ON CONFLICT(id) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS aif_shopify_price_sync_audit (
    id bigserial PRIMARY KEY,variant_id uuid NOT NULL,shopify_product_id text NOT NULL,
    shopify_variant_id text NOT NULL,sku text NOT NULL,old_price numeric(18,2) NOT NULL,
    new_price numeric(18,2) NOT NULL,source jsonb NOT NULL,status text NOT NULL,
    error text,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS aif_shopify_price_sync_audit_variant ON aif_shopify_price_sync_audit(variant_id,created_at DESC)`,
];
export const priceScanSQL=`INSERT INTO aif_shopify_price_sync_state(variant_id,source,status,next_attempt_at)
  SELECT v.id,${priceSourceSQL},'pending',now()
  FROM aif_product_variants v JOIN aif_product_models p ON p.id=v.model_id
  LEFT JOIN aif_shopify_variant_map m ON m.variant_id=v.id
  LEFT JOIN aif_shopify_price_sync_state q ON q.variant_id=v.id
  WHERE m.variant_id IS NOT NULL OR q.variant_id IS NOT NULL
  ON CONFLICT(variant_id) DO UPDATE SET source=EXCLUDED.source,status='pending',attempts=0,
    next_attempt_at=now(),last_error=NULL,updated_at=now()
  WHERE aif_shopify_price_sync_state.source IS DISTINCT FROM EXCLUDED.source
  RETURNING variant_id`;
const remoteFields='id sku barcode price compareAtPrice product { id status }';
export function validatePriceIdentity(source,v) {
  requireValue(source.variantStatus==='active' && source.modelStatus==='active','Inaktív belső termék.',true);
  requireValue(source.variantId && source.productId,'Hiányzó párosítás.',true);
  requireValue(v?.id && v.product?.id && typeof v.sku==='string' && typeof v.product.status==='string','Hiányos Shopify-válasz.');
  requireValue(v.id===source.variantId && v.product.id===source.productId,'Megváltozott Shopify-párosítás.',true);
  requireValue(v.product.status==='ACTIVE','A Shopify-termék nem aktív.',true);
  const aliases=[source.barcode,source.internalSku].map(x=>String(x||'').trim()).filter(Boolean);
  requireValue(v.sku && aliases.includes(v.sku),'Az élő SKU nem egyezik a belső vonalkóddal/SKU-val.',true);
  requireValue(!v.barcode || (source.barcode && v.barcode===source.barcode),'Eltérő Shopify-vonalkód.',true);
  priceCents(v.price);if(v.compareAtPrice!==null)priceCents(v.compareAtPrice);
}
const sameSource=(a,b)=>JSON.stringify(Object.keys(a).sort().map(k=>[k,a[k]]))===JSON.stringify(Object.keys(b).sort().map(k=>[k,b[k]]));
export function createAifShopifyPriceSync(api) {
  const initialized=new WeakSet();
  async function ensureSchema(db,pool) {
    if(pool && initialized.has(pool))return;
    for(const sql of priceDDL)await db.query(sql);
    if(pool)initialized.add(pool);
  }
  async function scan(db) {
    const due=await db.query(`UPDATE aif_shopify_price_sync_meta SET last_scan_at=now()
      WHERE id=1 AND (last_scan_at IS NULL OR last_scan_at < now()-interval '30 seconds') RETURNING id`);
    if(!due.rows.length)return 0;
    try{return (await db.query(priceScanSQL)).rows.length;}
    catch(e){await db.query('UPDATE aif_shopify_price_sync_meta SET last_scan_at=NULL WHERE id=1').catch(()=>{});throw e;}
  }
  async function readRemote(source) {
    const aliases=[source.barcode,source.internalSku].map(x=>String(x||'').trim()).filter(Boolean);
    requireValue(aliases.length && source.variantId && source.productId,'Hiányzó SKU/párosítás.',true);
    const query=[...new Set(aliases)].map(x=>`sku:${JSON.stringify(x)}`).join(' OR ');
    const r=await api.shopifyGraphql(`query AifPriceSyncRead($id:ID!,$query:String!) {
      productVariant(id:$id) { ${remoteFields} }
      productVariants(first:100,query:$query) { nodes { id sku product { status } } pageInfo { hasNextPage } }
    }`,{id:source.variantId,query});
    const c=r.data?.productVariants,v=r.data?.productVariant;
    requireValue(Array.isArray(c?.nodes) && typeof c.pageInfo?.hasNextPage==='boolean','Hiányos SKU-keresési válasz.');
    requireValue(c.pageInfo.hasNextPage===false,'Túl sok SKU-találat; kézi ellenőrzés kell.',true);
    requireValue(c.nodes.every(n=>n?.id&&typeof n.sku==='string'&&typeof n.product?.status==='string'),'Hiányos SKU-találat.');
    if(v===null)fail('A párosított Shopify-variáns nem található.',true);
    validatePriceIdentity(source,v);
    const matches=c.nodes.filter(n=>n.product.status==='ACTIVE' && n.sku===v.sku);
    requireValue(matches.length===1 && matches[0].id===v.id,'Többszörös vagy nem egyértelmű aktív Shopify SKU.',true);
    return v;
  }
  async function local(db,id,locked=false) {
    const r=await db.query(priceLocalSQL+(locked?' FOR UPDATE OF v,p,m':''),[id]);
    requireValue(r.rows.length===1,'A belső variáns vagy párosítása hiányzik.',true);
    const l=r.rows[0];
    const duplicates=await db.query(`SELECT count(*)::int AS n FROM aif_product_variants
      WHERE barcode=$1 AND id<>$2::uuid`,[l.source.barcode,id]);
    requireValue(duplicates.rows[0]?.n===0,'Többszörös belső vonalkód.',true);
    return l;
  }
  async function finish(db,row,status,remote,error=null) {
    await db.query(`UPDATE aif_shopify_price_sync_state SET status=$2,attempts=0,
      last_checked_at=now(),last_remote_price=$3,last_error=$4,updated_at=now(),
      next_attempt_at='infinity'::timestamptz
      WHERE variant_id=$1::uuid AND source=$5::jsonb`,[row.variant_id,status,remote,error,JSON.stringify(row.source)]);
  }
  async function processRow(db,row) {
    let auditId=null,attempted=false,inTransaction=false;
    try {
      const l=await local(db,row.variant_id);
      if(!sameSource(l.source,row.source)) {
        await db.query(`UPDATE aif_shopify_price_sync_state SET source=$2::jsonb,status='pending',attempts=0,
          next_attempt_at=now(),last_error=NULL,updated_at=now() WHERE variant_id=$1::uuid`,[row.variant_id,JSON.stringify(l.source)]);
        return 'superseded';
      }
      const source=l.source;
      if(source.variantStatus!=='active'||source.modelStatus!=='active') {
        await finish(db,row,'skipped',null,'Inaktív belső termék.');return 'skipped';
      }
      const target=priceCents(source.price);requireValue(target>0,'Nulla eladási ár.',true);
      const v=await readRemote(source),before=priceCents(v.price);
      if(target<=before) {
        await finish(db,row,target===before?'done':'skipped',money(before),target<before?'A Shopify-ár magasabb; árcsökkentés nem történt.':null);
        if(target===before)await db.query(`UPDATE aif_shopify_price_sync_audit SET status='recovered',finished_at=now(),error=NULL
          WHERE variant_id=$1::uuid AND source=$2::jsonb AND status IN ('prepared','uncertain')`,[row.variant_id,JSON.stringify(source)]);
        return target===before?'equal':'skipped';
      }
      const compare=v.compareAtPrice===null?null:money(priceCents(v.compareAtPrice));
      requireValue(compare===null || priceCents(compare)>target,'Az áthúzott Shopify-ár ütközik az új árral.',true);
      // Committed intent survives a crash or rollback after a remote write.
      const a=await db.query(`INSERT INTO aif_shopify_price_sync_audit
        (variant_id,shopify_product_id,shopify_variant_id,sku,old_price,new_price,source,status)
        VALUES($1::uuid,$2,$3,$4,$5,$6,$7::jsonb,'prepared') RETURNING id`,
        [row.variant_id,source.productId,source.variantId,v.sku,money(before),money(target),JSON.stringify(source)]);
      auditId=a.rows[0]?.id;requireValue(auditId,'Az árírás előtti naplózás nem sikerült.');
      await db.query('BEGIN');inTransaction=true;await db.query("SET LOCAL lock_timeout='3s'");
      const locked=await local(db,row.variant_id,true);
      requireValue(sameSource(locked.source,source),'A belső ár/párosítás közben megváltozott.');
      const fresh=await readRemote(source);
      requireValue(priceCents(fresh.price)===before && (fresh.compareAtPrice===null?null:money(priceCents(fresh.compareAtPrice)))===compare,
        'A Shopify-ár közben megváltozott; újraellenőrzés szükséges.');
      attempted=true;
      const r=await api.shopifyGraphql(`mutation AifPriceSyncRaise($productId:ID!,$variants:[ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId:$productId,variants:$variants,allowPartialUpdates:false) {
          productVariants { id price } userErrors { field message }
        }
      }`,{productId:source.productId,variants:[{id:source.variantId,price:money(target)}]});
      const p=r.data?.productVariantsBulkUpdate;
      requireValue(p && Array.isArray(p.userErrors),'Hiányos árírási válasz.');
      requireValue(!p.userErrors.length,`Shopify árírási hiba: ${JSON.stringify(p.userErrors)}`);
      requireValue(p.productVariants?.length===1 && p.productVariants[0].id===source.variantId && priceCents(p.productVariants[0].price)===target,'Az árírás eredménye nem igazolt.');
      const verified=await readRemote(source);
      requireValue(priceCents(verified.price)===target && (verified.compareAtPrice===null?null:money(priceCents(verified.compareAtPrice)))===compare,
        'Visszaellenőrzéskor eltérő ár/áthúzott ár.');
      await finish(db,row,'done',money(target));
      await db.query("UPDATE aif_shopify_price_sync_audit SET status='verified',finished_at=now(),error=NULL WHERE id=$1",[auditId]);
      await db.query('COMMIT');inTransaction=false;
      return 'updated';
    }catch(e) {
      if(inTransaction)await db.query('ROLLBACK').catch(()=>{});
      const attempt=Number(row.attempts||0)+1;
      const delay=e.pricePermanent?3600:Math.min(900,15*2**Math.min(attempt-1,6));
      const status=e.pricePermanent?'blocked':'retry';
      const error=String(e.message||e).slice(0,2000);
      if(auditId)await db.query(`UPDATE aif_shopify_price_sync_audit SET status=$2,error=$3,finished_at=now() WHERE id=$1`,
        [auditId,attempted?'uncertain':'cancelled',error]);
      await db.query(`UPDATE aif_shopify_price_sync_state SET status=$2,attempts=attempts+1,
        last_checked_at=now(),last_error=$3,next_attempt_at=now()+($4::int*interval '1 second'),updated_at=now()
        WHERE variant_id=$1::uuid AND source=$5::jsonb`,[row.variant_id,status,error,delay,JSON.stringify(row.source)]);
      console.warn('AIF Shopify price sync item',JSON.stringify({variantId:row.variant_id,status,attempt,error}));
      return status;
    }
  }
  async function runBatch(pool,options={}) {
    const config=api.getAifShopifyPublicConfig();
    if(!config.enabled || !bool(process.env.SHOPIFY_PRICE_SYNC_ENABLED,true))return {enabled:false,processed:0};
    const guard=await api.acquireAifShopifyProcessLock(pool);
    if(!guard.locked)return {enabled:true,processed:0,lockSkipped:true};
    let db;
    const result={enabled:true,queued:0,processed:0,updated:0,equal:0,skipped:0,blocked:0,retry:0,superseded:0};
    try {
      db=await pool.connect();await ensureSchema(db,pool);result.queued=await scan(db);
      const limit=Math.max(1,Math.min(5,Number(options.limit)||2));
      const due=await db.query(`SELECT * FROM aif_shopify_price_sync_state
        WHERE status IN ('pending','retry','blocked') AND next_attempt_at<=now()
        ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,updated_at DESC,variant_id LIMIT $1`,[limit]);
      if(due.rows.length) {
        const shop=await api.shopifyGraphql('query AifPriceSyncCurrency { shop { currencyCode } }');
        requireValue(shop.data?.shop?.currencyCode==='RON','Az árküldéshez RON Shopify-alapdeviza szükséges.');
      }
      const started=Date.now();
      for(const row of due.rows) {
        if(result.processed && Date.now()-started>10000)break;
        const status=await processRow(db,row);result.processed++;result[status]++;
      }
      await db.query('UPDATE aif_shopify_price_sync_meta SET last_batch_at=now(),last_error=NULL WHERE id=1');
      return result;
    }catch(e) {
      if(db)await db.query('UPDATE aif_shopify_price_sync_meta SET last_error=$1 WHERE id=1',[String(e.message||e).slice(0,2000)]).catch(()=>{});
      throw e;
    }finally{db?.release();await guard.release();}
  }
  return {ensureSchema,scan,processRow,runBatch};
}
let instance;
export async function processAifShopifyPriceSyncBatch(pool,options={}) {
  if(!instance)instance=createAifShopifyPriceSync(await import('./aifShopify.js'));
  return instance.runBatch(pool,options);
}
