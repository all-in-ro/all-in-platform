// ALLINFASHION_DAILY_AUDIT_EXCEL_20261026
// Read-only, role-scoped XLSX export for a day or inclusive date range. No inventory/cash writes.
// AIF_AUDIT_SUBCATEGORY_20261027: a saved subcategory is preferred; otherwise
// use the linked product's actual subcategory (Hungarian, then Romanian).
// Missing subcategories remain blank; no inference from title, code or brand.
import express from 'express';
import { buildAifDailyAuditXlsx } from './shopAuditXlsxWriter.js';

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const round = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const cents = (value) => Math.round(Number(value || 0) * 100);
const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('hu-HU');
const text = (v) => String(v ?? '').trim();
const METHODS = { cash: 'Készpénz', card: 'Bankkártya', bank_transfer: 'Átutalás', voucher: 'Utalvány', other: 'Egyéb' };
const methodName = (v) => METHODS[v] || text(v) || 'Ismeretlen';
const fromCents = (v) => Math.round(v) / 100;
function bookDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value).slice(0,19);
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
  }).formatToParts(date);
  const get = key => p.find(item=>item.type===key)?.value||'';
  return `${get('year')}.${get('month')}.${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}
function checkDate(value) {
  const raw = text(value);
  if (!DATE_RE.test(raw)) return false;
  const date = new Date(`${raw}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===raw;
}
// Split recorded cash receipts into sale lines with integer bani; never invent extra cents.
function distributeMoney(total, weightedRows) {
  const amountCents = cents(total);
  const positive = weightedRows.map(item => Math.max(0, Number(item || 0)));
  const weightTotal = positive.reduce((a,b)=>a+b,0);
  if (!positive.length) return [];
  if (weightTotal<=0 || amountCents === 0) return positive.map(()=>0);
  let remaining = amountCents;
  return positive.map((weight,index) => {
    const each = index===positive.length-1 ? remaining : Math.min(remaining,Math.round(amountCents*weight/weightTotal));
    remaining-=each;
    return fromCents(each);
  });
}
const EMPLOYEE_SQL = ` AND ($3::text IS NULL OR lower(regexp_replace(btrim(COALESCE(%ACTOR%,'')), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(btrim($3), '[[:space:]]+', ' ', 'g')))`;
const who = (field) => EMPLOYEE_SQL.replace('%ACTOR%',field);
// $2 = from, $3 = optional employee, $4 = to (inclusive). Bucharest-local boundaries.
const dayFilter = (field) => `${field} >= ($2::date::timestamp AT TIME ZONE 'Europe/Bucharest') AND ${field} < (($4::date + 1)::timestamp AT TIME ZONE 'Europe/Bucharest') AND ($3::text IS NULL OR $3::text IS NOT NULL)`;
export function aifAuditExcelPeriod(query = {}) {
  const date = text(query.date);
  const from = text(query.from || date || query.to);
  const to = text(query.to || date || query.from);
  if (!checkDate(from) || !checkDate(to) || from > to) {
    throw Object.assign(new Error('Adj meg érvényes Ettől–Eddig dátumot, növekvő sorrendben.'),{statusCode:400});
  }
  const days = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000) + 1;
  if (days > 366) throw Object.assign(new Error('Egyszerre legfeljebb 366 nap exportálható.'),{statusCode:400});
  return {from,to,days};
}

// AIF_AUDIT_PRODUCT_CODE_SOURCE_20261027_V2
// Keep product-code selection in the data layer. legacyProductCode and
// internal_sku are full legacy variant identifiers, NOT product-code fallbacks.
// The warehouse displays the model key without its technical namespace when
// there is no actual supplier product code. S/N is a separate field.
export function aifAuditProductCode({ supplierProductCode, modelCode, saleProductCode, brand } = {}) {
  const supplier = text(supplierProductCode);
  if (supplier) return supplier;
  const model = text(modelCode);
  if (model) {
    const suffix = model.includes(':') ? model.split(':').pop() : model;
    return text(suffix || model);
  }
  // A removed/unlinked variant can still have a valid saved sale-line code.
  // Only a namespace that matches this line's brand is removed here.
  const saved = text(saleProductCode);
  const match = /^([a-z0-9_]+):([^:]+)$/i.exec(saved);
  const brandKey = text(brand).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return match && brandKey && brandKey === match[1].toLowerCase() ? match[2] : saved;
}

