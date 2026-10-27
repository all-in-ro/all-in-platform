/**
 * AllInFashion / Shopify warehouse and isolated AVIZ flow.
 * No manual-store document counters, POS sales or cash drawers are touched.
 * Enable explicitly with SHOPIFY_WAREHOUSE_AUTOMATION_ENABLED=true after the
 * one-time legacy audit. All mutations occur in one DB transaction per order.
 */
import { createHash, randomUUID } from 'node:crypto';

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
  await db.query(`ALTER TABLE aif_shopify_warehouse_lines
    ALTER COLUMN legacy_movement_id TYPE text USING legacy_movement_id::text`);
  await db.query(`CREATE INDEX IF NOT EXISTS aif_shopify_warehouse_lines_order_idx
    ON aif_shopify_warehouse_lines (shopify_order_id)`);
  await db.query(`CREATE TABLE IF NOT EXISTS aif_shopify_warehouse_failures (
    shopify_order_id text PRIMARY KEY,
    error text NOT NULL,
    attempts integer NOT NULL DEFAULT 1,
    retry_after timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
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
  const srcQty=Number(src?.qty??(sourceStockAfter+(legacy?0:count)));
  const srcValue=Number(src?.book_value??srcQty*Number(variantSellPrice||0));
  // Legacy Shopify inbound already decreased aif_stock, but retail book may still
  // have the former quantity. The old source movement itself is reclassified.
  const basisQty=Math.max(count,srcQty);
  const transferValue=price(srcValue/basisQty*count)||price(count*variantSellPrice);
  const srcAfterQty=sourceStockAfter;
  const srcAfterValue=Math.max(0,price(srcValue-transferValue));
  const dstQty=Number(dst?.qty||0);
  const dstVal=Number(dst?.book_value||0);
  const targetStock=await db.query(`SELECT qty FROM aif_stock WHERE variant_id=$1 AND location_id=$2`,[variantId,target.id]);
  const toAfterQty=Number(targetStock.rows[0]?.qty||0);
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
    const unit=Number((p.line.unit_price ?? p.product.sell_price ?? 0));
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
        historical?.id != null ? String(historical.id) : null,JSON.stringify({shopifySku:p.line.sku,productTitle:p.product.title_ro})]);
  }
  return {created:true,documentNumber:seq.number,shopifyOrder:order.order_name,lines:prepared.length,legacyRelink:allowLegacy};
}

async function finalize(db,order,warehouse,source,target,mode) {
  if(warehouse.state!=='allocated') return {already:true,state:warehouse.state};
  const rows=await db.query(`SELECT * FROM aif_shopify_warehouse_lines WHERE shopify_order_id=$1
    ORDER BY shopify_line_item_id FOR UPDATE`,[order.shopify_order_id]);
  for(const l of rows.rows) {
    const open=Number(l.allocated_qty)-Number(l.shipped_qty)-Number(l.released_qty);
    if(open<=0) continue;
    const locks=await lockStock(db,l.variant_id,source,target);
    const tQty=Number(locks.to.qty),tReserved=Number(locks.to.reserved_qty);
    if(tQty<open||tReserved<open) throw new Error(`Shopify Raktár eltérés: ${l.variant_id}, foglalt ${tReserved}, kivezetendő ${open}.`);
    await db.query(`UPDATE aif_stock SET qty=$3,reserved_qty=$4,updated_at=now()
      WHERE variant_id=$1 AND location_id=$2`,[l.variant_id,target.id,tQty-open,tReserved-open]);
    const doc={...await (async()=>{const r=await db.query(`SELECT * FROM aif_stock_transfer_documents WHERE id=$1`,[warehouse.document_id]);return r.rows[0];})()};
    if(mode==='cancelled') {
      const before=Number(locks.from.qty),reserved=Number(locks.from.reserved_qty);
      await db.query(`UPDATE aif_stock SET qty=$3,reserved_qty=$4,updated_at=now()
        WHERE variant_id=$1 AND location_id=$2`,[l.variant_id,source.id,before+open,reserved]);
      await moveRetailBook(db,l.variant_id,target,source,open,{variantSellPrice:0});
      await writeMovement(db,{variantId:l.variant_id,locationId:target.id,delta:-open,before:tQty,after:tQty-open,
        actor:'SHOPIFY',document:doc,order,lineNo:0,side:'source',kind:'shopify_cancel_return'});
      await writeMovement(db,{variantId:l.variant_id,locationId:source.id,delta:open,before,after:before+open,
        actor:'SHOPIFY',document:doc,order,lineNo:0,side:'target',kind:'shopify_cancel_return'});
    } else {
      // Stock leaves the *internal* Shopify warehouse only now. No Csikszereda
      // or Kezdi stock change on shipment. No new retail POS sale is fabricated.
      const r=await db.query(`SELECT qty,book_value FROM aif_stock_retail_book
        WHERE location_id=$1 AND variant_id=$2 FOR UPDATE`,[target.id,l.variant_id]);
      const bookQty=Number(r.rows[0]?.qty??tQty),bookValue=Number(r.rows[0]?.book_value??0);
      const newVal=price(bookValue*(Math.max(0,bookQty-open)/Math.max(1,bookQty)));
      await db.query(`INSERT INTO aif_stock_retail_book(location_id,variant_id,qty,book_value,seeded,updated_at)
        VALUES($1,$2,$3,$4,false,now()) ON CONFLICT(location_id,variant_id) DO UPDATE
        SET qty=EXCLUDED.qty,book_value=EXCLUDED.book_value,seeded=false,updated_at=now()`,
        [target.id,l.variant_id,tQty-open,newVal]);
      await writeMovement(db,{variantId:l.variant_id,locationId:target.id,delta:-open,before:tQty,after:tQty-open,
        actor:'SHOPIFY',document:doc,order,lineNo:0,side:'shipment',kind:'shopify_order_fulfilled'});
    }
    await db.query(`UPDATE aif_shopify_warehouse_lines SET
      ${mode==='cancelled'?'released_qty':'shipped_qty'}=${mode==='cancelled'?'released_qty':'shipped_qty'}+$2,
      updated_at=now() WHERE shopify_line_item_id=$1`,[l.shopify_line_item_id,open]);
  }
  const state=mode==='cancelled'?'cancelled':'fulfilled';
  await db.query(`UPDATE aif_shopify_warehouse_orders
    SET state=$2,${mode==='cancelled'?'cancelled_at':'fulfilled_at'}=now(),updated_at=now()
    WHERE shopify_order_id=$1`,[order.shopify_order_id,state]);
  await db.query(`UPDATE aif_stock_transfer_documents SET raw=raw||$2::jsonb,updated_at=now() WHERE id=$1`,[
    warehouse.document_id,JSON.stringify({shopifyWarehouseState:state,shipOrCancelAt:new Date().toISOString()})]);
  return {state,documentNumber:warehouse.document_number};
}

async function withOrderTransaction(pool,orderId,{allowLegacy=false,dryRun=false}={}) {
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(`SET LOCAL lock_timeout='6s'`);
    // Advisory lock isolates same order from concurrent worker/manual action.
    await db.query(`SELECT pg_advisory_xact_lock(hashtext('shopify_warehouse'),hashtext($1))`,[orderId]);
    const q=await db.query(`SELECT * FROM aif_shopify_orders WHERE shopify_order_id=$1 FOR UPDATE`,[orderId]);
    if(!q.rowCount) throw new Error('Shopify rendelés nem található.');
    const order=q.rows[0];
    const locations=await findAifShopifyWarehouseLocations(db);
    const existing=await db.query(`SELECT * FROM aif_shopify_warehouse_orders WHERE shopify_order_id=$1 FOR UPDATE`,[orderId]);
    let result;
    if(existing.rowCount) {
      const warehouse=existing.rows[0];
      if(orderCondition(order)==='cancelled') result=await finalize(db,order,warehouse,locations.source,locations.target,'cancelled');
      else if(orderCondition(order)==='fulfilled') result=await finalize(db,order,warehouse,locations.source,locations.target,'fulfilled');
      else result={already:true,state:warehouse.state,documentNumber:warehouse.document_number};
    } else {
      const lines=await db.query(`SELECT * FROM aif_shopify_order_lines
        WHERE shopify_order_id=$1 AND is_active=true ORDER BY shopify_line_item_id FOR UPDATE`,[orderId]);
      result=await allocate(db,order,lines.rows,locations.source,locations.target,{allowLegacy});
    }
    if(dryRun) await db.query('ROLLBACK'); else await db.query('COMMIT');
    return {...result,dryRun};
  } catch(error) {try {await db.query('ROLLBACK');}catch{};throw error;}
  finally {db.release();}
}

export async function reconcileAifShopifyWarehouseOrder(pool,orderRef,{apply=false,legacy=false}={}) {
  const db=await pool.connect();
  let id;
  try {
    await ensureAifShopifyWarehouseSchema(db);
    const r=await db.query(`SELECT shopify_order_id FROM aif_shopify_orders
      WHERE shopify_order_id=$1 OR shopify_order_legacy_id=$1 OR order_name=$1 LIMIT 1`,[orderRef]);
    id=r.rows[0]?.shopify_order_id;
    if(!id) throw new Error('Rendelés nem található.');
  } finally {db.release();}
  if(!apply) return {preview:true,...await (async()=>{const c=await pool.connect();try{return await previewAifShopifyWarehouseOrder(c,id);}finally{c.release();}})()};
  if(!enabled()) throw new Error('SHOPIFY_WAREHOUSE_AUTOMATION_ENABLED nincs engedélyezve.');
  if(legacy && id!==`gid://shopify/Order/${legacyOrder}`) throw new Error('Történeti javítás kizárólag az AIF-1003 rendelésre engedélyezett.');
  return withOrderTransaction(pool,id,{allowLegacy:legacy});
}

