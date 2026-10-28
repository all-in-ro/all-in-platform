/**
 * AllInFashion / Shopify warehouse and isolated AVIZ flow.
 * No manual-store document counters, POS sales or cash drawers are touched.
 * Enable explicitly with SHOPIFY_WAREHOUSE_AUTOMATION_ENABLED=true after the
 * one-time legacy audit. All mutations occur in one DB transaction per order.
 */
import { createHash, randomUUID } from 'node:crypto';
import { ensureAifShopifyOrderSchema } from './aifShopifyOrders.js';
import { planAifShopifyLifecycle } from './aifShopifyLifecyclePlan.js';
import { acquireAifShopifyProcessLock, enqueueAifShopifyVariant } from './aifShopify.js';

export const aifShopifyLifecycleEnabled = () => ['true','1','yes','on'].includes(String(process.env.SHOPIFY_WAREHOUSE_LIFECYCLE_ENABLED || '').toLowerCase());

const clean = x => String(x ?? '').trim();
const qty = x => Math.max(0, Math.trunc(Number(x) || 0));
const price = x => Math.round((Number(x) || 0) * 100) / 100;
const enabled = () => ['true','1','yes','on'].includes(clean(process.env.SHOPIFY_WAREHOUSE_AUTOMATION_ENABLED).toLowerCase());
const legacyOrder = '8294369788231';
const legacyBarcode = '1200122271411';
export const SHOPIFY_WAREHOUSE_CODE = 'shopify_warehouse';