async function loadPeriod(client, args) {
  const locationId = args[0];
  const salesQuery = `
    SELECT s.id::text AS sale_id,s.sale_number,s.sold_at,s.actor,s.customer_name,s.customer_phone,
      s.sale_type,s.status,s.total AS sale_total,s.discount_total AS sale_discount,
       COALESCE(NULLIF(btrim(st.to_actor),''),s.actor) AS effective_actor, st.from_actor AS transferred_from, st.id::text AS transfer_id,
      st.decided_at AS transfer_decided_at, st.reason AS transfer_reason,
      mt.from_actor AS money_from_actor,mt.to_actor AS money_to_actor,
      mt.decided_at AS money_decided_at,mt.reason AS money_reason,
      sl.id::text AS line_id,sl.line_no,sl.variant_id::text AS variant_id,sl.quantity,
      sl.list_price,sl.unit_price,sl.discount_amount,sl.discount_percent,sl.line_total,
      sl.product_title,sl.product_code,sl.barcode,sl.brand_name,sl.color_name,sl.size,
      COALESCE(NULLIF(btrim(sl.subcategory_name),''),
        NULLIF(btrim(subc.name_hu),''),NULLIF(btrim(subc.name_ro),'')) AS export_subcategory,
      COALESCE(NULLIF(v.sn_cod,''),NULLIF(sl.raw->>'snCod',''),NULLIF(sl.raw->>'sn_cod','')) AS sn_code,
      stock_code.supplier_product_code AS export_supplier_product_code,
      m.model_code AS export_model_code,sl.product_code AS export_product_code,
      COALESCE(NULLIF(sl.barcode,''),NULLIF(v.barcode,'')) AS export_barcode
    FROM aif_shop_sales s
    JOIN aif_shop_sale_lines sl ON sl.sale_id=s.id
    LEFT JOIN aif_shop_seller_transfers st ON st.sale_line_id=sl.id AND st.status='accepted'
      AND st.transfer_kind='sale'
      AND st.location_id=s.location_id AND s.status='completed' AND s.sale_type='sale'
      AND sl.quantity=st.qty AND abs(sl.line_total-st.net_total)<0.005
      AND NOT EXISTS (SELECT 1 FROM aif_shop_exchanges ex WHERE ex.source_sale_id=s.id AND ex.status='completed')
    LEFT JOIN aif_shop_seller_transfers mt ON mt.sale_line_id=sl.id AND mt.status='accepted'
      AND mt.transfer_kind='money' AND mt.location_id=s.location_id
      AND s.status='completed' AND s.sale_type='sale'
      AND sl.quantity=mt.qty AND abs(sl.line_total-mt.net_total)<0.005
      AND NOT EXISTS (SELECT 1 FROM aif_shop_exchanges ex WHERE ex.source_sale_id=s.id AND ex.status='completed')
    LEFT JOIN aif_product_variants v ON v.id=sl.variant_id
    LEFT JOIN aif_product_models m ON m.id=v.model_id
    LEFT JOIN aif_categories subc ON subc.id=m.subcategory_id
    LEFT JOIN LATERAL (
      SELECT sc.supplier_product_code
      FROM aif_variant_supplier_codes sc
      WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
        AND NULLIF(btrim(sc.supplier_product_code),'') IS NOT NULL
      ORDER BY COALESCE(sc.is_active,true) DESC,
        sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST, sc.id::text DESC
      LIMIT 1
    ) stock_code ON true
    WHERE s.location_id=$1 AND s.status='completed' AND ${dayFilter('s.sold_at')}
    ORDER BY s.sold_at, s.sale_number, sl.line_no,sl.id LIMIT 50001`;
  const paymentsQuery = `
    SELECT p.id::text AS id,p.sale_id::text AS sale_id,p.method,p.amount,p.paid_at,p.actor,
      COALESCE(NULLIF(p.actor,''),s.actor) AS effective_payment_actor,
      s.sale_number,s.sold_at AS original_sold_at,s.sale_type,s.customer_name,
      ((p.paid_at AT TIME ZONE 'Europe/Bucharest')::date =
        (s.sold_at AT TIME ZONE 'Europe/Bucharest')::date) AS sold_this_day
    FROM aif_shop_sale_payments p
    JOIN aif_shop_sales s ON s.id=p.sale_id
    WHERE s.location_id=$1 AND s.status='completed'
      AND p.method<>'credit' AND p.customer_payment_id IS NULL AND ${dayFilter('p.paid_at')}

    ORDER BY p.paid_at,p.id LIMIT 50001`;
  const customerPaymentsQuery = `
    SELECT cp.id::text AS id,cp.amount,cp.method,cp.paid_at,cp.actor,cp.note,
      COALESCE(NULLIF(c.full_name,''),'Ismeretlen kliens') AS customer_name
    FROM aif_shop_customer_payments cp
    LEFT JOIN aif_shop_customers c ON c.id=cp.customer_id
    WHERE cp.location_id=$1 AND ${dayFilter('cp.paid_at')} ${who('cp.actor')}
    ORDER BY cp.paid_at,cp.id LIMIT 50001`;
  const allocationsQuery = `
    SELECT la.customer_payment_id::text AS payment_id,la.id::text AS id,la.amount,la.quantity,
      s.id::text AS sale_id,s.sale_number,s.sold_at AS original_sold_at,
      sl.quantity AS original_quantity,sl.list_price,sl.line_total,sl.discount_percent,
      sl.product_title,sl.product_code,sl.barcode,sl.brand_name,sl.color_name,sl.size,
      COALESCE(NULLIF(btrim(sl.subcategory_name),''),
        NULLIF(btrim(subc.name_hu),''),NULLIF(btrim(subc.name_ro),'')) AS export_subcategory,
      COALESCE(NULLIF(v.sn_cod,''),NULLIF(sl.raw->>'snCod',''),NULLIF(sl.raw->>'sn_cod','')) AS sn_code,
      stock_code.supplier_product_code AS export_supplier_product_code,
      m.model_code AS export_model_code,sl.product_code AS export_product_code,
      COALESCE(NULLIF(sl.barcode,''),NULLIF(v.barcode,'')) AS export_barcode,
      s.customer_name
    FROM aif_shop_customer_payment_line_allocations la
    JOIN aif_shop_customer_payments cp ON cp.id=la.customer_payment_id
    JOIN aif_shop_sale_lines sl ON sl.id=la.sale_line_id AND sl.sale_id=la.sale_id
    JOIN aif_shop_sales s ON s.id=la.sale_id
    LEFT JOIN aif_product_variants v ON v.id=sl.variant_id
    LEFT JOIN aif_product_models m ON m.id=v.model_id
    LEFT JOIN aif_categories subc ON subc.id=m.subcategory_id
    LEFT JOIN LATERAL (
      SELECT sc.supplier_product_code
      FROM aif_variant_supplier_codes sc
      WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
        AND NULLIF(btrim(sc.supplier_product_code),'') IS NOT NULL
      ORDER BY COALESCE(sc.is_active,true) DESC,
        sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST, sc.id::text DESC
      LIMIT 1
    ) stock_code ON true
    WHERE cp.location_id=$1 AND ${dayFilter('cp.paid_at')} ${who('cp.actor')}
    ORDER BY cp.paid_at,la.id LIMIT 50001`;
  const exchangeQuery = `
    SELECT e.id::text AS id,e.exchange_number,e.created_at,e.actor,e.customer_name,
      e.returned_qty,e.return_credit,e.replacement_total,e.difference,
      e.settlement_direction,e.settlement_method,e.settlement_amount,e.note,
      sl.product_title AS returned_product_title,
      sl.product_code AS returned_product_code,
      COALESCE(NULLIF(btrim(sl.subcategory_name),''),
        NULLIF(btrim(return_subc.name_hu),''),NULLIF(btrim(return_subc.name_ro),'')) AS returned_subcategory,
      return_code.supplier_product_code AS returned_supplier_product_code,
      rm.model_code AS returned_model_code,
      sl.barcode AS returned_barcode,sl.brand_name AS returned_brand,sl.color_name AS returned_color,
      sl.size AS returned_size,sl.list_price AS returned_list_price,
      sl.unit_price AS returned_unit_price,
      COALESCE(NULLIF(v.sn_cod,''),NULLIF(sl.raw->>'snCod','')) AS returned_sn,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',el.id,'quantity',el.quantity,'unit_price',el.unit_price,'line_total',el.line_total,
        'product_title',el.product_title,
        'product_code',el.product_code,
        'subcategory',COALESCE(NULLIF(btrim(el.raw->>'subcategoryName'),''),
          NULLIF(btrim(el.raw->>'subcategory_name'),''),
          NULLIF(btrim(new_subc.name_hu),''),NULLIF(btrim(new_subc.name_ro),'')),
        'supplier_product_code',new_code.supplier_product_code,'model_code',nm.model_code,
        'barcode',el.barcode,
        'brand_name',el.brand_name,'color_name',el.color_name,'size',el.size,
        'sn_cod',COALESCE(NULLIF(nv.sn_cod,''),NULLIF(el.raw->>'snCod','')))
        ORDER BY el.line_no), '[]'::jsonb)
        FROM aif_shop_exchange_lines el
        LEFT JOIN aif_product_variants nv ON nv.id=el.variant_id
        LEFT JOIN aif_product_models nm ON nm.id=nv.model_id
        LEFT JOIN aif_categories new_subc ON new_subc.id=nm.subcategory_id
        LEFT JOIN LATERAL (
          SELECT sc.supplier_product_code FROM aif_variant_supplier_codes sc
          WHERE sc.variant_id=nv.id AND COALESCE(sc.is_active,true)=true AND NULLIF(btrim(sc.supplier_product_code),'') IS NOT NULL
          ORDER BY COALESCE(sc.is_active,true) DESC,
            sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST, sc.id::text DESC
          LIMIT 1
        ) new_code ON true
        WHERE el.exchange_id=e.id) AS new_lines,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('method',es.method,'direction',es.direction,'amount',es.amount)
        ORDER BY es.id),'[]'::jsonb)
        FROM aif_shop_exchange_settlements es WHERE es.exchange_id=e.id) AS settlements
    FROM aif_shop_exchanges e
    LEFT JOIN aif_shop_sale_lines sl ON sl.id=e.source_sale_line_id
    LEFT JOIN aif_product_variants v ON v.id=e.source_variant_id
    LEFT JOIN aif_product_models rm ON rm.id=v.model_id
    LEFT JOIN aif_categories return_subc ON return_subc.id=rm.subcategory_id
    LEFT JOIN LATERAL (
      SELECT sc.supplier_product_code
      FROM aif_variant_supplier_codes sc
      WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
        AND NULLIF(btrim(sc.supplier_product_code),'') IS NOT NULL
      ORDER BY COALESCE(sc.is_active,true) DESC,
        sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST, sc.id::text DESC
      LIMIT 1
    ) return_code ON true
    WHERE e.location_id=$1 AND e.status='completed' AND ${dayFilter('e.created_at')} ${who('e.actor')}
    ORDER BY e.created_at,e.id LIMIT 50001`;

  const [salesResult,paymentsResult,customerResult,allocResult,exchangeResult] = await Promise.all([
    client.query(salesQuery,args),client.query(paymentsQuery,args),client.query(customerPaymentsQuery,args),
    client.query(allocationsQuery,args),client.query(exchangeQuery,args),
  ]);
  for (const r of [salesResult,paymentsResult,customerResult,allocResult,exchangeResult]) {
    if (r.rows.length>50000) throw Object.assign(new Error('Az időszaki export több mint 50 000 sort tartalmaz. Válassz rövidebb időszakot.'), {statusCode:413});
  }
  return { sales:salesResult.rows, payments:paymentsResult.rows, customerPayments:customerResult.rows,
    allocations:allocResult.rows, exchanges:exchangeResult.rows };
}
function excelEntries(data, employee = null) {
  const shouldInclude = (actor) => !employee || normalize(actor)===normalize(employee);
  const rows = [];
  const totals = {collected:0,gross:0,discount:0,settled:0,creditValue:0,exchangeCash:0,cash:0,card:0,transfer:0,other:0};
  const salesById=new Map();
  const customerPaysById=new Map(data.customerPayments.map(row=>[text(row.id),row]));
  const allocationsByPayment=new Map();
  for(const a of data.allocations) {
    const id=text(a.payment_id);
    if(!allocationsByPayment.has(id)) allocationsByPayment.set(id,[]);
    allocationsByPayment.get(id).push(a);
  }
  const paymentGroups=new Map();
  const totalMethod = method => method==='cash'?'cash':method==='card'?'card':method==='bank_transfer'?'transfer':'other';
  for (const p of data.payments) {
    const id=text(p.sale_id);
    if(!paymentGroups.has(id)) paymentGroups.set(id,[]);
    paymentGroups.get(id).push(p);
  }
  for (const sale of data.sales) {
    const key=text(sale.sale_id);
    if(!salesById.has(key)) salesById.set(key,[]);
    salesById.get(key).push(sale);
  }
  const add=(entry)=>rows.push(entry);
  // The original goods movement is on the original sale date, even for credit.
  for(const [saleId,lines] of salesById) {
    const sale=lines[0];
    const paid=(paymentGroups.get(saleId)||[]).filter(p=>p.sold_this_day);
    const methods=[...new Set(paid.map(p=>methodName(p.method)))].join(' + ');
    // Distribute actual receipts in integer bani. Goods ownership and payment
    // attribution are independent: the two people may genuinely be different.
    const paidByLine=lines.map(()=>({}));
    const paidByLineAndActor=lines.map(()=>new Map());
    for(const payment of paid){
      const split=distributeMoney(payment.amount,lines.map(line=>Number(line.line_total||0)));
      split.forEach((amount,index)=>{
        const line=lines[index];
        const key=totalMethod(text(payment.method));
        const financialActor=text(line.money_to_actor||line.transferred_to||payment.effective_payment_actor||payment.actor||line.actor);
        paidByLine[index][key]=round(Number(paidByLine[index][key]||0)+amount);
        const sub=paidByLineAndActor[index];
        const whoKey=normalize(financialActor);
        if(!sub.has(whoKey))sub.set(whoKey,{actor:financialActor,amounts:{}});
        const allocation=sub.get(whoKey).amounts;
        allocation[key]=round(Number(allocation[key]||0)+amount);
      });
    }
    for(let i=0;i<lines.length;i++) {
      const r=lines[i];
      const goodsActor=text(r.effective_actor||r.actor);
      const goodsVisible=shouldInclude(goodsActor);
      const financialRows=[...paidByLineAndActor[i].values()];
      const financialAllocations=employee
        ? financialRows.filter(record=>shouldInclude(record.actor))
        : financialRows;
      const allocated={};
      for(const record of financialAllocations){
        for(const [kind,value] of Object.entries(record.amounts))
          allocated[kind]=round(Number(allocated[kind]||0)+Number(value||0));
      }
      const collected=round(Object.values(allocated).reduce((a,b)=>a+Number(b||0),0));
      for(const [kind,value] of Object.entries(allocated))totals[kind]=round(totals[kind]+Number(value||0));
      const qty=Number(r.quantity||0);
      const lineTotal=round(r.line_total);
      const discount=round(Math.max(0,Number(r.discount_amount||0)));
      const credit=text(r.sale_type)==='credit';
      const saleFrom=text(r.transferred_from);
      const moneyFrom=text(r.money_from_actor);
      const productCode=aifAuditProductCode({supplierProductCode:r.export_supplier_product_code,
        modelCode:r.export_model_code,saleProductCode:r.export_product_code,brand:r.brand_name});
      const noteParts=[credit?'Az eredeti eladás készletcsökkenése. Későbbi befizetés nem új eladás.':''];
      if(saleFrom)noteParts.push(`Eladói terméksor-átvezetés: ${saleFrom} → ${goodsActor}; jóváhagyva: ${bookDateTime(r.transfer_decided_at)}; ${text(r.transfer_reason)?`indok: ${text(r.transfer_reason)}; `:''}az eredeti bizonylat és a raktármozgás nem módosult.`);
      if(moneyFrom)noteParts.push(`Csak pénzügyi elszámolási átvezetés: ${moneyFrom} → ${r.money_to_actor}; jóváhagyva: ${bookDateTime(r.money_decided_at)}; ${text(r.money_reason)?`indok: ${text(r.money_reason)}; `:''}az eredeti pénzbevétel, bizonylat, készlet és kassza változatlan.`);
      if(goodsVisible){
        add({id:`sale:${r.line_id}`,at:r.sold_at,dateTime:bookDateTime(r.sold_at),
          brand:r.brand_name,sn:r.sn_code,productCode,barcode:r.export_barcode,subcategory:r.export_subcategory,
          color:r.color_name,size:r.size,customer:r.customer_name,qty,
          listPrice:round(r.list_price),discountPercent:round(r.discount_percent),discount,
          lineTotal,method:methods||(credit?'Utólag fizet':'Nincs fizetési adat'),
          document:r.sale_number,actor:goodsActor,
          kind:credit?'Hitelre elvitt':saleFrom?'Eladás · másik eladótól átvéve':'Eladás',
          collected,originalDate:'',stockQty:-qty,note:noteParts.filter(Boolean).join(' ')});
        if(credit)totals.creditValue+=lineTotal;
        if(!credit&&collected>0)totals.discount+=discount;
        if(credit&&collected>0&&lineTotal>0)totals.discount+=round(discount*Math.min(1,collected/lineTotal));
      }else if(collected>0){
        // Employee payment-only view: zero new sold units and zero stock delta.
        const financialActor=financialAllocations[0]?.actor||'';
        add({id:`financial:${r.line_id}`,at:r.sold_at,dateTime:bookDateTime(r.sold_at),
          brand:r.brand_name,sn:r.sn_code,productCode,barcode:r.export_barcode,subcategory:r.export_subcategory,
          color:r.color_name,size:r.size,customer:r.customer_name,qty:0,
          listPrice:0,discountPercent:0,discount:0,lineTotal:collected,method:methods,
          document:r.sale_number,actor:financialActor,
          kind:moneyFrom?'Pénz átvezetése · jóváírás':'Másik eladó termékének pénzbevétele',
          collected,originalDate:bookDateTime(r.sold_at),stockQty:0,
          note:noteParts.concat([`Terméksor értéke ${lineTotal.toFixed(2)} RON, a terméket ${goodsActor} értékesítette. Csak pénzelszámolási esemény.`]).filter(Boolean).join(' ')});
      }
    }
  }
  // Late payments without customer_payment_id: historical compatibility.
  for (const [saleId,ps] of paymentGroups) {
    const old=ps.filter(p=>!p.sold_this_day);
    for (const p of old) {
      if(!shouldInclude(p.effective_payment_actor || p.actor)) continue;
      totals[totalMethod(text(p.method))]=round(totals[totalMethod(text(p.method))]+round(p.amount));
      // Product-wise attribution was not saved for legacy payments: do not guess SKUs.
      add({id:`legacy-payment:${p.id}`,at:p.paid_at,dateTime:bookDateTime(p.paid_at),
        customer:p.customer_name,qty:0,listPrice:0,discountPercent:0,discount:0,lineTotal:round(p.amount),
        method:methodName(p.method),document:p.sale_number,actor:p.actor,
        kind:'Korábbi hitel befizetése',collected:round(p.amount),stockQty:0,
        originalDate:bookDateTime(p.original_sold_at),
        note:'Régi befizetés, nincs biztonságosan visszafejthető terméksor-kapcsolat.',});
      totals.settled+=round(p.amount);
    }
  }
  // Customer payments: one receipt, zero or many linked ORIGINAL item lines.
  for(const cp of data.customerPayments) {
    const a=allocationsByPayment.get(text(cp.id))||[];
    const allocated=a.reduce((s,item)=>s+cents(item.amount),0);
    const received=cents(cp.amount);
    if(allocated>received+1) throw Object.assign(new Error(`A tartozásbefizetés termékfelosztása nagyobb a befizetésnél (${cp.id}).`),{statusCode:409});
    totals[cp.method==='cash'?'cash':cp.method==='card'?'card':cp.method==='bank_transfer'?'transfer':'other']+=round(cp.amount);
    totals.settled+=round(cp.amount);
    for(const r of a) {
      const qty=Number(r.quantity||0);
      const origQty=Number(r.original_quantity||0);
      const net=origQty>0?round(Number(r.line_total||0)*qty/origQty):round(r.amount);
      const regular=round(Number(r.list_price||0)*qty);
      const portion=net>0?Math.min(1,Number(r.amount||0)/net):0;
      const discount=round(Math.max(0,regular-net)*portion);
      totals.discount+=discount;
      add({id:`customer-payment:${cp.id}:${r.id}`,at:cp.paid_at,dateTime:bookDateTime(cp.paid_at),
        brand:r.brand_name,sn:r.sn_code,
        productCode:aifAuditProductCode({supplierProductCode:r.export_supplier_product_code,
          modelCode:r.export_model_code,saleProductCode:r.export_product_code,brand:r.brand_name}),
        barcode:r.export_barcode,subcategory:r.export_subcategory,
        color:r.color_name,size:r.size,customer:r.customer_name||cp.customer_name,qty,
        listPrice:round(r.list_price),discountPercent:round(r.discount_percent),discount,
        lineTotal:round(r.amount),method:methodName(cp.method),document:r.sale_number,actor:cp.actor,
        kind:'Tartozásrendezés',collected:round(r.amount),stockQty:0,
        originalDate:bookDateTime(r.original_sold_at),
        note:'Korábban elvitt termék rendezése; új készletcsökkenés nincs.',});
    }
    const rest=received-allocated;
    if(rest>0) {
      add({id:`customer-payment-remainder:${cp.id}`,at:cp.paid_at,dateTime:bookDateTime(cp.paid_at),
        customer:cp.customer_name,qty:0,listPrice:0,discountPercent:0,discount:0,
        lineTotal:fromCents(rest),method:methodName(cp.method),actor:cp.actor,
        kind:'Nem felosztott tartozásbefizetés',collected:fromCents(rest),stockQty:0,
        note:'A terméksor-kapcsolat hiányzik vagy részleges. A készpénz összege ettől még pontos.',});
    }
  }
  // Exchanges: show the returned and replacement goods separately from any cash difference.
  for(const e of data.exchanges) {
    if(Number(e.returned_qty||0)>0) {
      add({id:`exchange-return:${e.id}`,at:e.created_at,dateTime:bookDateTime(e.created_at),
        brand:e.returned_brand,sn:e.returned_sn,
        productCode:aifAuditProductCode({supplierProductCode:e.returned_supplier_product_code,
          modelCode:e.returned_model_code,saleProductCode:e.returned_product_code,brand:e.returned_brand}),
        barcode:e.returned_barcode,subcategory:e.returned_subcategory,
        color:e.returned_color,size:e.returned_size,
        customer:e.customer_name,qty:-Number(e.returned_qty),listPrice:round(e.returned_list_price),
        discountPercent:0,discount:0,lineTotal:-round(e.return_credit),method:'Csere / visszáru',
        document:e.exchange_number,actor:e.actor,kind:'Csere: visszahozott',collected:0,
        stockQty:Number(e.returned_qty),note:'Készlet-visszavétel, nem új készpénzmozgás.'});
    }
    for (const line of Array.isArray(e.new_lines)?e.new_lines:[]) {
      add({id:`exchange-new:${line.id}`,at:e.created_at,dateTime:bookDateTime(e.created_at),
        brand:line.brand_name,sn:line.sn_cod,
        productCode:aifAuditProductCode({supplierProductCode:line.supplier_product_code,
          modelCode:line.model_code,saleProductCode:line.product_code,brand:line.brand_name}),
        barcode:line.barcode,subcategory:line.subcategory,
        color:line.color_name,size:line.size,customer:e.customer_name,qty:Number(line.quantity||0),
        listPrice:round(line.unit_price),discountPercent:0,discount:0,lineTotal:round(line.line_total),
        method:'Csere',document:e.exchange_number,actor:e.actor,kind:'Csere: új termék',
        collected:0,stockQty:-Number(line.quantity||0),note:'Cserehelyettesítés; csak a különbözet pénzmozgás.'});
    }
    const settlements=Array.isArray(e.settlements)&&e.settlements.length?e.settlements:
      Number(e.settlement_amount||0)>0.005?[{method:e.settlement_method,direction:e.settlement_direction,amount:e.settlement_amount}]:[];
    for(let i=0;i<settlements.length;i++) {
      const p=settlements[i];const direction=p.direction==='out'?-1:1;
      const cash=round(Number(p.amount||0)*direction);
      if(!cash) continue;
      totals.exchangeCash+=cash;
      totals[p.method==='cash'?'cash':p.method==='card'?'card':p.method==='bank_transfer'?'transfer':'other']+=cash;
      add({id:`exchange-cash:${e.id}:${i}`,at:e.created_at,dateTime:bookDateTime(e.created_at),
        customer:e.customer_name,qty:0,listPrice:0,discountPercent:0,discount:0,lineTotal:cash,
        method:methodName(p.method),document:e.exchange_number,actor:e.actor,
        kind:cash>0?'Csere: befizetett különbözet':'Csere: visszafizetett különbözet',
        collected:cash,stockQty:0,note:e.note||'Csere különbözet, nem termékeladás.'});
    }
  }
  totals.collected=round(rows.reduce((sum,r)=>sum+Number(r.collected||0),0));
  totals.discount=round(totals.discount);
  totals.gross=round(totals.collected+totals.discount);
  for(const name of ['settled','creditValue','exchangeCash','cash','card','transfer','other']) totals[name]=round(totals[name]);
  const paymentMethods=round(totals.cash+totals.card+totals.transfer+totals.other);
  if (Math.abs(paymentMethods-totals.collected)>0.02) {
    // Important: never download a plausible looking but false reconciliation.
    throw Object.assign(new Error(`Nem egyezik az időszak pénzmozgása: részletek ${totals.collected}, fizetési módok ${paymentMethods} RON.`), {statusCode:409});
  }
  return {entries:rows,totals};
}

