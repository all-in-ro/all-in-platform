import express from "express";


// AIF_ADMIN_HISTORICAL_CREDIT_20261022
// A vezetői és az eladói nézet UGYANAZT a már ellenőrzött,
// eseménynapló-alapú (visszáru + későbbi kedvezmény + befizetés) vetítést használja.
// Ezt nem lehet a mai sale-line összegéből utólag rekonstruálni.
export function aifAdminCreditHistorySql(where) {
  return `SELECT s.*,
      (s.sold_at AT TIME ZONE 'Europe/Bucharest')::date::text AS history_day,
      (((s.sold_at AT TIME ZONE 'Europe/Bucharest')::date + 1)::timestamp
        AT TIME ZONE 'Europe/Bucharest') AS history_cutoff,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(sl) || jsonb_build_object(
          'image_url', COALESCE(NULLIF(sl.image_url,''), NULLIF(v.image_url,''))
        ) ORDER BY sl.line_no, sl.id)
        FROM aif_shop_sale_lines sl
        LEFT JOIN aif_product_variants v ON v.id=sl.variant_id
        WHERE sl.sale_id=s.id
      ), '[]'::jsonb) AS history_lines,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(ev) ORDER BY ev.created_at, ev.id)
        FROM aif_shop_sale_events ev WHERE ev.sale_id=s.id
      ), '[]'::jsonb) AS history_events,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(p) ORDER BY p.paid_at, p.id)
        FROM aif_shop_sale_payments p
        WHERE p.sale_id=s.id AND p.method <> 'credit'
      ), '[]'::jsonb) AS history_payments,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(ex) ORDER BY ex.created_at, ex.id)
        FROM aif_shop_exchanges ex WHERE ex.source_sale_id=s.id
      ), '[]'::jsonb) AS history_returns,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(la) || jsonb_build_object('paid_at', cp.paid_at)
          ORDER BY cp.paid_at, la.id)
        FROM aif_shop_customer_payment_line_allocations la
        JOIN aif_shop_customer_payments cp ON cp.id=la.customer_payment_id
        WHERE la.sale_id=s.id
      ), '[]'::jsonb) AS history_line_payments
    FROM aif_shop_sales s
    WHERE ${where}
      AND s.status='completed'
      AND s.sale_type='credit'
    ORDER BY s.sold_at, s.id`;
}

export function aifAdminBuildCreditHistory(rows, buildDailyHistory) {
  if (typeof buildDailyHistory !== 'function') {
    throw new Error('Hiányzik a közös történeti hitelszámítás; a főnöki nézet nem készíthet becsült adatot.');
  }
  const buckets = new Map();
  for (const sale of rows || []) {
    const day = String(sale.history_day || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new Error(`Érvénytelen hiteles vásárlási nap: ${sale.sale_number || 'ismeretlen'}`);
    }
    if (!buckets.has(day)) buckets.set(day, []);
    buckets.get(day).push(sale);
  }
  const total = {
    sales: [], productLines: [], unpaidTotal: 0, unpaidSales: 0,
    currentUnpaidTotal: 0, currentUnpaidSales: 0, creditSales: 0,
    creditLineCount: 0, creditItems: 0, warnings: [],
  };
  const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
  for (const [day, sales] of buckets) {
    // The SAME pure builder used by /shop-operations/daily-summary.
    const history = buildDailyHistory(sales, day);
    total.sales.push(...history.sales);
    total.productLines.push(...history.productLines);
    total.unpaidTotal = money(total.unpaidTotal + history.unpaidTotal);
    total.currentUnpaidTotal = money(total.currentUnpaidTotal + history.currentUnpaidTotal);
    total.unpaidSales += history.unpaidSales;
    total.currentUnpaidSales += history.currentUnpaidSales;
    total.creditSales += history.creditSales;
    total.warnings.push(...history.warnings);
  }
  total.creditLineCount = total.productLines.length;
  total.creditItems = total.productLines.reduce((qty, item) => qty + Number(item.qty || 0), 0);
  return total;
}

