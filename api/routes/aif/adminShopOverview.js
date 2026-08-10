import express from "express";

// Admin üzleti vezérlőpult: forgalom, készletpillanat, rangsorok, eladási napló.
export default function createAifAdminShopOverviewRouter(deps) {
  const {
    pool, requireAdminOrSecret, ensureAifShopSalesSchema, text, normCode,
    aifNumber, aifBucharestIsoDate, aifValidIsoDate, aifInclusiveDayCount,
    aifShiftIsoDate, aifMapShopSummary, aifPaymentMethodLabel,
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
      const search = text(req.query.search || req.query.q);

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

      const summarySql = (where) => `
        WITH filtered_sales AS (
          SELECT s.*
          FROM aif_shop_sales s
          WHERE ${where}
        ),
        line_totals AS (
          SELECT
            sl.sale_id,
            COALESCE(sum(sl.quantity),0)::numeric AS items_sold,
            COALESCE(sum(COALESCE(sl.buy_price_snapshot, v.buy_price,0) * sl.quantity),0)::numeric AS estimated_cost
          FROM aif_shop_sale_lines sl
          JOIN filtered_sales fs ON fs.id=sl.sale_id
          LEFT JOIN aif_product_variants v ON v.id=sl.variant_id
          GROUP BY sl.sale_id
        )
        SELECT
          count(*) FILTER (WHERE fs.status='completed')::int AS transactions,
          COALESCE(sum(fs.total) FILTER (WHERE fs.status='completed'),0)::numeric AS revenue,
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
          COALESCE(avg(fs.total) FILTER (WHERE fs.status='completed'),0)::numeric AS average_basket,
          count(*) FILTER (WHERE fs.status='cancelled')::int AS cancelled_sales,
          count(*) FILTER (WHERE fs.status='refunded')::int AS refunded_sales
        FROM filtered_sales fs
        LEFT JOIN line_totals lt ON lt.sale_id=fs.id
      `;

      const currentFilters = buildFilters(from, to);
      const previousFilters = buildFilters(previousFrom, previousTo);

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
        pool.query(summarySql(currentFilters.where), currentFilters.args),
        pool.query(summarySql(previousFilters.where), previousFilters.args),
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
      ]);

      const summary = aifMapShopSummary(summaryResult.rows[0] || {});
      const previousSummary = aifMapShopSummary(previousSummaryResult.rows[0] || {});
      const rankingMap = (rows) => {
        const totalRevenue = rows.reduce((sum, row) => sum + aifNumber(row.revenue), 0);
        return rows.map((row) => ({
          name: row.name,
          revenue: aifNumber(row.revenue),
          qty: aifNumber(row.qty),
          transactions: aifNumber(row.transactions),
          productCode: row.product_code || null,
          share: totalRevenue > 0 ? aifNumber(row.revenue) / totalRevenue * 100 : 0,
        }));
      };
      const totalPayments = paymentResult.rows.reduce((sum, row) => sum + aifNumber(row.amount), 0);

      res.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        location: {
          id: String(location.id),
          code: location.code,
          name: location.name,
        },
        period: { from, to, previousFrom, previousTo, days },
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
        trend: trendResult.rows.map((row) => ({
          date: row.date,
          label: row.label,
          revenue: aifNumber(row.revenue),
          transactions: aifNumber(row.transactions),
          itemsSold: aifNumber(row.items_sold),
          discountTotal: aifNumber(row.discount_total),
          unpaidTotal: aifNumber(row.unpaid_total),
        })),
        brands: rankingMap(brandResult.rows),
        categories: rankingMap(categoryResult.rows),
        products: rankingMap(productResult.rows),
        payments: paymentResult.rows.map((row) => ({
          method: row.method,
          label: aifPaymentMethodLabel(row.method),
          amount: aifNumber(row.amount),
          transactions: aifNumber(row.transactions),
          share: totalPayments > 0 ? aifNumber(row.amount) / totalPayments * 100 : 0,
        })),
        employees: employeeResult.rows.map((row) => ({
          actor: row.actor,
          revenue: aifNumber(row.revenue),
          transactions: aifNumber(row.transactions),
          itemsSold: aifNumber(row.items_sold),
          discountTotal: aifNumber(row.discount_total),
          unpaidTotal: aifNumber(row.unpaid_total),
          averageBasket: aifNumber(row.average_basket),
        })),
        recentSales: recentResult.rows.map((row) => ({
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
        })),
        filterOptions: {
          employees: employeesOptionResult.rows.map((row) => row.actor).filter(Boolean),
          brands: brandsOptionResult.rows.map((row) => row.value).filter(Boolean),
          categories: categoriesOptionResult.rows.map((row) => row.value).filter(Boolean),
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
