import express from "express";

// Vezetői klienskimutatás a két üzletre / üzletenként.
export default function createAifAdminCustomersOverviewRouter(deps) {
  const {
    pool, requireAdminOrSecret, ensureAifShopSalesSchema, text, normCode,
    aifNumber, aifBucharestIsoDate,
  } = deps;
  const router = express.Router();

  router.get("/customers-overview", requireAdminOrSecret, async (req, res) => {
    try {
      await ensureAifShopSalesSchema();

      const currentYear = Number(aifBucharestIsoDate().slice(0, 4)) || new Date().getFullYear();
      const requestedYear = Number.parseInt(text(req.query.year || currentYear), 10);
      const year = Number.isFinite(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100
        ? requestedYear
        : currentYear;

      const locationAliases = {
        csikszereda: "main_warehouse",
        ciuc: "main_warehouse",
        miercurea_ciuc: "main_warehouse",
        main_warehouse: "main_warehouse",
        kezdivasarhely: "magazin_targu_secuiesc",
        kezdi: "magazin_targu_secuiesc",
        targu_secuiesc: "magazin_targu_secuiesc",
        magazin_targu_secuiesc: "magazin_targu_secuiesc",
      };
      const requestedLocation = text(req.query.location || req.query.locationCode || req.query.location_code || "all");
      const locationKey = normCode(requestedLocation || "all");
      const allLocations = !requestedLocation || ["all", "both", "mindketto", "mindket_uzlet", "osszes"].includes(locationKey);
      const normalizedLocation = allLocations ? null : (locationAliases[locationKey] || requestedLocation);

      const locationResult = await pool.query(
        `SELECT id, code, name
         FROM aif_locations
         WHERE COALESCE(is_active,true)=true
           AND code IN ('main_warehouse','magazin_targu_secuiesc')
           ${normalizedLocation ? "AND (id::text=$1 OR code=$1 OR lower(name)=lower($1))" : ""}
         ORDER BY CASE WHEN code='main_warehouse' THEN 0 ELSE 1 END, name ASC`,
        normalizedLocation ? [normalizedLocation] : []
      );
      if (!locationResult.rowCount) {
        return res.status(404).json({ error: "A kiválasztott üzlet nem található." });
      }
      const locations = locationResult.rows;
      const locationIds = locations.map((row) => String(row.id));

      const employee = text(req.query.employee || req.query.actor);
      const search = text(req.query.search || req.query.q);
      const activityRaw = normCode(req.query.activity || "all");
      const activity = ["all", "buyers", "inactive", "repeat", "debt"].includes(activityRaw)
        ? activityRaw
        : "all";
      const sortRaw = normCode(req.query.sort || "revenue");
      const sort = ["revenue", "transactions", "items", "average", "debt", "last_sale", "name"].includes(sortRaw)
        ? sortRaw
        : "revenue";
      const topTen = ["1", "true", "yes", "on"].includes(text(req.query.top10 || req.query.top || req.query.topTen).toLowerCase());
      const combineRequested = text(req.query.combineStores ?? req.query.combine_stores ?? "1").toLowerCase();
      const combineStores = allLocations && topTen && !["0", "false", "no", "off"].includes(combineRequested);
      const requestedLimit = Number(req.query.limit || 2500);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(5000, Math.max(50, Math.trunc(requestedLimit)))
        : 2500;

      const args = [year, locationIds];
      const periodSaleWhere = [
        "s.status='completed'",
        "s.customer_id IS NOT NULL",
        "s.location_id = ANY($2::uuid[])",
        "EXTRACT(YEAR FROM (s.sold_at AT TIME ZONE 'Europe/Bucharest'))=$1::int",
      ];
      if (employee) {
        args.push(employee);
        periodSaleWhere.push(`s.actor=$${args.length}`);
      }

      const customerWhere = [
        "c.is_active=true",
        "c.location_id = ANY($2::uuid[])",
      ];
      if (search) {
        args.push(`%${search}%`);
        const p = `$${args.length}`;
        customerWhere.push(`(
          c.full_name ILIKE ${p}
          OR COALESCE(c.phone,'') ILIKE ${p}
          OR COALESCE(c.email,'') ILIKE ${p}
          OR COALESCE(c.address,'') ILIKE ${p}
          OR COALESCE(c.city,'') ILIKE ${p}
          OR COALESCE(c.locality_name,'') ILIKE ${p}
          OR COALESCE(c.county_name,'') ILIKE ${p}
          OR COALESCE(c.notes,'') ILIKE ${p}
        )`);
      }

      const periodSaleWhereSql = periodSaleWhere.join(" AND ");
      const customerWhereSql = customerWhere.join(" AND ");

      const [customerResult, sellerResult, yearsResult, employeeOptionsResult] = await Promise.all([
        pool.query(
          `WITH period_sale_base AS (
             SELECT
               s.id, s.customer_id, s.location_id, s.actor, s.sold_at,
               s.subtotal, s.discount_total, s.total, s.paid_total, s.balance_due
             FROM aif_shop_sales s
             WHERE ${periodSaleWhereSql}
           ),
           sale_line_totals AS (
             SELECT sl.sale_id, COALESCE(sum(sl.quantity),0)::numeric AS items_sold
             FROM aif_shop_sale_lines sl
             JOIN period_sale_base psb ON psb.id=sl.sale_id
             GROUP BY sl.sale_id
           ),
           period_sales AS (
             SELECT
               psb.id, psb.customer_id, psb.location_id, psb.actor, psb.sold_at,
               psb.subtotal, psb.discount_total, psb.total, psb.paid_total, psb.balance_due,
               COALESCE(lt.items_sold,0)::numeric AS items_sold
             FROM period_sale_base psb
             LEFT JOIN sale_line_totals lt ON lt.sale_id=psb.id
           ),
           period_by_customer AS (
             SELECT
               customer_id,
               location_id,
               count(*)::int AS period_transactions,
               COALESCE(sum(total),0)::numeric AS period_revenue,
               COALESCE(sum(subtotal),0)::numeric AS period_sales_before_discount,
               COALESCE(sum(discount_total),0)::numeric AS period_discount_total,
               COALESCE(sum(paid_total),0)::numeric AS period_paid_total,
               COALESCE(sum(balance_due),0)::numeric AS period_balance_due,
               COALESCE(sum(items_sold),0)::numeric AS period_items_sold,
               COALESCE(avg(total),0)::numeric AS period_average_basket,
               min(sold_at) AS period_first_sale_at,
               max(sold_at) AS period_last_sale_at
             FROM period_sales
             GROUP BY customer_id, location_id
           ),
           lifetime_by_customer AS (
             SELECT
               s.customer_id,
               s.location_id,
               count(*)::int AS lifetime_transactions,
               COALESCE(sum(s.total),0)::numeric AS lifetime_purchase_total,
               COALESCE(sum(s.paid_total),0)::numeric AS lifetime_paid_total,
               COALESCE(sum(s.balance_due),0)::numeric AS current_open_balance,
               count(*) FILTER (WHERE s.balance_due > 0)::int AS current_open_sales,
               min(s.sold_at) AS first_sale_at,
               max(s.sold_at) AS last_sale_at
             FROM aif_shop_sales s
             WHERE s.status='completed'
               AND s.customer_id IS NOT NULL
               AND s.location_id = ANY($2::uuid[])
             GROUP BY s.customer_id, s.location_id
           )
           SELECT
             c.id,
             c.full_name,
             c.phone,
             c.email,
             c.address,
             c.city,
             c.county_name,
             c.locality_name,
             c.postal_code,
             c.notes,
             c.location_id,
             c.created_at,
             c.updated_at,
             l.code AS location_code,
             l.name AS location_name,
             COALESCE(p.period_transactions,0)::int AS period_transactions,
             COALESCE(p.period_revenue,0)::numeric AS period_revenue,
             COALESCE(p.period_sales_before_discount,0)::numeric AS period_sales_before_discount,
             COALESCE(p.period_discount_total,0)::numeric AS period_discount_total,
             COALESCE(p.period_paid_total,0)::numeric AS period_paid_total,
             COALESCE(p.period_balance_due,0)::numeric AS period_balance_due,
             COALESCE(p.period_items_sold,0)::numeric AS period_items_sold,
             COALESCE(p.period_average_basket,0)::numeric AS period_average_basket,
             p.period_first_sale_at,
             p.period_last_sale_at,
             COALESCE(lf.lifetime_transactions,0)::int AS lifetime_transactions,
             COALESCE(lf.lifetime_purchase_total,0)::numeric AS lifetime_purchase_total,
             COALESCE(lf.lifetime_paid_total,0)::numeric AS lifetime_paid_total,
             COALESCE(lf.current_open_balance,0)::numeric AS current_open_balance,
             COALESCE(lf.current_open_sales,0)::int AS current_open_sales,
             lf.first_sale_at,
             lf.last_sale_at
           FROM aif_shop_customers c
           JOIN aif_locations l ON l.id=c.location_id
           LEFT JOIN period_by_customer p
             ON p.customer_id=c.id AND p.location_id=c.location_id
           LEFT JOIN lifetime_by_customer lf
             ON lf.customer_id=c.id AND lf.location_id=c.location_id
           WHERE ${customerWhereSql}
           ORDER BY COALESCE(p.period_revenue,0) DESC,
                    COALESCE(p.period_transactions,0) DESC,
                    lf.last_sale_at DESC NULLS LAST,
                    lower(c.full_name) ASC
           LIMIT ${limit}`,
          args
        ),
        pool.query(
          `WITH period_sale_base AS (
             SELECT
               s.id, s.customer_id, s.location_id,
               COALESCE(NULLIF(s.actor,''),'Ismeretlen') AS actor,
               s.sold_at, s.total, s.discount_total, s.balance_due
             FROM aif_shop_sales s
             WHERE ${periodSaleWhereSql}
           ),
           sale_line_totals AS (
             SELECT sl.sale_id, COALESCE(sum(sl.quantity),0)::numeric AS items_sold
             FROM aif_shop_sale_lines sl
             JOIN period_sale_base psb ON psb.id=sl.sale_id
             GROUP BY sl.sale_id
           ),
           period_sales AS (
             SELECT
               psb.id, psb.customer_id, psb.location_id, psb.actor,
               psb.sold_at, psb.total, psb.discount_total, psb.balance_due,
               COALESCE(lt.items_sold,0)::numeric AS items_sold
             FROM period_sale_base psb
             LEFT JOIN sale_line_totals lt ON lt.sale_id=psb.id
           )
           SELECT
             ps.customer_id,
             ps.location_id,
             ps.actor,
             COALESCE(sum(ps.total),0)::numeric AS revenue,
             count(*)::int AS transactions,
             COALESCE(sum(ps.items_sold),0)::numeric AS items_sold,
             COALESCE(sum(ps.discount_total),0)::numeric AS discount_total,
             COALESCE(sum(ps.balance_due),0)::numeric AS balance_due,
             max(ps.sold_at) AS last_sale_at
           FROM period_sales ps
           JOIN aif_shop_customers c ON c.id=ps.customer_id AND c.location_id=ps.location_id
           WHERE ${customerWhereSql}
           GROUP BY ps.customer_id, ps.location_id, ps.actor
           ORDER BY revenue DESC, transactions DESC, ps.actor ASC`,
          args
        ),
        pool.query(
          `SELECT year
           FROM (
             SELECT DISTINCT EXTRACT(YEAR FROM (s.sold_at AT TIME ZONE 'Europe/Bucharest'))::int AS year
             FROM aif_shop_sales s
             WHERE s.status='completed'
               AND s.location_id = ANY($1::uuid[])
             UNION
             SELECT $2::int AS year
           ) years
           WHERE year BETWEEN 2000 AND 2100
           ORDER BY year DESC`,
          [locationIds, currentYear]
        ),
        pool.query(
          `SELECT DISTINCT s.actor
           FROM aif_shop_sales s
           WHERE s.status='completed'
             AND s.location_id = ANY($1::uuid[])
             AND EXTRACT(YEAR FROM (s.sold_at AT TIME ZONE 'Europe/Bucharest'))=$2::int
             AND NULLIF(s.actor,'') IS NOT NULL
           ORDER BY s.actor ASC`,
          [locationIds, year]
        ),
      ]);

      const iso = (value) => {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
      };
      const minIso = (values) => {
        const valid = values.filter(Boolean).map((value) => new Date(value)).filter((date) => !Number.isNaN(date.getTime()));
        if (!valid.length) return null;
        return new Date(Math.min(...valid.map((date) => date.getTime()))).toISOString();
      };
      const maxIso = (values) => {
        const valid = values.filter(Boolean).map((value) => new Date(value)).filter((date) => !Number.isNaN(date.getTime()));
        if (!valid.length) return null;
        return new Date(Math.max(...valid.map((date) => date.getTime()))).toISOString();
      };
      const bucharestYear = (value) => {
        if (!value) return null;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        const formatted = new Intl.DateTimeFormat("en", {
          timeZone: "Europe/Bucharest",
          year: "numeric",
        }).format(date);
        const parsed = Number(formatted);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const romanianPhoneKey = (value) => {
        let digits = text(value).replace(/\D+/g, "");
        if (digits.startsWith("0040")) digits = digits.slice(4);
        else if (digits.startsWith("40") && digits.length >= 11) digits = digits.slice(2);
        if (digits.length >= 9) digits = digits.slice(-9);
        return digits.length >= 6 ? digits : "";
      };
      const identityKey = (item) => {
        const phone = romanianPhoneKey(item.phone);
        if (phone) return `phone:${phone}`;
        const email = text(item.email).toLowerCase();
        if (email) return `email:${email}`;
        return `customer:${item.id}`;
      };

      const sellerMap = new Map();
      for (const row of sellerResult.rows) {
        const key = `${row.customer_id}:${row.location_id}`;
        if (!sellerMap.has(key)) sellerMap.set(key, []);
        sellerMap.get(key).push({
          actor: row.actor || "Ismeretlen",
          revenue: aifNumber(row.revenue),
          transactions: aifNumber(row.transactions),
          itemsSold: aifNumber(row.items_sold),
          discountTotal: aifNumber(row.discount_total),
          balanceDue: aifNumber(row.balance_due),
          lastSaleAt: iso(row.last_sale_at),
        });
      }
      for (const sellers of sellerMap.values()) {
        const totalRevenue = sellers.reduce((sum, seller) => sum + seller.revenue, 0);
        sellers.sort((a, b) => b.revenue - a.revenue || b.transactions - a.transactions || a.actor.localeCompare(b.actor, "hu"));
        for (const seller of sellers) seller.share = totalRevenue > 0 ? seller.revenue / totalRevenue * 100 : 0;
      }

      let storeScopedCustomers = customerResult.rows.map((row) => {
        const employees = sellerMap.get(`${row.id}:${row.location_id}`) || [];
        return {
          key: `customer:${row.id}`,
          id: String(row.id),
          customerIds: [String(row.id)],
          fullName: row.full_name || "Névtelen kliens",
          phone: row.phone || null,
          email: row.email || null,
          address: [row.locality_name || row.city, row.county_name, row.address, row.postal_code].filter(Boolean).join(" • ") || null,
          note: row.notes || null,
          locationId: String(row.location_id),
          locationCode: row.location_code || null,
          locationName: row.location_name || null,
          combined: false,
          storeCount: 1,
          stores: [{
            customerId: String(row.id),
            locationId: String(row.location_id),
            locationCode: row.location_code || null,
            locationName: row.location_name || null,
            revenue: aifNumber(row.period_revenue),
            transactions: aifNumber(row.period_transactions),
            itemsSold: aifNumber(row.period_items_sold),
            paidTotal: aifNumber(row.period_paid_total),
            periodBalanceDue: aifNumber(row.period_balance_due),
            currentOpenBalance: aifNumber(row.current_open_balance),
            lastSaleAt: iso(row.period_last_sale_at),
          }],
          periodRevenue: aifNumber(row.period_revenue),
          periodTransactions: aifNumber(row.period_transactions),
          periodItemsSold: aifNumber(row.period_items_sold),
          periodSalesBeforeDiscount: aifNumber(row.period_sales_before_discount),
          periodDiscountTotal: aifNumber(row.period_discount_total),
          periodPaidTotal: aifNumber(row.period_paid_total),
          periodBalanceDue: aifNumber(row.period_balance_due),
          periodAverageBasket: aifNumber(row.period_average_basket),
          periodFirstSaleAt: iso(row.period_first_sale_at),
          periodLastSaleAt: iso(row.period_last_sale_at),
          currentOpenBalance: aifNumber(row.current_open_balance),
          currentOpenSales: aifNumber(row.current_open_sales),
          lifetimeTransactions: aifNumber(row.lifetime_transactions),
          lifetimePurchaseTotal: aifNumber(row.lifetime_purchase_total),
          lifetimePaidTotal: aifNumber(row.lifetime_paid_total),
          firstSaleAt: iso(row.first_sale_at),
          lastSaleAt: iso(row.last_sale_at),
          createdAt: iso(row.created_at),
          updatedAt: iso(row.updated_at),
          employees,
        };
      });

      if (employee) {
        storeScopedCustomers = storeScopedCustomers.filter((item) => item.periodTransactions > 0);
      }
      if (activity === "buyers") storeScopedCustomers = storeScopedCustomers.filter((item) => item.periodTransactions > 0);
      if (activity === "inactive") storeScopedCustomers = storeScopedCustomers.filter((item) => item.periodTransactions === 0);
      if (activity === "repeat") storeScopedCustomers = storeScopedCustomers.filter((item) => item.periodTransactions >= 2);
      if (activity === "debt") storeScopedCustomers = storeScopedCustomers.filter((item) => item.currentOpenBalance > 0.005);

      const mergeCustomers = (items) => {
        const groups = new Map();
        for (const item of items) {
          const key = identityKey(item);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(item);
        }
        return Array.from(groups.entries()).map(([key, members]) => {
          const representative = [...members].sort((a, b) =>
            b.periodRevenue - a.periodRevenue
            || new Date(b.lastSaleAt || 0).getTime() - new Date(a.lastSaleAt || 0).getTime()
            || new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
          )[0];
          const employeeMap = new Map();
          for (const member of members) {
            for (const seller of member.employees || []) {
              const current = employeeMap.get(seller.actor) || {
                actor: seller.actor,
                revenue: 0,
                transactions: 0,
                itemsSold: 0,
                discountTotal: 0,
                balanceDue: 0,
                lastSaleAt: null,
              };
              current.revenue += seller.revenue;
              current.transactions += seller.transactions;
              current.itemsSold += seller.itemsSold;
              current.discountTotal += seller.discountTotal;
              current.balanceDue += seller.balanceDue;
              current.lastSaleAt = maxIso([current.lastSaleAt, seller.lastSaleAt]);
              employeeMap.set(seller.actor, current);
            }
          }
          const employees = Array.from(employeeMap.values()).sort((a, b) => b.revenue - a.revenue || b.transactions - a.transactions || a.actor.localeCompare(b.actor, "hu"));
          const sellerRevenue = employees.reduce((sum, seller) => sum + seller.revenue, 0);
          for (const seller of employees) seller.share = sellerRevenue > 0 ? seller.revenue / sellerRevenue * 100 : 0;

          const periodRevenue = members.reduce((sum, item) => sum + item.periodRevenue, 0);
          const periodTransactions = members.reduce((sum, item) => sum + item.periodTransactions, 0);
          const stores = members.flatMap((item) => item.stores);
          return {
            ...representative,
            key: `combined:${key}`,
            id: representative.id,
            customerIds: members.flatMap((item) => item.customerIds),
            combined: members.length > 1,
            storeCount: new Set(stores.map((store) => store.locationId)).size,
            locationId: members.length === 1 ? representative.locationId : null,
            locationCode: members.length === 1 ? representative.locationCode : null,
            locationName: members.length === 1 ? representative.locationName : "Mindkét üzlet",
            stores,
            periodRevenue,
            periodTransactions,
            periodItemsSold: members.reduce((sum, item) => sum + item.periodItemsSold, 0),
            periodSalesBeforeDiscount: members.reduce((sum, item) => sum + item.periodSalesBeforeDiscount, 0),
            periodDiscountTotal: members.reduce((sum, item) => sum + item.periodDiscountTotal, 0),
            periodPaidTotal: members.reduce((sum, item) => sum + item.periodPaidTotal, 0),
            periodBalanceDue: members.reduce((sum, item) => sum + item.periodBalanceDue, 0),
            periodAverageBasket: periodTransactions > 0 ? periodRevenue / periodTransactions : 0,
            periodFirstSaleAt: minIso(members.map((item) => item.periodFirstSaleAt)),
            periodLastSaleAt: maxIso(members.map((item) => item.periodLastSaleAt)),
            currentOpenBalance: members.reduce((sum, item) => sum + item.currentOpenBalance, 0),
            currentOpenSales: members.reduce((sum, item) => sum + item.currentOpenSales, 0),
            lifetimeTransactions: members.reduce((sum, item) => sum + item.lifetimeTransactions, 0),
            lifetimePurchaseTotal: members.reduce((sum, item) => sum + item.lifetimePurchaseTotal, 0),
            lifetimePaidTotal: members.reduce((sum, item) => sum + item.lifetimePaidTotal, 0),
            firstSaleAt: minIso(members.map((item) => item.firstSaleAt)),
            lastSaleAt: maxIso(members.map((item) => item.lastSaleAt)),
            createdAt: minIso(members.map((item) => item.createdAt)),
            updatedAt: maxIso(members.map((item) => item.updatedAt)),
            employees,
          };
        });
      };

      const rawForSummary = storeScopedCustomers;
      const uniqueGroups = mergeCustomers(rawForSummary);
      const totalRevenue = rawForSummary.reduce((sum, item) => sum + item.periodRevenue, 0);
      const totalTransactions = rawForSummary.reduce((sum, item) => sum + item.periodTransactions, 0);
      const totalItemsSold = rawForSummary.reduce((sum, item) => sum + item.periodItemsSold, 0);
      const buyingCustomers = uniqueGroups.filter((item) => item.periodTransactions > 0).length;
      const repeatCustomers = uniqueGroups.filter((item) => item.periodTransactions >= 2).length;
      const newCustomers = uniqueGroups.filter((item) => bucharestYear(item.firstSaleAt) === year).length;

      const storeMap = new Map(locations.map((location) => [String(location.id), {
        id: String(location.id),
        code: location.code,
        name: location.name,
        customerCount: 0,
        activeCustomers: 0,
        inactiveCustomers: 0,
        transactions: 0,
        itemsSold: 0,
        revenue: 0,
        paidTotal: 0,
        periodBalanceDue: 0,
        currentOpenBalance: 0,
        share: 0,
        averageCustomerValue: 0,
        averageBasket: 0,
      }]));
      for (const item of rawForSummary) {
        const store = storeMap.get(item.locationId);
        if (!store) continue;
        store.customerCount += 1;
        if (item.periodTransactions > 0) store.activeCustomers += 1;
        else store.inactiveCustomers += 1;
        store.transactions += item.periodTransactions;
        store.itemsSold += item.periodItemsSold;
        store.revenue += item.periodRevenue;
        store.paidTotal += item.periodPaidTotal;
        store.periodBalanceDue += item.periodBalanceDue;
        store.currentOpenBalance += item.currentOpenBalance;
      }
      const storeItems = Array.from(storeMap.values());
      for (const store of storeItems) {
        store.share = totalRevenue > 0 ? store.revenue / totalRevenue * 100 : 0;
        store.averageCustomerValue = store.activeCustomers > 0 ? store.revenue / store.activeCustomers : 0;
        store.averageBasket = store.transactions > 0 ? store.revenue / store.transactions : 0;
      }

      const employeeMap = new Map();
      for (const item of rawForSummary) {
        const customerIdentity = identityKey(item);
        for (const seller of item.employees || []) {
          const current = employeeMap.get(seller.actor) || {
            actor: seller.actor,
            revenue: 0,
            transactions: 0,
            itemsSold: 0,
            discountTotal: 0,
            balanceDue: 0,
            lastSaleAt: null,
            customerKeys: new Set(),
            storeIds: new Set(),
          };
          current.revenue += seller.revenue;
          current.transactions += seller.transactions;
          current.itemsSold += seller.itemsSold;
          current.discountTotal += seller.discountTotal;
          current.balanceDue += seller.balanceDue;
          current.lastSaleAt = maxIso([current.lastSaleAt, seller.lastSaleAt]);
          current.customerKeys.add(customerIdentity);
          current.storeIds.add(item.locationId);
          employeeMap.set(seller.actor, current);
        }
      }
      const employeeItems = Array.from(employeeMap.values()).map((item) => ({
        actor: item.actor,
        revenue: item.revenue,
        transactions: item.transactions,
        itemsSold: item.itemsSold,
        discountTotal: item.discountTotal,
        balanceDue: item.balanceDue,
        customers: item.customerKeys.size,
        storeCount: item.storeIds.size,
        averageBasket: item.transactions > 0 ? item.revenue / item.transactions : 0,
        lastSaleAt: item.lastSaleAt,
      })).sort((a, b) => b.revenue - a.revenue || b.transactions - a.transactions || a.actor.localeCompare(b.actor, "hu"));

      const compare = (a, b) => {
        if (sort === "name") return a.fullName.localeCompare(b.fullName, "hu");
        if (sort === "transactions") return b.periodTransactions - a.periodTransactions || b.periodRevenue - a.periodRevenue;
        if (sort === "items") return b.periodItemsSold - a.periodItemsSold || b.periodRevenue - a.periodRevenue;
        if (sort === "average") return b.periodAverageBasket - a.periodAverageBasket || b.periodRevenue - a.periodRevenue;
        if (sort === "debt") return b.currentOpenBalance - a.currentOpenBalance || b.periodRevenue - a.periodRevenue;
        if (sort === "last_sale") return new Date(b.lastSaleAt || 0).getTime() - new Date(a.lastSaleAt || 0).getTime() || b.periodRevenue - a.periodRevenue;
        return b.periodRevenue - a.periodRevenue || b.periodTransactions - a.periodTransactions || a.fullName.localeCompare(b.fullName, "hu");
      };

      let customerItems = combineStores ? mergeCustomers(rawForSummary) : [...rawForSummary];
      customerItems.sort(compare);
      if (topTen) customerItems = customerItems.slice(0, 10);

      res.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        period: {
          year,
          from: `${year}-01-01`,
          to: `${year}-12-31`,
        },
        scope: {
          location: allLocations ? "all" : (locations[0]?.code || normalizedLocation),
          locationName: allLocations ? "Mindkét üzlet" : (locations[0]?.name || ""),
          employee: employee || null,
          search: search || null,
          activity,
          sort,
          topTen,
          combineStores,
        },
        summary: {
          customerCount: rawForSummary.length,
          uniqueCustomerCount: uniqueGroups.length,
          buyingCustomers,
          inactiveCustomers: uniqueGroups.length - buyingCustomers,
          repeatCustomers,
          newCustomers,
          transactions: totalTransactions,
          itemsSold: totalItemsSold,
          revenue: totalRevenue,
          salesBeforeDiscount: rawForSummary.reduce((sum, item) => sum + item.periodSalesBeforeDiscount, 0),
          discountTotal: rawForSummary.reduce((sum, item) => sum + item.periodDiscountTotal, 0),
          paidTotal: rawForSummary.reduce((sum, item) => sum + item.periodPaidTotal, 0),
          periodBalanceDue: rawForSummary.reduce((sum, item) => sum + item.periodBalanceDue, 0),
          currentOpenBalance: rawForSummary.reduce((sum, item) => sum + item.currentOpenBalance, 0),
          averageCustomerValue: buyingCustomers > 0 ? totalRevenue / buyingCustomers : 0,
          averageBasket: totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
        },
        stores: storeItems,
        employees: employeeItems,
        customers: customerItems,
        count: customerItems.length,
        totalFilteredCustomers: rawForSummary.length,
        filterOptions: {
          years: yearsResult.rows.map((row) => Number(row.year)).filter(Number.isFinite),
          employees: employeeOptionsResult.rows.map((row) => row.actor).filter(Boolean),
          locations: locations.map((location) => ({ id: String(location.id), code: location.code, name: location.name })),
        },
      });
    } catch (error) {
      console.error("AIF admin customer overview failed", error);
      const status = Number(error?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A klienskimutatás nem tölthető be.",
        code: error?.code || null,
      });
    }
  });


  return router;
}