export default function createAifShopDailyAuditExcelRouter({pool,requireAuthed,requireAdminOrSecret,ensureAifShopSalesSchema,ensureAifSellerTransferSchema,aifResolveShopLocation,actorFrom}) {
  const router=express.Router();
  async function download(req,res,scope) {
    let client=null;let started=false;
    try {
      const {from,to}=aifAuditExcelPeriod(req.query);
      const isAll=scope==='all';
      const employee=isAll?(text(req.query.employee).slice(0,120)||null):text(actorFrom(req));
      if(!isAll&&!employee) return res.status(403).json({error:'A bejelentkezett eladó nem azonosítható.'});
      await ensureAifShopSalesSchema();
      await ensureAifSellerTransferSchema(); // DDL only before the read-only export transaction.
      client=await pool.connect();
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');started=true;
      await client.query("SET LOCAL statement_timeout = '120000ms'");
      const location=await aifResolveShopLocation(req,client,req.query.location);
      // One snapshot and five period queries: monthly payments are still credited
      // on their *actual paid date*. Same-day vs late payment is evaluated per
      // receipt, never against the whole date range.
      const data=await loadPeriod(client,[location.id,from,employee,to]);
      const result=excelEntries(data,employee);
      if (result.entries.length > 50000) throw Object.assign(
        new Error('Az export több mint 50 000 eseménysort tartalmaz; válassz rövidebb időszakot.'),
        {statusCode:413});
      result.entries.sort((a,b) => new Date(a.at||0).getTime()-new Date(b.at||0).getTime()
        || String(a.id||'').localeCompare(String(b.id||'')));
      await client.query('COMMIT');started=false;
      client.release();client=null;
      const periodLabel = from===to ? from : `${from} - ${to}`;
      // Preserve the existing 15-column audit format, but write all rows and
      // one reconciled period total into ONE workbook.
      const file=buildAifDailyAuditXlsx({
        date:periodLabel,location:location.name||location.code,employeeLabel:employee||'Minden eladó',
        entries:result.entries,totals:result.totals,
      });
      const safeStore=text(location.code).replace(/[^a-z0-9_-]/gi,'_').slice(0,60);
      const filename=`AllInFashion_Auditnaplo_${safeStore}_${from}${from!==to?'_'+to:''}${employee?'_elado':''}.xlsx`;
      res.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition',`attachment; filename="${filename}"`);
      res.set('Cache-Control','no-store, private');
      return res.status(200).send(file);
    }catch(err) {
      if(started) try {await client.query('ROLLBACK');}catch(_){}
      console.error('AIF period XLSX export failed',err);
      const status=Number(err?.statusCode||500);
      if(res.headersSent) return;
      return res.status(status>=400&&status<600?status:500).json({error:err?.message||'Az időszaki Excel nem tölthető le.'});
    }finally {if(client) client.release();}
  }
  router.get('/all.xlsx',requireAdminOrSecret,(req,res)=>download(req,res,'all'));
  router.get('/mine.xlsx',requireAuthed,(req,res)=>download(req,res,'mine'));
  return router;
}