// The unique sequence is deliberately unrelated to aif_stock_document_settings
// and aif_stock_transfer_document_settings (PV/RET/COR/etc).
export async function ensureAifShopifyWarehouseSchema(db) {
  await ensureAifShopifyOrderSchema(db);
  const docs = await db.query(`SELECT to_regclass('public.aif_stock_transfer_documents') AS docs,
    to_regclass('public.aif_stock_transfer_document_lines') AS lines,
    to_regclass('public.aif_stock_movements') AS movements,
    to_regclass('public.aif_stock_retail_book') AS retail`);
  if (!docs.rows[0]?.docs || !docs.rows[0]?.lines || !docs.rows[0]?.movements || !docs.rows[0]?.retail) {
    throw new Error('Shopify Aviz: a normál raktári dokumentumok/készletérték táblái nincsenek inicializálva.');
  }
  await db.query(`CREATE TABLE IF NOT EXISTS aif_shopify_aviz_sequence (
    id smallint PRIMARY KEY CHECK(id=1), next_number bigint NOT NULL DEFAULT 1 CHECK(next_number>0))`);
  await db.query(`INSERT INTO aif_shopify_aviz_sequence (id,next_number) VALUES (1,1) ON CONFLICT DO NOTHING`);
  // First activation seals the cutover point. Historical checkout events are
  // never replayed as fresh transfers; AIF-1003 has an explicit audit path.
  await db.query(`CREATE TABLE IF NOT EXISTS aif_shopify_warehouse_activation (
    id smallint PRIMARY KEY CHECK(id=1), activated_at timestamptz NOT NULL DEFAULT now())`);
  if (enabled()) await db.query(`INSERT INTO aif_shopify_warehouse_activation (id) VALUES(1)
    ON CONFLICT DO NOTHING`);
  await db.query(`CREATE TABLE IF NOT EXISTS aif_shopify_warehouse_orders (
    shopify_order_id text PRIMARY KEY REFERENCES aif_shopify_orders(shopify_order_id) ON DELETE RESTRICT,
    document_id uuid NOT NULL UNIQUE REFERENCES aif_stock_transfer_documents(id) ON DELETE RESTRICT,
    document_number text NOT NULL UNIQUE,
    state text NOT NULL DEFAULT 'allocated' CHECK(state IN ('allocated','fulfilled','cancelled')),
    order_name text NOT NULL, customer_name text NULL,
    source_location_id uuid NOT NULL REFERENCES aif_locations(id),
    target_location_id uuid NOT NULL REFERENCES aif_locations(id),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    fulfilled_at timestamptz NULL, cancelled_at timestamptz NULL,
    raw jsonb NOT NULL DEFAULT '{}'::jsonb
  )`);
  // Existing AIF stock-movement IDs are numeric; store legacy references as text.
  await db.query(`CREATE TABLE IF NOT EXISTS aif_shopify_warehouse_lines (
    shopify_line_item_id text PRIMARY KEY,
    shopify_order_id text NOT NULL REFERENCES aif_shopify_warehouse_orders(shopify_order_id) ON DELETE RESTRICT,
    document_line_id uuid NOT NULL UNIQUE REFERENCES aif_stock_transfer_document_lines(id) ON DELETE RESTRICT,
    variant_id uuid NOT NULL REFERENCES aif_product_variants(id) ON DELETE RESTRICT,
    allocated_qty integer NOT NULL CHECK(allocated_qty>0),
    shipped_qty integer NOT NULL DEFAULT 0 CHECK(shipped_qty>=0),
    released_qty integer NOT NULL DEFAULT 0 CHECK(released_qty>=0),
    legacy_movement_id text NULL,
    raw jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK(shipped_qty+released_qty<=allocated_qty)
  )`);
  // A previous release created legacy_movement_id as UUID. Its empty table
  // survives a rolled-back allocation attempt because schema setup was earlier.
  // Upgrade the existing column too, without deleting or rewriting event history.
  await db.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='aif_shopify_warehouse_lines' AND column_name='legacy_movement_id' AND udt_name='uuid') THEN
      ALTER TABLE aif_shopify_warehouse_lines ALTER COLUMN legacy_movement_id TYPE text USING legacy_movement_id::text;
    END IF; END $$`);
  await db.query(`CREATE INDEX IF NOT EXISTS aif_shopify_warehouse_lines_order_idx
    ON aif_shopify_warehouse_lines (shopify_order_id)`);
  await db.query(`CREATE TABLE IF NOT EXISTS aif_shopify_warehouse_failures (
    shopify_order_id text PRIMARY KEY,
    error text NOT NULL,
    attempts integer NOT NULL DEFAULT 1,
    retry_after timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(`ALTER TABLE aif_shopify_warehouse_lines
    ADD COLUMN IF NOT EXISTS returned_qty integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS shipped_book_value numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS returned_book_value numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS valuation_known boolean NOT NULL DEFAULT false`);
  await db.query(`CREATE TABLE IF NOT EXISTS aif_shopify_lifecycle_sequences (
    series text PRIMARY KEY, next_number bigint NOT NULL DEFAULT 1 CHECK(next_number>0))`);
  await db.query(`CREATE TABLE IF NOT EXISTS aif_shopify_lifecycle_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shopify_order_id text NOT NULL REFERENCES aif_shopify_orders(shopify_order_id) ON DELETE RESTRICT,
    event_key text NOT NULL, request_hash text NULL, kind text NOT NULL,
    document_id uuid NULL REFERENCES aif_stock_transfer_documents(id) ON DELETE RESTRICT,
    actor text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(shopify_order_id,event_key))`);
  await db.query(`CREATE INDEX IF NOT EXISTS aif_shopify_lifecycle_events_order_idx
    ON aif_shopify_lifecycle_events(shopify_order_id,created_at)`);
  await db.query(`CREATE TABLE IF NOT EXISTS aif_shopify_return_quarantine (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shopify_order_id text NOT NULL REFERENCES aif_shopify_orders(shopify_order_id) ON DELETE RESTRICT,
    shopify_line_item_id text NOT NULL REFERENCES aif_shopify_warehouse_lines(shopify_line_item_id) ON DELETE RESTRICT,
    variant_id uuid NOT NULL REFERENCES aif_product_variants(id), location_id uuid NOT NULL REFERENCES aif_locations(id),
    receipt_document_id uuid NOT NULL REFERENCES aif_stock_transfer_documents(id),
    qty integer NOT NULL CHECK(qty>0), resolved_qty integer NOT NULL DEFAULT 0 CHECK(resolved_qty>=0 AND resolved_qty<=qty),
    book_value numeric(18,2) NOT NULL, resolved_value numeric(18,2) NOT NULL DEFAULT 0,
    note text NOT NULL, actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);

}

export async function findAifShopifyWarehouseLocations(db) {
  const result = await db.query(`SELECT id,code,name,is_active FROM aif_locations
    WHERE code='main_warehouse' OR code IN ('shopify_warehouse','shopify_raktar','shopify_raktár')
       OR lower(name) LIKE '%shopify%'
    ORDER BY code`);
  const source = result.rows.find(r => r.code === 'main_warehouse' && r.is_active !== false);
  const targets = result.rows.filter(r => r.code !== 'main_warehouse' && r.is_active !== false);
  if (!source) throw new Error('Hiányzik a Csíkszereda (main_warehouse) készlethely.');
  if (targets.length !== 1) throw new Error(`Pontosan egy aktív Shopify Raktár szükséges; találat: ${targets.length}.`);
  if (String(targets[0].id) === String(source.id)) throw new Error('Shopify Raktár nem lehet azonos a Csíkszereda helyszínnel.');
  return { source, target: targets[0] };
}

async function lockStock(db, variantId, source, target) {
  for (const locationId of [source.id, target.id]) {
    await db.query(`INSERT INTO aif_stock(location_id,variant_id,qty,reserved_qty,updated_at)
      VALUES($1,$2,0,0,now()) ON CONFLICT(location_id,variant_id) DO NOTHING`, [locationId,variantId]);
  }
  const locked = await db.query(`SELECT location_id, qty, reserved_qty FROM aif_stock
    WHERE variant_id=$1 AND location_id=ANY($2::uuid[])
    ORDER BY location_id FOR UPDATE`, [variantId,[source.id,target.id]]);
  const byId = new Map(locked.rows.map(r=>[String(r.location_id),r]));
  return { from: byId.get(String(source.id)), to: byId.get(String(target.id)) };
}

async function loadProduct(db, variantId) {
  const result = await db.query(`SELECT v.id,v.barcode,v.internal_sku,v.size,v.color_name,v.image_url,
    v.sell_price,v.buy_price,m.title_ro,m.model_code,b.name AS brand_name,c.name_ro AS category_name
    FROM aif_product_variants v
    JOIN aif_product_models m ON m.id=v.model_id
    LEFT JOIN aif_brands b ON b.id=m.brand_id
    LEFT JOIN aif_categories c ON c.id=m.category_id
    WHERE v.id=$1`,[variantId]);
  const r=result.rows[0];
  if(!r) throw new Error(`Ismeretlen AllIn termék: ${variantId}`);
  return {...r, productCode:clean(r.model_code).split(':').pop()||clean(r.internal_sku)};
}

async function nextNumber(db) {
  const r=await db.query(`SELECT next_number FROM aif_shopify_aviz_sequence WHERE id=1 FOR UPDATE`);
  const no=Number(r.rows[0]?.next_number||0);
  if (!Number.isSafeInteger(no)||no<1) throw new Error('Shopify Aviz sorszám érvénytelen.');
  await db.query(`UPDATE aif_shopify_aviz_sequence SET next_number=$1 WHERE id=1`,[no+1]);
  return {number:`SHOPIFY-${String(no).padStart(6,'0')}`,ordinal:no};
}

async function writeMovement(db, {variantId,locationId,delta,before,after,actor,document,order,lineNo,side,kind,extra={}}) {
  const raw = {
    reason:kind, documentType:'shopify_transfer',
    documentId:String(document.id), documentNumber:document.document_number,
    shopifyAvizNumber:document.document_number,
    shopifyOrderId:order.shopify_order_id, shopifyOrderNumber:order.order_name,
    shopifyCustomerName:order.customer_name,
    transferId:document.transfer_id, lineNo, side,
    fromLocationId:document.source_location_id,fromLocationName:document.from_location_summary,
    toLocationId:document.target_location_id,toLocationName:document.to_location_summary,
    ...extra,
  };
  // Some older AIF databases restrict movement source_id to 40/64 characters.
  // A stable short key prevents overlength inserts; full trace is stored in raw.
  const sourceId = 'shp:' + createHash('sha256')
    .update(`${document.id}:${lineNo}:${side}:${kind}`)
    .digest('hex').slice(0, 24);
  await db.query(`INSERT INTO aif_stock_movements
    (movement_type,source_type,source_id,location_id,variant_id,qty_delta,qty_before,qty_after,actor,raw)
    VALUES ($1,'shopify_transfer',$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`, [
      delta>0?'incoming':'manual_adjustment',sourceId,
      locationId,variantId,delta,before,after,actor,JSON.stringify(raw)]);
}

// Maintain the already-existing retail book instead of creating an unbalanced
// stock movement. This method transfers *book value*, not sale revenue.
async function moveRetailBook(db, variantId, source, target, count, {legacy=false, variantSellPrice=0}={}) {
  const current=await db.query(`SELECT location_id,qty,book_value FROM aif_stock_retail_book
    WHERE variant_id=$1 AND location_id=ANY($2::uuid[]) ORDER BY location_id FOR UPDATE`,[variantId,[source.id,target.id]]);
  const by=new Map(current.rows.map(r=>[String(r.location_id),r]));
  const src=by.get(String(source.id));
  const dst=by.get(String(target.id));
  const stockFrom=await db.query(`SELECT qty FROM aif_stock WHERE variant_id=$1 AND location_id=$2`,[variantId,source.id]);
  const sourceStockAfter=Number(stockFrom.rows[0]?.qty||0);
  const srcQty=Number(src?.qty??(sourceStockAfter+count));
  const srcValue=Number(src?.book_value??srcQty*Number(variantSellPrice||0));
  // Legacy Shopify inbound already decreased aif_stock, but retail book may still
  // have the former quantity. The old source movement itself is reclassified.
  const basisQty=Math.max(count,srcQty);
  if (src && (srcQty < count || Math.abs(srcQty - sourceStockAfter - count) > 0.0001)) throw new Error('Shopify átadás: a forrás készletérték mennyisége nem egyezik.');
  const transferValue=price(srcValue/basisQty*count);
  const srcAfterQty=sourceStockAfter;
  const srcAfterValue=Math.max(0,price(srcValue-transferValue));
  const dstQty=Number(dst?.qty||0);
  const dstVal=Number(dst?.book_value||0);
  const targetStock=await db.query(`SELECT qty FROM aif_stock WHERE variant_id=$1 AND location_id=$2`,[variantId,target.id]);
  const toAfterQty=Number(targetStock.rows[0]?.qty||0);
  if ((dst && Math.abs(dstQty - toAfterQty + count)>0.0001) || (!dst && toAfterQty!==count)) throw new Error('Shopify átadás: a cél készletérték mennyisége nem egyezik.');
  await db.query(`INSERT INTO aif_stock_retail_book(location_id,variant_id,qty,book_value,seeded,updated_at)
    VALUES ($1,$2,$3,$4,false,now()) ON CONFLICT(location_id,variant_id) DO UPDATE
    SET qty=EXCLUDED.qty,book_value=EXCLUDED.book_value,seeded=false,updated_at=now()`,
    [source.id,variantId,srcAfterQty,srcAfterValue]);
  await db.query(`INSERT INTO aif_stock_retail_book(location_id,variant_id,qty,book_value,seeded,updated_at)
    VALUES ($1,$2,$3,$4,false,now()) ON CONFLICT(location_id,variant_id) DO UPDATE
    SET qty=EXCLUDED.qty,book_value=EXCLUDED.book_value,seeded=false,updated_at=now()`,
    [target.id,variantId,toAfterQty,price(dstVal+transferValue)]);
  return {transferValue,sourceBookBefore:srcQty,targetBookBefore:dstQty,sourceBookAfter:srcAfterQty,targetBookAfter:toAfterQty};
}

async function claimLegacyMovement(db, order, variantId, qtyWanted, sourceStock, document, lineNo) {
  if (clean(order.shopify_order_legacy_id)!==legacyOrder) return null;
  const p=await db.query(`SELECT barcode FROM aif_product_variants WHERE id=$1`,[variantId]);
  if(p.rows[0]?.barcode!==legacyBarcode || qtyWanted!==1) return null;
  const result=await db.query(`SELECT id,created_at,qty_delta,qty_before,qty_after,raw FROM aif_stock_movements
    WHERE variant_id=$1 AND location_id=$2 AND source_type='shopify_inventory_webhook'
      AND qty_delta=-1 AND qty_before=6 AND qty_after=5
      AND (created_at AT TIME ZONE 'Europe/Bucharest')::date='2026-10-27'::date
      AND (created_at AT TIME ZONE 'Europe/Bucharest')::time BETWEEN '18:53:00' AND '18:54:30'
      AND raw->>'reason'='shopify_inventory_level_update'
      AND NOT (raw ? 'shopifyAvizNumber') FOR UPDATE`,[variantId,sourceStock.location_id]);
  if(result.rowCount!==1 || Number(sourceStock.qty)!==5 || Number(sourceStock.reserved_qty)!==0) {
    throw new Error('AIF-1003: a történeti -1 db mozgás/készlet már megváltozott. Csak kézi audit után rendezhető.');
  }
  const old=result.rows[0];
  await db.query(`UPDATE aif_stock_movements SET raw=COALESCE(raw,'{}'::jsonb) || $2::jsonb WHERE id=$1`,[
    old.id,JSON.stringify({
      reason:'shopify_transfer_relinked_legacy',originalReason:old.raw?.reason,
      documentType:'shopify_transfer',documentId:String(document.id),documentNumber:document.document_number,
      shopifyAvizNumber:document.document_number,shopifyOrderId:order.shopify_order_id,
      shopifyOrderNumber:order.order_name,shopifyCustomerName:order.customer_name,
      transferId:document.transfer_id,lineNo,side:'source',
      fromLocationId:String(document.source_location_id),fromLocationName:document.from_location_summary,
      toLocationId:String(document.target_location_id),toLocationName:document.to_location_summary,
      relinkedAt:new Date().toISOString(),originalMovementId:String(old.id)
    })]);
  return old;
}

function orderCondition(order) {
  if (order.cancelled_at || clean(order.status)==='cancelled') return 'cancelled';
  if(clean(order.fulfillment_status)==='fulfilled') return 'fulfilled';
  return 'open';
}

export async function previewAifShopifyWarehouseOrder(db, orderRef) {
  await ensureAifShopifyWarehouseSchema(db);
  const r=await db.query(`SELECT o.*,w.document_number AS aviz_number,w.state AS warehouse_state
    FROM aif_shopify_orders o LEFT JOIN aif_shopify_warehouse_orders w
      ON w.shopify_order_id=o.shopify_order_id
    WHERE o.shopify_order_id=$1 OR o.shopify_order_legacy_id=$1 OR o.order_name=$1 LIMIT 1`,[clean(orderRef)]);
  if(!r.rowCount) throw new Error('A Shopify rendelés nem található.');
  const o=r.rows[0];
  const lines=await db.query(`SELECT l.shopify_line_item_id,l.aif_variant_id,l.title,l.sku,
    l.quantity,l.current_quantity,l.fulfillment_status,l.unit_price,
    COALESCE(src.qty,0) AS source_qty,COALESCE(src.reserved_qty,0) AS source_reserved_qty,
    COALESCE(w.allocated_qty,0) AS warehouse_qty,COALESCE(w.shipped_qty,0) AS shipped_qty
    FROM aif_shopify_order_lines l
    LEFT JOIN aif_locations loc ON loc.code='main_warehouse'
    LEFT JOIN aif_stock src ON src.location_id=loc.id AND src.variant_id=l.aif_variant_id
    LEFT JOIN aif_shopify_warehouse_lines w ON w.shopify_line_item_id=l.shopify_line_item_id
    WHERE l.shopify_order_id=$1 AND l.is_active=true ORDER BY l.created_at`,[o.shopify_order_id]);
  return {orderId:o.shopify_order_id,orderNumber:o.order_name,customer:o.customer_name,
    state:o.warehouse_state||'not_allocated',avizNumber:o.aviz_number||null,
    financialStatus:o.financial_status,fulfillmentStatus:o.fulfillment_status,
    lines:lines.rows,legacyCandidate:clean(o.shopify_order_legacy_id)===legacyOrder};
}

async function allocate(db, order, lines, source, target, {allowLegacy=false}={}) {
  if(orderCondition(order)!=='open') throw new Error('Már törölt/teljesített rendeléshez automatikus Aviz nem készül.');
  if(!lines.length) throw new Error('A rendelésnek nincs aktív terméksora.');
  const already=await db.query(`SELECT document_number FROM aif_shopify_warehouse_orders WHERE shopify_order_id=$1`,[order.shopify_order_id]);
  if(already.rowCount) return {already:true,documentNumber:already.rows[0].document_number};
  if (clean(order.shopify_order_legacy_id)===legacyOrder && !allowLegacy) {
    throw Object.assign(new Error('AIF-1003 történeti készletmozgás rendezése szükséges; automatikusan újra levonni tilos.'),{code:'shopify_legacy_reconciliation_required'});
  }
  const prepared=[];
  for(const line of lines) {
    if(!line.aif_variant_id && (line.raw?.gift_card===true||line.requires_shipping===false))continue;
    if(!line.aif_variant_id) throw new Error(`${order.order_name}: párosítatlan terméksor ${line.sku||line.title}`);
    const count=qty(line.current_quantity??line.quantity);
    if(count===0) continue;
    const product=await loadProduct(db,line.aif_variant_id);
    prepared.push({line, count, product});
  }
  if(!prepared.length) throw new Error('A rendelés minden tétele nulla darabos.');
  // Validate the entire order before consuming any sequence number.
  const needed=new Map();
  for(const p of prepared) needed.set(clean(p.line.aif_variant_id),(needed.get(clean(p.line.aif_variant_id))||0)+p.count);
  for(const [variantId, count] of needed) {
    const r=await db.query(`SELECT qty,reserved_qty FROM aif_stock WHERE variant_id=$1 AND location_id=$2 FOR UPDATE`,[variantId,source.id]);
    const free=Number(r.rows[0]?.qty||0)-Number(r.rows[0]?.reserved_qty||0);
    const legacy=clean(order.shopify_order_legacy_id)===legacyOrder;
    if(free<count && !legacy) throw new Error(`Nincs elég szabad csíkszeredai készlet: ${variantId}, kell ${count}, van ${free}.`);
    if(legacy && (!allowLegacy || count!==1 || free!==5)) throw new Error('AIF-1003 váratlan történeti készlete; ellenőrzés szükséges.');
    // If an already-processed checkout inventory webhook is recorded, never
    // consume another source unit. Such orders need audited reconciliation.
    if(!legacy) {
      const old=await db.query(`SELECT id FROM aif_stock_movements
        WHERE variant_id=$1 AND location_id=$2 AND source_type='shopify_inventory_webhook'
          AND qty_delta<0 AND created_at BETWEEN $3::timestamptz-interval '3 minutes' AND $3::timestamptz+interval '5 minutes'
        LIMIT 1`,[variantId,source.id,order.shopify_created_at||order.created_at]);
      if(old.rowCount) throw new Error(`${order.order_name}: korábbi Shopify webhook készletcsökkentés látható. Külön helyesbítés kell.`);
    }
  }
  // The known first historical webshop sale receives SHOPIFY-000001.
  // The normal automatic processor must not take number 1 before this audit.
  if (clean(order.shopify_order_legacy_id)===legacyOrder) {
    const check=await db.query(`SELECT next_number FROM aif_shopify_aviz_sequence WHERE id=1 FOR UPDATE`);
    if (Number(check.rows[0]?.next_number)!==1) {
      throw new Error('AIF-1003: az elso SHOPIFY-000001 Aviz szam mar nem elerheto. Nem szamozom at a tortenetet.');
    }
  }
  const seq=await nextNumber(db);
  const documentId=randomUUID();
  const operationId=`shopify:${order.shopify_order_id}`;
  const doc=await db.query(`INSERT INTO aif_stock_transfer_documents (
    id,transfer_id,document_number,series,sequence_number,sequence_year,title,subtitle,note,status,actor,
    owner_key,line_count,total_qty,from_location_summary,to_location_summary,raw,
    document_type,source_location_id,target_location_id,external_reference,reason_code,reason_text,
    operation_direction,price_basis,total_value,currency_code,document_date)
    VALUES($1,$2,$3,'SHOPIFY',$4,NULL,'AVIZ INTERN SHOPIFY','Pregatire comanda online',
      $5,'issued','shopify',NULL,$6,$7,$8,$9,$10::jsonb,'shopify_transfer',$11,$12,$13,
      'shopify_order','Transfer automat catre gestiunea Shopify','transfer','selling_price',$14,'RON',
      (now() AT TIME ZONE 'Europe/Bucharest')::date)
    RETURNING *`,[
      documentId,operationId,seq.number,seq.ordinal,
      `Comanda ${order.order_name} • ${order.customer_name||'Vevő'}`,
      prepared.length,prepared.reduce((s,p)=>s+p.count,0),source.name,target.name,
      JSON.stringify({shopifyOrderId:order.shopify_order_id,shopifyOrderNumber:order.order_name,
        customerName:order.customer_name,shippingAddress:order.shipping_address,
        packingStatus:'packing_pending',managedBy:'aif_shopify_warehouse_v1'}),
      String(source.id),String(target.id),order.order_name,
      price(prepared.reduce((s,p)=>s+p.count*Number((p.line.unit_price ?? p.product.sell_price ?? 0)),0))]);
  const document=doc.rows[0];
  await db.query(`INSERT INTO aif_shopify_warehouse_orders
    (shopify_order_id,document_id,document_number,state,order_name,customer_name,source_location_id,target_location_id,raw)
    VALUES($1,$2,$3,'allocated',$4,$5,$6,$7,$8::jsonb)`,[
      order.shopify_order_id,document.id,seq.number,order.order_name,order.customer_name,source.id,target.id,
      JSON.stringify({paymentStatus:order.financial_status,shippingAmount:order.total_shipping,orderTotal:order.total_price})]);
  let lineNo=0;
  for(const p of prepared) {
    lineNo++;
    const stock=await lockStock(db,p.product.id,source,target);
    const before=Number(stock.from.qty),reserved=Number(stock.from.reserved_qty);
    const targetBefore=Number(stock.to.qty),targetReserved=Number(stock.to.reserved_qty);
    const legacy=clean(order.shopify_order_legacy_id)===legacyOrder;
    const historical=legacy ? await claimLegacyMovement(db,order,p.product.id,p.count,{...stock.from,location_id:source.id},document,lineNo) : null;
    if(legacy && !historical) throw new Error('AIF-1003 korábbi Shopify mozgása nem kapcsolható; a teljes tranzakció megszakítva.');
    const after=legacy ? before : before-p.count;
    if(after<reserved) throw new Error(`${p.product.title_ro}: a csíkszeredai szabad készlet nem elegendő.`);
    if(!legacy) {
      await db.query(`UPDATE aif_stock SET qty=$3,updated_at=now() WHERE location_id=$1 AND variant_id=$2`,[source.id,p.product.id,after]);
      await writeMovement(db,{variantId:p.product.id,locationId:source.id,delta:-p.count,before,after,
        actor:'SHOPIFY',document,order,lineNo,side:'source',kind:'shopify_order_auto_transfer'});
    }
    // Every Shopify-raktár piece is earmarked for exactly one order. Physical
    // stock is here, but available is zero until shipped or released.
    await db.query(`UPDATE aif_stock SET qty=$3,reserved_qty=$4,updated_at=now()
      WHERE location_id=$1 AND variant_id=$2`,[target.id,p.product.id,targetBefore+p.count,targetReserved+p.count]);
    const book=await moveRetailBook(db,p.product.id,source,target,p.count,{legacy,variantSellPrice:p.product.sell_price});
    await writeMovement(db,{variantId:p.product.id,locationId:target.id,delta:p.count,before:targetBefore,after:targetBefore+p.count,
      actor:'SHOPIFY',document,order,lineNo,side:'target',kind:'shopify_order_auto_transfer',extra:{retailBookMovementValue:book.transferValue}});
    const unit=price(book.transferValue/p.count);
    const detail=await db.query(`INSERT INTO aif_stock_transfer_document_lines (
      document_id,line_no,variant_id,product_title,brand_name,category_name,product_code,barcode,color_name,size,image_url,
      from_location_id,from_location_name,to_location_id,to_location_name,qty,source_before,source_after,
      target_before,target_after,unit_price,line_total,currency_code,price_basis,qty_delta,raw)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'RON','selling_price',0,$23::jsonb)
      RETURNING id`,[document.id,lineNo,clean(p.product.id),p.product.title_ro,p.product.brand_name,p.product.category_name,
        p.product.productCode,p.product.barcode,p.product.color_name,p.product.size,p.product.image_url,
        String(source.id),source.name,String(target.id),target.name,p.count,
        legacy?Number(historical.qty_before):before,after,targetBefore,targetBefore+p.count,unit,price(unit*p.count),
        JSON.stringify({shopifyOrderId:order.shopify_order_id,shopifyOrderNumber:order.order_name,
          shopifyCustomerName:order.customer_name,shopifyLineItemId:p.line.shopify_line_item_id,legacyRelink:Boolean(historical)})]);
    await db.query(`INSERT INTO aif_shopify_warehouse_lines
      (shopify_line_item_id,shopify_order_id,document_line_id,variant_id,allocated_qty,legacy_movement_id,raw)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,[p.line.shopify_line_item_id,order.shopify_order_id,detail.rows[0].id,p.product.id,p.count,
        historical?.id != null ? String(historical.id) : null,JSON.stringify({shopifySku:p.line.sku,productTitle:p.product.title_ro,allocatedBookValue:book.transferValue})]);
  }
  await db.query(`UPDATE aif_stock_transfer_documents SET total_value=(SELECT COALESCE(sum(line_total),0) FROM aif_stock_transfer_document_lines WHERE document_id=$1),price_basis='retail_book' WHERE id=$1`,[document.id]);
  return {created:true,documentNumber:seq.number,shopifyOrder:order.order_name,lines:prepared.length,legacyRelink:allowLegacy};
}