export async function processAifShopifyWarehouseBatch(pool,{limit=6}={}) {
  if(!enabled()) return {enabled:false,processed:0,errors:0};
  const db=await pool.connect();
  let ids=[];
  try {
    await ensureAifShopifyWarehouseSchema(db);
    // Keep the first independent Shopify Aviz number reserved for AIF-1003.
    // No background worker may silently consume SHOPIFY-000001 before the
    // explicitly reviewed historic stock movement has been relinked.
    const first=await db.query(`SELECT s.next_number, EXISTS(
      SELECT 1 FROM aif_shopify_orders o
      LEFT JOIN aif_shopify_warehouse_orders w ON w.shopify_order_id=o.shopify_order_id
      WHERE o.shopify_order_legacy_id=$1 AND w.shopify_order_id IS NULL
    ) AS first_legacy_pending FROM aif_shopify_aviz_sequence s WHERE s.id=1`,[legacyOrder]);
    if (Number(first.rows[0]?.next_number)===1 && first.rows[0]?.first_legacy_pending===true) {
      return {enabled:true,claimed:0,processed:0,errors:0,
        blocked:'AIF-1003 audit kell a SHOPIFY-000001 elso Avizhoz.'};
    }
    const r=await db.query(`SELECT o.shopify_order_id FROM aif_shopify_orders o
      LEFT JOIN aif_shopify_warehouse_orders w ON w.shopify_order_id=o.shopify_order_id
      LEFT JOIN aif_shopify_warehouse_failures f ON f.shopify_order_id=o.shopify_order_id
      WHERE ((w.shopify_order_id IS NULL AND o.cancelled_at IS NULL AND o.status<>'cancelled'
              AND o.shopify_order_legacy_id IS DISTINCT FROM $2
              AND EXISTS(SELECT 1 FROM aif_shopify_order_lines l WHERE l.shopify_order_id=o.shopify_order_id AND l.is_active))
            OR (w.state='allocated' AND (o.cancelled_at IS NOT NULL OR o.status='cancelled' OR o.fulfillment_status='fulfilled')))
        AND (f.retry_after IS NULL OR f.retry_after<=now())
        AND EXISTS (SELECT 1 FROM aif_shopify_warehouse_activation a
          WHERE a.id=1 AND COALESCE(o.shopify_created_at,o.created_at)>=a.activated_at)
      ORDER BY o.shopify_created_at ASC NULLS LAST,o.created_at ASC LIMIT $1`,[
      Math.min(25,Math.max(1,Number(limit)||6)),legacyOrder]);
    ids=r.rows.map(x=>x.shopify_order_id);
  } finally {db.release();}
  const errorItems=[];let success=0;
  for(const id of ids) {
    try {
      await withOrderTransaction(pool,id);
      const c=await pool.connect();try{await c.query(`DELETE FROM aif_shopify_warehouse_failures WHERE shopify_order_id=$1`,[id]);}finally{c.release();}
      success++;
    } catch(e) {
      const message=clean(e?.message||e).slice(0,1500);
      const c=await pool.connect();try{await c.query(`INSERT INTO aif_shopify_warehouse_failures(shopify_order_id,error)
        VALUES($1,$2) ON CONFLICT(shopify_order_id) DO UPDATE
        SET error=EXCLUDED.error,attempts=aif_shopify_warehouse_failures.attempts+1,
          retry_after=now()+interval '5 minutes',updated_at=now()`,[id,message]);}finally{c.release();}
      errorItems.push({orderId:id,error:message});
    }
  }
  return {enabled:true,claimed:ids.length,processed:success,errors:errorItems.length,errorItems};
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
  const header=await db.query(`SELECT w.*,d.*,o.total_price AS order_total,o.total_shipping AS shipping_amount,
    o.financial_status,o.fulfillment_status,o.shipping_address
    FROM aif_shopify_warehouse_orders w
    JOIN aif_stock_transfer_documents d ON d.id=w.document_id
    JOIN aif_shopify_orders o ON o.shopify_order_id=w.shopify_order_id
    WHERE w.shopify_order_id=$1 OR w.document_number=$1 OR w.document_id::text=$1 LIMIT 1`,[clean(id)]);
  if(!header.rowCount) throw new Error('Shopify Aviz nem található.');
  const doc=header.rows[0];
  const lines=await db.query(`SELECT l.*,w.allocated_qty,w.shipped_qty,w.released_qty,
    ol.shopify_line_item_id FROM aif_stock_transfer_document_lines l
    JOIN aif_shopify_warehouse_lines w ON w.document_line_id=l.id
    LEFT JOIN aif_shopify_order_lines ol ON ol.shopify_line_item_id=w.shopify_line_item_id
    WHERE l.document_id=$1 ORDER BY l.line_no`,[doc.document_id]);
  return {document:doc,lines:lines.rows};
}
