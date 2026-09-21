import express from "express";

// Kliens-, kliensfizetés-, vásárlási előzmény- és Bon de consum útvonalak.
// Szándékosan külön modul: az aif.js ne nőjön tovább ettől a funkciócsaládtól.
export default function createAifShopCustomersRouter({
  pool,
  requireAuthed,
  requireAdminOrSecret,
  ensureAifShopSalesSchema,
  aifResolveShopLocation,
  actorFrom,
  text,
  emptyToNull,
  toMoney,
  normCode,
  isUuidText,
  aifNumber,
  aifRoundMoney,
  aifDiscountedUnitPrice,
  aifLoadShopSaleResult,
  aifAssertNoPendingShopShiftHandover,
  aifBucharestIsoDate,
  cleanAifDocumentDate,
  aifCleanCountyCode,
  aifResolveRomaniaCustomerGeo,
}) {
  const router = express.Router();
  let aifConsumptionDocumentsSchemaPromise = null;

  function ensureAifConsumptionDocumentsSchema() {
    if (!aifConsumptionDocumentsSchemaPromise) {
      aifConsumptionDocumentsSchemaPromise = (async () => {
        await ensureAifShopSalesSchema();
        await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_consumption_document_settings (
          id smallint PRIMARY KEY DEFAULT 1 CHECK (id=1),
          series text NOT NULL DEFAULT 'BC',
          next_number bigint NOT NULL DEFAULT 1 CHECK (next_number > 0),
          digits integer NOT NULL DEFAULT 6 CHECK (digits BETWEEN 3 AND 10),
          include_year boolean NOT NULL DEFAULT true,
          yearly_reset boolean NOT NULL DEFAULT true,
          sequence_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          updated_by text NULL
        )`);
        await pool.query(`INSERT INTO aif_consumption_document_settings (id)
          VALUES (1) ON CONFLICT (id) DO NOTHING`);
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_consumption_documents (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          document_number text NOT NULL UNIQUE,
          series text NOT NULL DEFAULT 'BC',
          sequence_number bigint NOT NULL,
          sequence_year integer NOT NULL,
          document_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Europe/Bucharest')::date),
          location_id uuid NOT NULL REFERENCES aif_locations(id) ON DELETE RESTRICT,
          customer_id uuid NULL REFERENCES aif_shop_customers(id) ON DELETE SET NULL,
          customer_name text NOT NULL,
          customer_phone text NULL,
          recipient_name text NULL,
          purpose text NOT NULL,
          note text NULL,
          actor text NOT NULL,
          status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','cancelled')),
          total_qty integer NOT NULL DEFAULT 0 CHECK (total_qty >= 0),
          purchase_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (purchase_total >= 0),
          retail_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (retail_total >= 0),
          actual_sale_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (actual_sale_total >= 0),
          discount_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
          currency_code text NOT NULL DEFAULT 'RON',
          raw jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_consumption_documents_customer_idx
          ON aif_consumption_documents (customer_id, document_date DESC, created_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_consumption_documents_location_idx
          ON aif_consumption_documents (location_id, document_date DESC, created_at DESC)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_consumption_document_lines (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          document_id uuid NOT NULL REFERENCES aif_consumption_documents(id) ON DELETE CASCADE,
          line_no integer NOT NULL,
          source_sale_id text NULL,
          source_sale_line_id text NULL,
          source_sale_number text NULL,
          source_sold_at timestamptz NULL,
          variant_id text NULL,
          product_title text NULL,
          product_code text NULL,
          sn_cod text NULL,
          barcode text NULL,
          brand_name text NULL,
          category_name text NULL,
          subcategory_name text NULL,
          color_name text NULL,
          size text NULL,
          image_url text NULL,
          quantity integer NOT NULL CHECK (quantity > 0),
          purchase_unit_price numeric(14,2) NOT NULL CHECK (purchase_unit_price >= 0),
          list_unit_price numeric(14,2) NOT NULL CHECK (list_unit_price >= 0),
          actual_unit_price numeric(14,2) NOT NULL CHECK (actual_unit_price >= 0),
          sales_tva_rate numeric(7,3) NULL,
          purchase_value numeric(14,2) NOT NULL CHECK (purchase_value >= 0),
          retail_value numeric(14,2) NOT NULL CHECK (retail_value >= 0),
          actual_sale_value numeric(14,2) NOT NULL CHECK (actual_sale_value >= 0),
          discount_value numeric(14,2) NOT NULL CHECK (discount_value >= 0),
          raw jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (document_id, line_no)
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_consumption_document_lines_document_idx
          ON aif_consumption_document_lines (document_id, line_no)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_consumption_document_lines_source_line_idx
          ON aif_consumption_document_lines (source_sale_line_id) WHERE source_sale_line_id IS NOT NULL`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_consumption_document_lines_variant_idx
          ON aif_consumption_document_lines (variant_id) WHERE variant_id IS NOT NULL`);
        return true;
      })().catch((error) => {
        aifConsumptionDocumentsSchemaPromise = null;
        throw error;
      });
    }
    return aifConsumptionDocumentsSchemaPromise;
  }


  function aifShopCustomerResponse(row = {}) {
    return {
      id: String(row.id),
      fullName: row.full_name || "",
      phone: row.phone || null,
      email: row.email || null,
      address: row.address || null,
      city: row.city || row.locality_name || null,
      countryCode: row.country_code || "RO",
      countyCode: row.county_code || null,
      countyName: row.county_name || null,
      localityCode: row.locality_code || null,
      localityName: row.locality_name || row.city || null,
      postalCode: row.postal_code || null,
      locationId: row.location_id ? String(row.location_id) : null,
      locationCode: row.location_code || null,
      locationName: row.location_name || null,
      formattedAddress: [
        row.locality_name || row.city,
        row.county_name,
        row.address,
        row.postal_code,
      ].filter(Boolean).join(" • ") || null,
      notes: row.notes || null,
      creditLimit: aifNumber(row.credit_limit),
      isActive: row.is_active !== false,
      openBalance: aifNumber(row.open_balance),
      openSales: aifNumber(row.open_sales),
      saleCount: aifNumber(row.sale_count),
      yearPurchaseTotal: aifNumber(row.year_purchase_total),
      lifetimePurchaseTotal: aifNumber(row.lifetime_purchase_total),
      lifetimePaidTotal: aifNumber(row.lifetime_paid_total),
      lastSaleAt: row.last_sale_at ? new Date(row.last_sale_at).toISOString() : null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    };
  }

  async function aifLoadShopSaleResult(client, saleId) {
    const result = await client.query(
      `SELECT s.*,
              count(sl.id)::int AS line_count,
              COALESCE(sum(sl.quantity),0)::int AS item_count
       FROM aif_shop_sales s
       LEFT JOIN aif_shop_sale_lines sl ON sl.sale_id=s.id
       WHERE s.id=$1
       GROUP BY s.id
       LIMIT 1`,
      [saleId]
    );
    return result.rows[0] || null;
  }

  function aifShopCustomerSaleHistoryResponse(row = {}) {
    const rawLines = Array.isArray(row.lines) ? row.lines : [];
    const storedPayments = Array.isArray(row.sale_payments) ? row.sale_payments : [];
    const rawSale = row.raw && typeof row.raw === "object" && !Array.isArray(row.raw) ? row.raw : {};
    const fallbackPaymentMethod = text(rawSale.paymentMethod || rawSale.payment_method);
    const salePayments = storedPayments.length
      ? storedPayments
      : fallbackPaymentMethod
        ? [{
            method: fallbackPaymentMethod,
            amount: aifNumber(row.paid_total),
            paidAt: row.sold_at || null,
          }]
        : [];
    return {
      id: String(row.id),
      saleNumber: row.sale_number || "",
      locationId: row.location_id ? String(row.location_id) : null,
      locationCode: row.location_code || null,
      locationName: row.location_name || null,
      actor: row.actor || null,
      soldAt: row.sold_at ? new Date(row.sold_at).toISOString() : new Date().toISOString(),
      status: row.status || "",
      paymentStatus: row.payment_status || "",
      saleType: row.sale_type || "",
      subtotal: aifNumber(row.subtotal),
      discountTotal: aifNumber(row.discount_total),
      total: aifNumber(row.total),
      paidTotal: aifNumber(row.paid_total),
      balanceDue: aifNumber(row.balance_due),
      lineCount: aifNumber(row.line_count),
      itemCount: aifNumber(row.item_count),
      payments: salePayments.map((payment) => ({
        method: payment?.method || "other",
        amount: aifNumber(payment?.amount),
        paidAt: payment?.paidAt || payment?.paid_at
          ? new Date(payment.paidAt || payment.paid_at).toISOString()
          : null,
      })),
      lines: rawLines.map((line) => ({
        id: String(line.id || ""),
        lineNo: aifNumber(line.lineNo ?? line.line_no),
        variantId: line.variantId || line.variant_id ? String(line.variantId || line.variant_id) : null,
        productTitle: line.productTitle || line.product_title || null,
        productCode: line.productCode || line.product_code || null,
        barcode: line.barcode || null,
        brandName: line.brandName || line.brand_name || null,
        categoryName: line.categoryName || line.category_name || null,
        subcategoryName: line.subcategoryName || line.subcategory_name || null,
        colorName: line.colorName || line.color_name || null,
        colorHex: line.colorHex || line.color_hex || null,
        size: line.size || null,
        imageUrl: line.imageUrl || line.image_url || null,
        quantity: aifNumber(line.quantity),
        listPrice: aifNumber(line.listPrice ?? line.list_price),
        unitPrice: aifNumber(line.unitPrice ?? line.unit_price),
        discountAmount: aifNumber(line.discountAmount ?? line.discount_amount),
        discountPercent: aifNumber(line.discountPercent ?? line.discount_percent),
        lineTotal: aifNumber(line.lineTotal ?? line.line_total),
        buyPriceSnapshot: line.buyPriceSnapshot ?? line.buy_price_snapshot ?? null,
        snCod: line.snCod || line.sn_cod || null,
      })),
    };
  }

  function aifShopCustomerPaymentResponse(row = {}) {
    const rawAllocations = Array.isArray(row.allocations) ? row.allocations : [];
    return {
      id: String(row.id),
      amount: aifNumber(row.amount),
      method: row.method || "other",
      paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : new Date().toISOString(),
      actor: row.actor || null,
      reference: row.reference || null,
      note: row.note || null,
      locationId: row.location_id ? String(row.location_id) : null,
      locationCode: row.location_code || null,
      locationName: row.location_name || null,
      allocations: rawAllocations.map((allocation) => ({
        saleId: String(allocation.saleId || allocation.sale_id || ""),
        saleNumber: allocation.saleNumber || allocation.sale_number || "",
        soldAt: allocation.soldAt || allocation.sold_at
          ? new Date(allocation.soldAt || allocation.sold_at).toISOString()
          : null,
        amount: aifNumber(allocation.amount),
        balanceBefore: aifNumber(allocation.balanceBefore ?? allocation.balance_before),
        balanceAfter: aifNumber(allocation.balanceAfter ?? allocation.balance_after),
      })),
    };
  }


  function aifBonConsumSummaryResponse(row = {}) {
    return {
      id: String(row.id || ""),
      documentNumber: row.document_number || "",
      series: row.series || "BC",
      sequenceNumber: aifNumber(row.sequence_number),
      sequenceYear: aifNumber(row.sequence_year),
      documentDate: row.document_date ? String(row.document_date).slice(0, 10) : null,
      locationId: row.location_id ? String(row.location_id) : null,
      locationCode: row.location_code || null,
      locationName: row.location_name || null,
      customerId: row.customer_id ? String(row.customer_id) : null,
      customerName: row.customer_name || "",
      customerPhone: row.customer_phone || null,
      recipientName: row.recipient_name || null,
      purpose: row.purpose || "",
      note: row.note || null,
      actor: row.actor || null,
      status: row.status || "issued",
      totalQty: aifNumber(row.total_qty),
      purchaseTotal: aifNumber(row.purchase_total),
      retailTotal: aifNumber(row.retail_total),
      actualSaleTotal: aifNumber(row.actual_sale_total),
      discountTotal: aifNumber(row.discount_total),
      currencyCode: row.currency_code || "RON",
      lineCount: aifNumber(row.line_count),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    };
  }

  function aifBonConsumLineResponse(row = {}) {
    return {
      id: String(row.id || ""),
      lineNo: aifNumber(row.line_no),
      sourceSaleId: row.source_sale_id || null,
      sourceSaleLineId: row.source_sale_line_id || null,
      sourceSaleNumber: row.source_sale_number || null,
      sourceSoldAt: row.source_sold_at ? new Date(row.source_sold_at).toISOString() : null,
      variantId: row.variant_id || null,
      productTitle: row.product_title || null,
      productCode: row.product_code || null,
      snCod: row.sn_cod || null,
      barcode: row.barcode || null,
      brandName: row.brand_name || null,
      categoryName: row.category_name || null,
      subcategoryName: row.subcategory_name || null,
      colorName: row.color_name || null,
      size: row.size || null,
      imageUrl: row.image_url || null,
      quantity: aifNumber(row.quantity),
      purchaseUnitPrice: aifNumber(row.purchase_unit_price),
      listUnitPrice: aifNumber(row.list_unit_price),
      actualUnitPrice: aifNumber(row.actual_unit_price),
      salesTvaRate: row.sales_tva_rate === null || row.sales_tva_rate === undefined ? null : aifNumber(row.sales_tva_rate),
      purchaseValue: aifNumber(row.purchase_value),
      retailValue: aifNumber(row.retail_value),
      actualSaleValue: aifNumber(row.actual_sale_value),
      discountValue: aifNumber(row.discount_value),
    };
  }

  function cleanAifBonConsumSeries(value, fallback = "BC") {
    const raw = text(value);
    const cleaned = raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9_-]+/g, "")
      .slice(0, 20);
    return cleaned || fallback;
  }

  function aifBonConsumSettingsResponse(row = {}, yearOverride = null) {
    const currentYear = Number(aifBucharestIsoDate().slice(0, 4));
    const yearlyReset = row.yearly_reset !== false;
    const storedYear = Number(row.sequence_year || currentYear);
    const targetYear = Number(yearOverride || currentYear);
    const sequenceYear = yearlyReset && storedYear !== targetYear ? targetYear : storedYear;
    const series = cleanAifBonConsumSeries(row.series || "BC");
    const nextNumber = yearlyReset && storedYear !== targetYear
      ? 1
      : Math.max(1, Number(row.next_number || 1));
    const digits = Math.min(10, Math.max(3, Number(row.digits || 6)));
    const includeYear = row.include_year !== false;
    const sequence = String(nextNumber).padStart(digits, "0");
    return {
      series,
      nextNumber,
      digits,
      includeYear,
      yearlyReset,
      sequenceYear,
      previewNumber: includeYear ? `${series}/${sequenceYear}/${sequence}` : `${series}/${sequence}`,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      updatedBy: row.updated_by || null,
    };
  }

  async function allocateAifBonConsumDocumentNumber(client, options = {}) {
    await ensureAifConsumptionDocumentsSchema();
    const currentYear = Number(aifBucharestIsoDate().slice(0, 4));
    const requestedYear = Number(options.sequenceYear || currentYear);
    const locked = await client.query(`SELECT * FROM aif_consumption_document_settings WHERE id=1 FOR UPDATE`);
    const row = locked.rows[0] || {};

    const requestedSeriesRaw = text(options.series || "");
    const series = cleanAifBonConsumSeries(requestedSeriesRaw || row.series || "BC", "");
    if (!series) {
      throw Object.assign(new Error("A Bon de consum sorozat nem lehet üres."), { statusCode: 400, code: "bon_consum_invalid_series" });
    }

    let storedNextNumber = Math.max(1, Number(row.next_number || 1));
    let storedYear = Number(row.sequence_year || currentYear);
    if (row.yearly_reset !== false && storedYear !== requestedYear) {
      storedNextNumber = 1;
      storedYear = requestedYear;
    }

    const hasRequestedNumber = options.sequenceNumber !== null && options.sequenceNumber !== undefined && String(options.sequenceNumber).trim() !== "";
    const requestedNumber = hasRequestedNumber ? Number(options.sequenceNumber) : storedNextNumber;
    if (!Number.isInteger(requestedNumber) || requestedNumber <= 0 || requestedNumber > 9999999999) {
      throw Object.assign(new Error("A Bon de consum száma 1 és 9 999 999 999 közötti egész szám lehet."), { statusCode: 400, code: "bon_consum_invalid_sequence_number" });
    }

    const digits = Math.min(10, Math.max(3, Number(row.digits || 6)));
    const includeYear = row.include_year !== false;
    const sequence = String(requestedNumber).padStart(digits, "0");
    const documentNumber = includeYear
      ? `${series}/${requestedYear}/${sequence}`
      : `${series}/${sequence}`;

    const duplicate = await client.query(
      `SELECT id FROM aif_consumption_documents WHERE document_number=$1 LIMIT 1`,
      [documentNumber]
    );
    if (duplicate.rowCount) {
      throw Object.assign(new Error(`A ${documentNumber} Bon de consum sorszám már létezik. Adj meg másik számot.`), {
        statusCode: 409,
        code: "bon_consum_document_number_exists",
      });
    }

    await client.query(
      `UPDATE aif_consumption_document_settings
       SET series=$1, next_number=$2, sequence_year=$3, updated_at=now(), updated_by=$4
       WHERE id=1`,
      [series, requestedNumber + 1, requestedYear, text(options.actor || "system") || "system"]
    );

    return {
      documentNumber,
      series,
      sequenceNumber: requestedNumber,
      sequenceYear: requestedYear,
      nextNumber: requestedNumber + 1,
      digits,
      includeYear,
    };
  }

  async function loadAifBonConsumDocument(client, id) {
    const header = await client.query(
      `SELECT d.*, l.code AS location_code, l.name AS location_name,
              count(dl.id)::int AS line_count
       FROM aif_consumption_documents d
       JOIN aif_locations l ON l.id=d.location_id
       LEFT JOIN aif_consumption_document_lines dl ON dl.document_id=d.id
       WHERE d.id::text=$1 OR d.document_number=$1
       GROUP BY d.id, l.id, l.code, l.name
       LIMIT 1`,
      [text(id)]
    );
    if (!header.rowCount) return null;
    const lines = await client.query(
      `SELECT * FROM aif_consumption_document_lines
       WHERE document_id=$1
       ORDER BY line_no ASC, id ASC`,
      [header.rows[0].id]
    );
    return {
      document: aifBonConsumSummaryResponse(header.rows[0]),
      lines: lines.rows.map(aifBonConsumLineResponse),
    };
  }

  async function aifLoadShopCustomerSnapshot(client, customerId, year, locationId) {
    const result = await client.query(
      `SELECT
         c.*,
         l.code AS location_code,
         l.name AS location_name,
         COALESCE(sum(s.balance_due) FILTER (WHERE s.status='completed' AND s.balance_due > 0),0)::numeric AS open_balance,
         count(s.id) FILTER (WHERE s.status='completed' AND s.balance_due > 0)::int AS open_sales,
         count(s.id) FILTER (WHERE s.status='completed')::int AS sale_count,
         COALESCE(sum(s.total) FILTER (
           WHERE s.status='completed'
             AND EXTRACT(YEAR FROM (s.sold_at AT TIME ZONE 'Europe/Bucharest'))=$2::int
         ),0)::numeric AS year_purchase_total,
         COALESCE(sum(s.total) FILTER (WHERE s.status='completed'),0)::numeric AS lifetime_purchase_total,
         COALESCE(sum(s.paid_total) FILTER (WHERE s.status='completed'),0)::numeric AS lifetime_paid_total,
         max(s.sold_at) FILTER (WHERE s.status='completed') AS last_sale_at
       FROM aif_shop_customers c
       JOIN aif_locations l ON l.id=c.location_id
       LEFT JOIN aif_shop_sales s
         ON s.customer_id=c.id
        AND s.location_id=c.location_id
       WHERE c.id::text=$1
         AND c.is_active=true
         AND c.location_id=$3
       GROUP BY c.id, l.id, l.code, l.name
       LIMIT 1`,
      [customerId, year, locationId]
    );
    return result.rows[0] || null;
  }

  async function aifLoadShopCustomerPayment(client, paymentId) {
    const result = await client.query(
      `SELECT
         p.*,
         l.code AS location_code,
         l.name AS location_name,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'saleId', s.id::text,
               'saleNumber', s.sale_number,
               'soldAt', s.sold_at,
               'amount', a.amount,
               'balanceBefore', a.balance_before,
               'balanceAfter', a.balance_after
             ) ORDER BY a.created_at ASC, a.id ASC
           ) FILTER (WHERE a.id IS NOT NULL),
           '[]'::jsonb
         ) AS allocations
       FROM aif_shop_customer_payments p
       LEFT JOIN aif_locations l ON l.id=p.location_id
       LEFT JOIN aif_shop_customer_payment_allocations a ON a.customer_payment_id=p.id
       LEFT JOIN aif_shop_sales s ON s.id=a.sale_id
       WHERE p.id=$1
       GROUP BY p.id, l.id, l.code, l.name
       LIMIT 1`,
      [paymentId]
    );
    return result.rows[0] ? aifShopCustomerPaymentResponse(result.rows[0]) : null;
  }

  router.get("/romania/counties", requireAuthed, async (_req, res) => {
    try {
      await ensureAifShopSalesSchema();
      const result = await pool.query(
        `SELECT code, name, siruta_code, siruta_jud, priority
         FROM aif_ro_counties
         WHERE is_active=true
         ORDER BY priority ASC, name ASC`
      );
      res.json({
        ok: true,
        items: result.rows.map((row) => ({
          code: row.code,
          name: row.name,
          sirutaCode: row.siruta_code || null,
          sirutaJud: row.siruta_jud === null ? null : Number(row.siruta_jud),
          priority: Number(row.priority || 100),
        })),
      });
    } catch (error) {
      console.error("AIF Romania counties load failed", error);
      res.status(500).json({ error: error?.message || "A megyék nem tölthetők be." });
    }
  });

  router.get("/romania/localities", requireAuthed, async (req, res) => {
    try {
      await ensureAifShopSalesSchema();
      const countyCode = aifCleanCountyCode(req.query.county || req.query.countyCode || req.query.county_code);
      const search = text(req.query.q || req.query.search);
      const limit = Math.min(1000, Math.max(1, Number(req.query.limit || 1000)));
      if (!countyCode) return res.status(400).json({ error: "A megye kiválasztása kötelező." });
      const args = [countyCode];
      const where = ["l.county_code=$1", "l.is_active=true", "c.is_active=true"];
      if (search) {
        args.push(`%${search}%`);
        where.push(`(l.name ILIKE $2 OR COALESCE(l.postal_code,'') ILIKE $2 OR l.siruta_code ILIKE $2)`);
      }
      args.push(limit);
      const result = await pool.query(
        `SELECT
           l.siruta_code, l.name, l.official_name, l.county_code, c.name AS county_name,
           l.parent_siruta_code, l.postal_code, l.locality_type, l.admin_level, l.urban_rural
         FROM aif_ro_localities l
         JOIN aif_ro_counties c ON c.code=l.county_code
         WHERE ${where.join(" AND ")}
         ORDER BY lower(l.name) ASC, l.siruta_code ASC
         LIMIT $${args.length}`,
        args
      );
      res.json({
        ok: true,
        items: result.rows.map((row) => ({
          code: row.siruta_code,
          name: row.name,
          officialName: row.official_name || row.name,
          countyCode: row.county_code,
          countyName: row.county_name,
          parentCode: row.parent_siruta_code || null,
          postalCode: row.postal_code || null,
          localityType: row.locality_type === null ? null : Number(row.locality_type),
          adminLevel: row.admin_level === null ? null : Number(row.admin_level),
          urbanRural: row.urban_rural === null ? null : Number(row.urban_rural),
        })),
      });
    } catch (error) {
      console.error("AIF Romania localities load failed", error);
      res.status(500).json({ error: error?.message || "A helységek nem tölthetők be." });
    }
  });

  router.get("/shop-customers", requireAuthed, async (req, res) => {
    try {
      await ensureAifShopSalesSchema();
      const location = await aifResolveShopLocation(req, pool, req.query.location);
      const search = text(req.query.q || req.query.search);
      const limit = Math.min(5000, Math.max(1, Number(req.query.limit || 60)));
      const args = [location.id];
      const where = ["c.is_active=true", "c.location_id=$1"];
      if (search) {
        args.push(`%${search}%`);
        const searchParam = `$${args.length}`;
        where.push(`(
          c.full_name ILIKE ${searchParam}
          OR COALESCE(c.phone,'') ILIKE ${searchParam}
          OR COALESCE(c.email,'') ILIKE ${searchParam}
          OR COALESCE(c.address,'') ILIKE ${searchParam}
          OR COALESCE(c.city,'') ILIKE ${searchParam}
          OR COALESCE(c.county_name,'') ILIKE ${searchParam}
          OR COALESCE(c.locality_name,'') ILIKE ${searchParam}
          OR COALESCE(c.postal_code,'') ILIKE ${searchParam}
        )`);
      }
      args.push(limit);
      const limitParam = `$${args.length}`;
      const result = await pool.query(
        `SELECT
           c.*,
           l.code AS location_code,
           l.name AS location_name,
           COALESCE(sum(s.balance_due) FILTER (WHERE s.status='completed' AND s.balance_due > 0),0)::numeric AS open_balance,
           count(s.id) FILTER (WHERE s.status='completed' AND s.balance_due > 0)::int AS open_sales,
           count(s.id) FILTER (WHERE s.status='completed')::int AS sale_count,
           COALESCE(sum(s.total) FILTER (
             WHERE s.status='completed'
               AND EXTRACT(YEAR FROM (s.sold_at AT TIME ZONE 'Europe/Bucharest')) = EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))
           ),0)::numeric AS year_purchase_total,
           COALESCE(sum(s.total) FILTER (WHERE s.status='completed'),0)::numeric AS lifetime_purchase_total,
           COALESCE(sum(s.paid_total) FILTER (WHERE s.status='completed'),0)::numeric AS lifetime_paid_total,
           max(s.sold_at) FILTER (WHERE s.status='completed') AS last_sale_at
         FROM aif_shop_customers c
         JOIN aif_locations l ON l.id=c.location_id
         LEFT JOIN aif_shop_sales s
           ON s.customer_id=c.id
          AND s.location_id=c.location_id
         WHERE ${where.join(" AND ")}
         GROUP BY c.id, l.id, l.code, l.name
         ORDER BY
           CASE WHEN COALESCE(sum(s.balance_due) FILTER (WHERE s.status='completed' AND s.balance_due > 0),0) > 0 THEN 0 ELSE 1 END,
           max(s.sold_at) DESC NULLS LAST,
           lower(c.full_name) ASC
         LIMIT ${limitParam}`,
        args
      );
      res.json({
        ok: true,
        location: { id: String(location.id), code: location.code, name: location.name },
        items: result.rows.map(aifShopCustomerResponse),
        count: result.rowCount,
      });
    } catch (error) {
      console.error("AIF shop customers list failed", error);
      const status = Number(error?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A kliensek nem tölthetők be.",
        code: error?.code || null,
      });
    }
  });

  router.post("/shop-customers", requireAuthed, async (req, res) => {
    try {
      await ensureAifShopSalesSchema();
      const body = req.body || {};
      const fullName = text(body.fullName || body.full_name || body.name);
      const phone = text(body.phone);
      const email = emptyToNull(body.email);
      const address = emptyToNull(body.address || body.addressLine || body.address_line);
      const notes = emptyToNull(body.note || body.notes);
      if (!fullName) return res.status(400).json({ error: "A kliens neve kötelező." });

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const location = await aifResolveShopLocation(req, client, body.location);
        const geo = await aifResolveRomaniaCustomerGeo(client, body, { required: true });
        const existing = await client.query(
          `SELECT id
           FROM aif_shop_customers c
           WHERE NULLIF(btrim($1),'') IS NOT NULL
             AND lower(regexp_replace(COALESCE(c.phone,''),'[^0-9+]','','g')) =
                 lower(regexp_replace($1,'[^0-9+]','','g'))
             AND (
               c.location_id=$2
               OR (
                 c.location_id IS NULL
                 AND NOT EXISTS (SELECT 1 FROM aif_shop_sales s WHERE s.customer_id=c.id)
                 AND NOT EXISTS (SELECT 1 FROM aif_shop_customer_payments p WHERE p.customer_id=c.id)
               )
             )
           ORDER BY CASE WHEN c.location_id=$2 THEN 0 ELSE 1 END,
                    c.is_active DESC,
                    c.updated_at DESC
           LIMIT 1
           FOR UPDATE`,
          [phone, location.id]
        );
        let row;
        let duplicate = false;
        if (existing.rowCount) {
          duplicate = true;

          // Üzleti alkalmazott meglévő kliens adatait nem írhatja felül az „Új kliens” úton sem.
          // Különben a szerkesztés gomb elrejtése csak dekoráció lenne, márpedig abból van elég a világban.
          if (normCode(req.session?.role) === "shop") {
            const existingCustomer = await client.query(
              `SELECT c.*, l.code AS location_code, l.name AS location_name
               FROM aif_shop_customers c
               LEFT JOIN aif_locations l ON l.id=c.location_id
               WHERE c.id=$1
               LIMIT 1`,
              [existing.rows[0].id]
            );
            const protectedCustomer = existingCustomer.rows[0] || null;
            if (!protectedCustomer || protectedCustomer.is_active === false || String(protectedCustomer.location_id || "") !== String(location.id)) {
              const error = new Error("Ez a telefonszám már egy védett vagy archivált klienshez tartozik. A meglévő kliens adatait alkalmazott nem módosíthatja; adminisztrátori beavatkozás szükséges.");
              error.statusCode = 409;
              error.code = "shop_customer_existing_protected";
              throw error;
            }
            const currentYear = Number(aifBucharestIsoDate().slice(0, 4));
            const snapshot = await aifLoadShopCustomerSnapshot(client, protectedCustomer.id, currentYear, location.id);
            await client.query("COMMIT");
            return res.json({
              ok: true,
              duplicate: true,
              protected: true,
              item: aifShopCustomerResponse(snapshot || protectedCustomer),
            });
          }

          const updated = await client.query(
            `UPDATE aif_shop_customers
             SET full_name=$2,
                 phone=$3,
                 email=COALESCE($4,email),
                 address=COALESCE($5,address),
                 city=$6,
                 country_code=$7,
                 county_code=$8,
                 county_name=$9,
                 locality_code=$10,
                 locality_name=$11,
                 postal_code=COALESCE($12,postal_code),
                 notes=COALESCE($13,notes),
                 location_id=$14,
                 is_active=true,
                 updated_by=$15,
                 updated_at=now()
             WHERE id=$1
             RETURNING *`,
            [
              existing.rows[0].id, fullName, phone, email, address,
              geo.localityName, geo.countryCode, geo.countyCode, geo.countyName,
              geo.localityCode, geo.localityName, geo.postalCode, notes, location.id, actorFrom(req),
            ]
          );
          row = { ...updated.rows[0], location_code: location.code, location_name: location.name };
        } else {
          const created = await client.query(
            `INSERT INTO aif_shop_customers (
               full_name, phone, email, address, city,
               country_code, county_code, county_name, locality_code, locality_name, postal_code,
               notes, location_id, created_by, updated_by
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
             RETURNING *`,
            [
              fullName, phone || null, email, address, geo.localityName,
              geo.countryCode, geo.countyCode, geo.countyName, geo.localityCode, geo.localityName,
              geo.postalCode, notes, location.id, actorFrom(req),
            ]
          );
          row = { ...created.rows[0], location_code: location.code, location_name: location.name };
        }
        await client.query("COMMIT");
        res.json({ ok: true, duplicate, item: aifShopCustomerResponse(row) });
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("AIF shop customer save failed", error);
      const status = Number(error?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A kliens mentése nem sikerült.",
        code: error?.code || null,
      });
    }
  });

  router.patch("/shop-customers/:id", requireAdminOrSecret, async (req, res) => {
    const customerId = text(req.params.id);
    if (!customerId) return res.status(400).json({ error: "Hiányzik a kliens azonosítója." });

    const client = await pool.connect();
    try {
      await ensureAifShopSalesSchema();
      await client.query("BEGIN");

      const body = req.body || {};
      const requestedLocation = text(body.location || body.locationCode || body.location_code || req.query.location);
      let requestedLocationRow = null;
      if (requestedLocation) requestedLocationRow = await aifResolveShopLocation(req, client, requestedLocation);

      const current = await client.query(
        `SELECT c.*, l.code AS location_code, l.name AS location_name
         FROM aif_shop_customers c
         JOIN aif_locations l ON l.id=c.location_id
         WHERE c.id::text=$1
           AND c.is_active=true
           ${requestedLocationRow ? "AND c.location_id=$2" : ""}
         FOR UPDATE`,
        requestedLocationRow ? [customerId, requestedLocationRow.id] : [customerId]
      );
      if (!current.rowCount) {
        const error = new Error("A kliens nem található ebben az üzletben, vagy már törölve lett.");
        error.statusCode = 404;
        throw error;
      }

      const existing = current.rows[0];
      const location = requestedLocationRow || {
        id: existing.location_id,
        code: existing.location_code,
        name: existing.location_name,
      };
      const has = (...keys) => keys.some((key) => Object.prototype.hasOwnProperty.call(body, key));
      const field = (...keys) => {
        for (const key of keys) {
          if (Object.prototype.hasOwnProperty.call(body, key)) return body[key];
        }
        return undefined;
      };

      const fullName = has("fullName", "full_name", "name")
        ? text(field("fullName", "full_name", "name"))
        : text(existing.full_name);
      if (!fullName) {
        const error = new Error("A kliens neve kötelező.");
        error.statusCode = 400;
        throw error;
      }

      const phone = has("phone") ? text(body.phone) : text(existing.phone);
      const email = has("email") ? emptyToNull(body.email) : existing.email;
      const address = has("address", "addressLine", "address_line")
        ? emptyToNull(field("address", "addressLine", "address_line"))
        : existing.address;
      const notes = has("note", "notes") ? emptyToNull(field("note", "notes")) : existing.notes;

      const geoInputProvided = has(
        "countryCode", "country_code",
        "countyCode", "county_code",
        "localityCode", "locality_code", "sirutaCode", "siruta_code",
        "postalCode", "postal_code"
      );
      let countryCode = existing.country_code || "RO";
      let countyCode = existing.county_code || null;
      let countyName = existing.county_name || null;
      let localityCode = existing.locality_code || null;
      let localityName = existing.locality_name || existing.city || null;
      let postalCode = existing.postal_code || null;
      let city = existing.city || existing.locality_name || null;

      if (geoInputProvided) {
        const requestedCounty = aifCleanCountyCode(field("countyCode", "county_code"));
        const requestedLocality = text(field("localityCode", "locality_code", "sirutaCode", "siruta_code"));
        const requestedCountry = text(field("countryCode", "country_code") || existing.country_code || "RO").toUpperCase() || "RO";
        const requestedPostal = has("postalCode", "postal_code")
          ? emptyToNull(field("postalCode", "postal_code"))
          : existing.postal_code;

        if (requestedCounty || requestedLocality) {
          if (!requestedCounty || !requestedLocality) {
            const error = new Error("Ha a megye vagy a helység változik, mindkettőt ki kell választani.");
            error.statusCode = 400;
            throw error;
          }
          const geo = await aifResolveRomaniaCustomerGeo(client, {
            countryCode: requestedCountry,
            countyCode: requestedCounty,
            localityCode: requestedLocality,
            postalCode: requestedPostal,
          }, { required: true });
          countryCode = geo.countryCode;
          countyCode = geo.countyCode;
          countyName = geo.countyName;
          localityCode = geo.localityCode;
          localityName = geo.localityName;
          postalCode = geo.postalCode;
          city = geo.localityName;
        } else if (has("countyCode", "county_code", "localityCode", "locality_code", "sirutaCode", "siruta_code")) {
          // A főnök szándékosan leürítheti a régi strukturált helyadatot.
          countryCode = requestedCountry;
          countyCode = null;
          countyName = null;
          localityCode = null;
          localityName = null;
          postalCode = requestedPostal;
          city = has("city") ? emptyToNull(body.city) : existing.city;
        } else {
          countryCode = requestedCountry;
          postalCode = requestedPostal;
        }
      }
      if (has("city") && !localityCode) city = emptyToNull(body.city);

      let creditLimit = aifNumber(existing.credit_limit);
      if (has("creditLimit", "credit_limit")) {
        const parsedCreditLimit = toMoney(field("creditLimit", "credit_limit"));
        if (parsedCreditLimit === null || parsedCreditLimit < 0) {
          const error = new Error("A hitelkeret 0 vagy pozitív szám lehet.");
          error.statusCode = 400;
          throw error;
        }
        creditLimit = parsedCreditLimit;
      }

      if (phone) {
        const phoneConflict = await client.query(
          `SELECT id, full_name
           FROM aif_shop_customers
           WHERE id<>$1
             AND location_id=$2
             AND is_active=true
             AND lower(regexp_replace(COALESCE(phone,''),'[^0-9+]','','g')) =
                 lower(regexp_replace($3,'[^0-9+]','','g'))
           LIMIT 1`,
          [existing.id, location.id, phone]
        );
        if (phoneConflict.rowCount) {
          const error = new Error(`Ez a telefonszám ebben az üzletben már egy másik aktív klienshez tartozik: ${phoneConflict.rows[0].full_name || "ismeretlen kliens"}.`);
          error.statusCode = 409;
          error.code = "shop_customer_phone_conflict";
          throw error;
        }
      }

      const actor = actorFrom(req);
      const updated = await client.query(
        `UPDATE aif_shop_customers
         SET full_name=$2,
             phone=$3,
             email=$4,
             address=$5,
             city=$6,
             country_code=$7,
             county_code=$8,
             county_name=$9,
             locality_code=$10,
             locality_name=$11,
             postal_code=$12,
             notes=$13,
             credit_limit=$14,
             updated_by=$15,
             updated_at=now()
         WHERE id=$1
           AND location_id=$16
         RETURNING *`,
        [
          existing.id,
          fullName,
          phone || null,
          email,
          address,
          city,
          countryCode,
          countyCode,
          countyName,
          localityCode,
          localityName,
          postalCode,
          notes,
          creditLimit,
          actor,
          location.id,
        ]
      );

      // A kliens név/telefon pillanatképe a bizonylatfejeken is kövesse az admin javítást.
      await client.query(
        `UPDATE aif_shop_sales
         SET customer_name=$2,
             customer_phone=$3,
             updated_at=now()
         WHERE customer_id=$1
           AND location_id=$4`,
        [existing.id, fullName, phone || null, location.id]
      );

      const currentYear = Number(aifBucharestIsoDate().slice(0, 4));
      const snapshot = await aifLoadShopCustomerSnapshot(client, existing.id, currentYear, location.id);
      await client.query("COMMIT");
      res.json({
        ok: true,
        item: aifShopCustomerResponse(snapshot || { ...updated.rows[0], location_code: location.code, location_name: location.name }),
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF shop customer update failed", error);
      const status = Number(error?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A kliens módosítása nem sikerült.",
        code: error?.code || null,
      });
    } finally {
      client.release();
    }
  });

  router.delete("/shop-customers/:id", requireAdminOrSecret, async (req, res) => {
    const customerId = text(req.params.id);
    if (!customerId) return res.status(400).json({ error: "Hiányzik a kliens azonosítója." });

    const client = await pool.connect();
    try {
      await ensureAifShopSalesSchema();
      await client.query("BEGIN");
      const location = await aifResolveShopLocation(req, client, req.query.location);

      const result = await client.query(
        `SELECT
           c.*,
           (SELECT count(*)::int
              FROM aif_shop_sales s
             WHERE s.customer_id=c.id AND s.location_id=$2) AS sales_count,
           (SELECT count(*)::int
              FROM aif_shop_customer_payments p
             WHERE p.customer_id=c.id AND p.location_id=$2) AS payments_count,
           COALESCE((
             SELECT sum(s.balance_due)
             FROM aif_shop_sales s
             WHERE s.customer_id=c.id
               AND s.location_id=$2
               AND s.status='completed'
               AND s.balance_due > 0
           ),0)::numeric AS open_balance
         FROM aif_shop_customers c
         WHERE c.id::text=$1
           AND c.location_id=$2
           AND c.is_active=true
         FOR UPDATE`,
        [customerId, location.id]
      );
      if (!result.rowCount) {
        const error = new Error("A kliens nem található ebben az üzletben, vagy már törölve lett.");
        error.statusCode = 404;
        throw error;
      }

      const customer = result.rows[0];
      const sales = Number(customer.sales_count || 0);
      const payments = Number(customer.payments_count || 0);
      const openBalance = aifNumber(customer.open_balance);
      if (openBalance > 0.005) {
        const error = new Error(`A kliens nem törölhető, mert még ${openBalance.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON nyitott tartozása van.`);
        error.statusCode = 409;
        error.code = "shop_customer_has_open_balance";
        throw error;
      }

      const actor = actorFrom(req);
      let mode = "deleted";
      if (sales > 0 || payments > 0) {
        mode = "archived";
        await client.query(
          `UPDATE aif_shop_customers
           SET is_active=false,
               updated_by=$2,
               updated_at=now()
           WHERE id=$1 AND location_id=$3`,
          [customer.id, actor, location.id]
        );
      } else {
        try {
          await client.query("SAVEPOINT aif_delete_shop_customer");
          await client.query(
            `DELETE FROM aif_shop_customers WHERE id=$1 AND location_id=$2`,
            [customer.id, location.id]
          );
          await client.query("RELEASE SAVEPOINT aif_delete_shop_customer");
        } catch (deleteError) {
          try { await client.query("ROLLBACK TO SAVEPOINT aif_delete_shop_customer"); } catch {}
          try { await client.query("RELEASE SAVEPOINT aif_delete_shop_customer"); } catch {}
          if (deleteError?.code !== "23503") throw deleteError;
          mode = "archived";
          await client.query(
            `UPDATE aif_shop_customers
             SET is_active=false,
                 updated_by=$2,
                 updated_at=now()
             WHERE id=$1 AND location_id=$3`,
            [customer.id, actor, location.id]
          );
        }
      }

      await client.query("COMMIT");
      res.json({
        ok: true,
        mode,
        id: String(customer.id),
        location: { id: String(location.id), code: location.code, name: location.name },
        usage: { sales, payments, openBalance },
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF shop customer delete failed", error);
      const status = Number(error?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A kliens törlése nem sikerült.",
        code: error?.code || null,
      });
    } finally {
      client.release();
    }
  });

  router.get("/shop-customers/:id", requireAuthed, async (req, res) => {
    try {
      await ensureAifShopSalesSchema();
      await ensureAifConsumptionDocumentsSchema();
      const customerId = text(req.params.id);
      const location = await aifResolveShopLocation(req, pool, req.query.location);
      const currentYear = Number(aifBucharestIsoDate().slice(0, 4));
      const requestedYear = Number(req.query.year || currentYear);
      const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100
        ? requestedYear
        : currentYear;
      const salesLimit = Math.min(500, Math.max(1, Number(req.query.salesLimit || req.query.sales_limit || 200)));
      const paymentsLimit = Math.min(500, Math.max(1, Number(req.query.paymentsLimit || req.query.payments_limit || 200)));

      const customer = await aifLoadShopCustomerSnapshot(pool, customerId, year, location.id);
      if (!customer) return res.status(404).json({ error: "A kliens nem található ebben az üzletben vagy inaktív." });

      const salesResult = await pool.query(
        `SELECT
           s.*,
           l.code AS location_code,
           l.name AS location_name,
           count(sl.id)::int AS line_count,
           COALESCE(sum(sl.quantity),0)::int AS item_count,
           COALESCE(
             (
               SELECT jsonb_agg(
                 jsonb_build_object(
                   'method', sp.method,
                   'amount', sp.amount,
                   'paidAt', sp.paid_at
                 )
                 ORDER BY sp.paid_at ASC, sp.id ASC
               )
               FROM aif_shop_sale_payments sp
               WHERE sp.sale_id=s.id
             ),
             '[]'::jsonb
           ) AS sale_payments,
           COALESCE(
             jsonb_agg(
               jsonb_build_object(
                 'id', sl.id::text,
                 'lineNo', sl.line_no,
                 'variantId', sl.variant_id::text,
                 'productTitle', sl.product_title,
                 'productCode', sl.product_code,
                 'barcode', sl.barcode,
                 'brandName', sl.brand_name,
                 'categoryName', sl.category_name,
                 'subcategoryName', sl.subcategory_name,
                 'colorName', sl.color_name,
                 'colorHex', COALESCE(
                   NULLIF(sale_ct.hex,''),
                   (
                     SELECT NULLIF(ct.hex,'')
                     FROM aif_color_types ct
                     WHERE ct.is_active=true
                       AND NULLIF(btrim(COALESCE(ct.hex,'')),'') IS NOT NULL
                       AND (
                         lower(btrim(COALESCE(ct.code,'')))=lower(btrim(COALESCE(v.color_name,sl.color_name,'')))
                         OR lower(btrim(COALESCE(ct.name_ro,'')))=lower(btrim(COALESCE(v.color_name,sl.color_name,'')))
                         OR lower(btrim(COALESCE(ct.name_hu,'')))=lower(btrim(COALESCE(v.color_name,sl.color_name,'')))
                         OR lower(btrim(COALESCE(ct.name_en,'')))=lower(btrim(COALESCE(v.color_name,sl.color_name,'')))
                         OR lower(btrim(COALESCE(ct.name_de,'')))=lower(btrim(COALESCE(v.color_name,sl.color_name,'')))
                         OR EXISTS (
                           SELECT 1
                           FROM unnest(COALESCE(ct.aliases,'{}'::text[])) alias
                           WHERE lower(btrim(alias))=lower(btrim(COALESCE(v.color_name,sl.color_name,'')))
                         )
                       )
                     ORDER BY ct.sort_order ASC, ct.name_ro ASC
                     LIMIT 1
                   ),
                   NULLIF(v.color_hex,'')
                 ),
                 'size', sl.size,
                 'imageUrl', COALESCE(
                   NULLIF(sl.image_url,''),
                   NULLIF(v.image_url,''),
                   NULLIF(sl.raw->>'imageUrl',''),
                   NULLIF(sl.raw->>'image_url',''),
                   (
                     SELECT NULLIF(vb.image_url,'')
                     FROM aif_product_variants vb
                     WHERE NULLIF(vb.image_url,'') IS NOT NULL
                       AND NULLIF(btrim(COALESCE(sl.barcode,'')),'') IS NOT NULL
                       AND lower(btrim(COALESCE(vb.barcode,'')))=lower(btrim(sl.barcode))
                     ORDER BY CASE WHEN vb.id=sl.variant_id THEN 0 ELSE 1 END,
                              vb.updated_at DESC NULLS LAST,
                              vb.created_at DESC NULLS LAST
                     LIMIT 1
                   ),
                   (
                     SELECT NULLIF(vm.image_url,'')
                     FROM aif_product_variants vm
                     WHERE NULLIF(vm.image_url,'') IS NOT NULL
                       AND v.model_id IS NOT NULL
                       AND vm.model_id=v.model_id
                     ORDER BY CASE WHEN vm.id=sl.variant_id THEN 0 ELSE 1 END,
                              vm.updated_at DESC NULLS LAST,
                              vm.created_at DESC NULLS LAST
                     LIMIT 1
                   ),
                   (
                     SELECT NULLIF(vp.image_url,'')
                     FROM aif_product_variants vp
                     JOIN aif_product_models mp ON mp.id=vp.model_id
                     LEFT JOIN aif_variant_supplier_codes scp
                       ON scp.variant_id=vp.id AND COALESCE(scp.is_active,true)=true
                     WHERE NULLIF(vp.image_url,'') IS NOT NULL
                       AND NULLIF(btrim(COALESCE(sl.product_code,'')),'') IS NOT NULL
                       AND (
                         lower(btrim(COALESCE(vp.internal_sku,'')))=lower(btrim(sl.product_code))
                         OR lower(btrim(COALESCE(mp.model_code,'')))=lower(btrim(sl.product_code))
                         OR lower(btrim(COALESCE(scp.supplier_product_code,'')))=lower(btrim(sl.product_code))
                       )
                     ORDER BY vp.updated_at DESC NULLS LAST,
                              vp.created_at DESC NULLS LAST
                     LIMIT 1
                   )
                 ),
                 'quantity', sl.quantity,
                 'listPrice', sl.list_price,
                 'unitPrice', sl.unit_price,
                 'discountAmount', sl.discount_amount,
                 'discountPercent', sl.discount_percent,
                 'lineTotal', sl.line_total,
                 'buyPriceSnapshot', sl.buy_price_snapshot,
                 'snCod', v.sn_cod
               ) ORDER BY sl.line_no ASC, sl.id ASC
             ) FILTER (WHERE sl.id IS NOT NULL),
             '[]'::jsonb
           ) AS lines
         FROM aif_shop_sales s
         LEFT JOIN aif_locations l ON l.id=s.location_id
         LEFT JOIN aif_shop_sale_lines sl ON sl.sale_id=s.id
         LEFT JOIN aif_product_variants v ON v.id=sl.variant_id
         LEFT JOIN aif_product_models sale_model ON sale_model.id=v.model_id
         LEFT JOIN aif_brand_color_codes sale_bcc
           ON sale_bcc.brand_id=sale_model.brand_id
          AND sale_bcc.is_active=true
          AND lower(btrim(COALESCE(sale_bcc.color_code,'')))=lower(btrim(COALESCE(v.color_code,'')))
         LEFT JOIN aif_color_types sale_ct
           ON sale_ct.id=sale_bcc.color_type_id
          AND sale_ct.is_active=true
         WHERE s.customer_id=$1
           AND s.location_id=$2
           AND EXTRACT(YEAR FROM (s.sold_at AT TIME ZONE 'Europe/Bucharest'))=$3::int
           AND NOT (s.status='cancelled' AND COALESCE(s.raw->>'bonConsumFullyReclassified','false')='true')
         GROUP BY s.id, l.id, l.code, l.name
         ORDER BY s.sold_at DESC, s.id DESC
         LIMIT $4`,
        [customer.id, location.id, year, salesLimit]
      );

      const paymentsResult = await pool.query(
        `SELECT
           p.*,
           l.code AS location_code,
           l.name AS location_name,
           COALESCE(
             jsonb_agg(
               jsonb_build_object(
                 'saleId', s.id::text,
                 'saleNumber', s.sale_number,
                 'soldAt', s.sold_at,
                 'amount', a.amount,
                 'balanceBefore', a.balance_before,
                 'balanceAfter', a.balance_after
               ) ORDER BY a.created_at ASC, a.id ASC
             ) FILTER (WHERE a.id IS NOT NULL),
             '[]'::jsonb
           ) AS allocations
         FROM aif_shop_customer_payments p
         LEFT JOIN aif_locations l ON l.id=p.location_id
         LEFT JOIN aif_shop_customer_payment_allocations a ON a.customer_payment_id=p.id
         LEFT JOIN aif_shop_sales s ON s.id=a.sale_id
         WHERE p.customer_id=$1
           AND p.location_id=$2
         GROUP BY p.id, l.id, l.code, l.name
         ORDER BY p.paid_at DESC, p.id DESC
         LIMIT $3`,
        [customer.id, location.id, paymentsLimit]
      );

      const consumptionDocumentsResult = await pool.query(
        `SELECT d.*, l.code AS location_code, l.name AS location_name,
                count(dl.id)::int AS line_count
         FROM aif_consumption_documents d
         JOIN aif_locations l ON l.id=d.location_id
         LEFT JOIN aif_consumption_document_lines dl ON dl.document_id=d.id
         WHERE d.customer_id=$1
           AND d.location_id=$2
           AND EXTRACT(YEAR FROM d.document_date)=$3::int
         GROUP BY d.id, l.id, l.code, l.name
         ORDER BY d.document_date DESC, d.created_at DESC, d.id DESC
         LIMIT 500`,
        [customer.id, location.id, year]
      );

      const item = aifShopCustomerResponse(customer);
      res.json({
        ok: true,
        location: { id: String(location.id), code: location.code, name: location.name },
        item,
        summary: {
          year,
          yearPurchaseTotal: item.yearPurchaseTotal,
          lifetimePurchaseTotal: item.lifetimePurchaseTotal,
          lifetimePaidTotal: item.lifetimePaidTotal,
          openBalance: item.openBalance,
          openSales: item.openSales,
          saleCount: item.saleCount,
          lastSaleAt: item.lastSaleAt,
        },
        sales: salesResult.rows.map(aifShopCustomerSaleHistoryResponse),
        payments: paymentsResult.rows.map(aifShopCustomerPaymentResponse),
        consumptionDocuments: consumptionDocumentsResult.rows.map(aifBonConsumSummaryResponse),
      });
    } catch (error) {
      console.error("AIF shop customer detail failed", error);
      const status = Number(error?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A kliens adatlapja nem tölthető be.",
        code: error?.code || null,
      });
    }
  });


  function requireAifAdminOnly(req, res, next) {
    if (normCode(req.session?.role) !== "admin") {
      return res.status(403).json({
        error: "A Bon de consum készítése kizárólag Admin jogosultsággal érhető el.",
        code: "admin_only",
      });
    }
    next();
  }

  router.get("/bon-consum/settings", requireAuthed, requireAifAdminOnly, async (_req, res) => {
    try {
      await ensureAifConsumptionDocumentsSchema();
      const result = await pool.query(`SELECT * FROM aif_consumption_document_settings WHERE id=1 LIMIT 1`);
      res.json({ ok: true, settings: aifBonConsumSettingsResponse(result.rows[0] || {}) });
    } catch (error) {
      console.error("AIF bon consum settings failed", error);
      res.status(500).json({ error: error?.message || "A Bon de consum számozási beállításai nem tölthetők be.", code: error?.code || null });
    }
  });

  router.patch("/bon-consum/settings", requireAuthed, requireAifAdminOnly, async (req, res) => {
    const body = req.body || {};
    const series = cleanAifBonConsumSeries(body.series, "");
    const nextNumber = Number(body.nextNumber ?? body.next_number);
    if (!series) return res.status(400).json({ error: "A Bon de consum sorozat megadása kötelező." });
    if (!Number.isInteger(nextNumber) || nextNumber <= 0 || nextNumber > 9999999999) {
      return res.status(400).json({ error: "A következő Bon de consum bizonylatszám 1 és 9 999 999 999 közötti egész szám lehet." });
    }

    const client = await pool.connect();
    try {
      await ensureAifConsumptionDocumentsSchema();
      await client.query("BEGIN");
      const locked = await client.query(`SELECT * FROM aif_consumption_document_settings WHERE id=1 FOR UPDATE`);
      const current = locked.rows[0] || {};
      const year = Number(aifBucharestIsoDate().slice(0, 4));
      const digits = Math.min(10, Math.max(3, Number(current.digits || 6)));
      const includeYear = current.include_year !== false;
      const sequence = String(nextNumber).padStart(digits, "0");
      const candidate = includeYear ? `${series}/${year}/${sequence}` : `${series}/${sequence}`;
      const duplicate = await client.query(`SELECT 1 FROM aif_consumption_documents WHERE document_number=$1 LIMIT 1`, [candidate]);
      if (duplicate.rowCount) {
        throw Object.assign(new Error(`A ${candidate} Bon de consum sorszám már létezik. Állíts be másik következő számot.`), { statusCode: 409, code: "bon_consum_document_number_exists" });
      }
      const updated = await client.query(
        `UPDATE aif_consumption_document_settings
         SET series=$1, next_number=$2, sequence_year=$3, updated_at=now(), updated_by=$4
         WHERE id=1
         RETURNING *`,
        [series, nextNumber, year, actorFrom(req)]
      );
      await client.query("COMMIT");
      return res.json({ ok: true, settings: aifBonConsumSettingsResponse(updated.rows[0] || {}, year) });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF bon consum settings update failed", error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A Bon de consum számozási beállításai nem menthetők.",
        code: error?.code || null,
      });
    } finally {
      client.release();
    }
  });

  router.get("/bon-consum/:id", requireAuthed, requireAifAdminOnly, async (req, res) => {
    try {
      await ensureAifConsumptionDocumentsSchema();
      const detail = await loadAifBonConsumDocument(pool, req.params.id);
      if (!detail) return res.status(404).json({ error: "A Bon de consum nem található." });
      res.json({ ok: true, ...detail });
    } catch (error) {
      console.error("AIF bon consum detail failed", error);
      res.status(500).json({ error: error?.message || "A Bon de consum nem tölthető be.", code: error?.code || null });
    }
  });

  router.post("/shop-customers/:id/bon-consum", requireAuthed, requireAifAdminOnly, async (req, res) => {
    const customerId = text(req.params.id);
    const body = req.body || {};
    const locationInput = text(body.location || body.locationCode || body.location_code || body.locationId || body.location_id);
    const documentDate = cleanAifDocumentDate(body.documentDate || body.document_date) || aifBucharestIsoDate();
    const purpose = text(body.purpose || body.reason || body.scop);
    const recipientName = emptyToNull(body.recipientName || body.recipient_name || body.primitor);
    const note = emptyToNull(body.note || body.notes);
    const rawItems = Array.isArray(body.items)
      ? body.items
      : Array.isArray(body.lineIds)
        ? body.lineIds.map((lineId) => ({ lineId }))
        : Array.isArray(body.line_ids)
          ? body.line_ids.map((lineId) => ({ lineId }))
          : [];
    const lineIds = Array.from(new Set(rawItems.map((item) => text(item?.lineId || item?.line_id || item?.id || item)).filter(Boolean)));

    if (!isUuidText(customerId)) return res.status(400).json({ error: "Érvénytelen kliensazonosító." });
    if (!locationInput) return res.status(400).json({ error: "A készlethely kötelező." });
    if (!purpose) return res.status(400).json({ error: "A Bon de consum felhasználási célja kötelező." });
    if (!lineIds.length) return res.status(400).json({ error: "Legalább egy terméksort válassz ki a Bon de consumhoz." });
    if (lineIds.length > 250) return res.status(400).json({ error: "Egy Bon de consum legfeljebb 250 terméksort tartalmazhat." });
    if (lineIds.some((id) => !isUuidText(id))) return res.status(400).json({ error: "A kijelölt terméksorok között érvénytelen azonosító van." });

    const client = await pool.connect();
    try {
      await ensureAifConsumptionDocumentsSchema();
      await client.query("BEGIN");
      const location = await aifResolveShopLocation(req, client, locationInput);
      const customerResult = await client.query(
        `SELECT * FROM aif_shop_customers
         WHERE id::text=$1 AND location_id=$2 AND is_active=true
         FOR UPDATE`,
        [customerId, location.id]
      );
      if (!customerResult.rowCount) throw Object.assign(new Error("A kliens nem található ebben az üzletben."), { statusCode: 404 });
      const customer = customerResult.rows[0];

      const linesResult = await client.query(
        `SELECT
           sl.*,
           s.sale_number,
           s.sold_at,
           s.status AS sale_status,
           s.sale_type,
           s.payment_status,
           s.paid_total,
           s.balance_due,
           s.raw AS sale_raw,
           v.sn_cod,
           v.color_hex
         FROM aif_shop_sale_lines sl
         JOIN aif_shop_sales s ON s.id=sl.sale_id
         LEFT JOIN aif_product_variants v ON v.id=sl.variant_id
         WHERE sl.id::text = ANY($1::text[])
           AND s.customer_id=$2
           AND s.location_id=$3
         ORDER BY s.sold_at ASC, s.sale_number ASC, sl.line_no ASC
         FOR UPDATE OF sl, s`,
        [lineIds, customer.id, location.id]
      );
      if (linesResult.rows.length !== lineIds.length) {
        throw Object.assign(new Error("A kijelölt terméksorok egy része nem található ennél a kliensnél vagy üzletnél."), { statusCode: 409, code: "bon_consum_line_scope_mismatch" });
      }

      const saleIds = Array.from(new Set(linesResult.rows.map((row) => String(row.sale_id))));
      const paymentUsage = saleIds.length ? await client.query(
        `SELECT DISTINCT sale_id::text AS sale_id
         FROM aif_shop_sale_payments
         WHERE sale_id::text = ANY($1::text[])
           AND amount > 0
         UNION
         SELECT DISTINCT a.sale_id::text AS sale_id
         FROM aif_shop_customer_payment_allocations a
         WHERE a.sale_id::text = ANY($1::text[])
           AND a.amount > 0`,
        [saleIds]
      ) : { rows: [] };
      const paidSaleIds = new Set((paymentUsage.rows || []).map((row) => String(row.sale_id)));

      const exchangeUsage = await client.query(
        `SELECT DISTINCT source_sale_line_id::text AS line_id
         FROM aif_shop_exchanges
         WHERE source_sale_line_id::text = ANY($1::text[])`,
        [lineIds]
      );
      const exchangeLineIds = new Set((exchangeUsage.rows || []).map((row) => String(row.line_id)));

      const returnAuthorizationUsage = await client.query(
        `SELECT DISTINCT sale_line_id::text AS line_id
         FROM aif_shop_return_authorizations
         WHERE sale_line_id::text = ANY($1::text[])`,
        [lineIds]
      );
      const returnAuthorizationLineIds = new Set((returnAuthorizationUsage.rows || []).map((row) => String(row.line_id)));

      const prepared = [];
      for (const row of linesResult.rows) {
        if (row.sale_status !== "completed") {
          throw Object.assign(new Error(`${row.sale_number}: csak lezárt, aktív hiteles eladás vezethető át Bon de consumra.`), { statusCode: 409, code: "bon_consum_sale_not_completed" });
        }
        if (paidSaleIds.has(String(row.sale_id)) || Number(row.paid_total || 0) > 0.005 || !["credit", "unpaid"].includes(String(row.payment_status || ""))) {
          throw Object.assign(new Error(`${row.sale_number}: ehhez a vásárláshoz már fizetés kapcsolódik, ezért nem vezethető át Bon de consumra.`), { statusCode: 409, code: "bon_consum_sale_has_payment" });
        }
        if (exchangeLineIds.has(String(row.id))) {
          throw Object.assign(new Error(`${row.sale_number}: a kijelölt terméksorhoz visszáru vagy csere kapcsolódik, ezért nem vezethető át Bon de consumra.`), { statusCode: 409, code: "bon_consum_line_has_exchange" });
        }
        if (returnAuthorizationLineIds.has(String(row.id))) {
          throw Object.assign(new Error(`${row.sale_number}: a kijelölt terméksorhoz visszáru-engedélyezési előzmény kapcsolódik, ezért nem vezethető át automatikusan Bon de consumra.`), { statusCode: 409, code: "bon_consum_line_has_return_authorization" });
        }
        const qty = Number(row.quantity || 0);
        const purchaseUnitPrice = toMoney(row.buy_price_snapshot);
        const listUnitPrice = toMoney(row.list_price);
        const actualUnitPrice = toMoney(row.unit_price);
        if (!Number.isInteger(qty) || qty <= 0) throw Object.assign(new Error(`${row.product_title || row.product_code || "Termék"}: érvénytelen eladott mennyiség.`), { statusCode: 409 });
        if (purchaseUnitPrice === null) {
          throw Object.assign(new Error(`${row.product_title || row.product_code || "Termék"}: hiányzik az eladáskor rögzített vételár. Hivatalos Bon de consumhoz nem találunk ki adatot.`), { statusCode: 409, code: "bon_consum_missing_purchase_price" });
        }
        if (listUnitPrice === null || listUnitPrice <= 0) {
          throw Object.assign(new Error(`${row.product_title || row.product_code || "Termék"}: nincs érvényes teljes eladási listaár. Hivatalos Bon de consumhoz ezt előbb rendezni kell.`), { statusCode: 409, code: "bon_consum_missing_list_price" });
        }
        if (actualUnitPrice === null) {
          throw Object.assign(new Error(`${row.product_title || row.product_code || "Termék"}: hiányzik az eladáskori egységár.`), { statusCode: 409, code: "bon_consum_missing_sale_price" });
        }

        const movementResult = await client.query(
          `SELECT id, movement_type, source_type, source_id, qty_delta, qty_before, qty_after, raw
           FROM aif_stock_movements
           WHERE location_id=$1
             AND variant_id=$2
             AND (
               source_id=$3
               OR raw->>'saleId'=$3
             )
             AND (
               source_type='shop_sale'
               OR raw->>'reason'='shop_sale'
             )
           ORDER BY created_at ASC, id ASC
           FOR UPDATE`,
          [location.id, row.variant_id, String(row.sale_id)]
        );
        if (movementResult.rows.length !== 1) {
          throw Object.assign(new Error(`${row.sale_number}: nem azonosítható egyértelműen, melyik készletmozgás tartozik ehhez az eladáshoz. A Bon de consum ezért nem véglegesíthető.`), { statusCode: 409, code: "bon_consum_stock_movement_ambiguous" });
        }
        const movement = movementResult.rows[0];
        if (Number(movement.qty_delta || 0) !== -qty) {
          throw Object.assign(new Error(`${row.sale_number}: az eredeti készletmozgás mennyisége nem egyezik a terméksorral. Előbb ezt az eltérést kell kivizsgálni.`), { statusCode: 409, code: "bon_consum_stock_movement_qty_mismatch" });
        }

        const saleRaw = row.sale_raw && typeof row.sale_raw === "object" ? row.sale_raw : {};
        const salesTvaRate = toMoney(saleRaw.salesTvaRate ?? saleRaw.saleTvaRate);
        const purchaseValue = aifRoundMoney(qty * purchaseUnitPrice);
        const retailValue = aifRoundMoney(qty * listUnitPrice);
        const actualSaleValue = aifRoundMoney(row.line_total);
        const discountValue = aifRoundMoney(row.discount_amount);
        prepared.push({
          row,
          movement,
          qty,
          purchaseUnitPrice,
          listUnitPrice,
          actualUnitPrice,
          salesTvaRate,
          purchaseValue,
          retailValue,
          actualSaleValue,
          discountValue,
        });
      }

      const actor = actorFrom(req);
      const number = await allocateAifBonConsumDocumentNumber(client, {
        sequenceYear: Number(documentDate.slice(0, 4)),
        actor,
      });
      const totalQty = prepared.reduce((sum, item) => sum + item.qty, 0);
      const purchaseTotal = aifRoundMoney(prepared.reduce((sum, item) => sum + item.purchaseValue, 0));
      const retailTotal = aifRoundMoney(prepared.reduce((sum, item) => sum + item.retailValue, 0));
      const actualSaleTotal = aifRoundMoney(prepared.reduce((sum, item) => sum + item.actualSaleValue, 0));
      const discountTotal = aifRoundMoney(prepared.reduce((sum, item) => sum + item.discountValue, 0));

      const documentInsert = await client.query(
        `INSERT INTO aif_consumption_documents (
           document_number, series, sequence_number, sequence_year, document_date,
           location_id, customer_id, customer_name, customer_phone, recipient_name,
           purpose, note, actor, status, total_qty, purchase_total, retail_total,
           actual_sale_total, discount_total, currency_code, raw
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'issued',$14,$15,$16,$17,$18,'RON',$19::jsonb
         ) RETURNING *`,
        [
          number.documentNumber,
          number.series,
          number.sequenceNumber,
          number.sequenceYear,
          documentDate,
          location.id,
          customer.id,
          customer.full_name,
          customer.phone || null,
          recipientName || customer.full_name,
          purpose,
          note,
          actor,
          totalQty,
          purchaseTotal,
          retailTotal,
          actualSaleTotal,
          discountTotal,
          JSON.stringify({
            source: "admin_customer_purchase_history",
            valuation: {
              purchase: "sale_line_buy_price_snapshot",
              retail: "sale_line_list_price_full_value",
              actualSale: "sale_line_actual_value",
            },
            stockEffect: "reclassified_existing_sale_movement_no_second_stock_decrease",
            numbering: {
              series: number.series,
              sequenceNumber: number.sequenceNumber,
              sequenceYear: number.sequenceYear,
              nextNumber: number.nextNumber,
              source: "admin_manual_start_with_continuation",
            },
          }),
        ]
      );
      const document = documentInsert.rows[0];

      let lineNo = 1;
      for (const item of prepared) {
        const row = item.row;
        await client.query(
          `INSERT INTO aif_consumption_document_lines (
             document_id, line_no, source_sale_id, source_sale_line_id, source_sale_number, source_sold_at,
             variant_id, product_title, product_code, sn_cod, barcode, brand_name, category_name, subcategory_name,
             color_name, size, image_url, quantity, purchase_unit_price, list_unit_price, actual_unit_price,
             sales_tva_rate, purchase_value, retail_value, actual_sale_value, discount_value, raw
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27::jsonb
           )`,
          [
            document.id,
            lineNo++,
            String(row.sale_id),
            String(row.id),
            row.sale_number,
            row.sold_at,
            row.variant_id ? String(row.variant_id) : null,
            row.product_title || null,
            row.product_code || null,
            row.sn_cod || null,
            row.barcode || null,
            row.brand_name || null,
            row.category_name || null,
            row.subcategory_name || null,
            row.color_name || null,
            row.size || null,
            row.image_url || null,
            item.qty,
            item.purchaseUnitPrice,
            item.listUnitPrice,
            item.actualUnitPrice,
            item.salesTvaRate,
            item.purchaseValue,
            item.retailValue,
            item.actualSaleValue,
            item.discountValue,
            JSON.stringify({
              sourceSaleId: String(row.sale_id),
              sourceSaleLineId: String(row.id),
              sourceSaleNumber: row.sale_number,
              purchasePriceSource: "sale_line_buy_price_snapshot",
              retailPriceSource: "sale_line_list_price",
              originalPaymentStatus: row.payment_status,
              originalSaleType: row.sale_type,
            }),
          ]
        );

        await client.query(
          `UPDATE aif_stock_movements
           SET source_type='bon_consum',
               source_id=$2,
               actor=$3,
               raw=COALESCE(raw,'{}'::jsonb) || $4::jsonb
           WHERE id=$1`,
          [
            item.movement.id,
            String(document.id),
            actor,
            JSON.stringify({
              reason: "bon_consum",
              documentId: String(document.id),
              documentNumber: number.documentNumber,
              sourceSaleId: String(row.sale_id),
              sourceSaleLineId: String(row.id),
              sourceSaleNumber: row.sale_number,
              buyPriceSnapshot: item.purchaseUnitPrice,
              listPrice: item.listUnitPrice,
              unitPrice: item.actualUnitPrice,
              purchaseValue: item.purchaseValue,
              retailValue: item.retailValue,
              stockEffect: "reclassified_existing_sale_movement",
            }),
          ]
        );

        await client.query(`DELETE FROM aif_shop_sale_lines WHERE id=$1`, [row.id]);
      }

      for (const saleId of saleIds) {
        const totals = await client.query(
          `SELECT count(*)::int AS line_count,
                  COALESCE(sum(quantity),0)::int AS item_count,
                  COALESCE(sum(quantity * list_price),0)::numeric AS subtotal,
                  COALESCE(sum(discount_amount),0)::numeric AS discount_total,
                  COALESCE(sum(line_total),0)::numeric AS total
           FROM aif_shop_sale_lines
           WHERE sale_id=$1`,
          [saleId]
        );
        const saleTotals = totals.rows[0] || {};
        const lineCount = Number(saleTotals.line_count || 0);
        const remainingTotal = aifRoundMoney(saleTotals.total || 0);
        await client.query(
          `UPDATE aif_shop_sales
           SET status=$2,
               payment_status=$3,
               subtotal=$4,
               discount_total=$5,
               total=$6,
               paid_total=0,
               balance_due=$6,
               raw=COALESCE(raw,'{}'::jsonb) || $7::jsonb,
               updated_at=now()
           WHERE id=$1`,
          [
            saleId,
            lineCount > 0 ? "completed" : "cancelled",
            lineCount > 0 ? "credit" : "unpaid",
            aifRoundMoney(saleTotals.subtotal || 0),
            aifRoundMoney(saleTotals.discount_total || 0),
            remainingTotal,
            JSON.stringify({
              bonConsumReclassified: true,
              bonConsumFullyReclassified: lineCount === 0,
              lastBonConsumDocumentId: String(document.id),
              lastBonConsumDocumentNumber: number.documentNumber,
            }),
          ]
        );
        await client.query(
          `INSERT INTO aif_shop_sale_events (sale_id,event_type,actor,note,payload)
           VALUES ($1,'bon_consum_reclassified',$2,$3,$4::jsonb)`,
          [
            saleId,
            actor,
            `Bon de consum: ${number.documentNumber}`,
            JSON.stringify({
              documentId: String(document.id),
              documentNumber: number.documentNumber,
              remainingTotal,
            }),
          ]
        );
      }

      await client.query("COMMIT");
      const detail = await loadAifBonConsumDocument(pool, document.id);
      res.json({ ok: true, ...detail });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF create bon consum failed", error);
      const status = Number(error?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A Bon de consum létrehozása nem sikerült.",
        code: error?.code || null,
      });
    } finally {
      client.release();
    }
  });


  router.patch("/shop-customers/:customerId/sales/:saleId/lines/:lineId/discount", requireAuthed, async (req, res) => {
    const customerId = text(req.params.customerId);
    const saleId = text(req.params.saleId);
    const lineId = text(req.params.lineId);
    const body = req.body || {};
    const requestedPercent = toMoney(body.discountPercent ?? body.discount_percent);
    const note = emptyToNull(body.note);

    if (!isUuidText(customerId) || !isUuidText(saleId) || !isUuidText(lineId)) {
      return res.status(400).json({ error: "Érvénytelen kliens-, vásárlás- vagy terméksor azonosító." });
    }
    if (requestedPercent === null || requestedPercent < 0 || requestedPercent > 100) {
      return res.status(400).json({ error: "A kedvezmény 0 és 100% között lehet." });
    }

    const client = await pool.connect();
    try {
      await ensureAifShopSalesSchema();
      await client.query("BEGIN");
      const location = await aifResolveShopLocation(req, client, body.location);

      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`aif_customer_late_discount:${saleId}`]);

      const customerLock = await client.query(
        `SELECT id FROM aif_shop_customers
         WHERE id::text=$1 AND location_id=$2 AND is_active=true
         FOR UPDATE`,
        [customerId, location.id],
      );
      if (!customerLock.rowCount) {
        const error = new Error("A kliens nem található ebben az üzletben vagy inaktív.");
        error.statusCode = 404;
        throw error;
      }

      const saleResult = await client.query(
        `SELECT * FROM aif_shop_sales
         WHERE id::text=$1 AND customer_id=$2 AND location_id=$3 AND status='completed'
         FOR UPDATE`,
        [saleId, customerLock.rows[0].id, location.id],
      );
      if (!saleResult.rowCount) {
        const error = new Error("A klienshez tartozó vásárlás nem található.");
        error.statusCode = 404;
        throw error;
      }
      const sale = saleResult.rows[0];
      if (aifNumber(sale.balance_due) <= 0.005) {
        const error = new Error("Utólagos kedvezmény csak nyitott tartozásos vásárlásnál adható.");
        error.statusCode = 409;
        error.code = "late_discount_sale_already_paid";
        throw error;
      }

      const lineResult = await client.query(
        `SELECT * FROM aif_shop_sale_lines
         WHERE id::text=$1 AND sale_id=$2
         FOR UPDATE`,
        [lineId, sale.id],
      );
      if (!lineResult.rowCount) {
        const error = new Error("A kiválasztott terméksor nem található ebben a vásárlásban.");
        error.statusCode = 404;
        throw error;
      }
      const line = lineResult.rows[0];
      const currentPercent = aifNumber(line.discount_percent);
      const nextPercent = Math.max(0, Math.min(100, Number(requestedPercent)));

      // Már részben vagy teljesen visszavett tétel árát nem írjuk át utólag.
      // A visszáru a saját pillanatképével már pénzügyi és készlet-eseménnyé vált;
      // ha ezt a sale line-t később átáraznánk, a történeti visszáru és a tartozás szétesne.
      const returnedQtyResult = await client.query(
        `SELECT COALESCE(sum(returned_qty),0)::numeric AS returned_qty
         FROM aif_shop_exchanges
         WHERE source_sale_line_id=$1
           AND status='completed'`,
        [line.id],
      );
      const returnedQty = Math.max(0, aifNumber(returnedQtyResult.rows[0]?.returned_qty));
      if (returnedQty > 0.0001) {
        const error = new Error("Ehhez a terméksorhoz már tartozik lezárt visszáru, ezért az utólagos kedvezmény nem módosítható. A visszáru történeti árát és a kliens tartozását nem írjuk át utólag.");
        error.statusCode = 409;
        error.code = "late_discount_returned_line_locked";
        throw error;
      }

      // A nyitott tartozásos tétel kedvezménye utólag módosítható vagy 0%-ra törölhető.
      // A tartozást NEM számoljuk újra sale.total - paid_total képlettel, mert a balance_due
      // már tartalmazhat korábbi visszáru-jóváírást. Csak ennek a sornak az értékváltozását
      // vezetjük rá a már helyes aktuális tartozásra.
      const quantity = Math.max(1, aifNumber(line.quantity));
      const listPrice = aifRoundMoney(line.list_price);
      const previousUnitPrice = aifRoundMoney(line.unit_price);
      const previousLineTotal = aifRoundMoney(line.line_total);
      const previousLineDiscount = aifRoundMoney(line.discount_amount);
      const nextUnitPrice = aifDiscountedUnitPrice(listPrice, nextPercent);
      const nextLineTotal = aifRoundMoney(nextUnitPrice * quantity);
      const nextLineDiscount = aifRoundMoney(Math.max(0, listPrice * quantity - nextLineTotal));
      const paidTotal = aifRoundMoney(sale.paid_total);
      const previousBalanceDue = aifRoundMoney(sale.balance_due);
      const balanceDelta = aifRoundMoney(nextLineTotal - previousLineTotal);
      const nextBalanceDueRaw = aifRoundMoney(previousBalanceDue + balanceDelta);

      if (nextBalanceDueRaw < -0.005) {
        const maxAdditionalDiscount = aifRoundMoney(Math.max(0, previousBalanceDue));
        const error = new Error(`Ekkora kedvezmény már pénzvisszatérítést igényelne. Ennél a vásárlásnál legfeljebb ${maxAdditionalDiscount.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON további kedvezmény adható.`);
        error.statusCode = 409;
        error.code = "late_discount_exceeds_open_balance";
        error.maxAdditionalDiscount = maxAdditionalDiscount;
        throw error;
      }
      const balanceDue = aifRoundMoney(Math.max(0, nextBalanceDueRaw));

      if (Math.abs(nextPercent - currentPercent) < 0.0001 && Math.abs(nextLineTotal - previousLineTotal) < 0.005) {
        const currentYear = Number(aifBucharestIsoDate().slice(0, 4));
        const snapshot = await aifLoadShopCustomerSnapshot(client, customerLock.rows[0].id, currentYear, location.id);
        await client.query("COMMIT");
        return res.json({
          ok: true,
          unchanged: true,
          saleId: String(sale.id),
          lineId: String(line.id),
          discountPercent: currentPercent,
          discountAmount: previousLineDiscount,
          unitPrice: previousUnitPrice,
          lineTotal: previousLineTotal,
          saleTotal: aifNumber(sale.total),
          paidTotal: aifNumber(sale.paid_total),
          balanceDue: aifNumber(sale.balance_due),
          paymentStatus: sale.payment_status,
          openBalance: aifNumber(snapshot?.open_balance),
        });
      }

      await client.query(
        `UPDATE aif_shop_sale_lines
         SET unit_price=$2,
             discount_amount=$3,
             discount_percent=$4,
             line_total=$5,
             raw=COALESCE(raw,'{}'::jsonb) || $6::jsonb
         WHERE id=$1`,
        [
          line.id,
          nextUnitPrice,
          nextLineDiscount,
          nextPercent,
          nextLineTotal,
          JSON.stringify({
            lateDiscountUpdatedAt: new Date().toISOString(),
            lateDiscountUpdatedBy: actorFrom(req),
            lateDiscountPreviousPercent: currentPercent,
            lateDiscountPreviousAmount: previousLineDiscount,
            lateDiscountPreviousBalanceDue: previousBalanceDue,
            lateDiscountBalanceDelta: balanceDelta,
            lateDiscountNextBalanceDue: balanceDue,
            lateDiscountBalanceStrategy: "previous_balance_plus_line_delta",
            lateDiscountNote: note,
          }),
        ],
      );

      const totalsResult = await client.query(
        `SELECT
           COALESCE(sum(list_price * quantity),0)::numeric AS subtotal,
           COALESCE(sum(line_total),0)::numeric AS total
         FROM aif_shop_sale_lines
         WHERE sale_id=$1`,
        [sale.id],
      );
      const subtotal = aifRoundMoney(totalsResult.rows[0]?.subtotal);
      const total = aifRoundMoney(totalsResult.rows[0]?.total);
      const discountTotal = aifRoundMoney(Math.max(0, subtotal - total));
      const paymentStatus = balanceDue <= 0.005 ? "paid" : paidTotal > 0.005 ? "partial" : "credit";

      await client.query(
        `UPDATE aif_shop_sales
         SET subtotal=$2, discount_total=$3, total=$4, balance_due=$5, payment_status=$6, updated_at=now()
         WHERE id=$1`,
        [sale.id, subtotal, discountTotal, total, balanceDue, paymentStatus],
      );

      await client.query(
        `INSERT INTO aif_shop_sale_events (sale_id, event_type, actor, note, payload)
         VALUES ($1,'late_discount',$2,$3,$4::jsonb)`,
        [
          sale.id,
          actorFrom(req),
          note,
          JSON.stringify({
            source: "shop_customer_open_balance",
            customerId: String(customerLock.rows[0].id),
            lineId: String(line.id),
            productTitle: line.product_title || null,
            quantity,
            returnedQty,
            balanceStrategy: "previous_balance_plus_line_delta",
            balanceDelta,
            before: {
              discountPercent: currentPercent,
              discountAmount: previousLineDiscount,
              unitPrice: previousUnitPrice,
              lineTotal: previousLineTotal,
              saleTotal: aifNumber(sale.total),
              balanceDue: aifNumber(sale.balance_due),
            },
            after: {
              discountPercent: nextPercent,
              discountAmount: nextLineDiscount,
              unitPrice: nextUnitPrice,
              lineTotal: nextLineTotal,
              saleTotal: total,
              balanceDue,
            },
          }),
        ],
      );

      await client.query(
        `UPDATE aif_shop_customers SET updated_by=$2, updated_at=now() WHERE id=$1 AND location_id=$3`,
        [customerLock.rows[0].id, actorFrom(req), location.id],
      );

      const currentYear = Number(aifBucharestIsoDate().slice(0, 4));
      const snapshot = await aifLoadShopCustomerSnapshot(client, customerLock.rows[0].id, currentYear, location.id);

      await client.query("COMMIT");
      return res.json({
        ok: true,
        unchanged: false,
        saleId: String(sale.id),
        lineId: String(line.id),
        discountPercent: nextPercent,
        discountAmount: nextLineDiscount,
        unitPrice: nextUnitPrice,
        lineTotal: nextLineTotal,
        saleSubtotal: subtotal,
        saleDiscountTotal: discountTotal,
        saleTotal: total,
        paidTotal,
        balanceDue,
        paymentStatus,
        openBalance: aifNumber(snapshot?.open_balance),
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF late customer sale discount failed", error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "Az utólagos kedvezmény mentése nem sikerült.",
        code: error?.code || null,
        maxAdditionalDiscount: error?.maxAdditionalDiscount ?? null,
      });
    } finally {
      client.release();
    }
  });

  router.delete("/shop-customers/:customerId/sales/:saleId", requireAdminOrSecret, async (req, res) => {
    const customerId = text(req.params.customerId);
    const saleId = text(req.params.saleId);
    if (!customerId || !saleId) return res.status(400).json({ error: "Hiányzik a kliens vagy a vásárlás azonosítója." });

    const client = await pool.connect();
    try {
      await ensureAifShopSalesSchema();
      await client.query("BEGIN");
      const location = await aifResolveShopLocation(req, client, req.query.location);

      const customerResult = await client.query(
        `SELECT id, full_name, phone
         FROM aif_shop_customers
         WHERE id::text=$1
           AND location_id=$2
           AND is_active=true
         FOR UPDATE`,
        [customerId, location.id]
      );
      if (!customerResult.rowCount) {
        const error = new Error("A kliens nem található ebben az üzletben vagy inaktív.");
        error.statusCode = 404;
        throw error;
      }
      const customer = customerResult.rows[0];

      const saleResult = await client.query(
        `SELECT s.*, l.code AS location_code, l.name AS location_name
         FROM aif_shop_sales s
         JOIN aif_locations l ON l.id=s.location_id
         WHERE s.id::text=$1
           AND s.customer_id=$2
           AND s.location_id=$3
         FOR UPDATE OF s`,
        [saleId, customer.id, location.id]
      );
      if (!saleResult.rowCount) {
        const error = new Error("Ez a vásárlás nem tartozik ehhez a klienshez ebben az üzletben, vagy már törölve lett tőle.");
        error.statusCode = 404;
        throw error;
      }
      const sale = saleResult.rows[0];

      const allocations = await client.query(
        `SELECT count(*)::int AS count
         FROM aif_shop_customer_payment_allocations
         WHERE sale_id=$1`,
        [sale.id]
      );
      if (Number(allocations.rows[0]?.count || 0) > 0) {
        const error = new Error("Ehhez a vásárláshoz már tartozásbefizetés kapcsolódik, ezért nem választható le automatikusan. Előbb a kapcsolt befizetést kell rendezni.");
        error.statusCode = 409;
        error.code = "customer_sale_has_payment_allocations";
        throw error;
      }

      const actor = actorFrom(req);
      const detachedAt = new Date().toISOString();
      const detachAudit = {
        source: "shop_customer_sale_detach",
        customerId: String(customer.id),
        customerName: customer.full_name || sale.customer_name || null,
        customerPhone: customer.phone || sale.customer_phone || null,
        detachedAt,
        detachedBy: actor,
      };

      await client.query(
        `UPDATE aif_shop_sales
         SET customer_id=NULL,
             customer_name=NULL,
             customer_phone=NULL,
             raw=COALESCE(raw,'{}'::jsonb) || jsonb_build_object('customerDetachment',$2::jsonb),
             updated_at=now()
         WHERE id=$1 AND location_id=$3`,
        [sale.id, JSON.stringify(detachAudit), location.id]
      );

      await client.query(
        `INSERT INTO aif_shop_sale_events (sale_id, event_type, actor, note, payload)
         VALUES ($1,'customer_detached',$2,$3,$4::jsonb)`,
        [
          sale.id,
          actor,
          `Vásárlás leválasztva a kliensről: ${customer.full_name || customer.id}`,
          JSON.stringify({
            ...detachAudit,
            saleNumber: sale.sale_number,
            total: aifNumber(sale.total),
            paidTotal: aifNumber(sale.paid_total),
            balanceDue: aifNumber(sale.balance_due),
            locationId: String(sale.location_id),
            locationCode: sale.location_code,
            locationName: sale.location_name,
          }),
        ]
      );

      await client.query(
        `UPDATE aif_shop_customers
         SET updated_by=$2, updated_at=now()
         WHERE id=$1 AND location_id=$3`,
        [customer.id, actor, location.id]
      );

      const currentYear = Number(aifBucharestIsoDate().slice(0, 4));
      const snapshot = await aifLoadShopCustomerSnapshot(client, customer.id, currentYear, location.id);
      await client.query("COMMIT");
      res.json({
        ok: true,
        mode: "detached_from_customer",
        customerId: String(customer.id),
        saleId: String(sale.id),
        saleNumber: sale.sale_number,
        item: aifShopCustomerResponse(snapshot || { ...customer, location_id: location.id, location_code: location.code, location_name: location.name }),
        openBalance: aifNumber(snapshot?.open_balance),
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF shop customer sale detach failed", error);
      const status = Number(error?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A vásárlás leválasztása nem sikerült.",
        code: error?.code || null,
      });
    } finally {
      client.release();
    }
  });

  router.post("/shop-customers/:id/payments", requireAuthed, async (req, res) => {
    const customerId = text(req.params.id);
    const body = req.body || {};
    const amount = aifRoundMoney(toMoney(body.amount) || 0);
    const method = normCode(body.method || body.paymentMethod || body.payment_method);
    const allowedMethods = new Set(["cash", "card", "bank_transfer"]);
    const reference = emptyToNull(body.reference);
    const note = emptyToNull(body.note);
    const idempotencyKey = text(req.get("Idempotency-Key") || body.idempotencyKey || body.idempotency_key).slice(0, 200);

    if (!customerId) return res.status(400).json({ error: "Hiányzik a kliens azonosítója." });
    if (amount <= 0) return res.status(400).json({ error: "A befizetés összege legyen nagyobb nullánál." });
    if (!allowedMethods.has(method)) return res.status(400).json({ error: "Érvénytelen befizetési mód." });
    if (!idempotencyKey) return res.status(400).json({ error: "Hiányzik a befizetés biztonsági azonosítója." });

    const client = await pool.connect();
    try {
      await ensureAifShopSalesSchema();
      await client.query("BEGIN");
      const location = await aifResolveShopLocation(req, client, body.location);

      const duplicate = await client.query(
        `SELECT id, customer_id, location_id
         FROM aif_shop_customer_payments
         WHERE client_request_id=$1
         LIMIT 1`,
        [idempotencyKey]
      );
      if (duplicate.rowCount) {
        if (
          String(duplicate.rows[0].customer_id) !== String(customerId)
          || String(duplicate.rows[0].location_id || "") !== String(location.id)
        ) {
          const collision = new Error("Ez a befizetési azonosító már egy másik klienshez vagy üzlethez tartozik.");
          collision.statusCode = 409;
          throw collision;
        }
        const payment = await aifLoadShopCustomerPayment(client, duplicate.rows[0].id);
        const currentYear = Number(aifBucharestIsoDate().slice(0, 4));
        const customer = await aifLoadShopCustomerSnapshot(client, customerId, currentYear, location.id);
        await client.query("COMMIT");
        return res.json({
          ok: true,
          duplicate: true,
          payment,
          item: aifShopCustomerResponse(customer || {}),
          openBalance: aifNumber(customer?.open_balance),
        });
      }

      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`aif_shop_shift:${location.id}`]);
      await aifAssertNoPendingShopShiftHandover(client, location.id, actorFrom(req));

      const customerLock = await client.query(
        `SELECT id
         FROM aif_shop_customers
         WHERE id::text=$1
           AND location_id=$2
           AND is_active=true
         FOR UPDATE`,
        [customerId, location.id]
      );
      if (!customerLock.rowCount) {
        const error = new Error("A kliens nem található vagy inaktív.");
        error.statusCode = 404;
        throw error;
      }

      const openSales = await client.query(
        `SELECT id, sale_number, sold_at, total, paid_total, balance_due
         FROM aif_shop_sales
         WHERE customer_id=$1
           AND location_id=$2
           AND status='completed'
           AND balance_due > 0
         ORDER BY sold_at ASC, id ASC
         FOR UPDATE`,
        [customerLock.rows[0].id, location.id]
      );
      const openBalance = aifRoundMoney(
        openSales.rows.reduce((sum, sale) => sum + aifNumber(sale.balance_due), 0)
      );
      if (openBalance <= 0) {
        const error = new Error("Ennél a kliensnél nincs nyitott tartozás.");
        error.statusCode = 400;
        error.code = "customer_has_no_open_balance";
        throw error;
      }
      if (amount > openBalance + 0.005) {
        const error = new Error(`A befizetés nem lehet nagyobb a nyitott tartozásnál: ${openBalance.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON.`);
        error.statusCode = 400;
        error.code = "customer_payment_exceeds_open_balance";
        error.openBalance = openBalance;
        throw error;
      }

      const paymentInsert = await client.query(
        `INSERT INTO aif_shop_customer_payments (
           customer_id, location_id, amount, method, paid_at, actor,
           reference, note, client_request_id, raw
         ) VALUES ($1,$2,$3,$4,now(),$5,$6,$7,$8,$9::jsonb)
         RETURNING id`,
        [
          customerLock.rows[0].id,
          location.id,
          amount,
          method,
          actorFrom(req),
          reference,
          note,
          idempotencyKey,
          JSON.stringify({ source: "shop_customer_payment", allocation: "fifo_oldest_sale_first" }),
        ]
      );
      const paymentId = paymentInsert.rows[0].id;
      let remaining = amount;

      for (const sale of openSales.rows) {
        if (remaining <= 0.005) break;
        const balanceBefore = aifRoundMoney(sale.balance_due);
        const allocation = aifRoundMoney(Math.min(remaining, balanceBefore));
        if (allocation <= 0) continue;
        const balanceAfter = aifRoundMoney(Math.max(0, balanceBefore - allocation));
        const paidAfter = aifRoundMoney(Math.min(aifNumber(sale.total), aifNumber(sale.paid_total) + allocation));
        const paymentStatus = balanceAfter <= 0.005 ? "paid" : "partial";

        await client.query(
          `UPDATE aif_shop_sales
           SET paid_total=$2,
               balance_due=$3,
               payment_status=$4,
               updated_at=now()
           WHERE id=$1`,
          [sale.id, paidAfter, balanceAfter, paymentStatus]
        );

        await client.query(
          `INSERT INTO aif_shop_customer_payment_allocations (
             customer_payment_id, sale_id, amount, balance_before, balance_after
           ) VALUES ($1,$2,$3,$4,$5)`,
          [paymentId, sale.id, allocation, balanceBefore, balanceAfter]
        );

        await client.query(
          `INSERT INTO aif_shop_sale_payments (
             sale_id, method, amount, paid_at, actor, reference, note, raw, customer_payment_id
           ) VALUES ($1,$2,$3,now(),$4,$5,$6,$7::jsonb,$8)`,
          [
            sale.id,
            method,
            allocation,
            actorFrom(req),
            reference,
            note,
            JSON.stringify({
              source: "shop_customer_payment",
              customerId: String(customerLock.rows[0].id),
              paymentId: String(paymentId),
              balanceBefore,
              balanceAfter,
            }),
            paymentId,
          ]
        );

        await client.query(
          `INSERT INTO aif_shop_sale_events (sale_id, event_type, actor, note, payload)
           VALUES ($1,'customer_payment',$2,$3,$4::jsonb)`,
          [
            sale.id,
            actorFrom(req),
            note,
            JSON.stringify({
              customerPaymentId: String(paymentId),
              amount: allocation,
              method,
              reference,
              balanceBefore,
              balanceAfter,
            }),
          ]
        );
        remaining = aifRoundMoney(remaining - allocation);
      }

      if (remaining > 0.005) {
        const error = new Error("A befizetés teljes összege nem volt hozzárendelhető a nyitott tartozásokhoz.");
        error.statusCode = 409;
        error.code = "customer_payment_allocation_incomplete";
        throw error;
      }

      await client.query(
        `UPDATE aif_shop_customers
         SET updated_by=$2, updated_at=now()
         WHERE id=$1 AND location_id=$3`,
        [customerLock.rows[0].id, actorFrom(req), location.id]
      );

      const payment = await aifLoadShopCustomerPayment(client, paymentId);
      const currentYear = Number(aifBucharestIsoDate().slice(0, 4));
      const customer = await aifLoadShopCustomerSnapshot(client, customerId, currentYear, location.id);
      await client.query("COMMIT");
      res.json({
        ok: true,
        duplicate: false,
        payment,
        item: aifShopCustomerResponse(customer || {}),
        openBalance: aifNumber(customer?.open_balance),
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF shop customer payment failed", error);
      const status = Number(error?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A befizetés rögzítése nem sikerült.",
        code: error?.code || null,
        openBalance: error?.openBalance ?? null,
      });
    } finally {
      client.release();
    }
  });


  return router;
}