const lifeError = (message, code = 'shopify_lifecycle_review_required', statusCode = 409) => Object.assign(new Error(message), { code, statusCode });
const positiveQty = (value) => {
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<=0) throw lifeError('Pozitív egész darabszám szükséges.','invalid_quantity',400);
  return n;
};
async function byLocationId(db, id) {
  const r=await db.query('SELECT id,code,name,is_active FROM aif_locations WHERE id=$1',[id]);
  if(!r.rowCount) throw lifeError('A bizonylathoz tartozó készlethely nem található.');
  return r.rows[0];
}
async function warehouseLocations(db,w) {
  return {source:await byLocationId(db,w.source_location_id),target:await byLocationId(db,w.target_location_id)};
}
async function nextLifecycleNumber(db,series) {
  await db.query('INSERT INTO aif_shopify_lifecycle_sequences(series) VALUES($1) ON CONFLICT DO NOTHING',[series]);
  const r=await db.query('SELECT next_number FROM aif_shopify_lifecycle_sequences WHERE series=$1 FOR UPDATE',[series]);
  const ordinal=Number(r.rows[0].next_number);
  if(!Number.isSafeInteger(ordinal)||ordinal<1) throw lifeError('Érvénytelen Shopify bizonylatsorszám.');
  await db.query('UPDATE aif_shopify_lifecycle_sequences SET next_number=$2 WHERE series=$1',[series,ordinal+1]);
  return {number:`${series}-${String(ordinal).padStart(6,'0')}`,ordinal};
}
async function lifecycleDocument(db,{order,warehouse,kind,source=null,target=null,actor,reason,lines}) {
  const series={addition:'SHOPIFY',cancel_release:'SHOPIFY-VISSZA',shipment:'SHOPIFY-KIADAS',return_received:'SHOPIFY-RETUR',quarantine_release:'SHOPIFY-RENDEZES',quarantine_writeoff:'SHOPIFY-RENDEZES'}[kind];
  if(!series||!lines.length) throw lifeError('Hiányos bizonylati művelet.');
  const seq=kind==='addition'?await nextNumber(db):await nextLifecycleNumber(db,series);
  const id=randomUUID();
  const title={addition:'AVIZ INTERN SHOPIFY',cancel_release:'PROCES-VERBAL DE RETRANSFER',shipment:'DOCUMENT DE IESIRE SHOPIFY',return_received:'PROCES-VERBAL DE RECEPTIE RETUR',quarantine_release:'PROCES-VERBAL DE ELIBERARE DIN CARANTINA',quarantine_writeoff:'PROCES-VERBAL PRODUSE DETERIORATE'}[kind];
  const fromName=source?.name || `Client / ${order.order_name}`;
  const toName=target?.name || (kind==='quarantine_writeoff'?'Produse deteriorate':`Client / ${order.order_name}`);
  const total=price(lines.reduce((sum,l)=>sum+Number(l.value||0),0));
  const raw={managedBy:'aif_shopify_warehouse_v2',shopifyOperation:kind,shopifyOrderId:order.shopify_order_id,
    shopifyOrderNumber:order.order_name,customerName:order.customer_name,shippingAddress:order.shipping_address,
    originalAviz:warehouse.document_number,originalDocumentId:String(warehouse.document_id),
    originalSourceLocationId:String(warehouse.source_location_id),shopifyWarehouseState:'recorded',
    financialOperation:false,physicalReceipt:kind==='return_received'};
  const r=await db.query(`INSERT INTO aif_stock_transfer_documents
    (id,transfer_id,document_number,series,sequence_number,title,subtitle,note,status,actor,
     line_count,total_qty,from_location_summary,to_location_summary,raw,document_type,
     source_location_id,target_location_id,external_reference,reason_code,reason_text,
     operation_direction,price_basis,total_value,currency_code,document_date)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'issued',$9,$10,$11,$12,$13,$14::jsonb,'shopify_transfer',
     $15,$16,$17,$18,$8,$19,'retail_book',$20,'RON',(now() AT TIME ZONE 'Europe/Bucharest')::date) RETURNING *`,
    [id,`shp-life:${id}`,seq.number,series,seq.ordinal,title,`Comanda ${order.order_name} / ${warehouse.document_number}`,reason,actor,
      lines.length,lines.reduce((n,l)=>n+l.qty,0),fromName,toName,JSON.stringify(raw),source?String(source.id):null,
      target?String(target.id):null,order.order_name,kind,source&&target?'transfer':target?'increase':'decrease',total]);
  const document=r.rows[0];
  let index=0;
  for(const line of lines) {
    index++;
    const p=line.product || await loadProduct(db,line.variantId);
    const detail=await db.query(`INSERT INTO aif_stock_transfer_document_lines
      (document_id,line_no,variant_id,product_title,brand_name,category_name,product_code,barcode,color_name,size,image_url,
       from_location_id,from_location_name,to_location_id,to_location_name,qty,source_before,source_after,
       target_before,target_after,unit_price,line_total,currency_code,price_basis,qty_delta,raw)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'RON','retail_book',$23,$24::jsonb) RETURNING id`,
      [id,index,String(line.variantId),p.title_ro,p.brand_name,p.category_name,p.productCode,p.barcode,p.color_name,p.size,p.image_url,
        source?String(source.id):null,fromName,target?String(target.id):null,toName,line.qty,line.sourceBefore??null,line.sourceAfter??null,
        line.targetBefore??null,line.targetAfter??null,price(line.value/line.qty),price(line.value),source&&target?0:target?line.qty:-line.qty,
        JSON.stringify({shopifyOrderId:order.shopify_order_id,shopifyOrderNumber:order.order_name,shopifyLineItemId:line.lineId,
          originalAviz:warehouse.document_number,shopifyOperation:kind,condition:line.condition||null,bookValue:price(line.value),...line.raw})]);
    line.documentLineId=detail.rows[0].id;
    line.lineNo=index;
  }
  return document;
}
async function bookTake(db,locationId,variantId,before,take) {
  const r=await db.query('SELECT qty,book_value FROM aif_stock_retail_book WHERE location_id=$1 AND variant_id=$2 FOR UPDATE',[locationId,variantId]);
  const row=r.rows[0];
  if(!row || Math.abs(Number(row.qty)-before)>0.0001 || before<take || Number(row.book_value)<0) throw lifeError('Készlet és készletérték eltérés; a művelet nem menthető.');
  const value=take===before?Number(row.book_value):price(Number(row.book_value)*take/before);
  await db.query('UPDATE aif_stock_retail_book SET qty=$3,book_value=$4,seeded=false,updated_at=now() WHERE location_id=$1 AND variant_id=$2',[locationId,variantId,before-take,price(Number(row.book_value)-value)]);
  return value;
}
async function bookAdd(db,locationId,variantId,before,add,value) {
  const r=await db.query('SELECT qty,book_value FROM aif_stock_retail_book WHERE location_id=$1 AND variant_id=$2 FOR UPDATE',[locationId,variantId]);
  if((r.rowCount && Math.abs(Number(r.rows[0].qty)-before)>0.0001)||(!r.rowCount&&before!==0)) throw lifeError('A célhely készletérték-nyilvántartása nem egyezik.');
  await db.query(`INSERT INTO aif_stock_retail_book(location_id,variant_id,qty,book_value,seeded,updated_at)
    VALUES($1,$2,$3,$4,false,now()) ON CONFLICT(location_id,variant_id) DO UPDATE
    SET qty=EXCLUDED.qty,book_value=EXCLUDED.book_value,seeded=false,updated_at=now()`,[locationId,variantId,before+add,price(Number(r.rows[0]?.book_value||0)+value)]);
}
async function recordLifecycleEvent(db,order,kind,document,actor,lines,key=randomUUID(),hash=null,extra={}) {
  const payload={documentNumber:document?.document_number,lines:lines.map(l=>({lineId:l.lineId,variantId:l.variantId,qty:l.qty,value:l.value,condition:l.condition||null})),...extra};
  await db.query(`INSERT INTO aif_shopify_lifecycle_events(shopify_order_id,event_key,request_hash,kind,document_id,actor,payload)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,[order.shopify_order_id,key,hash,kind,document?.id||null,actor,JSON.stringify(payload)]);
  return payload;
}
async function updateLifecycleState(db,order,warehouse,{markProcessed=false}={}) {
  const r=await db.query(`SELECT COALESCE(sum(allocated_qty-shipped_qty-released_qty),0)::int AS held,
    COALESCE(sum(shipped_qty),0)::int AS shipped,COALESCE(sum(released_qty),0)::int AS released,
    COALESCE(sum(returned_qty),0)::int AS returned FROM aif_shopify_warehouse_lines WHERE shopify_order_id=$1`,[order.shopify_order_id]);
  const q=r.rows[0];
  const state=q.held>0?'allocated':q.shipped>0?'fulfilled':'cancelled';
  const detail=q.held>0?(q.shipped>0?'partial':'allocated'):q.shipped>0?(q.returned>=q.shipped?'returned':q.returned>0?'partially_returned':q.released>0?'fulfilled_partial_cancel':'fulfilled'):'cancelled';
  await db.query(`UPDATE aif_shopify_warehouse_orders SET state=$2,fulfilled_at=CASE WHEN $2='fulfilled' THEN COALESCE(fulfilled_at,now()) ELSE fulfilled_at END,
    cancelled_at=CASE WHEN $2='cancelled' THEN COALESCE(cancelled_at,now()) ELSE cancelled_at END,
    raw=raw||$3::jsonb,updated_at=now() WHERE shopify_order_id=$1`,[order.shopify_order_id,state,JSON.stringify({lifecycleVersion:2,lifecycleState:detail,pendingQty:q.held,shippedQty:q.shipped,releasedQty:q.released,returnedQty:q.returned,...(markProcessed?{lastSeenOrderUpdatedAt:order.updated_at}:{})})]);
  await db.query(`UPDATE aif_stock_transfer_documents SET raw=raw||$2::jsonb,updated_at=now() WHERE id=$1`,[warehouse.document_id,JSON.stringify({shopifyWarehouseState:state,shopifyLifecycleState:detail,pendingQty:q.held,shippedQty:q.shipped,returnedQty:q.returned})]);
  return {state,lifecycleState:detail,...q};
}
async function readLifecycleInputs(db,orderId) {
  const lines=await db.query('SELECT * FROM aif_shopify_order_lines WHERE shopify_order_id=$1 ORDER BY aif_variant_id,shopify_line_item_id FOR UPDATE',[orderId]);
  const saved=await db.query('SELECT * FROM aif_shopify_warehouse_lines WHERE shopify_order_id=$1 ORDER BY variant_id,shopify_line_item_id FOR UPDATE',[orderId]);
  const refunds=await db.query(`SELECT rl.* FROM aif_shopify_refund_lines rl JOIN aif_shopify_refunds r ON r.shopify_refund_id=rl.shopify_refund_id WHERE r.shopify_order_id=$1`,[orderId]);
  const fs=await db.query('SELECT * FROM aif_shopify_fulfillments WHERE shopify_order_id=$1',[orderId]);
  const raw=(await db.query('SELECT raw FROM aif_shopify_orders WHERE shopify_order_id=$1',[orderId])).rows[0]?.raw||{};
  const latest=new Map((Array.isArray(raw.fulfillments)?raw.fulfillments:[]).map(f=>[clean(f.admin_graphql_api_id || `gid://shopify/Fulfillment/${f.id}`),f]));
  for(const f of fs.rows) latest.set(f.shopify_fulfillment_id,f);
  return {lines:lines.rows,warehouseLines:saved.rows,refunds:refunds.rows,fulfillments:[...latest.values()]};
}
async function applyLifecyclePlan(db,order,warehouse,plan,locations) {
  const {source,target}=locations;
  const changes=[];
  for(const kind of ['addition','shipment','cancel_release']) {
    const field={addition:'add',shipment:'ship',cancel_release:'release'}[kind];
    const list=[];
    for(const item of plan.lines.filter(l=>l[field]>0).sort((a,b)=>String(a.variantId).localeCompare(String(b.variantId))||a.id.localeCompare(b.id))) {
      const amount=item[field];
      const locks=await lockStock(db,item.variantId,source,target);
      const a=Number(locks.from.qty),ar=Number(locks.from.reserved_qty),b=Number(locks.to.qty),br=Number(locks.to.reserved_qty);
      const line={lineId:item.id,variantId:item.variantId,qty:amount};
      if(kind==='addition') {
        if(source.is_active===false || a-ar<amount) throw lifeError(`${item.line.sku}: nincs elegendő szabad készlet a kiegészítő Avizhoz.`);
        line.value=await bookTake(db,source.id,item.variantId,a,amount);
        await bookAdd(db,target.id,item.variantId,b,amount,line.value);
        await db.query('UPDATE aif_stock SET qty=$3,updated_at=now() WHERE location_id=$1 AND variant_id=$2',[source.id,item.variantId,a-amount]);
        await db.query('UPDATE aif_stock SET qty=$3,reserved_qty=$4,updated_at=now() WHERE location_id=$1 AND variant_id=$2',[target.id,item.variantId,b+amount,br+amount]);
        Object.assign(line,{sourceBefore:a,sourceAfter:a-amount,targetBefore:b,targetAfter:b+amount});
      } else {
        if(b<amount||br<amount) throw lifeError(`${item.line.sku}: a Shopify foglalt készlete nem elegendő.`);
        line.value=await bookTake(db,target.id,item.variantId,b,amount);
        await db.query('UPDATE aif_stock SET qty=$3,reserved_qty=$4,updated_at=now() WHERE location_id=$1 AND variant_id=$2',[target.id,item.variantId,b-amount,br-amount]);
        Object.assign(line,{sourceBefore:b,sourceAfter:b-amount});
        if(kind==='cancel_release') {
          await bookAdd(db,source.id,item.variantId,a,amount,line.value);
          await db.query('UPDATE aif_stock SET qty=$3,updated_at=now() WHERE location_id=$1 AND variant_id=$2',[source.id,item.variantId,a+amount]);
          Object.assign(line,{targetBefore:a,targetAfter:a+amount});
        }
      }
      list.push(line);
    }
    if(!list.length) continue;
    const from=kind==='addition'?source:target;
    const to=kind==='addition'?target:kind==='cancel_release'?source:null;
    const document=await lifecycleDocument(db,{order,warehouse,kind,source:from,target:to,actor:'SHOPIFY',
      reason:{addition:'Completare comanda online',shipment:'Iesire pe baza confirmarii Shopify',cancel_release:'Anulare / reducere comanda, produse neexpediate'}[kind],lines:list});
    for(const l of list) {
      await writeMovement(db,{variantId:l.variantId,locationId:from.id,delta:-l.qty,before:l.sourceBefore,after:l.sourceAfter,
        actor:'SHOPIFY',document,order,lineNo:l.lineNo,side:'source',kind:`shopify_${kind}`,extra:{retailBookMovementValue:-l.value,originalAviz:warehouse.document_number}});
      if(to) await writeMovement(db,{variantId:l.variantId,locationId:to.id,delta:l.qty,before:l.targetBefore,after:l.targetAfter,
        actor:'SHOPIFY',document,order,lineNo:l.lineNo,side:'target',kind:`shopify_${kind}`,extra:{retailBookMovementValue:l.value,originalAviz:warehouse.document_number}});
      if(kind==='addition') await db.query(`INSERT INTO aif_shopify_warehouse_lines
        (shopify_line_item_id,shopify_order_id,document_line_id,variant_id,allocated_qty,raw)
        VALUES($1,$2,$3,$4,$5,'{}'::jsonb) ON CONFLICT(shopify_line_item_id) DO UPDATE
        SET allocated_qty=aif_shopify_warehouse_lines.allocated_qty+EXCLUDED.allocated_qty,updated_at=now()`,[l.lineId,order.shopify_order_id,l.documentLineId,l.variantId,l.qty]);
      else if(kind==='shipment') await db.query(`UPDATE aif_shopify_warehouse_lines SET shipped_qty=shipped_qty+$2,
        shipped_book_value=shipped_book_value+$3,valuation_known=(valuation_known OR shipped_qty=0),updated_at=now() WHERE shopify_line_item_id=$1`,[l.lineId,l.qty,l.value]);
      else await db.query('UPDATE aif_shopify_warehouse_lines SET released_qty=released_qty+$2,updated_at=now() WHERE shopify_line_item_id=$1',[l.lineId,l.qty]);
      await enqueueAifShopifyVariant(db,l.variantId,`shopify_lifecycle_${kind}`,{schemaReady:true});
    }
    await recordLifecycleEvent(db,order,kind,document,'SHOPIFY',list);
    changes.push({kind,documentNumber:document.document_number,quantity:list.reduce((n,l)=>n+l.qty,0)});
  }
  const state=await updateLifecycleState(db,order,warehouse,{markProcessed:true});
  // A Shopify refund can restock its online quantity before goods physically
  // arrive. Re-publish the verified AIF availability even when this plan itself
  // has no stock movement. The shared process lock/outbox guard prevent sending
  // this snapshot before the known order events have been accounted for.
  for(const variantId of new Set(plan.lines.map(l=>l.variantId).filter(Boolean))) {
    await enqueueAifShopifyVariant(db,variantId,'shopify_lifecycle_verified_availability',{schemaReady:true});
  }
  return {documentNumber:warehouse.document_number,changes,...state};
}
async function withOrderTransaction(pool,orderId,{allowLegacy=false,dryRun=false}={}) {
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL lock_timeout='6s'");
    await db.query("SET LOCAL statement_timeout='30000ms'");
    await db.query("SELECT pg_advisory_xact_lock(hashtext('shopify_warehouse'),hashtext($1))",[orderId]);
    const q=await db.query('SELECT * FROM aif_shopify_orders WHERE shopify_order_id=$1 FOR UPDATE',[orderId]);
    if(!q.rowCount) throw lifeError('Shopify rendelés nem található.','order_not_found',404);
    const order=q.rows[0];
    const existing=await db.query('SELECT * FROM aif_shopify_warehouse_orders WHERE shopify_order_id=$1 FOR UPDATE',[orderId]);
    let warehouse=existing.rows[0],result;
    if(!warehouse) {
      const locations=await findAifShopifyWarehouseLocations(db);
      const lines=await db.query('SELECT * FROM aif_shopify_order_lines WHERE shopify_order_id=$1 AND is_active=true ORDER BY aif_variant_id,shopify_line_item_id FOR UPDATE',[orderId]);
      if(orderCondition(order)==='cancelled' && !aifShopifyLifecycleEnabled()) result={skipped:true,reason:'cancelled_before_allocation'};
      else {
        let allocationLines=lines.rows,allocationOrder=order;
        if(aifShopifyLifecycleEnabled()&&!allowLegacy) {
          const inputs=await readLifecycleInputs(db,orderId);
          const initial=planAifShopifyLifecycle({order,...inputs});
          allocationLines=initial.lines.filter(l=>l.targetDemand>0).map(l=>({...l.line,current_quantity:l.targetDemand}));
          allocationOrder={...order,status:'open',cancelled_at:null,fulfillment_status:null};
        }
        if(!allocationLines.some(l=>Number(l.current_quantity)>0)) result={skipped:true,reason:'no_stock_required'};
        else {
          result=await allocate(db,allocationOrder,allocationLines,locations.source,locations.target,{allowLegacy});
          warehouse=(await db.query('SELECT * FROM aif_shopify_warehouse_orders WHERE shopify_order_id=$1 FOR UPDATE',[orderId])).rows[0];
          for(const variantId of new Set(allocationLines.map(l=>l.aif_variant_id))) if(variantId) await enqueueAifShopifyVariant(db,variantId,'shopify_allocation',{schemaReady:true});
        }
      }
    }
    if(warehouse) {
      if(aifShopifyLifecycleEnabled()) {
        const inputs=await readLifecycleInputs(db,orderId);
        // An old fulfillment without saved valuation cannot be safely returned.
        const plan=planAifShopifyLifecycle({order,...inputs});
        const life=await applyLifecyclePlan(db,order,warehouse,plan,await warehouseLocations(db,warehouse));
        result={...result,...life};
      } else if(orderCondition(order)!=='open') {
        throw lifeError('Lemondás/teljesítés vár feldolgozásra. A SHOPIFY_WAREHOUSE_LIFECYCLE_ENABLED még nincs engedélyezve.','lifecycle_disabled');
      } else result=result||{already:true,state:warehouse.state,documentNumber:warehouse.document_number};
    }
    if(dryRun) await db.query('ROLLBACK'); else await db.query('COMMIT');
    return {...result,dryRun};
  } catch(error) {await db.query('ROLLBACK').catch(()=>{});throw error;}
  finally {db.release();}
}
export async function reconcileAifShopifyWarehouseOrder(pool,orderRef,{apply=false,legacy=false,dryRun=false}={}) {
  const db=await pool.connect();let id;
  try {
    await ensureAifShopifyWarehouseSchema(db);
    id=(await db.query('SELECT shopify_order_id FROM aif_shopify_orders WHERE shopify_order_id=$1 OR shopify_order_legacy_id=$1 OR order_name=$1',[clean(orderRef)])).rows[0]?.shopify_order_id;
    if(!id)throw lifeError('Rendelés nem található.','order_not_found',404);
    if(!apply&&!dryRun) return {preview:true,...await previewAifShopifyWarehouseOrder(db,id)};
  } finally {db.release();}
  if(!enabled()&&!dryRun) throw lifeError('A Shopify raktári automatizmus nincs engedélyezve.','warehouse_disabled');
  if(legacy&&id!==`gid://shopify/Order/${legacyOrder}`) throw lifeError('Történeti javítás kizárólag az AIF-1003 rendelésre engedélyezett.');
  const lock=await acquireAifShopifyProcessLock(pool);
  if(!lock.locked)throw lifeError('Shopify feldolgozás folyamatban, próbáld újra.','shopify_processor_busy');
  try{return await withOrderTransaction(pool,id,{allowLegacy:legacy,dryRun});}finally{await lock.release();}
}
export async function processAifShopifyWarehouseBatch(pool,{limit=6}={}) {
  if(!enabled())return {enabled:false,processed:0,errors:0};
  const lock=await acquireAifShopifyProcessLock(pool);
  if(!lock.locked)return {enabled:true,processed:0,errors:0,lockSkipped:true};
  try {
    const db=await pool.connect();let ids=[];
    try {
      await ensureAifShopifyWarehouseSchema(db);
      const first=await db.query(`SELECT s.next_number,EXISTS(SELECT 1 FROM aif_shopify_orders o
        LEFT JOIN aif_shopify_warehouse_orders w ON w.shopify_order_id=o.shopify_order_id
        WHERE o.shopify_order_legacy_id=$1 AND w.shopify_order_id IS NULL) AS pending
        FROM aif_shopify_aviz_sequence s WHERE id=1`,[legacyOrder]);
      if(Number(first.rows[0]?.next_number)===1&&first.rows[0]?.pending)return {enabled:true,processed:0,errors:0,blocked:'AIF-1003 audit szükséges.'};
      const r=await db.query(`SELECT o.shopify_order_id FROM aif_shopify_orders o
        LEFT JOIN aif_shopify_warehouse_orders w ON w.shopify_order_id=o.shopify_order_id
        LEFT JOIN aif_shopify_warehouse_failures f ON f.shopify_order_id=o.shopify_order_id
        WHERE (f.retry_after IS NULL OR f.retry_after<=now()) AND (
          (w.shopify_order_id IS NULL AND o.shopify_order_legacy_id IS DISTINCT FROM $2
            AND (o.cancelled_at IS NULL AND o.status<>'cancelled' OR EXISTS(SELECT 1 FROM aif_shopify_fulfillments f WHERE f.shopify_order_id=o.shopify_order_id AND f.status='success'))
            AND EXISTS(SELECT 1 FROM aif_shopify_order_lines l WHERE l.shopify_order_id=o.shopify_order_id AND l.is_active AND (l.aif_variant_id IS NOT NULL OR l.requires_shipping IS DISTINCT FROM false) AND (l.current_quantity>0 OR EXISTS(SELECT 1 FROM aif_shopify_fulfillments f WHERE f.shopify_order_id=o.shopify_order_id AND f.status='success')))
            AND EXISTS(SELECT 1 FROM aif_shopify_warehouse_activation a WHERE a.id=1 AND COALESCE(o.shopify_created_at,o.created_at)>=a.activated_at))
          OR (w.shopify_order_id IS NOT NULL AND ($3::boolean AND
            (w.raw->>'lifecycleVersion' IS DISTINCT FROM '2' OR COALESCE((w.raw->>'lastSeenOrderUpdatedAt')::timestamptz,'epoch'::timestamptz)<o.updated_at)
            OR NOT $3::boolean AND w.state='allocated' AND (o.cancelled_at IS NOT NULL OR o.status='cancelled' OR o.fulfillment_status='fulfilled')))
        ) ORDER BY o.updated_at,o.shopify_order_id LIMIT $1`,[Math.min(25,Math.max(1,Number(limit)||6)),legacyOrder,aifShopifyLifecycleEnabled()]);
      ids=r.rows.map(r=>r.shopify_order_id);
    } finally {db.release();}
    let processed=0;const errorItems=[];
    for(const id of ids) {
      try {await withOrderTransaction(pool,id);await pool.query('DELETE FROM aif_shopify_warehouse_failures WHERE shopify_order_id=$1',[id]);processed++;}
      catch(error) {
        const message=clean(error?.message||error).slice(0,3000);
        await pool.query(`INSERT INTO aif_shopify_warehouse_failures(shopify_order_id,error) VALUES($1,$2)
          ON CONFLICT(shopify_order_id) DO UPDATE SET error=EXCLUDED.error,attempts=aif_shopify_warehouse_failures.attempts+1,retry_after=now()+interval '5 minutes',updated_at=now()`,[id,message]);
        errorItems.push({orderId:id,error:message});
      }
    }
    return {enabled:true,lifecycleEnabled:aifShopifyLifecycleEnabled(),claimed:ids.length,processed,errors:errorItems.length,errorItems};
  }finally{await lock.release();}
}

