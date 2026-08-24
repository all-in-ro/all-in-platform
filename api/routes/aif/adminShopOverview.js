import express from "express";

// Admin üzleti vezérlőpult: forgalom, készletpillanat, rangsorok, eladási napló.
export default function createAifAdminShopOverviewRouter(deps) {
  const {
    pool, requireAdminOrSecret, ensureAifShopSalesSchema, text, normCode,
    aifNumber, aifBucharestIsoDate, aifValidIsoDate, aifInclusiveDayCount,
    aifShiftIsoDate, aifMapShopSummary, aifPaymentMethodLabel,
    readSalesTvaSettings,
  } = deps;
  const router = express.Router();

  router.get("/overview", requireAdminOrSecret, async (req, res) => {
    try {
      await ensureAifShopSalesSchema();

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
      const paymentStatus = normCode(req.query.paymentStatus || req.query.payment_status);
      const saleType = normCode(req.query.saleType || req.query.sale_type);
      const brand = text(req.query.brand);
      const category = text(req.query.category);
      const snCod = text(req.query.snCod || req.query.sn_cod);
      const search = text(req.query.search || req.query.q);

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
        if (paymentStatus) {
          const p = push(paymentStatus);
          where.push(`s.payment_status=${p}`);
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
          count(*) FILTER (WHERE fs.status='completed')::int AS transactions,
          COALESCE(sum(fs.total) FILTER (WHERE fs.status='completed'),0)::numeric AS revenue,
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
          ) FILTER (WHERE fs.status='completed'),0)::numeric AS net_revenue,
          COALESCE(sum(fs.subtotal) FILTER (WHERE fs.status='completed'),0)::numeric AS sales_before_discount,
          COALESCE(sum(fs.discount_total) FILTER (WHERE fs.status='completed'),0)::numeric AS discount_total,
          COALESCE(sum(fs.paid_total) FILTER (WHERE fs.status='completed'),0)::numeric AS paid_total,
          COALESCE(sum(fs.balance_due) FILTER (WHERE fs.status='completed'),0)::numeric AS unpaid_total,
          count(*) FILTER (
            WHERE fs.status='completed' AND fs.balance_due > 0
          )::int AS unpaid_sales,
          count(*) FILTER (
            WHERE fs.status='completed' AND (fs.payment_status='credit' OR fs.sale_type='credit')
          )::int AS credit_sales,
          COALESCE(sum(lt.items_sold) FILTER (WHERE fs.status='completed'),0)::numeric AS items_sold,
          COALESCE(sum(lt.estimated_cost) FILTER (WHERE fs.status='completed'),0)::numeric AS estimated_cost,
          COALESCE(sum(lt.cost_snapshot_qty) FILTER (WHERE fs.status='completed'),0)::numeric AS cost_snapshot_qty,
          COALESCE(sum(lt.cost_fallback_qty) FILTER (WHERE fs.status='completed'),0)::numeric AS cost_fallback_qty,
          COALESCE(sum(lt.cost_missing_qty) FILTER (WHERE fs.status='completed'),0)::numeric AS cost_missing_qty,
          COALESCE(avg(fs.total) FILTER (WHERE fs.status='completed'),0)::numeric AS average_basket,
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
          WHERE ${where}
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
          COALESCE(sum(replacement_qty - returned_qty),0)::numeric AS items_sold,
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

      const currentFilters = buildFilters(from, to);
      const previousFilters = buildFilters(previousFrom, previousTo);
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
          where.push(`s.actor=${p}`);
        }
        if (paymentStatus) {
          const p = push(paymentStatus);
          where.push(`s.payment_status=${p}`);
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
        employeeResult,
        recentResult,
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
      ] = await Promise.all([
        pool.query(
          `SELECT
             count(*) FILTER (WHERE s.qty > 0)::int AS variant_count,
             COALESCE(sum(s.qty),0)::numeric AS total_qty,
             COALESCE(sum(s.reserved_qty),0)::numeric AS reserved_qty,
             COALESCE(sum(s.qty - s.reserved_qty),0)::numeric AS available_qty,
             COALESCE(sum((s.qty - s.reserved_qty) * COALESCE(v.sell_price,0)),0)::numeric AS retail_value,
             count(*) FILTER (WHERE (s.qty - s.reserved_qty) > 0 AND (s.qty - s.reserved_qty) <= 2)::int AS low_stock_variants
           FROM aif_stock s
           JOIN aif_product_variants v ON v.id=s.variant_id
           WHERE s.location_id=$1`,
          [location.id]
        ),
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
             COALESCE(sum(fs.total) FILTER (WHERE fs.status='completed'),0)::numeric AS revenue,
             count(fs.id) FILTER (WHERE fs.status='completed')::int AS transactions,
             COALESCE(sum(lt.items_sold) FILTER (WHERE fs.status='completed'),0)::numeric AS items_sold,
             COALESCE(sum(fs.discount_total) FILTER (WHERE fs.status='completed'),0)::numeric AS discount_total,
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
           GROUP BY COALESCE(NULLIF(sl.product_title,''),NULLIF(sl.product_code,''),'Ismeretlen termék')
           ORDER BY revenue DESC, qty DESC
           LIMIT 12`,
          currentFilters.args
        ),
        pool.query(
          `WITH filtered_sales AS (
             SELECT s.* FROM aif_shop_sales s WHERE ${currentFilters.where}
           )
           SELECT
             p.method,
             COALESCE(sum(p.amount),0)::numeric AS amount,
             count(DISTINCT p.sale_id)::int AS transactions
           FROM aif_shop_sale_payments p
           JOIN filtered_sales fs ON fs.id=p.sale_id
           WHERE fs.status='completed'
           GROUP BY p.method
           ORDER BY amount DESC`,
          currentFilters.args
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
             COALESCE(sum(fs.total) FILTER (WHERE fs.status='completed'),0)::numeric AS revenue,
             count(*) FILTER (WHERE fs.status='completed')::int AS transactions,
             COALESCE(sum(lt.items_sold) FILTER (WHERE fs.status='completed'),0)::numeric AS items_sold,
             COALESCE(sum(fs.discount_total) FILTER (WHERE fs.status='completed'),0)::numeric AS discount_total,
             COALESCE(sum(fs.balance_due) FILTER (WHERE fs.status='completed'),0)::numeric AS unpaid_total,
             COALESCE(avg(fs.total) FILTER (WHERE fs.status='completed'),0)::numeric AS average_basket
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
             s.sale_number, s.sold_at, s.actor, s.customer_name, s.customer_phone,
             s.status, s.payment_status, s.sale_type,
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
             SELECT e.* FROM aif_shop_exchanges e WHERE ${currentExchangeFilters.where}
           ),
           exchange_days AS (
             SELECT
               (e.created_at AT TIME ZONE 'Europe/Bucharest')::date AS day,
               COALESCE(sum(e.difference),0)::numeric AS revenue,
               count(*)::int AS transactions,
               COALESCE(sum(COALESCE(lines.replacement_qty,0) - e.returned_qty),0)::numeric AS items_sold
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
             SELECT e.* FROM aif_shop_exchanges e WHERE ${currentExchangeFilters.where}
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
             SELECT e.* FROM aif_shop_exchanges e WHERE ${currentExchangeFilters.where}
           )
           SELECT
             COALESCE(NULLIF(e.actor,''),'Ismeretlen') AS actor,
             COALESCE(sum(e.difference),0)::numeric AS revenue,
             count(*)::int AS transactions,
             COALESCE(sum(COALESCE(lines.replacement_qty,0) - e.returned_qty),0)::numeric AS items_sold,
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
      ]);

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
      const previousCombinedRow = combineSummaryRows(previousSummaryResult.rows[0] || {}, previousExchangeSummaryResult.rows[0] || {});
      previousCombinedRow.exchange_revenue = aifNumber(previousExchangeSummaryResult.rows[0]?.revenue);
      previousCombinedRow.exchange_transactions = aifNumber(previousExchangeSummaryResult.rows[0]?.transactions);

      const summary = mapSummary(currentCombinedRow);
      const previousSummary = mapSummary(previousCombinedRow);

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
      for (const row of [...trendResult.rows, ...exchangeTrendResult.rows]) {
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
      const trend = Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date));

      const paymentMap = new Map();
      for (const row of [...paymentResult.rows, ...exchangePaymentResult.rows]) {
        const method = String(row.method || "");
        if (!method) continue;
        const current = paymentMap.get(method) || { method, amount: 0, transactions: 0 };
        current.amount += aifNumber(row.amount);
        current.transactions += aifNumber(row.transactions);
        paymentMap.set(method, current);
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
        actor: row.actor,
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        status: row.status,
        paymentStatus: row.payment_status,
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
      });

      const recentSales = [
        ...recentResult.rows.map((row) => mapRecentRow({ ...row, record_type: "sale", deletable: true })),
        ...exchangeRecentResult.rows.map(mapRecentRow),
      ]
        .sort((a, b) => new Date(b.soldAt || 0).getTime() - new Date(a.soldAt || 0).getTime() || a.lineNo - b.lineNo)
        .slice(0, 500);

      const uniqueTextOptions = (...groups) => Array.from(new Set(
        groups.flat().map((value) => String(value || "").trim()).filter(Boolean)
      )).sort((a, b) => a.localeCompare(b, "hu"));

      const brands = mergeRankingRows(brandResult.rows, exchangeImpactResult.rows, "brand_name");
      const categories = mergeRankingRows(categoryResult.rows, exchangeImpactResult.rows, "category_name");
      const products = mergeRankingRows(productResult.rows, exchangeImpactResult.rows, "product_name", "product_code");

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
        stockSnapshot: {
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