// Admin üzleti vezérlőpult: forgalom, készletpillanat, rangsorok, eladási napló.
export default function createAifAdminShopOverviewRouter(deps) {
  const {
    pool, requireAdminOrSecret, ensureAifShopSalesSchema, text, normCode,
    aifNumber, aifBucharestIsoDate, aifValidIsoDate, aifInclusiveDayCount,
    aifShiftIsoDate, aifMapShopSummary, aifPaymentMethodLabel,
    aifBuildDailyCreditHistory, aifReadSettledGrossDiscounts, readSalesTvaSettings,
    ensureAifSellerTransferSchema,
  } = deps;
  const router = express.Router();
  let retailBookSchemaPromise = null;
  async function ensureRetailBookSchema() {
    if (!retailBookSchemaPromise) {
      retailBookSchemaPromise = (async () => {
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_stock_retail_book (
          location_id uuid NOT NULL REFERENCES aif_locations(id) ON DELETE CASCADE,
          variant_id uuid NOT NULL REFERENCES aif_product_variants(id) ON DELETE CASCADE,
          qty numeric(14,3) NOT NULL DEFAULT 0,
          book_value numeric(18,2) NOT NULL DEFAULT 0,
          seeded boolean NOT NULL DEFAULT false,
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (location_id,variant_id)
        )`);
        await pool.query(`INSERT INTO aif_stock_retail_book (location_id,variant_id,qty,book_value,seeded,updated_at)
          SELECT s.location_id,s.variant_id,COALESCE(s.qty,0),round(COALESCE(s.qty,0)::numeric * COALESCE(v.sell_price,0)::numeric,2),true,now()
          FROM aif_stock s
          JOIN aif_product_variants v ON v.id=s.variant_id
          ON CONFLICT (location_id,variant_id) DO NOTHING`);
        return true;
      })().catch((error) => {
        retailBookSchemaPromise = null;
        throw error;
      });
    }
    return retailBookSchemaPromise;
  }

  router.get("/overview", requireAdminOrSecret, async (req, res) => {
    try {
      await ensureAifShopSalesSchema();
      await ensureRetailBookSchema();
      await ensureAifSellerTransferSchema();

      const requestedLocation = text(req.query.location || req.query.locationCode || req.query.location_code);
      const aliasMap = {
        csikszereda: "main_warehouse",
        ciuc: "main_warehouse",
        miercurea_ciuc: "main_warehouse",
        kezdivasarhely: "magazin_targu_secuiesc",
        kezdi: "magazin_targu_secuiesc",
        targu_secuiesc: "magazin_targu_secuiesc",
      };
      const normalizedLocation = aliasMap[normCode(requestedLocation)] || requestedLocation;
      const locationResult = await pool.query(
        `SELECT id, code, name
         FROM aif_locations
         WHERE id::text=$1 OR code=$1 OR lower(name)=lower($1)
         LIMIT 1`,
        [normalizedLocation]
      );
      if (!locationResult.rowCount) {
        return res.status(404).json({ error: "A kiválasztott üzlet nem található." });
      }
      const location = locationResult.rows[0];

      const today = aifBucharestIsoDate();
      let from = aifValidIsoDate(req.query.from, today);
      let to = aifValidIsoDate(req.query.to, today);
      if (from > to) [from, to] = [to, from];
      const days = aifInclusiveDayCount(from, to);
      const previousTo = aifShiftIsoDate(from, -1);
      const previousFrom = aifShiftIsoDate(previousTo, -(days - 1));

      const employee = text(req.query.employee);
      // AIF_ADMIN_SHOP_PAYMENT_METHOD_V1
      // A Fizetés szűrő egyszerre tud fizetési állapotra (paid/partial/unpaid/credit)
      // és konkrét fizetési módra (cash/card/bank_transfer) szűrni.
      const paymentFilter = normCode(req.query.paymentStatus || req.query.payment_status);
      const paymentMethod = ["cash", "card", "bank_transfer"].includes(paymentFilter)
        ? paymentFilter
        : "";
      const paymentStatus = paymentMethod ? "" : paymentFilter;
      const saleType = normCode(req.query.saleType || req.query.sale_type);
      const brand = text(req.query.brand);
      const category = text(req.query.category);
      const snCod = text(req.query.snCod || req.query.sn_cod);
      const search = text(req.query.search || req.query.q);

      // AIF SELLER-TRANSFER ADMIN 20261029
      // Read-only projection of accepted corrections. Never update the original receipt,
      // original payment actor, physical till or warehouse stock from this dashboard.
      // Fetch previous comparison period too, so changes never distort the delta cards.
      const sellerTransferRows = (await pool.query(`
        SELECT t.id::text AS transfer_id,t.sale_id::text AS sale_id,
          t.sale_line_id::text AS sale_line_id,t.from_actor,t.to_actor,
          t.qty,t.list_total,t.net_total,t.discount_total,t.payment_method,
          t.sold_at,(t.sold_at AT TIME ZONE 'Europe/Bucharest')::date::text AS sale_day,
          s.sale_number,s.customer_name,s.customer_phone,s.customer_id,s.raw AS sale_raw,
          sl.product_title,sl.product_code,sl.barcode,sl.brand_name,
          COALESCE(NULLIF(sl.subcategory_name,''),NULLIF(subc.name_hu,''),NULLIF(subc.name_ro,'')) AS category_name,
          sl.size,sl.color_name,v.sn_cod,
          round(COALESCE(sl.buy_price_snapshot,v.buy_price,0)::numeric * sl.quantity,2) AS line_cost,
          (sl.buy_price_snapshot IS NOT NULL) AS cost_snapshot,
          (sl.buy_price_snapshot IS NULL AND v.buy_price IS NOT NULL) AS cost_fallback,
          (sl.buy_price_snapshot IS NULL AND v.buy_price IS NULL) AS cost_missing,
          (SELECT count(*)::int FROM aif_shop_sale_lines other WHERE other.sale_id=s.id) AS total_line_count
        FROM aif_shop_seller_transfers t
        JOIN aif_shop_sales s ON s.id=t.sale_id AND s.location_id=t.location_id
        JOIN aif_shop_sale_lines sl ON sl.id=t.sale_line_id AND sl.sale_id=s.id
        LEFT JOIN aif_product_variants v ON v.id=sl.variant_id
        LEFT JOIN aif_product_models m ON m.id=v.model_id
        LEFT JOIN aif_categories subc ON subc.id=m.subcategory_id
        WHERE t.location_id=$1 AND t.status='accepted'
          AND s.status='completed' AND s.sale_type='sale'
          AND sl.quantity=t.qty AND abs(sl.line_total-t.net_total)<0.005
          AND (t.sold_at AT TIME ZONE 'Europe/Bucharest')::date BETWEEN $2::date AND $3::date
          AND NOT EXISTS (
            SELECT 1 FROM aif_shop_exchanges ex
            WHERE ex.source_sale_id=s.id AND ex.status='completed'
          )
        ORDER BY t.sold_at,t.sale_id,t.sale_line_id`, [location.id,previousFrom,to])).rows;

      const sellerKey = name => String(name || '').trim().replace(/\s+/g,' ').toLocaleLowerCase('hu-HU');
      const sameSeller = (one,two) => sellerKey(one) === sellerKey(two);
      const roundSellerMoney = value => Math.round((Number(value || 0)+Number.EPSILON)*100)/100;
      // These restrictions mirror the selection controls, but the actual sale still
      // exists only once. Transfer is a responsibility correction, not a new sale.
      function transferPassesFilters(t) {
        if (paymentStatus && paymentStatus !== 'paid') return false;
        if (saleType && saleType !== 'sale') return false;
        if (paymentMethod && paymentMethod !== t.payment_method) return false;
        if (brand && String(t.brand_name||'').toLocaleLowerCase('hu-HU')!==brand.toLocaleLowerCase('hu-HU')) return false;
        if (category && String(t.category_name||'').toLocaleLowerCase('hu-HU')!==category.toLocaleLowerCase('hu-HU')) return false;
        if (snCod && !String(t.sn_cod||'').toLocaleLowerCase('hu-HU').includes(snCod.toLocaleLowerCase('hu-HU'))) return false;
        if (search) {
          const needle=search.toLocaleLowerCase('hu-HU');
          if (![t.sale_number,t.from_actor,t.to_actor,t.customer_name,t.customer_phone,
            t.product_title,t.product_code,t.barcode,t.color_name,t.size]
            .some(value=>String(value||'').toLocaleLowerCase('hu-HU').includes(needle))) return false;
        }
        return true;
      }
      const transfersForRange = (start,end) => sellerTransferRows.filter(t =>
        t.sale_day >= start && t.sale_day <= end && transferPassesFilters(t));
      const currentSellerTransfers=transfersForRange(from,to);
      const previousSellerTransfers=transfersForRange(previousFrom,previousTo);
      function transferTransactionChanges(rows) {
        const groups=new Map();
        for(const t of rows){
          let g=groups.get(t.sale_id);
          if(!g){g={from:t.from_actor,count:0,total:Number(t.total_line_count||0),recipients:new Set(),method:t.payment_method,day:t.sale_day};groups.set(t.sale_id,g);}
          g.count++;g.recipients.add(sellerKey(t.to_actor));
        }
        const deltas=new Map();
        for(const g of groups.values()){
          const fromKey=sellerKey(g.from);
          if(g.total>0&&g.count>=g.total)deltas.set(fromKey,(deltas.get(fromKey)||0)-1);
          for(const key of g.recipients)deltas.set(key,(deltas.get(key)||0)+1);
        }
        return deltas;
      }
      // For a multi-line receipt, an employee keeps one transaction if at least
      // one line remains with them. The recipient gets one, never one per item.
      function transactionChangeFor(rows,name) {
        return transferTransactionChanges(rows).get(sellerKey(name))||0;
      }
      function effectiveVatNet(t) {
        const raw=t.sale_raw&&typeof t.sale_raw==='object'?t.sale_raw:{};
        const vatFlag=String(raw.sellPriceIncludesTva??raw.salesPriceIncludesTva??'').toLowerCase();
        const incl=vatFlag==='true'?true:vatFlag==='false'?false:sellPriceIncludesTva;
        const storedRate=Number(raw.salesTvaRate);
        const rate=raw.salesTvaRate!==undefined && Number.isFinite(storedRate)
          ? Math.max(0,Math.min(100,storedRate)):salesTvaRate;
        const total=Number(t.net_total||0);
        return incl?total/(1+rate/100):total;
      }

      const salesTvaSettings = typeof readSalesTvaSettings === "function"
        ? await readSalesTvaSettings(pool)
        : { salesTvaRate: 21, sellPriceIncludesTva: true, salesPriceIncludesTva: true };
      const salesTvaRate = Math.max(
        0,
        Math.min(100, aifNumber(salesTvaSettings?.salesTvaRate ?? 21)),
      );
      const sellPriceIncludesTva =
        salesTvaSettings?.sellPriceIncludesTva !== false &&
        salesTvaSettings?.salesPriceIncludesTva !== false;

      const buildFilters = (rangeFrom, rangeTo) => {
        const args = [location.id, rangeFrom, rangeTo];
        const where = [
          `s.location_id=$1`,
          `(s.sold_at AT TIME ZONE 'Europe/Bucharest')::date BETWEEN $2::date AND $3::date`,
        ];
        const push = (value) => {
          args.push(value);
          return `$${args.length}`;
        };
        if (employee) {
          const p = push(employee);
          where.push(`s.actor=${p}`);
        }
        if (paymentStatus === "credit") {
          where.push(`(s.sale_type='credit' OR s.payment_status='credit')`);
        } else if (paymentStatus) {
          const p = push(paymentStatus);
          where.push(`s.payment_status=${p}`);
          if (paymentStatus === "paid") where.push(`s.sale_type<>'credit'`);
        }
        if (paymentMethod) {
          // A későbbi hitelrendezés nem változtatja meg az eredeti elvitel módját.
          where.push(`s.sale_type<>'credit'`);
          const p = push(paymentMethod);
          where.push(`EXISTS (
            SELECT 1
            FROM aif_shop_sale_payments pmf
            WHERE pmf.sale_id=s.id
              AND pmf.method=${p}
              AND abs(COALESCE(pmf.amount,0)) > 0
          )`);
        }
        if (saleType) {
          const p = push(saleType);
          where.push(`s.sale_type=${p}`);
        }
        if (brand) {
          const p = push(brand);
          where.push(`EXISTS (
            SELECT 1 FROM aif_shop_sale_lines slf
            WHERE slf.sale_id=s.id AND lower(COALESCE(slf.brand_name,''))=lower(${p})
          )`);
        }
        if (category) {
          const p = push(category);
          where.push(`EXISTS (
            SELECT 1
            FROM aif_shop_sale_lines slf
            LEFT JOIN aif_product_variants vf ON vf.id=slf.variant_id
            LEFT JOIN aif_product_models mf ON mf.id=vf.model_id
            LEFT JOIN aif_categories subcf ON subcf.id=mf.subcategory_id
            WHERE slf.sale_id=s.id
              AND lower(COALESCE(
                NULLIF(slf.subcategory_name,''),
                NULLIF(subcf.name_hu,''),
                NULLIF(subcf.name_ro,''),
                'Nincs alkategória'
              ))=lower(${p})
          )`);
        }
        if (snCod) {
          const p = push(`%${snCod}%`);
          where.push(`EXISTS (
            SELECT 1
            FROM aif_shop_sale_lines slf
            LEFT JOIN aif_product_variants vf ON vf.id=slf.variant_id
            WHERE slf.sale_id=s.id
              AND COALESCE(vf.sn_cod,'') ILIKE ${p}
          )`);
        }
        if (search) {
          const p = push(`%${search}%`);
          where.push(`(
            s.sale_number ILIKE ${p}
            OR COALESCE(s.actor,'') ILIKE ${p}
            OR COALESCE(s.customer_name,'') ILIKE ${p}
            OR COALESCE(s.customer_phone,'') ILIKE ${p}
            OR EXISTS (
              SELECT 1 FROM aif_shop_sale_lines slf
              WHERE slf.sale_id=s.id
                AND (
                  COALESCE(slf.product_title,'') ILIKE ${p}
                  OR COALESCE(slf.product_code,'') ILIKE ${p}
                  OR COALESCE(slf.barcode,'') ILIKE ${p}
                )
            )
          )`);
        }
        return { args, where: where.join(" AND ") };
      };

      // Pénzmozgásnál a dátumot mindig a tényleges fizetés időpontja (p.paid_at)
      // határozza meg, nem az eladás időpontja (s.sold_at).
      // Így egy korábbi hiteles eladás későbbi rendezése azon a napon jelenik meg,
      // amikor a pénz ténylegesen beérkezett.
      const buildPaymentFilters = (rangeFrom, rangeTo) => {
        const args = [location.id, rangeFrom, rangeTo];
        const where = [
          `s.location_id=$1`,
          `s.status='completed'`,
          `(p.paid_at AT TIME ZONE 'Europe/Bucharest')::date BETWEEN $2::date AND $3::date`,
          `abs(COALESCE(p.amount,0)) > 0`,
        ];
        const push = (value) => {
          args.push(value);
          return `$${args.length}`;
        };
        if (employee) {
          const pEmployee = push(employee);
          where.push(`COALESCE(NULLIF(p.actor,''), s.actor)=${pEmployee}`);
        }
        if (paymentStatus) {
          const pStatus = push(paymentStatus);
          where.push(`s.payment_status=${pStatus}`);
        }
        if (paymentMethod) {
          const pMethod = push(paymentMethod);
          where.push(`p.method=${pMethod}`);
        }
        if (saleType) {
          const pSaleType = push(saleType);
          where.push(`s.sale_type=${pSaleType}`);
        }
        if (brand) {
          const pBrand = push(brand);
          where.push(`EXISTS (
            SELECT 1 FROM aif_shop_sale_lines slf
            WHERE slf.sale_id=s.id
              AND lower(COALESCE(slf.brand_name,''))=lower(${pBrand})
              AND slf.quantity > COALESCE((
                SELECT sum(exf.returned_qty)
                FROM aif_shop_exchanges exf
                WHERE exf.source_sale_line_id=slf.id
                  AND exf.status='completed'
              ),0)
          )`);
        }
        if (category) {
          const pCategory = push(category);
          where.push(`EXISTS (
            SELECT 1
            FROM aif_shop_sale_lines slf
            LEFT JOIN aif_product_variants vf ON vf.id=slf.variant_id
            LEFT JOIN aif_product_models mf ON mf.id=vf.model_id
            LEFT JOIN aif_categories subcf ON subcf.id=mf.subcategory_id
            WHERE slf.sale_id=s.id
              AND lower(COALESCE(
                NULLIF(slf.subcategory_name,''),
                NULLIF(subcf.name_hu,''),
                NULLIF(subcf.name_ro,''),
                'Nincs alkategória'
              ))=lower(${pCategory})
              AND slf.quantity > COALESCE((
                SELECT sum(exf.returned_qty)
                FROM aif_shop_exchanges exf
                WHERE exf.source_sale_line_id=slf.id
                  AND exf.status='completed'
              ),0)
          )`);
        }
        if (snCod) {
          const pSnCod = push(`%${snCod}%`);
          where.push(`EXISTS (
            SELECT 1
            FROM aif_shop_sale_lines slf
            LEFT JOIN aif_product_variants vf ON vf.id=slf.variant_id
            WHERE slf.sale_id=s.id
              AND COALESCE(vf.sn_cod,'') ILIKE ${pSnCod}
              AND slf.quantity > COALESCE((
                SELECT sum(exf.returned_qty)
                FROM aif_shop_exchanges exf
                WHERE exf.source_sale_line_id=slf.id
                  AND exf.status='completed'
              ),0)
          )`);
        }
        if (search) {
          const pSearch = push(`%${search}%`);
          where.push(`(
            s.sale_number ILIKE ${pSearch}
            OR COALESCE(s.actor,'') ILIKE ${pSearch}
            OR COALESCE(p.actor,'') ILIKE ${pSearch}
            OR COALESCE(s.customer_name,'') ILIKE ${pSearch}
            OR COALESCE(s.customer_phone,'') ILIKE ${pSearch}
            OR EXISTS (
              SELECT 1 FROM aif_shop_sale_lines slf
              WHERE slf.sale_id=s.id
                AND (
                  COALESCE(slf.product_title,'') ILIKE ${pSearch}
                  OR COALESCE(slf.product_code,'') ILIKE ${pSearch}
                  OR COALESCE(slf.barcode,'') ILIKE ${pSearch}
                )
                AND slf.quantity > COALESCE((
                  SELECT sum(exf.returned_qty)
                  FROM aif_shop_exchanges exf
                  WHERE exf.source_sale_line_id=slf.id
                    AND exf.status='completed'
                ),0)
            )
          )`);
        }
        return { args, where: where.join(" AND ") };
      };

      const buildExchangeFilters = (rangeFrom, rangeTo) => {
        const args = [location.id, rangeFrom, rangeTo];
        const where = [
          `e.location_id=$1`,
          `e.status='completed'`,
          `(e.created_at AT TIME ZONE 'Europe/Bucharest')::date BETWEEN $2::date AND $3::date`,
        ];
        const push = (value) => {
          args.push(value);
          return `$${args.length}`;
        };
        if (employee) {
          const p = push(employee);
          where.push(`e.actor=${p}`);
        }
        if (paymentStatus && paymentStatus !== "paid") where.push(`1=0`);
        if (paymentMethod) {
          const p = push(paymentMethod);
          where.push(`(
            e.settlement_method=${p}
            OR EXISTS (
              SELECT 1
              FROM aif_shop_exchange_settlements esf
              WHERE esf.exchange_id=e.id
                AND esf.method=${p}
                AND abs(COALESCE(esf.amount,0)) > 0
            )
          )`);
        }
        if (saleType && saleType !== "exchange") where.push(`1=0`);
        if (brand) {
          const p = push(brand);
          where.push(`(
            EXISTS (
              SELECT 1
              FROM aif_shop_exchange_lines elf
              WHERE elf.exchange_id=e.id
                AND lower(COALESCE(elf.brand_name,''))=lower(${p})
            )
            OR EXISTS (
              SELECT 1
              FROM aif_shop_sale_lines srcf
              WHERE srcf.id=e.source_sale_line_id
                AND lower(COALESCE(srcf.brand_name,''))=lower(${p})
            )
          )`);
        }
        if (category) {
          const p = push(category);
          where.push(`(
            EXISTS (
              SELECT 1
              FROM aif_shop_exchange_lines elf
              LEFT JOIN aif_product_variants evf ON evf.id=elf.variant_id
              LEFT JOIN aif_product_models emf ON emf.id=evf.model_id
              LEFT JOIN aif_categories escf ON escf.id=emf.subcategory_id
              WHERE elf.exchange_id=e.id
                AND lower(COALESCE(
                  NULLIF(escf.name_hu,''),
                  NULLIF(escf.name_ro,''),
                  'Nincs alkategória'
                ))=lower(${p})
            )
            OR EXISTS (
              SELECT 1
              FROM aif_shop_sale_lines srcf
              LEFT JOIN aif_product_variants svf ON svf.id=srcf.variant_id
              LEFT JOIN aif_product_models smf ON smf.id=svf.model_id
              LEFT JOIN aif_categories sscf ON sscf.id=smf.subcategory_id
              WHERE srcf.id=e.source_sale_line_id
                AND lower(COALESCE(
                  NULLIF(srcf.subcategory_name,''),
                  NULLIF(sscf.name_hu,''),
                  NULLIF(sscf.name_ro,''),
                  'Nincs alkategória'
                ))=lower(${p})
            )
          )`);
        }
        if (snCod) {
          const p = push(`%${snCod}%`);
          where.push(`(
            EXISTS (
              SELECT 1
              FROM aif_shop_exchange_lines elf
              LEFT JOIN aif_product_variants evf ON evf.id=elf.variant_id
              WHERE elf.exchange_id=e.id
                AND COALESCE(evf.sn_cod,'') ILIKE ${p}
            )
            OR EXISTS (
              SELECT 1
              FROM aif_shop_sale_lines srcf
              LEFT JOIN aif_product_variants svf ON svf.id=srcf.variant_id
              WHERE srcf.id=e.source_sale_line_id
                AND COALESCE(svf.sn_cod,'') ILIKE ${p}
            )
          )`);
        }
        if (search) {
          const p = push(`%${search}%`);
          where.push(`(
            e.exchange_number ILIKE ${p}
            OR COALESCE(e.actor,'') ILIKE ${p}
            OR COALESCE(e.customer_name,'') ILIKE ${p}
            OR COALESCE(e.customer_phone,'') ILIKE ${p}
            OR EXISTS (
              SELECT 1
              FROM aif_shop_exchange_lines elf
              WHERE elf.exchange_id=e.id
                AND (
                  COALESCE(elf.product_title,'') ILIKE ${p}
                  OR COALESCE(elf.product_code,'') ILIKE ${p}
                  OR COALESCE(elf.barcode,'') ILIKE ${p}
                )
            )
            OR EXISTS (
              SELECT 1
              FROM aif_shop_sale_lines srcf
              WHERE srcf.id=e.source_sale_line_id
                AND (
                  COALESCE(srcf.product_title,'') ILIKE ${p}
                  OR COALESCE(srcf.product_code,'') ILIKE ${p}
                  OR COALESCE(srcf.barcode,'') ILIKE ${p}
                )
            )
          )`);
        }
        return { args, where: where.join(" AND ") };
      };

      const summarySql = (where, tvaRateParam, priceIncludesTvaParam) => `
        WITH filtered_sales AS (
          SELECT s.*
          FROM aif_shop_sales s
          WHERE ${where}
        ),
        line_totals AS (
          SELECT
            sl.sale_id,
            COALESCE(sum(sl.quantity),0)::numeric AS items_sold,
            COALESCE(sum(COALESCE(sl.buy_price_snapshot, v.buy_price,0) * sl.quantity),0)::numeric AS estimated_cost,
            COALESCE(sum(sl.quantity) FILTER (
              WHERE sl.buy_price_snapshot IS NOT NULL
            ),0)::numeric AS cost_snapshot_qty,
            COALESCE(sum(sl.quantity) FILTER (
              WHERE sl.buy_price_snapshot IS NULL AND v.buy_price IS NOT NULL
            ),0)::numeric AS cost_fallback_qty,
            COALESCE(sum(sl.quantity) FILTER (
              WHERE sl.buy_price_snapshot IS NULL AND v.buy_price IS NULL
            ),0)::numeric AS cost_missing_qty
          FROM aif_shop_sale_lines sl
          JOIN filtered_sales fs ON fs.id=sl.sale_id
          LEFT JOIN aif_product_variants v ON v.id=sl.variant_id
          GROUP BY sl.sale_id
        )
        SELECT
          count(*) FILTER (WHERE fs.status='completed' AND fs.sale_type <> 'credit')::int AS transactions,
          COALESCE(sum(fs.total) FILTER (WHERE fs.status='completed' AND fs.sale_type <> 'credit'),0)::numeric AS revenue,
          COALESCE(sum(
            CASE
              WHEN COALESCE(
                CASE
                  WHEN lower(COALESCE(fs.raw->>'sellPriceIncludesTva', fs.raw->>'salesPriceIncludesTva', '')) IN ('true','false')
                  THEN lower(COALESCE(fs.raw->>'sellPriceIncludesTva', fs.raw->>'salesPriceIncludesTva'))='true'
                  ELSE NULL
                END,
                ${priceIncludesTvaParam}::boolean
              )
              THEN fs.total / (
                1 + (
                  GREATEST(
                    0,
                    LEAST(
                      100,
                      COALESCE(
                        CASE
                          WHEN COALESCE(fs.raw->>'salesTvaRate','') ~ '^[0-9]+([.][0-9]+)?$'
                          THEN (fs.raw->>'salesTvaRate')::numeric
                          ELSE NULL
                        END,
                        ${tvaRateParam}::numeric
                      )
                    )
                  ) / 100
                )
              )
              ELSE fs.total
            END
          ) FILTER (WHERE fs.status='completed' AND fs.sale_type <> 'credit'),0)::numeric AS net_revenue,
          COALESCE(sum(fs.subtotal) FILTER (WHERE fs.status='completed' AND fs.sale_type <> 'credit'),0)::numeric AS sales_before_discount,
          COALESCE(sum(fs.discount_total) FILTER (WHERE fs.status='completed' AND fs.sale_type <> 'credit'),0)::numeric AS discount_total,
          COALESCE(sum(fs.paid_total) FILTER (WHERE fs.status='completed' AND fs.sale_type <> 'credit'),0)::numeric AS paid_total,
          COALESCE(sum(fs.balance_due) FILTER (WHERE fs.status='completed'),0)::numeric AS unpaid_total,
          count(*) FILTER (
            WHERE fs.status='completed' AND fs.balance_due > 0
          )::int AS unpaid_sales,
          count(*) FILTER (
            WHERE fs.status='completed' AND (fs.payment_status='credit' OR fs.sale_type='credit')
          )::int AS credit_sales,
          COALESCE(sum(lt.items_sold) FILTER (WHERE fs.status='completed' AND fs.sale_type <> 'credit'),0)::numeric AS items_sold,
          COALESCE(sum(lt.estimated_cost) FILTER (WHERE fs.status='completed' AND fs.sale_type <> 'credit'),0)::numeric AS estimated_cost,
          COALESCE(sum(lt.cost_snapshot_qty) FILTER (WHERE fs.status='completed' AND fs.sale_type <> 'credit'),0)::numeric AS cost_snapshot_qty,
          COALESCE(sum(lt.cost_fallback_qty) FILTER (WHERE fs.status='completed' AND fs.sale_type <> 'credit'),0)::numeric AS cost_fallback_qty,
          COALESCE(sum(lt.cost_missing_qty) FILTER (WHERE fs.status='completed' AND fs.sale_type <> 'credit'),0)::numeric AS cost_missing_qty,
          COALESCE(avg(fs.total) FILTER (WHERE fs.status='completed' AND fs.sale_type <> 'credit'),0)::numeric AS average_basket,
          count(*) FILTER (WHERE fs.status='cancelled')::int AS cancelled_sales,
          count(*) FILTER (WHERE fs.status='refunded')::int AS refunded_sales
        FROM filtered_sales fs
        LEFT JOIN line_totals lt ON lt.sale_id=fs.id
      `;

      const summaryQuery = (filters) => {
        const args = [...filters.args, salesTvaRate, sellPriceIncludesTva];
        const tvaRateParam = `$${args.length - 1}`;
        const priceIncludesTvaParam = `$${args.length}`;
        return {
          sql: summarySql(filters.where, tvaRateParam, priceIncludesTvaParam),
          args,
        };
      };

      const exchangeSummarySql = (where, tvaRateParam, priceIncludesTvaParam) => `
        WITH filtered_exchanges AS (
          SELECT e.*
          FROM aif_shop_exchanges e
          JOIN aif_shop_sales source_sale ON source_sale.id=e.source_sale_id
          WHERE ${where}
            AND source_sale.sale_type <> 'credit'
        ),
        exchange_rows AS (
          SELECT
            e.id,
            e.difference,
            e.returned_qty,
            e.customer_name,
            e.created_at,
            e.original_snapshot,
            COALESCE(rep.replacement_qty,0)::numeric AS replacement_qty,
            COALESCE(rep.replacement_cost,0)::numeric AS replacement_cost,
            COALESCE(src.buy_price_snapshot, srcv.buy_price,0)::numeric * e.returned_qty::numeric AS return_cost,
            COALESCE(rep.cost_snapshot_qty,0)::numeric
              + CASE WHEN src.buy_price_snapshot IS NOT NULL THEN e.returned_qty ELSE 0 END::numeric AS cost_snapshot_qty,
            COALESCE(rep.cost_fallback_qty,0)::numeric
              + CASE WHEN src.buy_price_snapshot IS NULL AND srcv.buy_price IS NOT NULL THEN e.returned_qty ELSE 0 END::numeric AS cost_fallback_qty,
            COALESCE(rep.cost_missing_qty,0)::numeric
              + CASE WHEN src.buy_price_snapshot IS NULL AND srcv.buy_price IS NULL THEN e.returned_qty ELSE 0 END::numeric AS cost_missing_qty
          FROM filtered_exchanges e
          JOIN aif_shop_sale_lines src ON src.id=e.source_sale_line_id
          LEFT JOIN aif_product_variants srcv ON srcv.id=src.variant_id
          LEFT JOIN LATERAL (
            SELECT
              COALESCE(sum(el.quantity),0)::numeric AS replacement_qty,
              COALESCE(sum(COALESCE(el.buy_price_snapshot, rv.buy_price,0) * el.quantity),0)::numeric AS replacement_cost,
              COALESCE(sum(el.quantity) FILTER (WHERE el.buy_price_snapshot IS NOT NULL),0)::numeric AS cost_snapshot_qty,
              COALESCE(sum(el.quantity) FILTER (WHERE el.buy_price_snapshot IS NULL AND rv.buy_price IS NOT NULL),0)::numeric AS cost_fallback_qty,
              COALESCE(sum(el.quantity) FILTER (WHERE el.buy_price_snapshot IS NULL AND rv.buy_price IS NULL),0)::numeric AS cost_missing_qty
            FROM aif_shop_exchange_lines el
            LEFT JOIN aif_product_variants rv ON rv.id=el.variant_id
            WHERE el.exchange_id=e.id
          ) rep ON true
        )
        SELECT
          count(*)::int AS transactions,
          COALESCE(sum(difference),0)::numeric AS revenue,
          COALESCE(sum(
            CASE
              WHEN COALESCE(
                CASE
                  WHEN lower(COALESCE(original_snapshot->>'sellPriceIncludesTva', original_snapshot->>'salesPriceIncludesTva', '')) IN ('true','false')
                  THEN lower(COALESCE(original_snapshot->>'sellPriceIncludesTva', original_snapshot->>'salesPriceIncludesTva'))='true'
                  ELSE NULL
                END,
                ${priceIncludesTvaParam}::boolean
              )
              THEN difference / (
                1 + (
                  GREATEST(
                    0,
                    LEAST(
                      100,
                      COALESCE(
                        CASE
                          WHEN COALESCE(original_snapshot->>'salesTvaRate','') ~ '^[0-9]+([.][0-9]+)?$'
                          THEN (original_snapshot->>'salesTvaRate')::numeric
                          ELSE NULL
                        END,
                        ${tvaRateParam}::numeric
                      )
                    )
                  ) / 100
                )
              )
              ELSE difference
            END
          ),0)::numeric AS net_revenue,
          COALESCE(sum(difference),0)::numeric AS sales_before_discount,
          0::numeric AS discount_total,
          COALESCE(sum(difference),0)::numeric AS paid_total,
          0::numeric AS unpaid_total,
          0::int AS unpaid_sales,
          0::int AS credit_sales,
          0::numeric AS items_sold,
          COALESCE(sum(replacement_cost - return_cost),0)::numeric AS estimated_cost,
          COALESCE(sum(cost_snapshot_qty),0)::numeric AS cost_snapshot_qty,
          COALESCE(sum(cost_fallback_qty),0)::numeric AS cost_fallback_qty,
          COALESCE(sum(cost_missing_qty),0)::numeric AS cost_missing_qty,
          COALESCE(avg(difference),0)::numeric AS average_basket,
          0::int AS cancelled_sales,
          0::int AS refunded_sales
        FROM exchange_rows
      `;

      const exchangeSummaryQuery = (filters) => {
        const args = [...filters.args, salesTvaRate, sellPriceIncludesTva];
        const tvaRateParam = `$${args.length - 1}`;
        const priceIncludesTvaParam = `$${args.length}`;
        return {
          sql: exchangeSummarySql(filters.where, tvaRateParam, priceIncludesTvaParam),
          args,
        };
      };

      const buildStockSnapshotQuery = (snapshotDate) => {
        const args = [location.id, snapshotDate];
        const where = ["1=1"];
        const push = (value) => {
          args.push(value);
          return `$${args.length}`;
        };

        if (brand) {
          const p = push(brand);
          where.push(`lower(COALESCE(b.name,''))=lower(${p})`);
        }
        if (category) {
          const p = push(category);
          where.push(`lower(COALESCE(
            NULLIF(subc.name_hu,''),
            NULLIF(subc.name_ro,''),
            'Nincs alkategória'
          ))=lower(${p})`);
        }
        if (snCod) {
          const p = push(`%${snCod}%`);
          where.push(`COALESCE(v.sn_cod,'') ILIKE ${p}`);
        }
        if (search) {
          const p = push(`%${search}%`);
          where.push(`(
            COALESCE(m.title_hu,'') ILIKE ${p}
            OR COALESCE(m.title_ro,'') ILIKE ${p}
            OR COALESCE(m.shopify_title,'') ILIKE ${p}
            OR COALESCE(m.model_code,'') ILIKE ${p}
            OR COALESCE(v.internal_sku,'') ILIKE ${p}
            OR COALESCE(v.barcode,'') ILIKE ${p}
            OR COALESCE(v.sn_cod,'') ILIKE ${p}
            OR COALESCE(v.color_name,'') ILIKE ${p}
            OR COALESCE(v.color_code,'') ILIKE ${p}
            OR COALESCE(v.size,'') ILIKE ${p}
          )`);
        }

        return {
          sql: `
            WITH candidate_variants AS (
              SELECT s.variant_id
              FROM aif_stock s
              WHERE s.location_id=$1

              UNION

              SELECT sm.variant_id
              FROM aif_stock_movements sm
              WHERE sm.location_id=$1
                AND (sm.created_at AT TIME ZONE 'Europe/Bucharest')::date > $2::date
            ),
            future_movements AS (
              SELECT
                sm.variant_id,
                COALESCE(sum(sm.qty_delta),0)::numeric AS qty_delta_after
              FROM aif_stock_movements sm
              WHERE sm.location_id=$1
                AND (sm.created_at AT TIME ZONE 'Europe/Bucharest')::date > $2::date
              GROUP BY sm.variant_id
            ),
            snapshot_rows AS (
              SELECT
                cv.variant_id,
                GREATEST(
                  COALESCE(s.qty,0)::numeric - COALESCE(fm.qty_delta_after,0)::numeric,
                  0
                )::numeric AS snapshot_qty,
                CASE
                  WHEN $2::date >= ((now() AT TIME ZONE 'Europe/Bucharest')::date)
                  THEN LEAST(
                    GREATEST(COALESCE(s.reserved_qty,0)::numeric,0),
                    GREATEST(COALESCE(s.qty,0)::numeric - COALESCE(fm.qty_delta_after,0)::numeric,0)
                  )
                  ELSE 0::numeric
                END AS snapshot_reserved_qty,
                CASE
                  WHEN $2::date >= ((now() AT TIME ZONE 'Europe/Bucharest')::date)
                       AND COALESCE(rb.qty,0) > 0
                    THEN COALESCE(rb.book_value,0)::numeric / rb.qty::numeric
                  WHEN hist.book_value_after IS NOT NULL AND COALESCE(hist.qty_after,0) > 0
                    THEN hist.book_value_after::numeric / hist.qty_after::numeric
                  ELSE COALESCE(v.sell_price,0)::numeric
                END AS book_unit_value
              FROM candidate_variants cv
              LEFT JOIN aif_stock s
                ON s.location_id=$1
               AND s.variant_id=cv.variant_id
              LEFT JOIN future_movements fm ON fm.variant_id=cv.variant_id
              JOIN aif_product_variants v ON v.id=cv.variant_id
              JOIN aif_product_models m ON m.id=v.model_id
              LEFT JOIN aif_brands b ON b.id=m.brand_id
              LEFT JOIN aif_categories subc ON subc.id=m.subcategory_id
              LEFT JOIN aif_stock_retail_book rb
                ON rb.location_id=$1
               AND rb.variant_id=cv.variant_id
              LEFT JOIN LATERAL (
                SELECT
                  NULLIF(sm.raw->>'retailBookValueAfter','')::numeric AS book_value_after,
                  COALESCE(sm.qty_after,0)::numeric AS qty_after
                FROM aif_stock_movements sm
                WHERE sm.location_id=$1
                  AND sm.variant_id=cv.variant_id
                  AND (sm.created_at AT TIME ZONE 'Europe/Bucharest')::date <= $2::date
                  AND NULLIF(sm.raw->>'retailBookValueAfter','') IS NOT NULL
                ORDER BY sm.created_at DESC, sm.id DESC
                LIMIT 1
              ) hist ON true
              WHERE ${where.join(" AND ")}
            )
            SELECT
              count(*) FILTER (WHERE snapshot_qty > 0)::int AS variant_count,
              COALESCE(sum(snapshot_qty),0)::numeric AS total_qty,
              COALESCE(sum(snapshot_reserved_qty),0)::numeric AS reserved_qty,
              COALESCE(sum(GREATEST(snapshot_qty - snapshot_reserved_qty,0)),0)::numeric AS available_qty,
              COALESCE(sum(
                GREATEST(snapshot_qty - snapshot_reserved_qty,0) * book_unit_value
              ),0)::numeric AS retail_value,
              count(*) FILTER (
                WHERE GREATEST(snapshot_qty - snapshot_reserved_qty,0) > 0
                  AND GREATEST(snapshot_qty - snapshot_reserved_qty,0) <= 2
              )::int AS low_stock_variants
            FROM snapshot_rows
          `,
          args,
        };
      };

      // A készletkártyák a kiválasztott időszak ZÁRÓ napjára állnak vissza.
      // Így a múltbeli dátumszűrésnél az eladási készletérték is ténylegesen változik.
      // A múltbeli foglalási állapot nem rekonstruálható biztosan a jelenlegi sémából,
      // ezért múltbeli snapshotnál a foglalt mennyiséget 0-nak vesszük; mai/jövőbeli
      // nézetnél a jelenlegi reserved_qty marad érvényben.
      const stockSnapshotDate = to > today ? today : to;
      const stockSnapshotQuery = buildStockSnapshotQuery(stockSnapshotDate);

      const currentFilters = buildFilters(from, to);
      const previousFilters = buildFilters(previousFrom, previousTo);
      const currentPaymentFilters = buildPaymentFilters(from, to);
      const previousPaymentFilters = buildPaymentFilters(previousFrom, previousTo);
      const currentExchangeFilters = buildExchangeFilters(from, to);
      const previousExchangeFilters = buildExchangeFilters(previousFrom, previousTo);
      const currentSummaryQuery = summaryQuery(currentFilters);
      const previousSummaryQuery = summaryQuery(previousFilters);
      const currentExchangeSummaryQuery = exchangeSummaryQuery(currentExchangeFilters);
      const previousExchangeSummaryQuery = exchangeSummaryQuery(previousExchangeFilters);

      const buildRecentLineFilters = (rangeFrom, rangeTo) => {
        const args = [location.id, rangeFrom, rangeTo];
        const where = [
          `s.location_id=$1`,
          `(s.sold_at AT TIME ZONE 'Europe/Bucharest')::date BETWEEN $2::date AND $3::date`,
        ];
        const push = (value) => {
          args.push(value);
          return `$${args.length}`;
        };
        if (employee) {
          const p = push(employee);
          where.push(`COALESCE((
            SELECT st.to_actor FROM aif_shop_seller_transfers st
            WHERE st.sale_line_id=sl.id AND st.status='accepted'
              AND s.sale_type='sale' AND s.status='completed'
              AND sl.quantity=st.qty AND abs(sl.line_total-st.net_total)<0.005
              AND NOT EXISTS (SELECT 1 FROM aif_shop_exchanges ex
                WHERE ex.source_sale_id=s.id AND ex.status='completed')
            LIMIT 1
          ),s.actor)=${p}`);
        }
        if (paymentStatus === "credit") {
          where.push(`(s.sale_type='credit' OR s.payment_status='credit')`);
        } else if (paymentStatus) {
          const p = push(paymentStatus);
          where.push(`s.payment_status=${p}`);
          if (paymentStatus === "paid") where.push(`s.sale_type<>'credit'`);
        }
        if (paymentMethod) {
          // A későbbi hitelrendezés nem változtatja meg az eredeti elvitel módját.
          where.push(`s.sale_type<>'credit'`);
          const p = push(paymentMethod);
          where.push(`EXISTS (
            SELECT 1
            FROM aif_shop_sale_payments pmf
            WHERE pmf.sale_id=s.id
              AND pmf.method=${p}
              AND abs(COALESCE(pmf.amount,0)) > 0
          )`);
        }
        if (saleType) {
          const p = push(saleType);
          where.push(`s.sale_type=${p}`);
        }
        if (brand) {
          const p = push(brand);
          where.push(`lower(COALESCE(sl.brand_name,''))=lower(${p})`);
        }
        if (category) {
          const p = push(category);
          where.push(`lower(COALESCE(
            NULLIF(sl.subcategory_name,''),
            NULLIF(subc.name_hu,''),
            NULLIF(subc.name_ro,''),
            'Nincs alkategória'
          ))=lower(${p})`);
        }
        if (snCod) {
          const p = push(`%${snCod}%`);
          where.push(`COALESCE(v.sn_cod,'') ILIKE ${p}`);
        }
        if (search) {
          const p = push(`%${search}%`);
          where.push(`(
            s.sale_number ILIKE ${p}
            OR COALESCE(s.actor,'') ILIKE ${p}
            OR COALESCE(s.customer_name,'') ILIKE ${p}
            OR COALESCE(s.customer_phone,'') ILIKE ${p}
            OR COALESCE(sl.product_title,'') ILIKE ${p}
            OR COALESCE(sl.product_code,'') ILIKE ${p}
            OR COALESCE(sl.barcode,'') ILIKE ${p}
            OR COALESCE(sl.color_name,'') ILIKE ${p}
            OR COALESCE(sl.size,'') ILIKE ${p}
          )`);
        }
        return { args, where: where.join(" AND ") };
      };
      const recentLineFilters = buildRecentLineFilters(from, to);

      // Korábbi vásárlás későbbi kliensbefizetése:
      // csak megjelenítési eseményt készítünk az admin naplóhoz.
      // Nincs INSERT/UPDATE, nincs készletmozgás, és nem számít új eladásnak.
      const buildSettlementLineFilters = (rangeFrom, rangeTo) => {
        const args = [location.id, rangeFrom, rangeTo];
        const where = [
          `s.location_id=$1`,
          `s.status='completed'`,
          `p.customer_payment_id IS NOT NULL`,
          `abs(COALESCE(p.amount,0)) > 0`,
          `(p.paid_at AT TIME ZONE 'Europe/Bucharest')::date BETWEEN $2::date AND $3::date`,
          `(p.paid_at AT TIME ZONE 'Europe/Bucharest')::date <> (s.sold_at AT TIME ZONE 'Europe/Bucharest')::date`,
          `GREATEST(sl.quantity - COALESCE(ret.returned_qty,0),0) > 0`,
        ];
        const push = (value) => {
          args.push(value);
          return `$${args.length}`;
        };
        if (employee) {
          const pEmployee = push(employee);
          where.push(`COALESCE(NULLIF(p.actor,''), s.actor)=${pEmployee}`);
        }
        if (paymentStatus) {
          const pStatus = push(paymentStatus);
          where.push(`s.payment_status=${pStatus}`);
        }
        if (paymentMethod) {
          const pMethod = push(paymentMethod);
          where.push(`p.method=${pMethod}`);
        }
        if (saleType) {
          const pSaleType = push(saleType);
          where.push(`s.sale_type=${pSaleType}`);
        }
        if (brand) {
          const pBrand = push(brand);
          where.push(`lower(COALESCE(sl.brand_name,''))=lower(${pBrand})`);
        }
        if (category) {
          const pCategory = push(category);
          where.push(`lower(COALESCE(
            NULLIF(sl.subcategory_name,''),
            NULLIF(subc.name_hu,''),
            NULLIF(subc.name_ro,''),
            'Nincs alkategória'
          ))=lower(${pCategory})`);
        }
        if (snCod) {
          const pSnCod = push(`%${snCod}%`);
          where.push(`COALESCE(v.sn_cod,'') ILIKE ${pSnCod}`);
        }
        if (search) {
          const pSearch = push(`%${search}%`);
          where.push(`(
            s.sale_number ILIKE ${pSearch}
            OR COALESCE(s.actor,'') ILIKE ${pSearch}
            OR COALESCE(p.actor,'') ILIKE ${pSearch}
            OR COALESCE(s.customer_name,'') ILIKE ${pSearch}
            OR COALESCE(s.customer_phone,'') ILIKE ${pSearch}
            OR COALESCE(sl.product_title,'') ILIKE ${pSearch}
            OR COALESCE(sl.product_code,'') ILIKE ${pSearch}
            OR COALESCE(sl.barcode,'') ILIKE ${pSearch}
            OR COALESCE(sl.color_name,'') ILIKE ${pSearch}
            OR COALESCE(sl.size,'') ILIKE ${pSearch}
          )`);
        }
        return { args, where: where.join(" AND ") };
      };
      const settlementLineFilters = buildSettlementLineFilters(from, to);

      const [
        stockResult,
        movementResult,
        summaryResult,
        previousSummaryResult,
        trendResult,
        brandResult,
        categoryResult,
        productResult,
        paymentResult,
        previousPaymentResult,
        paymentTrendResult,
        employeeResult,
        recentResult,
        settlementRecentResult,
        employeesOptionResult,
        brandsOptionResult,
        categoriesOptionResult,
        exchangeSummaryResult,
        previousExchangeSummaryResult,
        exchangeTrendResult,
        exchangeImpactResult,
        exchangePaymentResult,
        exchangeEmployeeResult,
        exchangeRecentResult,
        exchangeEmployeesOptionResult,
        exchangeBrandsOptionResult,
        exchangeCategoriesOptionResult,
        currentCreditHistoryResult,
        previousCreditHistoryResult,
      ] = await Promise.all([
        pool.query(stockSnapshotQuery.sql, stockSnapshotQuery.args),
        pool.query(
          `SELECT
             count(*)::int AS movement_count,
             count(DISTINCT sm.variant_id)::int AS distinct_variants,
             COALESCE(sum(CASE WHEN sm.qty_delta > 0 THEN sm.qty_delta ELSE 0 END),0)::numeric AS incoming_qty,
             COALESCE(sum(CASE WHEN sm.qty_delta < 0 THEN abs(sm.qty_delta) ELSE 0 END),0)::numeric AS outgoing_qty,
             COALESCE(sum(sm.qty_delta),0)::numeric AS net_qty
           FROM aif_stock_movements sm
           WHERE sm.location_id=$1
             AND (sm.created_at AT TIME ZONE 'Europe/Bucharest')::date BETWEEN $2::date AND $3::date`,
          [location.id, from, to]
        ),
        pool.query(currentSummaryQuery.sql, currentSummaryQuery.args),
        pool.query(previousSummaryQuery.sql, previousSummaryQuery.args),
        pool.query(
          `WITH filtered_sales AS (
             SELECT s.*
             FROM aif_shop_sales s
             WHERE ${currentFilters.where}
           ),
           days AS (
             SELECT generate_series($2::date, $3::date, interval '1 day')::date AS day
           ),
           line_totals AS (
             SELECT sl.sale_id, COALESCE(sum(sl.quantity),0)::numeric AS items_sold
             FROM aif_shop_sale_lines sl
             JOIN filtered_sales fs ON fs.id=sl.sale_id
             GROUP BY sl.sale_id
           )
           SELECT
             d.day::text AS date,
             to_char(d.day,'MM.DD') AS label,
             0::numeric AS revenue,
             count(fs.id) FILTER (WHERE fs.status='completed' AND fs.sale_type <> 'credit')::int AS transactions,
             COALESCE(sum(lt.items_sold) FILTER (WHERE fs.status='completed' AND fs.sale_type <> 'credit'),0)::numeric AS items_sold,
             COALESCE(sum(fs.discount_total) FILTER (WHERE fs.status='completed' AND fs.sale_type <> 'credit'),0)::numeric AS discount_total,
             COALESCE(sum(fs.balance_due) FILTER (WHERE fs.status='completed'),0)::numeric AS unpaid_total
           FROM days d
           LEFT JOIN filtered_sales fs
             ON (fs.sold_at AT TIME ZONE 'Europe/Bucharest')::date=d.day
           LEFT JOIN line_totals lt ON lt.sale_id=fs.id
           GROUP BY d.day
           ORDER BY d.day ASC`,
          currentFilters.args
        ),
        pool.query(
          `WITH filtered_sales AS (
             SELECT s.* FROM aif_shop_sales s WHERE ${currentFilters.where}
           )
           SELECT
             COALESCE(NULLIF(sl.brand_name,''),'Ismeretlen márka') AS name,
             COALESCE(sum(sl.line_total),0)::numeric AS revenue,
             COALESCE(sum(sl.quantity),0)::numeric AS qty,
             count(DISTINCT fs.id)::int AS transactions
           FROM filtered_sales fs
           JOIN aif_shop_sale_lines sl ON sl.sale_id=fs.id
           WHERE fs.status='completed'
             AND fs.sale_type <> 'credit'
           GROUP BY COALESCE(NULLIF(sl.brand_name,''),'Ismeretlen márka')
           ORDER BY revenue DESC, qty DESC
           LIMIT 12`,
          currentFilters.args
        ),
        pool.query(
          `WITH filtered_sales AS (
             SELECT s.* FROM aif_shop_sales s WHERE ${currentFilters.where}
           )
           SELECT
             COALESCE(
               NULLIF(sl.subcategory_name,''),
               NULLIF(subc.name_hu,''),
               NULLIF(subc.name_ro,''),
               'Nincs alkategória'
             ) AS name,
             COALESCE(sum(sl.line_total),0)::numeric AS revenue,
             COALESCE(sum(sl.quantity),0)::numeric AS qty,
             count(DISTINCT fs.id)::int AS transactions
           FROM filtered_sales fs
           JOIN aif_shop_sale_lines sl ON sl.sale_id=fs.id
           LEFT JOIN aif_product_variants v ON v.id=sl.variant_id
           LEFT JOIN aif_product_models m ON m.id=v.model_id
           LEFT JOIN aif_categories subc ON subc.id=m.subcategory_id
           WHERE fs.status='completed'
             AND fs.sale_type <> 'credit'
           GROUP BY COALESCE(
             NULLIF(sl.subcategory_name,''),
             NULLIF(subc.name_hu,''),
             NULLIF(subc.name_ro,''),
             'Nincs alkategória'
           )
           ORDER BY qty DESC, revenue DESC
           LIMIT 12`,
          currentFilters.args
        ),
        pool.query(
          `WITH filtered_sales AS (
             SELECT s.* FROM aif_shop_sales s WHERE ${currentFilters.where}
           )
           SELECT
             COALESCE(NULLIF(sl.product_title,''),NULLIF(sl.product_code,''),'Ismeretlen termék') AS name,
             max(sl.product_code) AS product_code,
             COALESCE(sum(sl.line_total),0)::numeric AS revenue,
             COALESCE(sum(sl.quantity),0)::numeric AS qty,
             count(DISTINCT fs.id)::int AS transactions
           FROM filtered_sales fs
           JOIN aif_shop_sale_lines sl ON sl.sale_id=fs.id
           WHERE fs.status='completed'
             AND fs.sale_type <> 'credit'
           GROUP BY COALESCE(NULLIF(sl.product_title,''),NULLIF(sl.product_code,''),'Ismeretlen termék')
           ORDER BY revenue DESC, qty DESC
           LIMIT 12`,
          currentFilters.args
        ),
        pool.query(
          `SELECT
             p.method,
             COALESCE(sum(p.amount),0)::numeric AS amount,
             count(DISTINCT COALESCE(p.customer_payment_id::text, p.id::text))::int AS transactions
           FROM aif_shop_sale_payments p
           JOIN aif_shop_sales s ON s.id=p.sale_id
           WHERE ${currentPaymentFilters.where}
           GROUP BY p.method
           ORDER BY amount DESC`,
          currentPaymentFilters.args
        ),
        pool.query(
          `SELECT
             p.method,
             COALESCE(sum(p.amount),0)::numeric AS amount,
             count(DISTINCT COALESCE(p.customer_payment_id::text, p.id::text))::int AS transactions
           FROM aif_shop_sale_payments p
           JOIN aif_shop_sales s ON s.id=p.sale_id
           WHERE ${previousPaymentFilters.where}
           GROUP BY p.method
           ORDER BY amount DESC`,
          previousPaymentFilters.args
        ),
        pool.query(
          `SELECT
             (p.paid_at AT TIME ZONE 'Europe/Bucharest')::date::text AS date,
             to_char((p.paid_at AT TIME ZONE 'Europe/Bucharest')::date,'MM.DD') AS label,
             COALESCE(sum(p.amount),0)::numeric AS revenue,
             0::int AS transactions,
             0::numeric AS items_sold,
             0::numeric AS discount_total,
             0::numeric AS unpaid_total
           FROM aif_shop_sale_payments p
           JOIN aif_shop_sales s ON s.id=p.sale_id
           WHERE ${currentPaymentFilters.where}
           GROUP BY (p.paid_at AT TIME ZONE 'Europe/Bucharest')::date
           ORDER BY (p.paid_at AT TIME ZONE 'Europe/Bucharest')::date ASC`,
          currentPaymentFilters.args
        ),
        pool.query(
          `WITH filtered_sales AS (
             SELECT s.* FROM aif_shop_sales s WHERE ${currentFilters.where}
           ),
           line_totals AS (
             SELECT sl.sale_id, COALESCE(sum(sl.quantity),0)::numeric AS items_sold
             FROM aif_shop_sale_lines sl
             JOIN filtered_sales fs ON fs.id=sl.sale_id
             GROUP BY sl.sale_id
           )
           SELECT
             COALESCE(NULLIF(fs.actor,''),'Ismeretlen') AS actor,
             COALESCE(sum(fs.total) FILTER (WHERE fs.status='completed' AND fs.sale_type <> 'credit'),0)::numeric AS revenue,
             count(*) FILTER (WHERE fs.status='completed' AND fs.sale_type <> 'credit')::int AS transactions,
             COALESCE(sum(lt.items_sold) FILTER (WHERE fs.status='completed' AND fs.sale_type <> 'credit'),0)::numeric AS items_sold,
             COALESCE(sum(fs.discount_total) FILTER (WHERE fs.status='completed' AND fs.sale_type <> 'credit'),0)::numeric AS discount_total,
             COALESCE(sum(fs.balance_due) FILTER (WHERE fs.status='completed'),0)::numeric AS unpaid_total,
             COALESCE(avg(fs.total) FILTER (WHERE fs.status='completed' AND fs.sale_type <> 'credit'),0)::numeric AS average_basket
           FROM filtered_sales fs
           LEFT JOIN line_totals lt ON lt.sale_id=fs.id
           GROUP BY COALESCE(NULLIF(fs.actor,''),'Ismeretlen')
           ORDER BY revenue DESC, transactions DESC`,
          currentFilters.args
        ),
        pool.query(
          `SELECT
             sl.id AS line_id,
             sl.sale_id,
             sl.line_no,
             sl.variant_id,
             s.sale_number, s.sold_at,
             COALESCE(st.to_actor,s.actor) AS actor,s.actor AS original_actor,
             st.from_actor AS transferred_from,st.to_actor AS transferred_to,
             st.id::text AS transfer_id,
             s.customer_name, s.customer_phone,
             s.status, s.payment_status, s.sale_type,
             COALESCE(
               (
                 SELECT CASE
                   WHEN count(DISTINCT pm.method)=1 THEN min(pm.method)
                   WHEN count(DISTINCT pm.method)>1 THEN 'mixed'
                   ELSE NULL
                 END
                 FROM aif_shop_sale_payments pm
                 WHERE pm.sale_id=s.id
                   AND abs(COALESCE(pm.amount,0)) > 0
               ),
               NULLIF(s.raw->>'paymentMethod',''),
               NULLIF(s.raw->>'payment_method','')
             ) AS payment_method,
             s.subtotal, s.discount_total, s.total, s.paid_total, s.balance_due,
             totals.item_count, totals.line_count,
             COALESCE(NULLIF(sl.product_title,''), NULLIF(sl.product_code,''), 'Ismeretlen termék') AS product_title,
             sl.product_code, sl.barcode, sl.brand_name, sl.category_name,
             COALESCE(NULLIF(sl.subcategory_name,''), NULLIF(subc.name_hu,''), NULLIF(subc.name_ro,'')) AS subcategory_name,
             sl.color_name, sl.size,
             COALESCE(
               NULLIF(sl.image_url,''),
               NULLIF(v.image_url,''),
               NULLIF(sl.raw->>'imageUrl',''),
               NULLIF(sl.raw->>'image_url','')
             ) AS image_url,
             sl.quantity, sl.list_price, sl.unit_price,
             sl.discount_amount AS line_discount_amount,
             sl.discount_percent AS line_discount_percent,
             sl.line_total
           FROM aif_shop_sales s
           JOIN aif_shop_sale_lines sl ON sl.sale_id=s.id
           LEFT JOIN aif_shop_seller_transfers st ON st.sale_line_id=sl.id
             AND st.status='accepted' AND s.sale_type='sale' AND s.status='completed'
             AND sl.quantity=st.qty AND abs(sl.line_total-st.net_total)<0.005
             AND NOT EXISTS (SELECT 1 FROM aif_shop_exchanges ex
               WHERE ex.source_sale_id=s.id AND ex.status='completed')
           LEFT JOIN aif_product_variants v ON v.id=sl.variant_id
           LEFT JOIN aif_product_models m ON m.id=v.model_id
           LEFT JOIN aif_categories subc ON subc.id=m.subcategory_id
           LEFT JOIN LATERAL (
             SELECT count(*)::int AS line_count, COALESCE(sum(x.quantity),0)::int AS item_count
             FROM aif_shop_sale_lines x
             WHERE x.sale_id=s.id
           ) totals ON true
           WHERE ${recentLineFilters.where}
           ORDER BY s.sold_at DESC, s.created_at DESC, sl.line_no ASC, sl.id ASC
           LIMIT 500`,
          recentLineFilters.args
        ),
        pool.query(
          `SELECT
             ('payment:' || p.id::text || ':' || sl.id::text) AS line_id,
             s.id AS sale_id,
             sl.line_no,
             sl.variant_id,
             s.sale_number,
             p.paid_at AS sold_at,
             s.sold_at AS original_sold_at,
             COALESCE(NULLIF(p.actor,''), s.actor) AS actor,
             s.customer_name,
             s.customer_phone,
             'completed'::text AS status,
             'paid'::text AS payment_status,
             p.method AS payment_method,
             s.sale_type,
             s.subtotal,
             s.discount_total,
             s.total,
             CASE
               WHEN allocation_stats.line_count > 0 THEN COALESCE(line_allocation.amount,0)::numeric
               WHEN active_totals.line_value_total > 0 AND sl.quantity > 0 THEN round(
                 p.amount::numeric * COALESCE(sl.line_total,0)::numeric
                 * GREATEST(sl.quantity - COALESCE(ret.returned_qty,0),0)::numeric
                 / sl.quantity::numeric / active_totals.line_value_total, 2)
               ELSE 0::numeric
             END AS paid_total,
             s.balance_due,
             CASE WHEN allocation_stats.line_count > 0 THEN allocation_stats.item_count ELSE active_totals.item_count END AS item_count,
             CASE WHEN allocation_stats.line_count > 0 THEN allocation_stats.line_count ELSE active_totals.line_count END AS line_count,
             COALESCE(NULLIF(sl.product_title,''), NULLIF(sl.product_code,''), 'Ismeretlen termék') AS product_title,
             sl.product_code,
             sl.barcode,
             sl.brand_name,
             sl.category_name,
             COALESCE(NULLIF(sl.subcategory_name,''), NULLIF(subc.name_hu,''), NULLIF(subc.name_ro,'')) AS subcategory_name,
             sl.color_name,
             sl.size,
             COALESCE(
               NULLIF(sl.image_url,''),
               NULLIF(v.image_url,''),
               NULLIF(sl.raw->>'imageUrl',''),
               NULLIF(sl.raw->>'image_url','')
             ) AS image_url,
             CASE
               WHEN allocation_stats.line_count > 0 THEN LEAST(
                 GREATEST(sl.quantity - COALESCE(ret.returned_qty,0),0),
                 COALESCE(line_allocation.quantity,0))::numeric
               ELSE GREATEST(sl.quantity - COALESCE(ret.returned_qty,0),0)::numeric
             END AS quantity,
             sl.list_price,
             sl.unit_price,
             CASE
               WHEN sl.quantity > 0
               THEN round(
                 COALESCE(sl.discount_amount,0)
                 * GREATEST(sl.quantity - COALESCE(ret.returned_qty,0),0)::numeric
                 / sl.quantity::numeric,
                 2
               )
               ELSE 0
             END AS line_discount_amount,
             sl.discount_percent AS line_discount_percent,
             CASE
               WHEN sl.quantity > 0
               THEN round(
                 COALESCE(sl.line_total,0)
                 * GREATEST(sl.quantity - COALESCE(ret.returned_qty,0),0)::numeric
                 / sl.quantity::numeric,
                 2
               )
               ELSE 0
             END AS line_total,
             'payment_settlement'::text AS record_type,
             false AS deletable,
             CASE
               WHEN allocation_stats.line_count > 0 THEN COALESCE(line_allocation.amount,0)::numeric
               WHEN active_totals.line_value_total > 0 AND sl.quantity > 0 THEN round(
                 p.amount::numeric * COALESCE(sl.line_total,0)::numeric
                 * GREATEST(sl.quantity - COALESCE(ret.returned_qty,0),0)::numeric
                 / sl.quantity::numeric / active_totals.line_value_total, 2)
               ELSE 0::numeric
             END AS settlement_amount,
             p.id AS settlement_payment_id,
             p.customer_payment_id,
             CASE WHEN allocation_stats.line_count > 0 THEN allocation_stats.line_count ELSE active_totals.line_count END AS settlement_line_count,
             allocation_stats.line_count=0 AS settlement_approximate,
             0::numeric AS stock_effect
           FROM aif_shop_sale_payments p
           JOIN aif_shop_sales s ON s.id=p.sale_id
           JOIN aif_shop_sale_lines sl ON sl.sale_id=s.id
           LEFT JOIN aif_product_variants v ON v.id=sl.variant_id
           LEFT JOIN aif_product_models m ON m.id=v.model_id
           LEFT JOIN aif_categories subc ON subc.id=m.subcategory_id
           LEFT JOIN LATERAL (
             SELECT COALESCE(sum(ex.returned_qty),0)::numeric AS returned_qty
             FROM aif_shop_exchanges ex
             WHERE ex.source_sale_line_id=sl.id
               AND ex.status='completed'
           ) ret ON true
           -- Az egyetlen kliensbefizetés több terméksorhoz is tartozhat.
           -- A soronkénti ténylegesen fizetett összeg és darabszám az allokációból jön.
           LEFT JOIN LATERAL (
             SELECT count(*)::int AS line_count,
                    COALESCE(sum(la2.quantity),0)::numeric AS item_count
             FROM aif_shop_customer_payment_line_allocations la2
             WHERE la2.customer_payment_id=p.customer_payment_id
               AND la2.sale_id=s.id
           ) allocation_stats ON true
           LEFT JOIN aif_shop_customer_payment_line_allocations line_allocation
             ON line_allocation.customer_payment_id=p.customer_payment_id
            AND line_allocation.sale_id=s.id
            AND line_allocation.sale_line_id=sl.id
           LEFT JOIN LATERAL (
             SELECT
               count(*) FILTER (
                 WHERE GREATEST(x.quantity - COALESCE(xr.returned_qty,0),0) > 0
               )::int AS line_count,
               COALESCE(sum(
                 GREATEST(x.quantity - COALESCE(xr.returned_qty,0),0)
               ) FILTER (
                 WHERE GREATEST(x.quantity - COALESCE(xr.returned_qty,0),0) > 0
               ),0)::numeric AS item_count,
               COALESCE(sum(CASE WHEN x.quantity > 0 THEN
                 COALESCE(x.line_total,0)::numeric
                 * GREATEST(x.quantity - COALESCE(xr.returned_qty,0),0)::numeric
                 / x.quantity::numeric ELSE 0::numeric END),0)::numeric AS line_value_total
             FROM aif_shop_sale_lines x
             LEFT JOIN LATERAL (
               SELECT COALESCE(sum(ex2.returned_qty),0)::numeric AS returned_qty
               FROM aif_shop_exchanges ex2
               WHERE ex2.source_sale_line_id=x.id
                 AND ex2.status='completed'
             ) xr ON true
             WHERE x.sale_id=s.id
           ) active_totals ON true
           WHERE ${settlementLineFilters.where}
             AND (allocation_stats.line_count=0 OR line_allocation.id IS NOT NULL)
           ORDER BY p.paid_at DESC, s.sale_number DESC, sl.line_no ASC, sl.id ASC
           LIMIT 500`,
          settlementLineFilters.args
        ),
        pool.query(
          `SELECT DISTINCT actor
           FROM aif_shop_sales
           WHERE location_id=$1 AND NULLIF(actor,'') IS NOT NULL
           ORDER BY actor ASC`,
          [location.id]
        ),
        pool.query(
          `SELECT DISTINCT sl.brand_name AS value
           FROM aif_shop_sale_lines sl
           JOIN aif_shop_sales s ON s.id=sl.sale_id
           WHERE s.location_id=$1 AND NULLIF(sl.brand_name,'') IS NOT NULL
           ORDER BY sl.brand_name ASC`,
          [location.id]
        ),
        pool.query(
          `SELECT DISTINCT
             COALESCE(
               NULLIF(sl.subcategory_name,''),
               NULLIF(subc.name_hu,''),
               NULLIF(subc.name_ro,'')
             ) AS value
           FROM aif_shop_sale_lines sl
           JOIN aif_shop_sales s ON s.id=sl.sale_id
           LEFT JOIN aif_product_variants v ON v.id=sl.variant_id
           LEFT JOIN aif_product_models m ON m.id=v.model_id
           LEFT JOIN aif_categories subc ON subc.id=m.subcategory_id
           WHERE s.location_id=$1
             AND COALESCE(
               NULLIF(sl.subcategory_name,''),
               NULLIF(subc.name_hu,''),
               NULLIF(subc.name_ro,'')
             ) IS NOT NULL
           ORDER BY value ASC`,
          [location.id]
        ),
        pool.query(currentExchangeSummaryQuery.sql, currentExchangeSummaryQuery.args),
        pool.query(previousExchangeSummaryQuery.sql, previousExchangeSummaryQuery.args),
        pool.query(
          `WITH filtered_exchanges AS (
             SELECT e.*
             FROM aif_shop_exchanges e
             JOIN aif_shop_sales source_sale ON source_sale.id=e.source_sale_id
             WHERE ${currentExchangeFilters.where}
               AND source_sale.sale_type <> 'credit'
           ),
           exchange_days AS (
             SELECT
               (e.created_at AT TIME ZONE 'Europe/Bucharest')::date AS day,
               COALESCE(sum(e.difference),0)::numeric AS revenue,
               count(*)::int AS transactions,
               0::numeric AS items_sold
             FROM filtered_exchanges e
             LEFT JOIN LATERAL (
               SELECT COALESCE(sum(el.quantity),0)::numeric AS replacement_qty
               FROM aif_shop_exchange_lines el
               WHERE el.exchange_id=e.id
             ) lines ON true
             GROUP BY (e.created_at AT TIME ZONE 'Europe/Bucharest')::date
           )
           SELECT
             day::text AS date,
             to_char(day,'MM.DD') AS label,
             revenue, transactions, items_sold,
             0::numeric AS discount_total,
             0::numeric AS unpaid_total
           FROM exchange_days
           ORDER BY day ASC`,
          currentExchangeFilters.args
        ),
        pool.query(
          `WITH filtered_exchanges AS (
             SELECT e.*
             FROM aif_shop_exchanges e
             JOIN aif_shop_sales source_sale ON source_sale.id=e.source_sale_id
             WHERE ${currentExchangeFilters.where}
               AND source_sale.sale_type <> 'credit'
           )
           SELECT * FROM (
             SELECT
               'replacement'::text AS impact_kind,
               e.id AS exchange_id,
               COALESCE(NULLIF(el.brand_name,''), NULLIF(b.name,''), 'Ismeretlen márka') AS brand_name,
               COALESCE(NULLIF(subc.name_hu,''), NULLIF(subc.name_ro,''), 'Nincs alkategória') AS category_name,
               COALESCE(NULLIF(el.product_title,''), NULLIF(el.product_code,''), 'Ismeretlen termék') AS product_name,
               el.product_code,
               el.line_total::numeric AS revenue,
               el.quantity::numeric AS qty
             FROM filtered_exchanges e
             JOIN aif_shop_exchange_lines el ON el.exchange_id=e.id
             LEFT JOIN aif_product_variants v ON v.id=el.variant_id
             LEFT JOIN aif_product_models m ON m.id=v.model_id
             LEFT JOIN aif_brands b ON b.id=m.brand_id
             LEFT JOIN aif_categories subc ON subc.id=m.subcategory_id

             UNION ALL

             SELECT
               'return'::text AS impact_kind,
               e.id AS exchange_id,
               COALESCE(NULLIF(src.brand_name,''), NULLIF(b.name,''), 'Ismeretlen márka') AS brand_name,
               COALESCE(NULLIF(src.subcategory_name,''), NULLIF(subc.name_hu,''), NULLIF(subc.name_ro,''), 'Nincs alkategória') AS category_name,
               COALESCE(NULLIF(src.product_title,''), NULLIF(src.product_code,''), 'Ismeretlen termék') AS product_name,
               src.product_code,
               (-e.return_credit)::numeric AS revenue,
               (-e.returned_qty)::numeric AS qty
             FROM filtered_exchanges e
             JOIN aif_shop_sale_lines src ON src.id=e.source_sale_line_id
             LEFT JOIN aif_product_variants v ON v.id=src.variant_id
             LEFT JOIN aif_product_models m ON m.id=v.model_id
             LEFT JOIN aif_brands b ON b.id=m.brand_id
             LEFT JOIN aif_categories subc ON subc.id=m.subcategory_id
           ) impacts`,
          currentExchangeFilters.args
        ),
        pool.query(
          `WITH filtered_exchanges AS (
             SELECT e.* FROM aif_shop_exchanges e WHERE ${currentExchangeFilters.where}
           )
           SELECT
             es.method,
             COALESCE(sum(CASE WHEN es.direction='in' THEN es.amount ELSE -es.amount END),0)::numeric AS amount,
             count(DISTINCT es.exchange_id)::int AS transactions
           FROM aif_shop_exchange_settlements es
           JOIN filtered_exchanges e ON e.id=es.exchange_id
           GROUP BY es.method
           ORDER BY amount DESC`,
          currentExchangeFilters.args
        ),
        pool.query(
          `WITH filtered_exchanges AS (
             SELECT e.*
             FROM aif_shop_exchanges e
             JOIN aif_shop_sales source_sale ON source_sale.id=e.source_sale_id
             WHERE ${currentExchangeFilters.where}
               AND source_sale.sale_type <> 'credit'
           )
           SELECT
             COALESCE(NULLIF(e.actor,''),'Ismeretlen') AS actor,
             COALESCE(sum(e.difference),0)::numeric AS revenue,
             count(*)::int AS transactions,
             0::numeric AS items_sold,
             0::numeric AS discount_total,
             0::numeric AS unpaid_total,
             COALESCE(avg(e.difference),0)::numeric AS average_basket
           FROM filtered_exchanges e
           LEFT JOIN LATERAL (
             SELECT COALESCE(sum(el.quantity),0)::numeric AS replacement_qty
             FROM aif_shop_exchange_lines el
             WHERE el.exchange_id=e.id
           ) lines ON true
           GROUP BY COALESCE(NULLIF(e.actor,''),'Ismeretlen')
           ORDER BY revenue DESC, transactions DESC`,
          currentExchangeFilters.args
        ),
        pool.query(
          `WITH filtered_exchanges AS (
             SELECT e.* FROM aif_shop_exchanges e WHERE ${currentExchangeFilters.where}
           )
           SELECT
             ('exchange:' || el.id::text) AS line_id,
             e.id AS sale_id,
             el.line_no,
             el.variant_id,
             e.exchange_number AS sale_number,
             e.created_at AS sold_at,
             e.actor,
             e.customer_name,
             e.customer_phone,
             'completed'::text AS status,
             'paid'::text AS payment_status,
             e.settlement_method AS payment_method,
             'exchange'::text AS sale_type,
             e.replacement_total AS subtotal,
             0::numeric AS discount_total,
             e.difference AS total,
             e.difference AS paid_total,
             0::numeric AS balance_due,
             totals.item_count,
             totals.line_count,
             COALESCE(NULLIF(el.product_title,''), NULLIF(el.product_code,''), 'Ismeretlen termék') AS product_title,
             el.product_code,
             el.barcode,
             COALESCE(NULLIF(el.brand_name,''), NULLIF(b.name,'')) AS brand_name,
             NULL::text AS category_name,
             COALESCE(NULLIF(subc.name_hu,''), NULLIF(subc.name_ro,'')) AS subcategory_name,
             el.color_name,
             el.size,
             COALESCE(NULLIF(el.image_url,''), NULLIF(v.image_url,'')) AS image_url,
             el.quantity,
             el.unit_price AS list_price,
             el.unit_price,
             0::numeric AS line_discount_amount,
             0::numeric AS line_discount_percent,
             el.line_total,
             'exchange'::text AS record_type,
             false AS deletable,
             e.id AS exchange_id,
             e.exchange_number,
             e.return_credit,
             e.replacement_total,
             e.difference AS exchange_difference,
             e.settlement_direction,
             e.settlement_method,
             e.settlement_amount
           FROM filtered_exchanges e
           JOIN aif_shop_exchange_lines el ON el.exchange_id=e.id
           LEFT JOIN aif_product_variants v ON v.id=el.variant_id
           LEFT JOIN aif_product_models m ON m.id=v.model_id
           LEFT JOIN aif_brands b ON b.id=m.brand_id
           LEFT JOIN aif_categories subc ON subc.id=m.subcategory_id
           LEFT JOIN LATERAL (
             SELECT count(*)::int AS line_count, COALESCE(sum(x.quantity),0)::int AS item_count
             FROM aif_shop_exchange_lines x
             WHERE x.exchange_id=e.id
           ) totals ON true
           ORDER BY e.created_at DESC, el.line_no ASC, el.id ASC
           LIMIT 500`,
          currentExchangeFilters.args
        ),
        pool.query(
          `SELECT DISTINCT actor
           FROM aif_shop_exchanges
           WHERE location_id=$1
             AND status='completed'
             AND NULLIF(actor,'') IS NOT NULL
           ORDER BY actor ASC`,
          [location.id]
        ),
        pool.query(
          `SELECT DISTINCT value
           FROM (
             SELECT COALESCE(NULLIF(el.brand_name,''), NULLIF(b.name,'')) AS value
             FROM aif_shop_exchange_lines el
             JOIN aif_shop_exchanges e ON e.id=el.exchange_id
             LEFT JOIN aif_product_variants v ON v.id=el.variant_id
             LEFT JOIN aif_product_models m ON m.id=v.model_id
             LEFT JOIN aif_brands b ON b.id=m.brand_id
             WHERE e.location_id=$1 AND e.status='completed'
             UNION
             SELECT COALESCE(NULLIF(src.brand_name,''), NULLIF(b.name,'')) AS value
             FROM aif_shop_exchanges e
             JOIN aif_shop_sale_lines src ON src.id=e.source_sale_line_id
             LEFT JOIN aif_product_variants v ON v.id=src.variant_id
             LEFT JOIN aif_product_models m ON m.id=v.model_id
             LEFT JOIN aif_brands b ON b.id=m.brand_id
             WHERE e.location_id=$1 AND e.status='completed'
           ) opts
           WHERE NULLIF(value,'') IS NOT NULL
           ORDER BY value ASC`,
          [location.id]
        ),
        pool.query(
          `SELECT DISTINCT value
           FROM (
             SELECT COALESCE(NULLIF(subc.name_hu,''), NULLIF(subc.name_ro,'')) AS value
             FROM aif_shop_exchange_lines el
             JOIN aif_shop_exchanges e ON e.id=el.exchange_id
             LEFT JOIN aif_product_variants v ON v.id=el.variant_id
             LEFT JOIN aif_product_models m ON m.id=v.model_id
             LEFT JOIN aif_categories subc ON subc.id=m.subcategory_id
             WHERE e.location_id=$1 AND e.status='completed'
             UNION
             SELECT COALESCE(NULLIF(src.subcategory_name,''), NULLIF(subc.name_hu,''), NULLIF(subc.name_ro,'')) AS value
             FROM aif_shop_exchanges e
             JOIN aif_shop_sale_lines src ON src.id=e.source_sale_line_id
             LEFT JOIN aif_product_variants v ON v.id=src.variant_id
             LEFT JOIN aif_product_models m ON m.id=v.model_id
             LEFT JOIN aif_categories subc ON subc.id=m.subcategory_id
             WHERE e.location_id=$1 AND e.status='completed'
           ) opts
           WHERE NULLIF(value,'') IS NOT NULL
           ORDER BY value ASC`,
          [location.id]
        ),
        // Tényleges napi hiteles elvitelek, eredeti napi árakkal és egyenlegekkel.
        // Sem készlet, sem fizetés, sem kassza nem módosul.
        pool.query(aifAdminCreditHistorySql(currentFilters.where), currentFilters.args),
        pool.query(aifAdminCreditHistorySql(previousFilters.where), previousFilters.args),
      ]);

      // Same SOURCE and algorithm as the seller's Daily Summary, not a
      // recalculation from the displayed (possibly discounted) current rows.
      const [currentReceiptDiscounts, previousReceiptDiscounts] = await Promise.all([
        aifReadSettledGrossDiscounts(pool, currentPaymentFilters.where, currentPaymentFilters.args),
        aifReadSettledGrossDiscounts(pool, previousPaymentFilters.where, previousPaymentFilters.args),
      ]);

      const currentCreditHistory = aifAdminBuildCreditHistory(
        currentCreditHistoryResult.rows, aifBuildDailyCreditHistory);
      const previousCreditHistory = aifAdminBuildCreditHistory(
        previousCreditHistoryResult.rows, aifBuildDailyCreditHistory);

      const combineSummaryRows = (saleRow = {}, exchangeRow = {}) => {
        const revenue = aifNumber(saleRow.revenue) + aifNumber(exchangeRow.revenue);
        const transactions = aifNumber(saleRow.transactions) + aifNumber(exchangeRow.transactions);
        return {
          ...saleRow,
          revenue,
          net_revenue: aifNumber(saleRow.net_revenue) + aifNumber(exchangeRow.net_revenue),
          sales_before_discount: aifNumber(saleRow.sales_before_discount) + aifNumber(exchangeRow.sales_before_discount),
          discount_total: aifNumber(saleRow.discount_total) + aifNumber(exchangeRow.discount_total),
          paid_total: aifNumber(saleRow.paid_total) + aifNumber(exchangeRow.paid_total),
          unpaid_total: aifNumber(saleRow.unpaid_total) + aifNumber(exchangeRow.unpaid_total),
          unpaid_sales: aifNumber(saleRow.unpaid_sales) + aifNumber(exchangeRow.unpaid_sales),
          credit_sales: aifNumber(saleRow.credit_sales) + aifNumber(exchangeRow.credit_sales),
          items_sold: aifNumber(saleRow.items_sold) + aifNumber(exchangeRow.items_sold),
          estimated_cost: aifNumber(saleRow.estimated_cost) + aifNumber(exchangeRow.estimated_cost),
          cost_snapshot_qty: aifNumber(saleRow.cost_snapshot_qty) + aifNumber(exchangeRow.cost_snapshot_qty),
          cost_fallback_qty: aifNumber(saleRow.cost_fallback_qty) + aifNumber(exchangeRow.cost_fallback_qty),
          cost_missing_qty: aifNumber(saleRow.cost_missing_qty) + aifNumber(exchangeRow.cost_missing_qty),
          average_basket: transactions > 0 ? revenue / transactions : 0,
          transactions,
          cancelled_sales: aifNumber(saleRow.cancelled_sales) + aifNumber(exchangeRow.cancelled_sales),
          refunded_sales: aifNumber(saleRow.refunded_sales) + aifNumber(exchangeRow.refunded_sales),
        };
      };

      const mapSummary = (row = {}) => {
        const mapped = aifMapShopSummary(row);
        const revenue = aifNumber(row.revenue);
        const netRevenue = aifNumber(row.net_revenue);
        const estimatedCost = aifNumber(row.estimated_cost);
        const grossProfit = netRevenue - estimatedCost;
        const costSnapshotQty = aifNumber(row.cost_snapshot_qty);
        const costFallbackQty = aifNumber(row.cost_fallback_qty);
        const costMissingQty = aifNumber(row.cost_missing_qty);
        const costCoveredQty = costSnapshotQty + costFallbackQty;
        const costTotalQty = costCoveredQty + costMissingQty;

        return {
          ...mapped,
          netRevenue,
          tvaAmount: revenue - netRevenue,
          estimatedCost,
          grossProfit,
          grossMargin: netRevenue !== 0 ? grossProfit / netRevenue * 100 : 0,
          costSnapshotQty,
          costFallbackQty,
          costMissingQty,
          costCoveragePercent: costTotalQty > 0 ? costCoveredQty / costTotalQty * 100 : 100,
          salesTvaRate,
          sellPriceIncludesTva,
          exchangeRevenue: aifNumber(row.exchange_revenue),
          exchangeTransactions: aifNumber(row.exchange_transactions),
        };
      };

      const currentCombinedRow = combineSummaryRows(summaryResult.rows[0] || {}, exchangeSummaryResult.rows[0] || {});
      currentCombinedRow.exchange_revenue = aifNumber(exchangeSummaryResult.rows[0]?.revenue);
      currentCombinedRow.exchange_transactions = aifNumber(exchangeSummaryResult.rows[0]?.transactions);
      // A "Fizetve" érték pénzmozgás, ezért nem az adott napon eladott tételek
      // s.paid_total snapshotjából számoljuk. A tényleges, kiválasztott időszakban
      // beérkezett sale-payment összegeket használjuk p.paid_at szerint.
      // Ugyanez az összeg lesz a vezetői Forgalom alapja is: nyitott hitel = 0 forgalom,
      // későbbi tényleges befizetés = forgalom a befizetés napján.
      currentCombinedRow.paid_total =
        paymentResult.rows.reduce((sum, row) => sum + aifNumber(row.amount), 0)
        + aifNumber(exchangeSummaryResult.rows[0]?.paid_total);

      const previousCombinedRow = combineSummaryRows(previousSummaryResult.rows[0] || {}, previousExchangeSummaryResult.rows[0] || {});
      previousCombinedRow.exchange_revenue = aifNumber(previousExchangeSummaryResult.rows[0]?.revenue);
      previousCombinedRow.exchange_transactions = aifNumber(previousExchangeSummaryResult.rows[0]?.transactions);
      previousCombinedRow.paid_total =
        previousPaymentResult.rows.reduce((sum, row) => sum + aifNumber(row.amount), 0)
        + aifNumber(previousExchangeSummaryResult.rows[0]?.paid_total);

      const summary = mapSummary(currentCombinedRow);
      const previousSummary = mapSummary(previousCombinedRow);
      const roundMoney = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
      const applyHistory = (target, cohort) => {
        const live = aifNumber(target.unpaidTotal);
        const liveCount = aifNumber(target.unpaidSales);
        // The existing SQL includes today's outstanding credit. Replace ONLY
        // that cohort with its status at the sale-day end; do not double count it.
        target.currentUnpaidTotal = roundMoney(live);
        target.currentUnpaidSales = liveCount;
        target.unpaidTotal = roundMoney(Math.max(0, live - cohort.currentUnpaidTotal + cohort.unpaidTotal));
        target.unpaidSales = Math.max(0, liveCount - cohort.currentUnpaidSales + cohort.unpaidSales);
        target.historicalCreditTotal = cohort.unpaidTotal;
        target.historicalCreditSales = cohort.creditSales;
        target.historicalCreditItems = cohort.creditItems;
      };
      applyHistory(summary, currentCreditHistory);
      applyHistory(previousSummary, previousCreditHistory);

      // Forgalom = ténylegesen realizált pénzmozgás.
      // A hitelbe kiadott áru addig NEM forgalom, amíg nincs tényleges befizetés.
      // Amikor a tartozást később rendezik, a befizetés napján válik forgalommá.
      // Így a vezetői "Forgalom" és "Fizetve" ugyanazt a realizált összeget mutatja,
      // miközben a nyitott hitel továbbra is csak Kintlévőség marad.
      summary.revenue = aifNumber(currentCombinedRow.paid_total);
      previousSummary.revenue = aifNumber(previousCombinedRow.paid_total);

      // Employee cards are personnel attribution. Store totals stay immutable.
      // A corrected line is moved with its actual net, pre-discount value, discount,
      // payment method and cost. This is never booked again as physical revenue.
      function adjustPersonalSummary(target,transfers,person){
        if(!person || !transfers.length) return;
        let net=0,gross=0,discount=0,qty=0,netExVat=0,cost=0;
        let snapshotQty=0,fallbackQty=0,missingQty=0;
        for(const t of transfers){
          const sign=sameSeller(t.to_actor,person)?1:sameSeller(t.from_actor,person)?-1:0;
          if(!sign)continue;
          net+=sign*Number(t.net_total||0);
          gross+=sign*Number(t.list_total||0);
          discount+=sign*Number(t.discount_total||0);
          qty+=sign*Number(t.qty||0);
          netExVat+=sign*effectiveVatNet(t);
          cost+=sign*Number(t.line_cost||0);
          if(t.cost_snapshot===true)snapshotQty+=sign*Number(t.qty||0);
          else if(t.cost_fallback===true)fallbackQty+=sign*Number(t.qty||0);
          else if(t.cost_missing===true)missingQty+=sign*Number(t.qty||0);
        }
        target.revenue=roundSellerMoney(Number(target.revenue||0)+net);
        target.paidTotal=roundSellerMoney(Number(target.paidTotal||0)+net);
        target.itemsSold=Number(target.itemsSold||0)+qty;
        target.transactions=Number(target.transactions||0)+transactionChangeFor(transfers,person);
        target.discountTotal=roundSellerMoney(Number(target.discountTotal||0)+discount);
        target.netRevenue=roundSellerMoney(Number(target.netRevenue||0)+netExVat);
        target.tvaAmount=roundSellerMoney(Number(target.tvaAmount||0)+net-netExVat);
        target.estimatedCost=roundSellerMoney(Number(target.estimatedCost||0)+cost);
        target.grossProfit=roundSellerMoney(Number(target.netRevenue||0)-Number(target.estimatedCost||0));
        target.grossMargin=Number(target.netRevenue||0)?target.grossProfit/target.netRevenue*100:0;
        target.costSnapshotQty=Number(target.costSnapshotQty||0)+snapshotQty;
        target.costFallbackQty=Number(target.costFallbackQty||0)+fallbackQty;
        target.costMissingQty=Number(target.costMissingQty||0)+missingQty;
        const covered=target.costSnapshotQty+target.costFallbackQty;
        target.costCoveragePercent=covered+target.costMissingQty>0?covered/(covered+target.costMissingQty)*100:100;
        target.averageBasket=target.transactions>0?roundSellerMoney(target.revenue/target.transactions):0;
        // Rebuilt below from actual attributed money + collected discount.
        target.salesBeforeDiscount=roundSellerMoney(Number(target.revenue||0)+Number(target.discountTotal||0));
      }
      // Later, discounted credit payments are counted as cash ONLY at their
      // paid amount. Their original sticker-price difference goes to discount,
      // not to extra income and never backdated to the original issue day.
      summary.settlementDiscountTotal = currentReceiptDiscounts.total;
      previousSummary.settlementDiscountTotal = previousReceiptDiscounts.total;
      summary.discountTotal = roundMoney(summary.discountTotal + currentReceiptDiscounts.total);
      previousSummary.discountTotal = roundMoney(previousSummary.discountTotal + previousReceiptDiscounts.total);

      // Bruttó forgalom a dashboardon ugyanazon realizált forgalmi alapon:
      // kedvezmény nélküli eladási érték = tényleges forgalom + adott időszaki kedvezmény.
      // Így a kártya nem keveri a sale-dátum szerinti subtotal-t a payment-dátum szerinti
      // Forgalommal (pl. korábbi hitel későbbi rendezése esetén).
      summary.salesBeforeDiscount = aifNumber(summary.revenue) + aifNumber(summary.discountTotal);
      previousSummary.salesBeforeDiscount = aifNumber(previousSummary.revenue) + aifNumber(previousSummary.discountTotal);

      if(employee) {
        adjustPersonalSummary(summary,currentSellerTransfers,employee);
        adjustPersonalSummary(previousSummary,previousSellerTransfers,employee);
      }

      const mergeRankingRows = (saleRows, exchangeRows, nameKey, productCodeKey = null) => {
        const map = new Map();
        for (const row of saleRows || []) {
          const name = String(row.name || "Ismeretlen").trim() || "Ismeretlen";
          const key = name.toLocaleLowerCase("hu-HU");
          map.set(key, {
            name,
            revenue: aifNumber(row.revenue),
            qty: aifNumber(row.qty),
            transactions: aifNumber(row.transactions),
            product_code: row.product_code || null,
          });
        }
        const exchangeGroups = new Map();
        for (const row of exchangeRows || []) {
          const name = String(row[nameKey] || "Ismeretlen").trim() || "Ismeretlen";
          const key = name.toLocaleLowerCase("hu-HU");
          const group = exchangeGroups.get(key) || {
            name,
            revenue: 0,
            qty: 0,
            transactions: new Set(),
            product_code: productCodeKey ? (row[productCodeKey] || null) : null,
          };
          group.revenue += aifNumber(row.revenue);
          group.qty += aifNumber(row.qty);
          if (row.exchange_id) group.transactions.add(String(row.exchange_id));
          if (!group.product_code && productCodeKey && row[productCodeKey]) group.product_code = row[productCodeKey];
          exchangeGroups.set(key, group);
        }
        for (const [key, group] of exchangeGroups.entries()) {
          const current = map.get(key) || { name: group.name, revenue: 0, qty: 0, transactions: 0, product_code: group.product_code };
          current.revenue += group.revenue;
          current.qty += group.qty;
          current.transactions += group.transactions.size;
          if (!current.product_code && group.product_code) current.product_code = group.product_code;
          map.set(key, current);
        }
        const rows = Array.from(map.values())
          .filter((row) => Math.abs(row.revenue) > 0.005 || Math.abs(row.qty) > 0.0001 || row.transactions > 0)
          .sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || a.name.localeCompare(b.name, "hu"))
          .slice(0, 12);
        const totalAbsRevenue = rows.reduce((sum, row) => sum + Math.abs(aifNumber(row.revenue)), 0);
        return rows.map((row) => ({
          name: row.name,
          revenue: aifNumber(row.revenue),
          qty: aifNumber(row.qty),
          transactions: aifNumber(row.transactions),
          productCode: row.product_code || null,
          share: totalAbsRevenue > 0 ? Math.abs(aifNumber(row.revenue)) / totalAbsRevenue * 100 : 0,
        }));
      };

      const trendMap = new Map();
      for (const row of [...trendResult.rows, ...paymentTrendResult.rows, ...exchangeTrendResult.rows]) {
        const key = String(row.date);
        const current = trendMap.get(key) || {
          date: key,
          label: row.label,
          revenue: 0,
          transactions: 0,
          itemsSold: 0,
          discountTotal: 0,
          unpaidTotal: 0,
        };
        current.revenue += aifNumber(row.revenue);
        current.transactions += aifNumber(row.transactions);
        current.itemsSold += aifNumber(row.items_sold);
        current.discountTotal += aifNumber(row.discount_total);
        current.unpaidTotal += aifNumber(row.unpaid_total);
        trendMap.set(key, current);
      }
      for (const sale of currentCreditHistory.sales) {
        const day = String(sale.history_date || '');
        const point = trendMap.get(day);
        if (!point) continue;
        point.unpaidTotal = roundMoney(Math.max(0,
          point.unpaidTotal - aifNumber(sale.current_balance_due) + aifNumber(sale.balance_due)));
      }
      const trend = Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date));

      // The daily discount trend follows the same settlement-day allocation.
      for (const receipt of currentReceiptDiscounts.rows) {
        const point = trendMap.get(receipt.date);
        if (point) point.discountTotal = roundMoney(point.discountTotal + receipt.discount);
      }

      if(employee){
        const transactionDeltaByDay=new Map();
        for(const t of currentSellerTransfers){
          const sign=sameSeller(t.to_actor,employee)?1:sameSeller(t.from_actor,employee)?-1:0;
          if(!sign)continue;
          const point=trendMap.get(t.sale_day);
          if(!point)continue;
          point.revenue=roundSellerMoney(point.revenue+sign*Number(t.net_total||0));
          point.itemsSold+=sign*Number(t.qty||0);
          point.discountTotal=roundSellerMoney(point.discountTotal+sign*Number(t.discount_total||0));
          if(!transactionDeltaByDay.has(t.sale_day))transactionDeltaByDay.set(t.sale_day,[]);
          transactionDeltaByDay.get(t.sale_day).push(t);
        }
        for(const [day,rows] of transactionDeltaByDay){
          const point=trendMap.get(day);
          if(point)point.transactions+=transactionChangeFor(rows,employee);
        }
      }

      const paymentMap = new Map();
      for (const row of [...paymentResult.rows, ...exchangePaymentResult.rows]) {
        const method = String(row.method || "");
        if (!method) continue;
        const current = paymentMap.get(method) || { method, amount: 0, transactions: 0 };
        current.amount += aifNumber(row.amount);
        current.transactions += aifNumber(row.transactions);
        paymentMap.set(method, current);
      }
      if(employee){
        const methodsBySale=new Map();
        for(const t of currentSellerTransfers){
          const sign=sameSeller(t.to_actor,employee)?1:sameSeller(t.from_actor,employee)?-1:0;
          if(!sign)continue;
          const method=String(t.payment_method||'');
          const entry=paymentMap.get(method)||{method,amount:0,transactions:0};
          entry.amount=roundSellerMoney(entry.amount+sign*Number(t.net_total||0));
          paymentMap.set(method,entry);
          if(!methodsBySale.has(t.sale_id))methodsBySale.set(t.sale_id,method);
        }
        const transactionGroups=new Map();
        for(const t of currentSellerTransfers){
          if(!transactionGroups.has(t.sale_id))transactionGroups.set(t.sale_id,[]);
          transactionGroups.get(t.sale_id).push(t);
        }
        for(const group of transactionGroups.values()){
          const delta=transactionChangeFor(group,employee);
          if(!delta)continue;
          const method=String(group[0].payment_method||'');
          const entry=paymentMap.get(method)||{method,amount:0,transactions:0};
          entry.transactions+=delta;
          paymentMap.set(method,entry);
        }
      }
      const paymentRows = Array.from(paymentMap.values()).sort((a, b) => b.amount - a.amount);
      const totalPaymentAbs = paymentRows.reduce((sum, row) => sum + Math.abs(row.amount), 0);

      const employeeMap = new Map();
      for (const row of [...employeeResult.rows, ...exchangeEmployeeResult.rows]) {
        const actorName = String(row.actor || "Ismeretlen");
        const key = actorName.toLocaleLowerCase("hu-HU");
        const current = employeeMap.get(key) || {
          actor: actorName,
          revenue: 0,
          transactions: 0,
          itemsSold: 0,
          discountTotal: 0,
          unpaidTotal: 0,
        };
        current.revenue += aifNumber(row.revenue);
        current.transactions += aifNumber(row.transactions);
        current.itemsSold += aifNumber(row.items_sold);
        current.discountTotal += aifNumber(row.discount_total);
        current.unpaidTotal += aifNumber(row.unpaid_total);
        employeeMap.set(key, current);
      }
      // Include the discount on settled older credit lines under the cashier
      // who received the payment; do not alter sale/stock ownership.
      for (const receipt of currentReceiptDiscounts.rows) {
        const key = String(receipt.actor || 'Ismeretlen').toLocaleLowerCase('hu-HU');
        const entry = employeeMap.get(key);
        if (entry) entry.discountTotal = roundMoney(entry.discountTotal + receipt.discount);
      }
      for (const sale of currentCreditHistory.sales) {
        const actorName = String(sale.actor || 'Ismeretlen');
        const entry = employeeMap.get(actorName.toLocaleLowerCase('hu-HU'));
        if (!entry) continue;
        entry.unpaidTotal = roundMoney(Math.max(0,
          entry.unpaidTotal - aifNumber(sale.current_balance_due) + aifNumber(sale.balance_due)));
      }
      // All sellers are shown by the *effective* owner of the sold lines.
      // Each multi-product original receipt remains one original transaction
      // unless every item moved away, and one per recipient of that receipt.
      for(const t of currentSellerTransfers){
        for(const [name,sign] of [[t.from_actor,-1],[t.to_actor,1]]){
          if(employee&&!sameSeller(name,employee))continue;
          const key=sellerKey(name);
          const row=employeeMap.get(key)||{
            actor:name,revenue:0,transactions:0,itemsSold:0,discountTotal:0,unpaidTotal:0,
          };
          row.revenue=roundSellerMoney(row.revenue+sign*Number(t.net_total||0));
          row.itemsSold+=sign*Number(t.qty||0);
          row.discountTotal=roundSellerMoney(row.discountTotal+sign*Number(t.discount_total||0));
          employeeMap.set(key,row);
        }
      }
      const employeeTransactionDeltas=transferTransactionChanges(currentSellerTransfers);
      for(const [key,delta] of employeeTransactionDeltas){
        const row=employeeMap.get(key);
        if(row)row.transactions+=delta;
      }
      const employees = Array.from(employeeMap.values())
        .map((row) => ({
          ...row,
          averageBasket: row.transactions > 0 ? row.revenue / row.transactions : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue || b.transactions - a.transactions);

      const mapRecentRow = (row) => ({
        id: String(row.line_id),
        lineId: String(row.line_id),
        saleId: String(row.sale_id),
        lineNo: aifNumber(row.line_no),
        variantId: row.variant_id ? String(row.variant_id) : null,
        saleNumber: row.sale_number,
        soldAt: row.sold_at ? new Date(row.sold_at).toISOString() : null,
        originalSoldAt: row.original_sold_at ? new Date(row.original_sold_at).toISOString() : null,
        actor: row.actor,
        originalActor: row.original_actor || row.actor,
        transferredFrom: row.transferred_from || null,
        transferredTo: row.transferred_to || null,
        transferId: row.transfer_id ? String(row.transfer_id) : null,
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        status: row.status,
        paymentStatus: row.payment_status,
        paymentMethod: row.payment_method || row.settlement_method || null,
        saleType: row.sale_type,
        subtotal: aifNumber(row.subtotal),
        discountTotal: aifNumber(row.discount_total),
        total: aifNumber(row.total),
        paidTotal: aifNumber(row.paid_total),
        balanceDue: aifNumber(row.balance_due),
        itemCount: aifNumber(row.item_count),
        lineCount: aifNumber(row.line_count),
        productTitle: row.product_title || null,
        productCode: row.product_code || null,
        barcode: row.barcode || null,
        brandName: row.brand_name || null,
        categoryName: row.category_name || null,
        subcategoryName: row.subcategory_name || null,
        colorName: row.color_name || null,
        size: row.size || null,
        imageUrl: row.image_url || null,
        quantity: aifNumber(row.quantity),
        listPrice: aifNumber(row.list_price),
        unitPrice: aifNumber(row.unit_price),
        lineDiscountAmount: aifNumber(row.line_discount_amount),
        lineDiscountPercent: aifNumber(row.line_discount_percent),
        lineTotal: aifNumber(row.line_total),
        recordType: row.record_type || "sale",
        deletable: row.deletable === undefined || row.deletable === null ? true : Boolean(row.deletable),
        exchangeId: row.exchange_id ? String(row.exchange_id) : null,
        exchangeNumber: row.exchange_number || null,
        returnCredit: aifNumber(row.return_credit),
        replacementTotal: aifNumber(row.replacement_total),
        exchangeDifference: aifNumber(row.exchange_difference),
        settlementDirection: row.settlement_direction || null,
        settlementMethod: row.settlement_method || null,
        settlementAmount: aifNumber(row.settlement_amount),
        settlementPaymentId: row.settlement_payment_id ? String(row.settlement_payment_id) : null,
        customerPaymentId: row.customer_payment_id ? String(row.customer_payment_id) : null,
        settlementLineCount: aifNumber(row.settlement_line_count),
        settlementApproximate: row.settlement_approximate === true,
        stockEffect: aifNumber(row.stock_effect),
      });

      const historySalesById = new Map(currentCreditHistory.sales.map((s) => [String(s.id), s]));
      const historyLinesById = new Map(currentCreditHistory.productLines.map((l) => [String(l.line_id), l]));
      const mapCurrentSaleRow = (row) => {
        if (String(row.sale_type || '') !== 'credit') {
          return mapRecentRow({ ...row, record_type: 'sale', deletable: true });
        }
        const h = historyLinesById.get(String(row.line_id));
        const hs = historySalesById.get(String(row.sale_id));
        if (!h || !hs) {
          // Fail visibly instead of silently presenting a later, discounted price.
          return { ...mapRecentRow({ ...row, record_type: 'sale', deletable: false }),
            historyComplete: false, historyWarning: 'Hiányzó történeti terméksor',
            dailyCategory: 'credit' };
        }
        return {
          ...mapRecentRow({ ...row, record_type: 'sale', deletable: true }),
          paymentStatus: hs.payment_status,
          balanceDue: aifNumber(hs.balance_due),
          subtotal: aifNumber(hs.subtotal),
          discountTotal: aifNumber(hs.discount_total),
          total: aifNumber(hs.total),
          paidTotal: aifNumber(hs.paid_total),
          itemCount: aifNumber(hs.item_count),
          lineCount: aifNumber(hs.line_count),
          quantity: aifNumber(h.qty),
          listPrice: aifNumber(h.list_price),
          unitPrice: aifNumber(h.unit_price),
          lineDiscountAmount: aifNumber(h.discount_total),
          lineDiscountPercent: aifNumber(h.discount_percent),
          lineTotal: aifNumber(h.net_total),
          dailyCategory: 'credit',
          historyDate: h.history_date,
          historyComplete: h.history_complete !== false,
          currentBalanceDue: aifNumber(h.current_balance_due),
          currentPaymentStatus: h.current_payment_status,
          returnedLaterQty: aifNumber(h.returned_later_qty),
          returnedLaterAt: h.returned_later_at || null,
          paidLaterAt: h.paid_later_at || null,
        };
      };
      const recentSales = [
        ...recentResult.rows.map(mapCurrentSaleRow),
        ...settlementRecentResult.rows.map(mapRecentRow),
        ...exchangeRecentResult.rows.map(mapRecentRow),
      ]
        .sort((a, b) => new Date(b.soldAt || 0).getTime() - new Date(a.soldAt || 0).getTime() || a.lineNo - b.lineNo)
        .slice(0, 500);

      const uniqueTextOptions = (...groups) => Array.from(new Set(
        groups.flat().map((value) => String(value || "").trim()).filter(Boolean)
      )).sort((a, b) => a.localeCompare(b, "hu"));

      function adjustPersonalRanking(rows,getName,withProductCode=false) {
        if(!employee)return rows;
        const map=new Map(rows.map(r=>[String(r.name||'').toLocaleLowerCase('hu-HU'),{...r}]));
        for(const t of currentSellerTransfers){
          const sign=sameSeller(t.to_actor,employee)?1:sameSeller(t.from_actor,employee)?-1:0;
          if(!sign)continue;
          const name=String(getName(t)||'Ismeretlen');
          const key=name.toLocaleLowerCase('hu-HU');
          const item=map.get(key)||{name,revenue:0,qty:0,transactions:0,productCode:withProductCode?(t.product_code||null):null};
          item.revenue=roundSellerMoney(item.revenue+sign*Number(t.net_total||0));
          item.qty+=sign*Number(t.qty||0);
          map.set(key,item);
        }
        const values=Array.from(map.values())
          .filter(row=>Math.abs(Number(row.revenue||0))>0.005||Math.abs(Number(row.qty||0))>0.0001||Number(row.transactions||0)>0)
          .sort((a,b)=>b.revenue-a.revenue||b.qty-a.qty||a.name.localeCompare(b.name,'hu'))
          .slice(0,12);
        const whole=values.reduce((n,row)=>n+Math.abs(Number(row.revenue||0)),0);
        return values.map(row=>({...row,share:whole?Math.abs(row.revenue)/whole*100:0}));
      }
      const brands=adjustPersonalRanking(
        mergeRankingRows(brandResult.rows,exchangeImpactResult.rows,'brand_name'),
        t=>t.brand_name||'Ismeretlen márka');
      const categories=adjustPersonalRanking(
        mergeRankingRows(categoryResult.rows,exchangeImpactResult.rows,'category_name'),
        t=>t.category_name||'Nincs alkategória');
      const products=adjustPersonalRanking(
        mergeRankingRows(productResult.rows,exchangeImpactResult.rows,'product_name','product_code'),
        t=>t.product_title||t.product_code||'Ismeretlen termék',true);

      res.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        location: {
          id: String(location.id),
          code: location.code,
          name: location.name,
        },
        period: { from, to, previousFrom, previousTo, days },
        salesTva: {
          rate: salesTvaRate,
          priceIncludesTva: sellPriceIncludesTva,
        },
        summary,
        previousSummary,
        history: {
          version: 'daily-credit-20261022', basis: 'sale_day_end',
          complete: currentCreditHistory.warnings.length === 0,
          warnings: currentCreditHistory.warnings,
          historicalCreditTotal: currentCreditHistory.unpaidTotal,
          currentCreditTotal: currentCreditHistory.currentUnpaidTotal,
          creditSales: currentCreditHistory.creditSales,
          creditLines: currentCreditHistory.creditLineCount,
          creditItems: currentCreditHistory.creditItems,
        },
        stockSnapshot: {
          asOfDate: stockSnapshotDate,
          variantCount: aifNumber(stockResult.rows[0]?.variant_count),
          totalQty: aifNumber(stockResult.rows[0]?.total_qty),
          reservedQty: aifNumber(stockResult.rows[0]?.reserved_qty),
          availableQty: aifNumber(stockResult.rows[0]?.available_qty),
          retailValue: aifNumber(stockResult.rows[0]?.retail_value),
          lowStockVariants: aifNumber(stockResult.rows[0]?.low_stock_variants),
        },
        movementSummary: {
          movementCount: aifNumber(movementResult.rows[0]?.movement_count),
          distinctVariants: aifNumber(movementResult.rows[0]?.distinct_variants),
          incomingQty: aifNumber(movementResult.rows[0]?.incoming_qty),
          outgoingQty: aifNumber(movementResult.rows[0]?.outgoing_qty),
          netQty: aifNumber(movementResult.rows[0]?.net_qty),
        },
        trend,
        brands,
        categories,
        products,
        payments: paymentRows.map((row) => ({
          method: row.method,
          label: aifPaymentMethodLabel(row.method),
          amount: aifNumber(row.amount),
          transactions: aifNumber(row.transactions),
          share: totalPaymentAbs > 0 ? Math.abs(aifNumber(row.amount)) / totalPaymentAbs * 100 : 0,
        })),
        employees,
        recentSales,
        filterOptions: {
          employees: uniqueTextOptions(
            employeesOptionResult.rows.map((row) => row.actor),
            exchangeEmployeesOptionResult.rows.map((row) => row.actor),
            sellerTransferRows.flatMap(t=>[t.from_actor,t.to_actor]),
          ),
          brands: uniqueTextOptions(
            brandsOptionResult.rows.map((row) => row.value),
            exchangeBrandsOptionResult.rows.map((row) => row.value),
          ),
          categories: uniqueTextOptions(
            categoriesOptionResult.rows.map((row) => row.value),
            exchangeCategoriesOptionResult.rows.map((row) => row.value),
          ),
        },
      });
    } catch (error) {
      console.error("AIF admin shop overview failed", error);
      res.status(500).json({
        error: error?.message || "Az üzleti vezérlőpult nem tölthető be.",
        code: error?.code || null,
      });
    }
  });

  return router;
}