/** Physical return receipt only. Never sends a refund, cancellation or fulfillment to Shopify. */
export async function receiveAifShopifyReturn(pool,orderRef,input,{actor,allowedLocationId=null,admin=false}={}) {
  if(!enabled()||!aifShopifyLifecycleEnabled())throw lifeError('A Shopify visszáru-kezelés még nincs engedélyezve.','lifecycle_disabled');
  if(!clean(actor)||input?.physicallyReceived!==true) throw lifeError('A tényleges átvételt meg kell erősíteni.','physical_confirmation_required',400);
  const requestKey=clean(input.idempotencyKey);
  if(!/^[A-Za-z0-9:_-]{16,120}$/.test(requestKey))throw lifeError('Érvénytelen műveletazonosító.','idempotency_key_required',400);
  const note=clean(input.note).slice(0,1500);
  if(!note)throw lifeError('A visszavétel indoka szükséges.','return_note_required',400);
  if(!Array.isArray(input.lines)||!input.lines.length||input.lines.length>100)throw lifeError('Visszavételi tétel szükséges.','invalid_lines',400);
  const lines=input.lines.map(l=>({lineId:clean(l.lineId),qty:positiveQty(l.quantity),condition:clean(l.condition)})).sort((a,b)=>a.lineId.localeCompare(b.lineId));
  if(new Set(lines.map(l=>l.lineId)).size!==lines.length || lines.some(l=>!l.lineId||!['restock','quarantine'].includes(l.condition)))throw lifeError('Érvénytelen vagy ismétlődő visszáru-sor.','invalid_lines',400);
  const requestHash=createHash('sha256').update(JSON.stringify({lines,note,location:clean(input.locationId),replacementOrder:clean(input.replacementOrder)})).digest('hex');
  const init=await pool.connect();try{await ensureAifShopifyWarehouseSchema(init);}finally{init.release();}
  const lock=await acquireAifShopifyProcessLock(pool);
  if(!lock.locked)throw lifeError('Shopify feldolgozás folyamatban, próbáld újra.','shopify_processor_busy');
  let db;
  try {
    db=await pool.connect();
    await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='6s'");await db.query("SET LOCAL statement_timeout='30000ms'");
    const ref=await db.query('SELECT shopify_order_id FROM aif_shopify_orders WHERE shopify_order_id=$1 OR order_name=$1 OR shopify_order_legacy_id=$1',[clean(orderRef)]);
    const id=ref.rows[0]?.shopify_order_id;if(!id)throw lifeError('Rendelés nem található.','order_not_found',404);
    await db.query("SELECT pg_advisory_xact_lock(hashtext('shopify_warehouse'),hashtext($1))",[id]);
    const order=(await db.query('SELECT * FROM aif_shopify_orders WHERE shopify_order_id=$1 FOR UPDATE',[id])).rows[0];
    const warehouse=(await db.query('SELECT * FROM aif_shopify_warehouse_orders WHERE shopify_order_id=$1 FOR UPDATE',[id])).rows[0];
    if(!warehouse)throw lifeError('Nincs kezelt Shopify átadás ehhez a rendeléshez.');
    // Non-admins can receive only into their own physical location, and only
    // when it is the original source. A webshop session cannot impersonate it.
    const locationId=clean(input.locationId)||String(warehouse.source_location_id);
    if(!admin && (!allowedLocationId||String(allowedLocationId)!==locationId||locationId!==String(warehouse.source_location_id)))throw lifeError('Csak a saját forrásüzletedben vehetsz át visszárut.','forbidden_location',403);
    const destination=await byLocationId(db,locationId);
    if(destination.is_active===false||destination.id===warehouse.target_location_id)throw lifeError('Aktív fizikai átvételi üzletet válassz.');
    const key=`receipt:${requestKey}`;
    const old=await db.query('SELECT request_hash,payload FROM aif_shopify_lifecycle_events WHERE shopify_order_id=$1 AND event_key=$2',[id,key]);
    if(old.rowCount){if(old.rows[0].request_hash!==requestHash)throw lifeError('Ugyanaz a műveletazonosító más adatokkal már szerepel.','idempotency_conflict');await db.query('COMMIT');return {duplicate:true,...old.rows[0].payload};}
    const saved=await db.query('SELECT * FROM aif_shopify_warehouse_lines WHERE shopify_order_id=$1 ORDER BY variant_id,shopify_line_item_id FOR UPDATE',[id]);
    const prepared=[];
    for(const item of lines) {
      const line=saved.rows.find(l=>l.shopify_line_item_id===item.lineId);
      if(!line||Number(line.shipped_qty)-Number(line.returned_qty)<item.qty)throw lifeError('A visszavett mennyiség meghaladja a még visszavehető, ténylegesen kiadott darabszámot.');
      if(!line.valuation_known)throw lifeError('A régi feladás készletérték-pillanatképe hiányzik; külön audit szükséges.');
      const remaining=Number(line.shipped_qty)-Number(line.returned_qty);
      const valueLeft=price(Number(line.shipped_book_value)-Number(line.returned_book_value));
      const value=item.qty===remaining?valueLeft:price(valueLeft*item.qty/remaining);
      prepared.push({...item,variantId:line.variant_id,value,old:line});
    }
    for(const line of prepared.sort((a,b)=>String(a.variantId).localeCompare(String(b.variantId))||a.lineId.localeCompare(b.lineId))) {
      await db.query('INSERT INTO aif_stock(location_id,variant_id,qty,reserved_qty) VALUES($1,$2,0,0) ON CONFLICT DO NOTHING',[destination.id,line.variantId]);
      const row=(await db.query('SELECT qty,reserved_qty FROM aif_stock WHERE location_id=$1 AND variant_id=$2 FOR UPDATE',[destination.id,line.variantId])).rows[0];
      line.targetBefore=Number(row.qty);line.targetAfter=line.targetBefore+line.qty;
      await bookAdd(db,destination.id,line.variantId,line.targetBefore,line.qty,line.value);
      await db.query('UPDATE aif_stock SET qty=$3,reserved_qty=$4,updated_at=now() WHERE location_id=$1 AND variant_id=$2',[destination.id,line.variantId,line.targetAfter,Number(row.reserved_qty)+(line.condition==='quarantine'?line.qty:0)]);
      await db.query('UPDATE aif_shopify_warehouse_lines SET returned_qty=returned_qty+$2,returned_book_value=returned_book_value+$3,updated_at=now() WHERE shopify_line_item_id=$1',[line.lineId,line.qty,line.value]);
    }
    const document=await lifecycleDocument(db,{order,warehouse,kind:'return_received',target:destination,actor,reason:note+(clean(input.replacementOrder)?` | Comanda de schimb: ${clean(input.replacementOrder).slice(0,120)}`:''),lines:prepared});
    for(const line of prepared) {
      await writeMovement(db,{variantId:line.variantId,locationId:destination.id,delta:line.qty,before:line.targetBefore,after:line.targetAfter,actor,document,order,lineNo:line.lineNo,side:'target',kind:'shopify_physical_return',extra:{condition:line.condition,retailBookMovementValue:line.value,originalAviz:warehouse.document_number}});
      if(line.condition==='quarantine')await db.query(`INSERT INTO aif_shopify_return_quarantine(shopify_order_id,shopify_line_item_id,variant_id,location_id,receipt_document_id,qty,book_value,note,actor)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,line.lineId,line.variantId,destination.id,document.id,line.qty,line.value,note,actor]);
      await enqueueAifShopifyVariant(db,line.variantId,'shopify_physical_return',{schemaReady:true});
    }
    const payload=await recordLifecycleEvent(db,order,'return_received',document,actor,prepared,key,requestHash,{locationId:String(destination.id),replacementOrder:clean(input.replacementOrder)||null});
    await updateLifecycleState(db,order,warehouse);
    await db.query('UPDATE aif_shopify_warehouse_failures SET retry_after=now() WHERE shopify_order_id=$1',[id]);
    await db.query('COMMIT');return {duplicate:false,...payload};
  } catch(e){if(db)await db.query('ROLLBACK').catch(()=>{});throw e;}
  finally{db?.release();await lock.release();}
}

export async function getAifShopifyWarehouseStatus(db,{limit=100}={}) {
  await ensureAifShopifyWarehouseSchema(db);
  const r=await db.query(`SELECT w.shopify_order_id,w.document_id,w.document_number AS aviz_number,
    w.state,w.order_name,w.customer_name,w.created_at,w.fulfilled_at,w.cancelled_at,
    o.total_price,o.total_shipping,o.currency_code,o.financial_status,o.fulfillment_status,
    (SELECT COALESCE(sum(allocated_qty),0)::int FROM aif_shopify_warehouse_lines l WHERE l.shopify_order_id=w.shopify_order_id) AS items,
    (SELECT COALESCE(sum(allocated_qty-shipped_qty-released_qty),0)::int FROM aif_shopify_warehouse_lines l WHERE l.shopify_order_id=w.shopify_order_id) AS pending_qty
    FROM aif_shopify_warehouse_orders w JOIN aif_shopify_orders o ON o.shopify_order_id=w.shopify_order_id
    ORDER BY w.created_at DESC LIMIT $1`,[Math.min(500,Math.max(1,Number(limit)||100))]);
  const f=await db.query(`SELECT f.shopify_order_id,o.order_name,f.error,f.attempts,f.updated_at
    FROM aif_shopify_warehouse_failures f JOIN aif_shopify_orders o ON o.shopify_order_id=f.shopify_order_id
    ORDER BY f.updated_at DESC LIMIT 50`);
  return {enabled:enabled(),items:r.rows,errors:f.rows};
}

export async function getAifShopifyAviz(db,id) {
  await ensureAifShopifyWarehouseSchema(db);
  const header=await db.query(`SELECT d.*,d.id AS document_id,w.shopify_order_id,w.order_name,w.customer_name,
    CASE WHEN d.id=w.document_id THEN w.state ELSE 'recorded' END AS state,
    o.total_price AS order_total,o.total_shipping AS shipping_amount,o.financial_status,o.fulfillment_status,o.shipping_address
    FROM aif_stock_transfer_documents d JOIN aif_shopify_warehouse_orders w
      ON d.id=w.document_id OR d.raw->>'shopifyOrderId'=w.shopify_order_id
    JOIN aif_shopify_orders o ON o.shopify_order_id=w.shopify_order_id
    WHERE d.document_type='shopify_transfer' AND
      (d.document_number=$1 OR d.id::text=$1 OR (w.shopify_order_id=$1 AND d.id=w.document_id)) LIMIT 1`,[clean(id)]);
  if(!header.rowCount)throw lifeError('Shopify bizonylat nem található.','document_not_found',404);
  const document=header.rows[0];
  const lines=await db.query('SELECT * FROM aif_stock_transfer_document_lines WHERE document_id=$1 ORDER BY line_no',[document.id]);
  return {document,lines:lines.rows};
}

export async function getAifShopifyLifecycle(db,orderRef) {
  await ensureAifShopifyWarehouseSchema(db);
  const r=await db.query(`SELECT w.*,o.financial_status,o.fulfillment_status,o.cancelled_at AS order_cancelled_at,
    o.raw AS order_raw,o.refunded_amount,src.name AS source_name,src.code AS source_code,dst.name AS target_name
    FROM aif_shopify_warehouse_orders w JOIN aif_shopify_orders o ON o.shopify_order_id=w.shopify_order_id
    JOIN aif_locations src ON src.id=w.source_location_id JOIN aif_locations dst ON dst.id=w.target_location_id
    WHERE w.shopify_order_id=$1 OR w.order_name=$1 OR w.document_number=$1`,[clean(orderRef)]);
  if(!r.rowCount)throw lifeError('Kezelt Shopify rendelés nem található.','order_not_found',404);
  const w=r.rows[0];
  const lines=await db.query(`SELECT l.*,dl.product_title,dl.barcode,dl.size,dl.color_name,dl.image_url,
    (l.allocated_qty-l.shipped_qty-l.released_qty) AS pending_qty,
    (l.shipped_qty-l.returned_qty) AS returnable_qty
    FROM aif_shopify_warehouse_lines l JOIN aif_stock_transfer_document_lines dl ON dl.id=l.document_line_id
    WHERE l.shopify_order_id=$1 ORDER BY dl.line_no,l.shopify_line_item_id`,[w.shopify_order_id]);
  const documents=await db.query(`SELECT id,document_number,document_date,created_at,title,total_qty,total_value,
    from_location_summary,to_location_summary,raw FROM aif_stock_transfer_documents
    WHERE document_type='shopify_transfer' AND (id=$2 OR raw->>'shopifyOrderId'=$1) ORDER BY created_at,document_number`,[w.shopify_order_id,w.document_id]);
  const returns=await db.query('SELECT shopify_return_id,status,topic,raw,updated_at FROM aif_shopify_returns WHERE shopify_order_id=$1 ORDER BY updated_at DESC',[w.shopify_order_id]);
  const events=await db.query('SELECT id,event_key,kind,actor,payload,created_at FROM aif_shopify_lifecycle_events WHERE shopify_order_id=$1 ORDER BY created_at DESC LIMIT 100',[w.shopify_order_id]);
  const quarantine=await db.query(`SELECT q.*,l.name AS location_name FROM aif_shopify_return_quarantine q
    JOIN aif_locations l ON l.id=q.location_id WHERE shopify_order_id=$1 AND q.qty>q.resolved_qty ORDER BY q.created_at`,[w.shopify_order_id]);
  const errors=await db.query('SELECT error,updated_at FROM aif_shopify_warehouse_failures WHERE shopify_order_id=$1',[w.shopify_order_id]);
  const locations=await db.query(`SELECT id,code,name FROM aif_locations WHERE is_active=true AND id<>$1 ORDER BY name`,[w.target_location_id]);
  const {order_raw,...safeOrder}=w;
  return {enabled:enabled()&&aifShopifyLifecycleEnabled(),order:safeOrder,lines:lines.rows,documents:documents.rows,
    returns:returns.rows,events:events.rows,quarantine:quarantine.rows,errors:errors.rows,locations:locations.rows};
}

export async function resolveAifShopifyQuarantine(pool,id,input,{actor,admin=false}={}) {
  if(!admin)throw lifeError('A sérült/elkülönített visszáru rendezése admin feladat.','forbidden',403);
  if(!enabled()||!aifShopifyLifecycleEnabled())throw lifeError('A Shopify visszáru-kezelés nincs engedélyezve.');
  const count=positiveQty(input.quantity),action=clean(input.action),note=clean(input.note).slice(0,1500),key=clean(input.idempotencyKey);
  if(!['restock','writeoff'].includes(action)||!note||!/^[A-Za-z0-9:_-]{16,120}$/.test(key))throw lifeError('Művelet, indok és egyedi azonosító szükséges.','invalid_request',400);
  const hash=createHash('sha256').update(JSON.stringify({id,count,action,note})).digest('hex');
  const lock=await acquireAifShopifyProcessLock(pool);if(!lock.locked)throw lifeError('Shopify feldolgozás folyamatban.');
  let db;
  try {
    db=await pool.connect();
    await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='6s'");await db.query("SET LOCAL statement_timeout='30000ms'");
    const lookup=(await db.query('SELECT shopify_order_id FROM aif_shopify_return_quarantine WHERE id::text=$1',[clean(id)])).rows[0];
    if(!lookup)throw lifeError('Elkülönített visszáru nem található.','quarantine_not_found',404);
    await db.query("SELECT pg_advisory_xact_lock(hashtext('shopify_warehouse'),hashtext($1))",[lookup.shopify_order_id]);
    const q=(await db.query('SELECT * FROM aif_shopify_return_quarantine WHERE id::text=$1 FOR UPDATE',[clean(id)])).rows[0];
    const previous=await db.query('SELECT request_hash,payload FROM aif_shopify_lifecycle_events WHERE shopify_order_id=$1 AND event_key=$2',[q.shopify_order_id,`quarantine:${key}`]);
    if(previous.rowCount){if(previous.rows[0].request_hash!==hash)throw lifeError('Eltérő adatokkal ismételt művelet.');await db.query('COMMIT');return {duplicate:true,...previous.rows[0].payload};}
    if(Number(q.qty)-Number(q.resolved_qty)<count)throw lifeError('Több darabot jelöltél, mint amennyi elkülönítve maradt.');
    const order=(await db.query('SELECT * FROM aif_shopify_orders WHERE shopify_order_id=$1 FOR UPDATE',[q.shopify_order_id])).rows[0];
    const warehouse=(await db.query('SELECT * FROM aif_shopify_warehouse_orders WHERE shopify_order_id=$1 FOR UPDATE',[q.shopify_order_id])).rows[0];
    const location=await byLocationId(db,q.location_id);
    const stock=(await db.query('SELECT qty,reserved_qty FROM aif_stock WHERE location_id=$1 AND variant_id=$2 FOR UPDATE',[q.location_id,q.variant_id])).rows[0];
    if(!stock||Number(stock.reserved_qty)<count||Number(stock.qty)<count)throw lifeError('Az elkülönített készlet nem egyezik.');
    const originalValue=count===Number(q.qty)-Number(q.resolved_qty)?price(Number(q.book_value)-Number(q.resolved_value)):price(Number(q.book_value)*count/Number(q.qty));
    const value=action==='writeoff'?await bookTake(db,q.location_id,q.variant_id,Number(stock.qty),count):originalValue;
    const after=Number(stock.qty)-(action==='writeoff'?count:0);
    await db.query('UPDATE aif_stock SET qty=$3,reserved_qty=$4,updated_at=now() WHERE location_id=$1 AND variant_id=$2',[q.location_id,q.variant_id,after,Number(stock.reserved_qty)-count]);
    await db.query('UPDATE aif_shopify_return_quarantine SET resolved_qty=resolved_qty+$2,resolved_value=resolved_value+$3 WHERE id=$1',[q.id,count,originalValue]);
    const kind=action==='writeoff'?'quarantine_writeoff':'quarantine_release';
    const line={lineId:q.shopify_line_item_id,variantId:q.variant_id,qty:count,value,sourceBefore:Number(stock.qty),sourceAfter:after,raw:{quarantineId:String(q.id),physicalDelta:action==='writeoff'?-count:0}};
    const document=await lifecycleDocument(db,{order,warehouse,kind,source:location,target:action==='restock'?location:null,actor,reason:note,lines:[line]});
    await writeMovement(db,{variantId:q.variant_id,locationId:q.location_id,delta:action==='writeoff'?-count:0,before:Number(stock.qty),after,actor,document,order,lineNo:1,side:'source',kind:`shopify_${kind}`,extra:{quarantineId:String(q.id),retailBookMovementValue:action==='writeoff'?-value:0}});
    const payload=await recordLifecycleEvent(db,order,kind,document,actor,[line],`quarantine:${key}`,hash);
    await enqueueAifShopifyVariant(db,q.variant_id,`shopify_${kind}`,{schemaReady:true});
    await db.query('COMMIT');return {duplicate:false,...payload};
  }catch(e){if(db)await db.query('ROLLBACK').catch(()=>{});throw e;}
  finally{db?.release();await lock.release();}
}
