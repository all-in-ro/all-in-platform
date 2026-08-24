import express from "express";
import { createHash } from "node:crypto";

/**
 * Vezetői eladási központ.
 *
 * Az élő üzleti eladásokat és a készletet/pénztárat nem érintő történeti
 * adatokat egy közös elemzési rétegben kezeli. A történeti táblák szándékosan
 * külön élnek az aif_shop_sales tábláktól: egy 2025-ös import soha nem mozdíthat
 * készletet, pénztárat, kliens-egyenleget vagy bizonylatsorszámot.
 */
export default function createAifAdminSalesCommandCenterRouter(deps) {
  const {
    pool,
    requireAdminOrSecret,
    ensureAifShopSalesSchema,
    actorFrom,
    text: depText,
    normCode: depNormCode,
    aifNumber: depNumber,
    aifBucharestIsoDate,
    aifValidIsoDate,
    readSalesTvaSettings,
    aifPaymentMethodLabel,
  } = deps;

  const router = express.Router();
  const text = typeof depText === "function" ? depText : (value) => String(value ?? "").trim();
  const normCode = typeof depNormCode === "function"
    ? depNormCode
    : (value) => text(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  const numberValue = typeof depNumber === "function"
    ? depNumber
    : (value) => {
      const result = Number(value);
      return Number.isFinite(result) ? result : 0;
    };

  let historySchemaPromise = null;
  let filterOptionsCache = null;

  function boolValue(value, fallback = false) {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "boolean") return value;
    return ["1", "true", "yes", "igen", "da", "on"].includes(text(value).toLowerCase());
  }

  function nullableNumber(value) {
    if (value === undefined || value === null || text(value) === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;

    let raw = text(value)
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, "")
      .replace(/RON|LEI/gi, "")
      .replace(/%$/, "");
    if (!raw) return null;

    const comma = raw.lastIndexOf(",");
    const dot = raw.lastIndexOf(".");
    if (comma >= 0 && dot >= 0) {
      if (comma > dot) raw = raw.replace(/\./g, "").replace(",", ".");
      else raw = raw.replace(/,/g, "");
    } else if (comma >= 0) {
      const decimals = raw.length - comma - 1;
      raw = decimals > 0 && decimals <= 3 ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
    } else if (dot >= 0) {
      const pieces = raw.split(".");
      if (pieces.length > 2) {
        const last = pieces.pop();
        raw = `${pieces.join("")}.${last}`;
      }
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function isoDateOnly(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    const raw = text(value);
    const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (direct) return direct[1];
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }

  function normalizeDateInput(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    const raw = text(value);
    if (!raw) return null;

    const direct = raw.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?/);
    if (direct) {
      const year = Number(direct[1]);
      const month = Number(direct[2]);
      const day = Number(direct[3] || 1);
      const candidate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const parsed = new Date(`${candidate}T12:00:00Z`);
      if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate) return candidate;
    }

    const european = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (european) {
      const candidate = `${european[3]}-${String(Number(european[2])).padStart(2, "0")}-${String(Number(european[1])).padStart(2, "0")}`;
      const parsed = new Date(`${candidate}T12:00:00Z`);
      if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate) return candidate;
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }

  function shiftYear(iso, amount) {
    const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return iso;
    const year = Number(match[1]) + amount;
    const month = Number(match[2]);
    const day = Number(match[3]);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
  }

  function addDays(iso, days) {
    const date = new Date(`${iso}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function addMonths(iso, months) {
    const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return iso;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + months, 1, 12));
    return date.toISOString().slice(0, 10);
  }

  function monthStart(iso) {
    return `${String(iso).slice(0, 7)}-01`;
  }

  function monthEnd(iso) {
    return addDays(addMonths(monthStart(iso), 1), -1);
  }

  function inclusiveDays(from, to) {
    const a = new Date(`${from}T12:00:00Z`).getTime();
    const b = new Date(`${to}T12:00:00Z`).getTime();
    return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
  }

  function cleanSource(value) {
    const source = normCode(value || "all");
    return ["all", "live", "history"].includes(source) ? source : "all";
  }

  function cleanBucket(value, days) {
    let bucket = normCode(value || "auto");
    if (!["auto", "day", "week", "month"].includes(bucket)) bucket = "auto";
    if (bucket === "auto") return days <= 45 ? "day" : days <= 240 ? "week" : "month";
    if (bucket === "day" && days > 550) return "week";
    if (bucket === "week" && days > 1_500) return "month";
    return bucket;
  }

  async function ensureHistorySchema() {
    if (!historySchemaPromise) {
      historySchemaPromise = (async () => {
        await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_sales_history_imports (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          source_name text NOT NULL,
          source_kind text NOT NULL DEFAULT 'manual' CHECK (source_kind IN ('manual','xlsx','xls','csv','other')),
          payload_hash text NOT NULL,
          row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
          imported_by text NULL,
          note text NULL,
          raw jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        )`);
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS aif_sales_history_imports_hash_uq
          ON aif_sales_history_imports (payload_hash)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_sales_history_imports_created_idx
          ON aif_sales_history_imports (created_at DESC)`);

        await pool.query(`CREATE TABLE IF NOT EXISTS aif_sales_history_rows (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          import_id uuid NOT NULL REFERENCES aif_sales_history_imports(id) ON DELETE CASCADE,
          row_no integer NOT NULL,
          sold_on date NOT NULL,
          location_id uuid NULL REFERENCES aif_locations(id) ON DELETE SET NULL,
          location_code text NULL,
          location_name text NULL,
          actor text NOT NULL DEFAULT 'Ismeretlen',
          source_granularity text NOT NULL DEFAULT 'monthly' CHECK (source_granularity IN ('monthly','daily','line')),
          transaction_key text NULL,
          brand_name text NULL,
          category_name text NULL,
          subcategory_name text NULL,
          product_title text NULL,
          product_code text NULL,
          color_name text NULL,
          size text NULL,
          quantity numeric(16,3) NULL,
          transactions numeric(16,3) NULL,
          revenue numeric(16,2) NOT NULL DEFAULT 0,
          net_revenue numeric(16,2) NULL,
          tva_rate numeric(7,3) NULL,
          price_includes_tva boolean NOT NULL DEFAULT true,
          sales_before_discount numeric(16,2) NULL,
          discount_total numeric(16,2) NULL,
          paid_total numeric(16,2) NULL,
          unpaid_total numeric(16,2) NULL,
          estimated_cost numeric(16,2) NULL,
          payment_method text NULL,
          note text NULL,
          raw jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (import_id, row_no)
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_sales_history_rows_date_idx
          ON aif_sales_history_rows (sold_on DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_sales_history_rows_location_date_idx
          ON aif_sales_history_rows (location_id, sold_on DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_sales_history_rows_actor_date_idx
          ON aif_sales_history_rows (lower(actor), sold_on DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_sales_history_rows_brand_idx
          ON aif_sales_history_rows (lower(brand_name)) WHERE brand_name IS NOT NULL`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_sales_history_rows_subcategory_idx
          ON aif_sales_history_rows (lower(subcategory_name)) WHERE subcategory_name IS NOT NULL`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_sales_history_rows_product_idx
          ON aif_sales_history_rows (lower(product_title)) WHERE product_title IS NOT NULL`);
        return true;
      })().catch((error) => {
        historySchemaPromise = null;
        throw error;
      });
    }
    return historySchemaPromise;
  }

  async function readLocations() {
    const result = await pool.query(
      `SELECT id, code, name, location_type, is_active
       FROM aif_locations
       ORDER BY is_active DESC, name ASC`,
    );
    return result.rows || [];
  }

  function locationLookup(locations) {
    const map = new Map();
    const aliases = {
      csikszereda: "main_warehouse",
      ciuc: "main_warehouse",
      miercurea_ciuc: "main_warehouse",
      szereda: "main_warehouse",
      kezdivasarhely: "magazin_targu_secuiesc",
      kezdi: "magazin_targu_secuiesc",
      targu_secuiesc: "magazin_targu_secuiesc",
      kezi: "magazin_targu_secuiesc",
    };
    for (const row of locations) {
      for (const candidate of [row.id, row.code, row.name]) {
        const key = normCode(candidate);
        if (key) map.set(key, row);
      }
    }
    for (const [alias, code] of Object.entries(aliases)) {
      const target = locations.find((row) => row.code === code);
      if (target) map.set(alias, target);
    }
    return map;
  }

  function normalizeHistoryRow(input, index, defaults, locationsMap) {
    const rowNo = Number(input?.rowNo ?? input?.row_no ?? index + 1) || index + 1;
    const soldOn = normalizeDateInput(
      input?.soldOn ?? input?.sold_on ?? input?.date ?? input?.datum ?? input?.dátum ?? input?.month ?? input?.honap ?? input?.hónap,
    );
    const errors = [];
    if (!soldOn) errors.push("Hiányzó vagy hibás dátum/hónap.");

    const locationRaw = text(
      input?.location ?? input?.locationCode ?? input?.location_code ?? input?.store ?? input?.uzlet ?? input?.üzlet ?? defaults?.location,
    );
    const location = locationsMap.get(normCode(locationRaw));
    if (!location) errors.push(`Az üzlet nem azonosítható: ${locationRaw || "nincs megadva"}.`);

    const actor = text(
      input?.actor ?? input?.employee ?? input?.seller ?? input?.elado ?? input?.eladó ?? defaults?.actor ?? "Ismeretlen",
    ) || "Ismeretlen";
    const revenue = nullableNumber(input?.revenue ?? input?.total ?? input?.forgalom ?? input?.bevetel ?? input?.bevétel);
    const quantity = nullableNumber(input?.quantity ?? input?.qty ?? input?.itemsSold ?? input?.items_sold ?? input?.darab);
    const transactions = nullableNumber(input?.transactions ?? input?.transactionCount ?? input?.vasarlasok ?? input?.vásárlások);
    if (revenue === null) errors.push("A forgalom/bevétel hiányzik.");

    const discountTotal = nullableNumber(input?.discountTotal ?? input?.discount_total ?? input?.discount ?? input?.kedvezmeny ?? input?.kedvezmény);
    const salesBeforeDiscount = nullableNumber(input?.salesBeforeDiscount ?? input?.sales_before_discount)
      ?? (revenue !== null && discountTotal !== null ? revenue + discountTotal : null);
    const unpaidTotal = nullableNumber(input?.unpaidTotal ?? input?.unpaid_total ?? input?.balanceDue ?? input?.balance_due ?? input?.kintlevoseg ?? input?.kintlévőség);
    const paidTotal = nullableNumber(input?.paidTotal ?? input?.paid_total)
      ?? (revenue !== null && unpaidTotal !== null ? revenue - unpaidTotal : null);
    const estimatedCost = nullableNumber(input?.estimatedCost ?? input?.estimated_cost ?? input?.cost ?? input?.purchaseCost ?? input?.beszerzesiErtek ?? input?.beszerzésiÉrték);
    const tvaRate = nullableNumber(input?.tvaRate ?? input?.tva_rate ?? input?.vatRate ?? input?.vat_rate ?? defaults?.tvaRate);
    const priceIncludesTva = boolValue(
      input?.priceIncludesTva ?? input?.price_includes_tva ?? input?.sellPriceIncludesTva ?? defaults?.priceIncludesTva,
      true,
    );
    let netRevenue = nullableNumber(input?.netRevenue ?? input?.net_revenue ?? input?.netto ?? input?.nettó);
    if (netRevenue === null && revenue !== null && tvaRate !== null) {
      netRevenue = priceIncludesTva ? revenue / (1 + Math.max(0, tvaRate) / 100) : revenue;
    }

    const transactionKey = text(
      input?.transactionKey ?? input?.transaction_key ?? input?.receiptNumber ?? input?.receipt_number ?? input?.saleNumber ?? input?.sale_number ?? input?.bizonylat,
    ) || null;
    const brandName = text(input?.brandName ?? input?.brand_name ?? input?.brand ?? input?.marka ?? input?.márka) || null;
    const categoryName = text(input?.categoryName ?? input?.category_name ?? input?.category ?? input?.fokategoria ?? input?.főkategória) || null;
    const subcategoryName = text(input?.subcategoryName ?? input?.subcategory_name ?? input?.subcategory ?? input?.alkategoria ?? input?.alkategória) || null;
    const productTitle = text(input?.productTitle ?? input?.product_title ?? input?.product ?? input?.termek ?? input?.termék) || null;
    const productCode = text(input?.productCode ?? input?.product_code ?? input?.sku ?? input?.termekkod ?? input?.termékkód) || null;
    const colorName = text(input?.colorName ?? input?.color_name ?? input?.color ?? input?.szin ?? input?.szín) || null;
    const size = text(input?.size ?? input?.meret ?? input?.méret) || null;
    const paymentMethod = text(input?.paymentMethod ?? input?.payment_method ?? input?.fizetesiMod ?? input?.fizetésiMód) || null;
    const note = text(input?.note ?? input?.megjegyzes ?? input?.megjegyzés) || null;

    const requestedGranularity = normCode(input?.sourceGranularity ?? input?.source_granularity ?? input?.granularity ?? defaults?.granularity);
    const hasDetail = Boolean(transactionKey || brandName || categoryName || subcategoryName || productTitle || productCode || colorName || size);
    const sourceGranularity = ["monthly", "daily", "line"].includes(requestedGranularity)
      ? requestedGranularity
      : hasDetail
        ? "line"
        : String(soldOn || "").endsWith("-01")
          ? "monthly"
          : "daily";

    if (revenue !== null && quantity === null && transactions === null && revenue === 0) {
      errors.push("A sor minden fő mutatója nulla vagy üres.");
    }

    return {
      errors,
      value: {
        rowNo,
        soldOn,
        locationId: location?.id || null,
        locationCode: location?.code || null,
        locationName: location?.name || null,
        actor,
        sourceGranularity,
        transactionKey,
        brandName,
        categoryName,
        subcategoryName,
        productTitle,
        productCode,
        colorName,
        size,
        quantity,
        transactions,
        revenue: revenue ?? 0,
        netRevenue,
        tvaRate,
        priceIncludesTva,
        salesBeforeDiscount,
        discountTotal,
        paidTotal,
        unpaidTotal,
        estimatedCost,
        paymentMethod,
        note,
        raw: input && typeof input === "object" ? input : { value: input },
      },
    };
  }

  async function insertHistoryRows(client, importId, rows) {
    const columns = [
      "import_id", "row_no", "sold_on", "location_id", "location_code", "location_name",
      "actor", "source_granularity", "transaction_key", "brand_name", "category_name",
      "subcategory_name", "product_title", "product_code", "color_name", "size", "quantity",
      "transactions", "revenue", "net_revenue", "tva_rate", "price_includes_tva",
      "sales_before_discount", "discount_total", "paid_total", "unpaid_total", "estimated_cost",
      "payment_method", "note", "raw",
    ];
    const batchSize = 100;
    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const batch = rows.slice(offset, offset + batchSize);
      const args = [];
      const values = batch.map((row, rowIndex) => {
        const data = [
          importId,
          row.rowNo,
          row.soldOn,
          row.locationId,
          row.locationCode,
          row.locationName,
          row.actor,
          row.sourceGranularity,
          row.transactionKey,
          row.brandName,
          row.categoryName,
          row.subcategoryName,
          row.productTitle,
          row.productCode,
          row.colorName,
          row.size,
          row.quantity,
          row.transactions,
          row.revenue,
          row.netRevenue,
          row.tvaRate,
          row.priceIncludesTva,
          row.salesBeforeDiscount,
          row.discountTotal,
          row.paidTotal,
          row.unpaidTotal,
          row.estimatedCost,
          row.paymentMethod,
          row.note,
          JSON.stringify(row.raw || {}),
        ];
        const base = rowIndex * columns.length;
        args.push(...data);
        const placeholders = data.map((_, columnIndex) => {
          const p = `$${base + columnIndex + 1}`;
          return columnIndex === columns.length - 1 ? `${p}::jsonb` : p;
        });
        return `(${placeholders.join(",")})`;
      });
      await client.query(
        `INSERT INTO aif_sales_history_rows (${columns.join(",")}) VALUES ${values.join(",")}`,
        args,
      );
    }
  }

  function historyImportMap(row = {}) {
    return {
      id: String(row.id),
      sourceName: row.source_name,
      sourceKind: row.source_kind,
      rowCount: numberValue(row.row_count),
      importedBy: row.imported_by || null,
      note: row.note || null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      periodFrom: isoDateOnly(row.period_from),
      periodTo: isoDateOnly(row.period_to),
      revenue: numberValue(row.revenue),
      itemsSold: numberValue(row.items_sold),
      transactions: numberValue(row.transactions),
      estimatedCost: row.estimated_cost === null || row.estimated_cost === undefined ? null : numberValue(row.estimated_cost),
      detailedRows: numberValue(row.detailed_rows),
      locations: Array.isArray(row.locations) ? row.locations : [],
      employees: Array.isArray(row.employees) ? row.employees : [],
    };
  }

  function historyImportAggregateSql(where = "") {
    return `SELECT
      i.id, i.source_name, i.source_kind, i.row_count, i.imported_by, i.note, i.created_at,
      min(h.sold_on) AS period_from,
      max(h.sold_on) AS period_to,
      COALESCE(sum(h.revenue),0)::numeric AS revenue,
      COALESCE(sum(h.quantity),0)::numeric AS items_sold,
      COALESCE(
        count(DISTINCT h.transaction_key) FILTER (WHERE NULLIF(h.transaction_key,'') IS NOT NULL),0
      )::numeric + COALESCE(
        sum(h.transactions) FILTER (WHERE NULLIF(h.transaction_key,'') IS NULL),0
      )::numeric AS transactions,
      CASE WHEN count(*) FILTER (WHERE h.estimated_cost IS NOT NULL) > 0
        THEN COALESCE(sum(h.estimated_cost),0)::numeric ELSE NULL END AS estimated_cost,
      count(*) FILTER (
        WHERE NULLIF(h.transaction_key,'') IS NOT NULL
           OR NULLIF(h.brand_name,'') IS NOT NULL
           OR NULLIF(h.category_name,'') IS NOT NULL
           OR NULLIF(h.subcategory_name,'') IS NOT NULL
           OR NULLIF(h.product_title,'') IS NOT NULL
           OR NULLIF(h.product_code,'') IS NOT NULL
           OR NULLIF(h.color_name,'') IS NOT NULL
           OR NULLIF(h.size,'') IS NOT NULL
      )::int AS detailed_rows,
      COALESCE(array_agg(DISTINCT COALESCE(NULLIF(h.location_name,''),NULLIF(h.location_code,'')))
        FILTER (WHERE COALESCE(NULLIF(h.location_name,''),NULLIF(h.location_code,'')) IS NOT NULL),'{}') AS locations,
      COALESCE(array_agg(DISTINCT h.actor) FILTER (WHERE NULLIF(h.actor,'') IS NOT NULL),'{}') AS employees
    FROM aif_sales_history_imports i
    LEFT JOIN aif_sales_history_rows h ON h.import_id=i.id
    ${where}
    GROUP BY i.id`;
  }

  function saleNetExpression(saleAlias, amountExpression, fallbackTvaParam, fallbackIncludesParam, rawColumn = "raw") {
    const raw = `${saleAlias}.${rawColumn}`;
    return `CASE
      WHEN COALESCE(
        CASE
          WHEN lower(COALESCE(${raw}->>'sellPriceIncludesTva', ${raw}->>'salesPriceIncludesTva', '')) IN ('true','false')
          THEN lower(COALESCE(${raw}->>'sellPriceIncludesTva', ${raw}->>'salesPriceIncludesTva'))='true'
          ELSE NULL
        END,
        ${fallbackIncludesParam}::boolean
      )
      THEN (${amountExpression}) / (
        1 + (
          GREATEST(0, LEAST(100, COALESCE(
            CASE
              WHEN COALESCE(${raw}->>'salesTvaRate','') ~ '^[0-9]+([.][0-9]+)?$'
              THEN (${raw}->>'salesTvaRate')::numeric
              ELSE NULL
            END,
            ${fallbackTvaParam}::numeric
          ))) / 100
        )
      )
      ELSE (${amountExpression})
    END`;
  }

  function buildFactsQuery({ from, to, filters, salesTvaRate, priceIncludesTva, selectSql }) {
    const source = cleanSource(filters.source);
    const args = [from, to, salesTvaRate, priceIncludesTva];
    const push = (value) => {
      args.push(value);
      return `$${args.length}`;
    };

    const branches = [];
    if (source !== "history") {
      const saleNet = saleNetExpression("s", "sl.line_total", "$3", "$4");
      branches.push(`SELECT
        'live_sale'::text AS source,
        sl.id::text AS record_id,
        NULL::text AS import_id,
        ('sale:' || s.id::text) AS transaction_key,
        (s.sold_at AT TIME ZONE 'Europe/Bucharest')::date AS happened_on,
        l.id::text AS location_id,
        l.code AS location_code,
        l.name AS location_name,
        COALESCE(NULLIF(s.actor,''),'Ismeretlen') AS actor,
        COALESCE(NULLIF(sl.brand_name,''),NULLIF(b.name,'')) AS brand_name,
        COALESCE(NULLIF(sl.category_name,''),NULLIF(cat.name_hu,''),NULLIF(cat.name_ro,'')) AS category_name,
        COALESCE(NULLIF(sl.subcategory_name,''),NULLIF(subc.name_hu,''),NULLIF(subc.name_ro,'')) AS subcategory_name,
        COALESCE(NULLIF(sl.product_title,''),NULLIF(m.title_ro,''),NULLIF(sl.product_code,''),'Ismeretlen termék') AS product_title,
        COALESCE(NULLIF(sl.product_code,''),NULLIF(v.internal_sku,''),NULLIF(m.model_code,'')) AS product_code,
        COALESCE(NULLIF(sl.image_url,''),NULLIF(v.image_url,''),NULLIF(sl.raw->>'imageUrl',''),NULLIF(sl.raw->>'image_url','')) AS image_url,
        NULLIF(v.sn_cod,'') AS sn_cod,
        COALESCE(NULLIF(sl.color_name,''),NULLIF(v.color_name,''),NULLIF(v.color_code,'')) AS color_name,
        COALESCE(NULLIF(sl.size,''),NULLIF(v.size,'')) AS size,
        sl.quantity::numeric AS quantity,
        NULL::numeric AS aggregate_transactions,
        sl.line_total::numeric AS revenue,
        (${saleNet})::numeric AS net_revenue,
        (COALESCE(sl.list_price,sl.unit_price,0) * sl.quantity)::numeric AS sales_before_discount,
        GREATEST((COALESCE(sl.list_price,sl.unit_price,0) * sl.quantity) - sl.line_total,0)::numeric AS discount_total,
        CASE WHEN s.total <> 0 THEN (s.paid_total * sl.line_total / s.total)::numeric ELSE 0::numeric END AS paid_total,
        CASE WHEN s.total <> 0 THEN (s.balance_due * sl.line_total / s.total)::numeric ELSE 0::numeric END AS unpaid_total,
        (COALESCE(sl.buy_price_snapshot,v.buy_price,0) * sl.quantity)::numeric AS estimated_cost,
        (sl.buy_price_snapshot IS NOT NULL OR v.buy_price IS NOT NULL) AS cost_covered,
        true AS net_covered,
        COALESCE(NULLIF(pay.method,''),'mixed') AS payment_method,
        'line'::text AS source_granularity,
        s.sale_number AS document_number,
        s.customer_name,
        s.customer_phone,
        s.note
      FROM aif_shop_sales s
      JOIN aif_shop_sale_lines sl ON sl.sale_id=s.id
      JOIN aif_locations l ON l.id=s.location_id
      LEFT JOIN aif_product_variants v ON v.id=sl.variant_id
      LEFT JOIN aif_product_models m ON m.id=v.model_id
      LEFT JOIN aif_brands b ON b.id=m.brand_id
      LEFT JOIN aif_categories cat ON cat.id=m.category_id
      LEFT JOIN aif_categories subc ON subc.id=m.subcategory_id
      LEFT JOIN LATERAL (
        SELECT CASE WHEN count(DISTINCT p.method)=1 THEN min(p.method) ELSE 'mixed' END AS method
        FROM aif_shop_sale_payments p
        WHERE p.sale_id=s.id
      ) pay ON true
      WHERE s.status='completed'
        AND (s.sold_at AT TIME ZONE 'Europe/Bucharest')::date BETWEEN $1::date AND $2::date`);

      const exchangeNetReplacement = saleNetExpression("e", "el.line_total", "$3", "$4", "original_snapshot");
      branches.push(`SELECT
        'live_exchange'::text AS source,
        ('exchange-line:' || el.id::text) AS record_id,
        NULL::text AS import_id,
        ('exchange:' || e.id::text) AS transaction_key,
        (e.created_at AT TIME ZONE 'Europe/Bucharest')::date AS happened_on,
        l.id::text AS location_id,
        l.code AS location_code,
        l.name AS location_name,
        COALESCE(NULLIF(e.actor,''),'Ismeretlen') AS actor,
        COALESCE(NULLIF(el.brand_name,''),NULLIF(b.name,'')) AS brand_name,
        COALESCE(NULLIF(cat.name_hu,''),NULLIF(cat.name_ro,'')) AS category_name,
        COALESCE(NULLIF(subc.name_hu,''),NULLIF(subc.name_ro,'')) AS subcategory_name,
        COALESCE(NULLIF(el.product_title,''),NULLIF(m.title_ro,''),NULLIF(el.product_code,''),'Ismeretlen termék') AS product_title,
        COALESCE(NULLIF(el.product_code,''),NULLIF(v.internal_sku,''),NULLIF(m.model_code,'')) AS product_code,
        COALESCE(NULLIF(el.image_url,''),NULLIF(v.image_url,'')) AS image_url,
        NULLIF(v.sn_cod,'') AS sn_cod,
        COALESCE(NULLIF(el.color_name,''),NULLIF(v.color_name,''),NULLIF(v.color_code,'')) AS color_name,
        COALESCE(NULLIF(el.size,''),NULLIF(v.size,'')) AS size,
        el.quantity::numeric AS quantity,
        NULL::numeric AS aggregate_transactions,
        el.line_total::numeric AS revenue,
        (${exchangeNetReplacement})::numeric AS net_revenue,
        el.line_total::numeric AS sales_before_discount,
        0::numeric AS discount_total,
        el.line_total::numeric AS paid_total,
        0::numeric AS unpaid_total,
        (COALESCE(el.buy_price_snapshot,v.buy_price,0) * el.quantity)::numeric AS estimated_cost,
        (el.buy_price_snapshot IS NOT NULL OR v.buy_price IS NOT NULL) AS cost_covered,
        true AS net_covered,
        COALESCE(NULLIF(e.settlement_method,''),'exchange') AS payment_method,
        'line'::text AS source_granularity,
        e.exchange_number AS document_number,
        e.customer_name,
        e.customer_phone,
        e.note
      FROM aif_shop_exchanges e
      JOIN aif_shop_exchange_lines el ON el.exchange_id=e.id
      JOIN aif_locations l ON l.id=e.location_id
      LEFT JOIN aif_product_variants v ON v.id=el.variant_id
      LEFT JOIN aif_product_models m ON m.id=v.model_id
      LEFT JOIN aif_brands b ON b.id=m.brand_id
      LEFT JOIN aif_categories cat ON cat.id=m.category_id
      LEFT JOIN aif_categories subc ON subc.id=m.subcategory_id
      WHERE e.status='completed'
        AND (e.created_at AT TIME ZONE 'Europe/Bucharest')::date BETWEEN $1::date AND $2::date`);

      const exchangeNetReturn = saleNetExpression("e", "(-e.return_credit)", "$3", "$4", "original_snapshot");
      branches.push(`SELECT
        'live_exchange_return'::text AS source,
        ('exchange-return:' || e.id::text) AS record_id,
        NULL::text AS import_id,
        ('exchange:' || e.id::text) AS transaction_key,
        (e.created_at AT TIME ZONE 'Europe/Bucharest')::date AS happened_on,
        l.id::text AS location_id,
        l.code AS location_code,
        l.name AS location_name,
        COALESCE(NULLIF(e.actor,''),'Ismeretlen') AS actor,
        COALESCE(NULLIF(src.brand_name,''),NULLIF(b.name,'')) AS brand_name,
        COALESCE(NULLIF(src.category_name,''),NULLIF(cat.name_hu,''),NULLIF(cat.name_ro,'')) AS category_name,
        COALESCE(NULLIF(src.subcategory_name,''),NULLIF(subc.name_hu,''),NULLIF(subc.name_ro,'')) AS subcategory_name,
        COALESCE(NULLIF(src.product_title,''),NULLIF(m.title_ro,''),NULLIF(src.product_code,''),'Ismeretlen termék') AS product_title,
        COALESCE(NULLIF(src.product_code,''),NULLIF(v.internal_sku,''),NULLIF(m.model_code,'')) AS product_code,
        COALESCE(NULLIF(src.image_url,''),NULLIF(v.image_url,''),NULLIF(src.raw->>'imageUrl',''),NULLIF(src.raw->>'image_url','')) AS image_url,
        NULLIF(v.sn_cod,'') AS sn_cod,
        COALESCE(NULLIF(src.color_name,''),NULLIF(v.color_name,''),NULLIF(v.color_code,'')) AS color_name,
        COALESCE(NULLIF(src.size,''),NULLIF(v.size,'')) AS size,
        (-e.returned_qty)::numeric AS quantity,
        NULL::numeric AS aggregate_transactions,
        (-e.return_credit)::numeric AS revenue,
        (${exchangeNetReturn})::numeric AS net_revenue,
        (-e.return_credit)::numeric AS sales_before_discount,
        0::numeric AS discount_total,
        (-e.return_credit)::numeric AS paid_total,
        0::numeric AS unpaid_total,
        (-(COALESCE(src.buy_price_snapshot,v.buy_price,0) * e.returned_qty))::numeric AS estimated_cost,
        (src.buy_price_snapshot IS NOT NULL OR v.buy_price IS NOT NULL) AS cost_covered,
        true AS net_covered,
        COALESCE(NULLIF(e.settlement_method,''),'exchange') AS payment_method,
        'line'::text AS source_granularity,
        e.exchange_number AS document_number,
        e.customer_name,
        e.customer_phone,
        e.note
      FROM aif_shop_exchanges e
      JOIN aif_shop_sale_lines src ON src.id=e.source_sale_line_id
      JOIN aif_locations l ON l.id=e.location_id
      LEFT JOIN aif_product_variants v ON v.id=src.variant_id
      LEFT JOIN aif_product_models m ON m.id=v.model_id
      LEFT JOIN aif_brands b ON b.id=m.brand_id
      LEFT JOIN aif_categories cat ON cat.id=m.category_id
      LEFT JOIN aif_categories subc ON subc.id=m.subcategory_id
      WHERE e.status='completed'
        AND (e.created_at AT TIME ZONE 'Europe/Bucharest')::date BETWEEN $1::date AND $2::date`);
    }

    if (source !== "live") {
      branches.push(`SELECT
        'history'::text AS source,
        h.id::text AS record_id,
        h.import_id::text AS import_id,
        CASE WHEN NULLIF(h.transaction_key,'') IS NOT NULL
          THEN ('history:' || h.import_id::text || ':' || h.transaction_key)
          ELSE NULL END AS transaction_key,
        h.sold_on AS happened_on,
        COALESCE(h.location_id::text,l.id::text) AS location_id,
        COALESCE(NULLIF(h.location_code,''),l.code) AS location_code,
        COALESCE(NULLIF(h.location_name,''),l.name,NULLIF(h.location_code,''),'Ismeretlen üzlet') AS location_name,
        COALESCE(NULLIF(h.actor,''),'Ismeretlen') AS actor,
        h.brand_name,
        h.category_name,
        h.subcategory_name,
        COALESCE(NULLIF(h.product_title,''),NULLIF(h.product_code,'')) AS product_title,
        h.product_code,
        NULL::text AS image_url,
        NULL::text AS sn_cod,
        h.color_name,
        h.size,
        COALESCE(h.quantity,0)::numeric AS quantity,
        h.transactions::numeric AS aggregate_transactions,
        h.revenue::numeric AS revenue,
        COALESCE(
          h.net_revenue,
          CASE
            WHEN h.tva_rate IS NOT NULL AND h.price_includes_tva=true
              THEN h.revenue / (1 + GREATEST(0,h.tva_rate) / 100)
            ELSE h.revenue
          END
        )::numeric AS net_revenue,
        COALESCE(h.sales_before_discount,h.revenue + COALESCE(h.discount_total,0))::numeric AS sales_before_discount,
        COALESCE(h.discount_total,0)::numeric AS discount_total,
        COALESCE(h.paid_total,h.revenue - COALESCE(h.unpaid_total,0))::numeric AS paid_total,
        COALESCE(h.unpaid_total,0)::numeric AS unpaid_total,
        COALESCE(h.estimated_cost,0)::numeric AS estimated_cost,
        (h.estimated_cost IS NOT NULL) AS cost_covered,
        (h.net_revenue IS NOT NULL OR h.tva_rate IS NOT NULL OR h.price_includes_tva=false) AS net_covered,
        h.payment_method,
        h.source_granularity,
        h.transaction_key AS document_number,
        NULL::text AS customer_name,
        NULL::text AS customer_phone,
        h.note
      FROM aif_sales_history_rows h
      LEFT JOIN aif_locations l ON l.id=h.location_id
      WHERE h.sold_on BETWEEN $1::date AND $2::date`);
    }

    const where = ["1=1"];
    const location = text(filters.location || "all");
    if (location && normCode(location) !== "all") {
      const p = push(location);
      where.push(`(f.location_id=${p} OR f.location_code=${p} OR lower(COALESCE(f.location_name,''))=lower(${p}))`);
    }
    if (text(filters.employee)) {
      const p = push(text(filters.employee));
      where.push(`lower(COALESCE(f.actor,''))=lower(${p})`);
    }
    if (text(filters.brand)) {
      const p = push(text(filters.brand));
      where.push(`lower(COALESCE(f.brand_name,''))=lower(${p})`);
    }
    if (text(filters.category)) {
      const p = push(text(filters.category));
      where.push(`lower(COALESCE(f.category_name,''))=lower(${p})`);
    }
    if (text(filters.subcategory)) {
      const p = push(text(filters.subcategory));
      where.push(`lower(COALESCE(f.subcategory_name,''))=lower(${p})`);
    }
    if (text(filters.size)) {
      const p = push(text(filters.size));
      where.push(`lower(COALESCE(f.size,''))=lower(${p})`);
    }
    if (text(filters.color)) {
      const p = push(text(filters.color));
      where.push(`lower(COALESCE(f.color_name,''))=lower(${p})`);
    }
    if (text(filters.payment)) {
      const p = push(text(filters.payment));
      where.push(`lower(COALESCE(f.payment_method,''))=lower(${p})`);
    }
    if (text(filters.product)) {
      const p = push(`%${text(filters.product)}%`);
      where.push(`(COALESCE(f.product_title,'') ILIKE ${p} OR COALESCE(f.product_code,'') ILIKE ${p})`);
    }
    if (text(filters.snCod)) {
      const p = push(`%${text(filters.snCod)}%`);
      where.push(`COALESCE(f.sn_cod,'') ILIKE ${p}`);
    }
    if (text(filters.search)) {
      const p = push(`%${text(filters.search)}%`);
      where.push(`(
        COALESCE(f.product_title,'') ILIKE ${p}
        OR COALESCE(f.product_code,'') ILIKE ${p}
        OR COALESCE(f.brand_name,'') ILIKE ${p}
        OR COALESCE(f.subcategory_name,'') ILIKE ${p}
        OR COALESCE(f.actor,'') ILIKE ${p}
        OR COALESCE(f.document_number,'') ILIKE ${p}
      )`);
    }

    return {
      args,
      sql: `WITH fact_rows AS (
        ${branches.join("\nUNION ALL\n")}
      ), filtered AS (
        SELECT f.* FROM fact_rows f WHERE ${where.join(" AND ")}
      )
      ${selectSql}`,
    };
  }

  const transactionCountSql = `(
    count(DISTINCT transaction_key) FILTER (WHERE transaction_key IS NOT NULL)
    + COALESCE(sum(aggregate_transactions) FILTER (WHERE transaction_key IS NULL),0)
  )`;

  const summarySelectSql = `SELECT
    COALESCE(sum(revenue),0)::numeric AS revenue,
    COALESCE(sum(net_revenue),0)::numeric AS net_revenue,
    COALESCE(sum(sales_before_discount),0)::numeric AS sales_before_discount,
    COALESCE(sum(discount_total),0)::numeric AS discount_total,
    COALESCE(sum(paid_total),0)::numeric AS paid_total,
    COALESCE(sum(unpaid_total),0)::numeric AS unpaid_total,
    COALESCE(sum(quantity),0)::numeric AS items_sold,
    COALESCE(sum(estimated_cost),0)::numeric AS estimated_cost,
    ${transactionCountSql}::numeric AS transactions,
    COALESCE(sum(abs(revenue)) FILTER (WHERE cost_covered),0)::numeric AS cost_covered_revenue,
    COALESCE(sum(abs(revenue)),0)::numeric AS total_abs_revenue,
    COALESCE(sum(abs(revenue)) FILTER (WHERE net_covered),0)::numeric AS net_covered_revenue,
    COALESCE(sum(abs(revenue)) FILTER (
      WHERE source='history' AND (
        NULLIF(transaction_key,'') IS NOT NULL OR NULLIF(brand_name,'') IS NOT NULL
        OR NULLIF(category_name,'') IS NOT NULL OR NULLIF(subcategory_name,'') IS NOT NULL
        OR NULLIF(product_title,'') IS NOT NULL OR NULLIF(product_code,'') IS NOT NULL
        OR NULLIF(color_name,'') IS NOT NULL OR NULLIF(size,'') IS NOT NULL
      )
    ),0)::numeric AS history_detailed_revenue,
    COALESCE(sum(abs(revenue)) FILTER (WHERE source='history'),0)::numeric AS history_abs_revenue,
    COALESCE(sum(revenue) FILTER (WHERE source='history'),0)::numeric AS history_revenue,
    COALESCE(sum(revenue) FILTER (WHERE source<>'history'),0)::numeric AS live_revenue,
    count(*) FILTER (WHERE source='history')::int AS history_rows,
    count(*) FILTER (WHERE source<>'history')::int AS live_rows
  FROM filtered`;

  function mapSummary(row = {}) {
    const revenue = numberValue(row.revenue);
    const netRevenue = numberValue(row.net_revenue);
    const estimatedCost = numberValue(row.estimated_cost);
    const transactions = numberValue(row.transactions);
    const totalAbsRevenue = numberValue(row.total_abs_revenue);
    const historyAbsRevenue = numberValue(row.history_abs_revenue);
    // A főnöki képlet logikája:
    // vételár + 65% profit + TVA. A tényleges bevétel már a kedvezmény UTÁNI
    // összeg, ezért a megmaradt profit = nettó eladás - vételár,
    // a megmaradt profit % pedig ezt a vételárhoz viszonyítja.
    const grossProfit = netRevenue - estimatedCost;
    const profitPercent = Math.abs(estimatedCost) > 0.000001
      ? grossProfit / Math.abs(estimatedCost) * 100
      : 0;
    const tvaAmount = revenue - netRevenue;
    return {
      revenue,
      netRevenue,
      tvaAmount,
      tvaPayable: tvaAmount,
      profitPercent,
      salesBeforeDiscount: numberValue(row.sales_before_discount),
      discountTotal: numberValue(row.discount_total),
      paidTotal: numberValue(row.paid_total),
      unpaidTotal: numberValue(row.unpaid_total),
      itemsSold: numberValue(row.items_sold),
      transactions,
      averageBasket: transactions !== 0 ? revenue / transactions : 0,
      estimatedCost,
      grossProfit,
      grossMargin: netRevenue !== 0 ? grossProfit / Math.abs(netRevenue) * 100 : 0,
      costCoveragePercent: totalAbsRevenue > 0 ? numberValue(row.cost_covered_revenue) / totalAbsRevenue * 100 : 100,
      netCoveragePercent: totalAbsRevenue > 0 ? numberValue(row.net_covered_revenue) / totalAbsRevenue * 100 : 100,
      historyDetailCoveragePercent: historyAbsRevenue > 0 ? numberValue(row.history_detailed_revenue) / historyAbsRevenue * 100 : 100,
      liveRevenue: numberValue(row.live_revenue),
      historyRevenue: numberValue(row.history_revenue),
      liveRows: numberValue(row.live_rows),
      historyRows: numberValue(row.history_rows),
    };
  }

  function metricRow(row = {}) {
    const revenue = numberValue(row.revenue);
    const netRevenue = numberValue(row.net_revenue);
    const estimatedCost = numberValue(row.estimated_cost);
    const transactions = numberValue(row.transactions);
    const grossProfit = netRevenue - estimatedCost;
    return {
      revenue,
      netRevenue,
      tvaAmount: revenue - netRevenue,
      estimatedCost,
      grossProfit,
      profitPercent: Math.abs(estimatedCost) > 0.000001
        ? grossProfit / Math.abs(estimatedCost) * 100
        : 0,
      itemsSold: numberValue(row.items_sold),
      transactions,
      averageBasket: transactions !== 0 ? revenue / transactions : 0,
      discountTotal: numberValue(row.discount_total),
      unpaidTotal: numberValue(row.unpaid_total),
    };
  }

  function deltaPercent(current, comparison) {
    const a = numberValue(current);
    const b = numberValue(comparison);
    if (Math.abs(b) < 0.000001) return Math.abs(a) < 0.000001 ? 0 : null;
    return (a - b) / Math.abs(b) * 100;
  }

  function comparisonObject(current, comparison) {
    const result = {};
    for (const key of ["revenue", "netRevenue", "tvaAmount", "estimatedCost", "grossProfit", "profitPercent", "itemsSold", "transactions", "averageBasket", "discountTotal", "unpaidTotal"]) {
      result[key] = deltaPercent(current?.[key], comparison?.[key]);
    }
    return result;
  }

  function bucketSql(bucket) {
    if (bucket === "day") return `happened_on::date`;
    if (bucket === "week") return `date_trunc('week', happened_on)::date`;
    return `date_trunc('month', happened_on)::date`;
  }

  function bucketEnd(start, bucket) {
    if (bucket === "day") return start;
    if (bucket === "week") return addDays(start, 6);
    return monthEnd(start);
  }

  function bucketLabel(start, bucket) {
    const date = new Date(`${start}T12:00:00Z`);
    if (bucket === "day") {
      return new Intl.DateTimeFormat("hu-HU", { month: "2-digit", day: "2-digit" }).format(date);
    }
    if (bucket === "week") {
      return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
    }
    return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "short" }).format(date).replace(".", "");
  }

  function generateBucketStarts(from, to, bucket) {
    const starts = [];
    if (bucket === "day") {
      for (let cursor = from; cursor <= to && starts.length < 600; cursor = addDays(cursor, 1)) starts.push(cursor);
      return starts;
    }
    if (bucket === "week") {
      const date = new Date(`${from}T12:00:00Z`);
      const day = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() - day + 1);
      let cursor = date.toISOString().slice(0, 10);
      while (cursor <= to && starts.length < 600) {
        starts.push(cursor);
        cursor = addDays(cursor, 7);
      }
      return starts;
    }
    let cursor = monthStart(from);
    while (cursor <= to && starts.length < 600) {
      starts.push(cursor);
      cursor = addMonths(cursor, 1);
    }
    return starts;
  }

  function completeTrend(rows, from, to, bucket) {
    const byStart = new Map((rows || []).map((row) => [isoDateOnly(row.bucket_start), row]).filter(([key]) => Boolean(key)));
    return generateBucketStarts(from, to, bucket).map((start, index) => {
      const row = byStart.get(start) || {};
      const metrics = metricRow(row);
      return {
        index,
        start,
        end: bucketEnd(start, bucket),
        label: bucketLabel(start, bucket),
        ...metrics,
      };
    });
  }

  const employeeSelectSql = `SELECT
    COALESCE(NULLIF(actor,''),'Ismeretlen') AS name,
    COALESCE(sum(revenue),0)::numeric AS revenue,
    COALESCE(sum(net_revenue),0)::numeric AS net_revenue,
    COALESCE(sum(estimated_cost),0)::numeric AS estimated_cost,
    COALESCE(sum(quantity),0)::numeric AS items_sold,
    ${transactionCountSql}::numeric AS transactions,
    COALESCE(sum(discount_total),0)::numeric AS discount_total,
    COALESCE(sum(unpaid_total),0)::numeric AS unpaid_total
  FROM filtered
  GROUP BY COALESCE(NULLIF(actor,''),'Ismeretlen')
  ORDER BY revenue DESC, transactions DESC
  LIMIT 100`;

  // Ezt szándékosan nem külön WITH-tel kezdjük. A buildFactsQuery már létrehozza
  // a fact_rows és filtered CTE-ket, ezért egy második WITH közvetlenül utána
  // PostgreSQL szintaktikai hibát okozott ("syntax error at or near WITH").
  const dimensionsSelectSql = `SELECT *
  FROM (
    SELECT grouped.*,
      row_number() OVER (PARTITION BY dimension ORDER BY revenue DESC, items_sold DESC, name ASC) AS rank
    FROM (
      SELECT
        dimension,
        dimension_key AS key,
        max(dimension_name) AS name,
        max(meta) AS meta,
        COALESCE(sum(revenue),0)::numeric AS revenue,
        COALESCE(sum(net_revenue),0)::numeric AS net_revenue,
        COALESCE(sum(estimated_cost),0)::numeric AS estimated_cost,
        COALESCE(sum(quantity),0)::numeric AS items_sold,
        ${transactionCountSql}::numeric AS transactions,
        COALESCE(sum(discount_total),0)::numeric AS discount_total,
        COALESCE(sum(unpaid_total),0)::numeric AS unpaid_total
      FROM (
        SELECT f.*, d.dimension, d.dimension_key, d.dimension_name, d.meta
        FROM filtered f
        CROSS JOIN LATERAL (VALUES
          ('brand'::text, NULLIF(f.brand_name,''), NULLIF(f.brand_name,''), NULL::text),
          ('category'::text, NULLIF(f.category_name,''), NULLIF(f.category_name,''), NULL::text),
          ('subcategory'::text, NULLIF(f.subcategory_name,''), NULLIF(f.subcategory_name,''), NULL::text),
          ('product'::text, COALESCE(NULLIF(f.product_code,''),NULLIF(f.product_title,'')), COALESCE(NULLIF(f.product_title,''),NULLIF(f.product_code,'')), NULLIF(f.product_code,'')),
          ('size'::text, NULLIF(f.size,''), NULLIF(f.size,''), NULL::text),
          ('color'::text, NULLIF(f.color_name,''), NULLIF(f.color_name,''), NULL::text),
          ('store'::text, COALESCE(NULLIF(f.location_code,''),NULLIF(f.location_name,'')), COALESCE(NULLIF(f.location_name,''),NULLIF(f.location_code,'')), NULLIF(f.location_code,'')),
          ('payment'::text, NULLIF(f.payment_method,''), NULLIF(f.payment_method,''), NULL::text)
        ) d(dimension,dimension_key,dimension_name,meta)
        WHERE d.dimension_key IS NOT NULL
      ) expanded
      GROUP BY dimension, dimension_key
    ) grouped
  ) ranked
  WHERE rank <= 18
  ORDER BY dimension, rank`;

  const heatmapSelectSql = `SELECT
    COALESCE(NULLIF(actor,''),'Ismeretlen') AS actor,
    date_trunc('month', happened_on)::date AS month_start,
    COALESCE(sum(revenue),0)::numeric AS revenue,
    COALESCE(sum(net_revenue),0)::numeric AS net_revenue,
    COALESCE(sum(estimated_cost),0)::numeric AS estimated_cost,
    COALESCE(sum(quantity),0)::numeric AS items_sold,
    ${transactionCountSql}::numeric AS transactions
  FROM filtered
  GROUP BY COALESCE(NULLIF(actor,''),'Ismeretlen'), date_trunc('month', happened_on)::date
  ORDER BY actor ASC, month_start ASC`;

  const detailsSelectSql = `SELECT
    source, record_id, import_id, happened_on, location_id, location_code, location_name,
    actor, brand_name, category_name, subcategory_name, product_title, product_code, image_url,
    color_name, size, quantity, aggregate_transactions, revenue, net_revenue,
    sales_before_discount, discount_total, paid_total, unpaid_total, estimated_cost,
    cost_covered, net_covered, payment_method, source_granularity, document_number,
    customer_name, customer_phone, note
  FROM filtered
  ORDER BY happened_on DESC, document_number DESC NULLS LAST, record_id DESC
  LIMIT 5000`;

  function mergeNamedRows(currentRows, comparisonRows, kind = "employee") {
    const map = new Map();
    const put = (row, side) => {
      const dimension = kind === "dimension" ? text(row.dimension) : "employee";
      const rawKey = text(kind === "dimension" ? row.key : row.name) || "Ismeretlen";
      const mapKey = `${dimension}:${rawKey.toLocaleLowerCase("hu-HU")}`;
      const current = map.get(mapKey) || {
        dimension,
        key: rawKey,
        name: text(row.name) || rawKey,
        meta: row.meta || null,
        rank: numberValue(row.rank),
        current: metricRow({}),
        comparison: metricRow({}),
      };
      current[side] = metricRow(row);
      if (row.meta) current.meta = row.meta;
      if (row.name) current.name = row.name;
      if (side === "current") current.rank = numberValue(row.rank);
      map.set(mapKey, current);
    };
    for (const row of currentRows || []) put(row, "current");
    for (const row of comparisonRows || []) put(row, "comparison");
    return Array.from(map.values())
      .map((row) => ({ ...row, deltaPercent: comparisonObject(row.current, row.comparison) }))
      .sort((a, b) => b.current.revenue - a.current.revenue || b.comparison.revenue - a.comparison.revenue || a.name.localeCompare(b.name, "hu"));
  }

  function monthBuckets(from, to) {
    const result = [];
    for (let cursor = monthStart(from); cursor <= to && result.length < 60; cursor = addMonths(cursor, 1)) {
      result.push({ start: cursor, end: monthEnd(cursor), label: bucketLabel(cursor, "month") });
    }
    return result;
  }

  function buildHeatmap(currentRows, comparisonRows, from, to, compareFrom, compareTo) {
    const currentMonths = monthBuckets(from, to);
    const comparisonMonths = monthBuckets(compareFrom, compareTo);
    const length = Math.max(currentMonths.length, comparisonMonths.length);
    const months = Array.from({ length }, (_, index) => ({
      index,
      label: currentMonths[index]?.label || comparisonMonths[index]?.label || "",
      currentStart: currentMonths[index]?.start || null,
      currentEnd: currentMonths[index]?.end || null,
      comparisonStart: comparisonMonths[index]?.start || null,
      comparisonEnd: comparisonMonths[index]?.end || null,
    }));
    const currentMap = new Map();
    const comparisonMap = new Map();
    const actorNames = new Set();
    for (const row of currentRows || []) {
      const actor = text(row.actor) || "Ismeretlen";
      actorNames.add(actor);
      const month = isoDateOnly(row.month_start);
      if (month) currentMap.set(`${actor.toLocaleLowerCase("hu-HU")}:${month.slice(0, 7)}`, metricRow(row));
    }
    for (const row of comparisonRows || []) {
      const actor = text(row.actor) || "Ismeretlen";
      actorNames.add(actor);
      const month = isoDateOnly(row.month_start);
      if (month) comparisonMap.set(`${actor.toLocaleLowerCase("hu-HU")}:${month.slice(0, 7)}`, metricRow(row));
    }
    const rows = Array.from(actorNames).map((actor) => {
      const key = actor.toLocaleLowerCase("hu-HU");
      const values = months.map((month, index) => {
        const current = month.currentStart
          ? currentMap.get(`${key}:${month.currentStart.slice(0, 7)}`) || metricRow({})
          : metricRow({});
        const comparison = month.comparisonStart
          ? comparisonMap.get(`${key}:${month.comparisonStart.slice(0, 7)}`) || metricRow({})
          : metricRow({});
        return { index, current, comparison, deltaPercent: comparisonObject(current, comparison) };
      });
      return {
        actor,
        values,
        totalRevenue: values.reduce((sum, value) => sum + value.current.revenue, 0),
      };
    }).sort((a, b) => b.totalRevenue - a.totalRevenue || a.actor.localeCompare(b.actor, "hu"));
    return { months, rows };
  }

  function mapDetails(rows) {
    return (rows || []).map((row) => ({
      id: String(row.record_id),
      source: row.source,
      importId: row.import_id ? String(row.import_id) : null,
      date: isoDateOnly(row.happened_on),
      locationId: row.location_id || null,
      locationCode: row.location_code || null,
      locationName: row.location_name || null,
      actor: row.actor || "Ismeretlen",
      brandName: row.brand_name || null,
      categoryName: row.category_name || null,
      subcategoryName: row.subcategory_name || null,
      productTitle: row.product_title || null,
      productCode: row.product_code || null,
      imageUrl: row.image_url || null,
      colorName: row.color_name || null,
      size: row.size || null,
      quantity: numberValue(row.quantity),
      transactions: row.aggregate_transactions === null || row.aggregate_transactions === undefined ? null : numberValue(row.aggregate_transactions),
      revenue: numberValue(row.revenue),
      netRevenue: numberValue(row.net_revenue),
      salesBeforeDiscount: numberValue(row.sales_before_discount),
      discountTotal: numberValue(row.discount_total),
      paidTotal: numberValue(row.paid_total),
      unpaidTotal: numberValue(row.unpaid_total),
      estimatedCost: numberValue(row.estimated_cost),
      grossProfit: numberValue(row.net_revenue) - numberValue(row.estimated_cost),
      costCovered: Boolean(row.cost_covered),
      netCovered: Boolean(row.net_covered),
      paymentMethod: row.payment_method || null,
      granularity: row.source_granularity || "line",
      documentNumber: row.document_number || null,
      customerName: row.customer_name || null,
      customerPhone: row.customer_phone || null,
      note: row.note || null,
    }));
  }

  async function filterOptions() {
    const now = Date.now();
    if (filterOptionsCache && filterOptionsCache.expiresAt > now) return filterOptionsCache.value;
    const [locationsResult, yearsResult, employeesResult, shopEmployeesResult, brandsResult, categoriesResult, subcategoriesResult, sizesResult, colorsResult] = await Promise.all([
      pool.query(`SELECT id::text AS id, code, name
        FROM aif_locations
        WHERE COALESCE(is_active,true)=true
        ORDER BY name ASC`),
      pool.query(`SELECT DISTINCT year FROM (
        SELECT EXTRACT(YEAR FROM sold_at AT TIME ZONE 'Europe/Bucharest')::int AS year FROM aif_shop_sales
        UNION SELECT EXTRACT(YEAR FROM created_at AT TIME ZONE 'Europe/Bucharest')::int AS year FROM aif_shop_exchanges
        UNION SELECT EXTRACT(YEAR FROM sold_on)::int AS year FROM aif_sales_history_rows
      ) years WHERE year IS NOT NULL ORDER BY year DESC`),
      pool.query(`SELECT DISTINCT value FROM (
        SELECT NULLIF(actor,'') AS value FROM aif_shop_sales
        UNION SELECT NULLIF(actor,'') AS value FROM aif_shop_exchanges
        UNION SELECT NULLIF(actor,'') AS value FROM aif_sales_history_rows
        UNION SELECT NULLIF(btrim(name),'') AS value
          FROM login_codes
      ) x WHERE value IS NOT NULL ORDER BY value ASC LIMIT 500`),
      pool.query(`SELECT shop_id, min(btrim(name)) AS name
        FROM login_codes
        WHERE NULLIF(btrim(COALESCE(name,'')),'') IS NOT NULL
          AND shop_id IN ('csikszereda','kezdivasarhely')
        GROUP BY shop_id, lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))
        ORDER BY shop_id, min(btrim(name)) ASC`),
      pool.query(`SELECT DISTINCT value FROM (
        SELECT NULLIF(brand_name,'') AS value FROM aif_shop_sale_lines
        UNION SELECT NULLIF(brand_name,'') AS value FROM aif_shop_exchange_lines
        UNION SELECT NULLIF(brand_name,'') AS value FROM aif_sales_history_rows
      ) x WHERE value IS NOT NULL ORDER BY value ASC LIMIT 500`),
      pool.query(`SELECT DISTINCT value FROM (
        SELECT NULLIF(category_name,'') AS value FROM aif_shop_sale_lines
        UNION SELECT NULLIF(category_name,'') AS value FROM aif_sales_history_rows
        UNION SELECT COALESCE(NULLIF(name_hu,''),NULLIF(name_ro,'')) AS value FROM aif_categories WHERE parent_id IS NULL
      ) x WHERE value IS NOT NULL ORDER BY value ASC LIMIT 500`),
      pool.query(`SELECT DISTINCT value FROM (
        SELECT NULLIF(subcategory_name,'') AS value FROM aif_shop_sale_lines
        UNION SELECT NULLIF(subcategory_name,'') AS value FROM aif_sales_history_rows
        UNION SELECT COALESCE(NULLIF(name_hu,''),NULLIF(name_ro,'')) AS value FROM aif_categories WHERE parent_id IS NOT NULL
      ) x WHERE value IS NOT NULL ORDER BY value ASC LIMIT 500`),
      pool.query(`SELECT DISTINCT value FROM (
        SELECT NULLIF(size,'') AS value FROM aif_shop_sale_lines
        UNION SELECT NULLIF(size,'') AS value FROM aif_shop_exchange_lines
        UNION SELECT NULLIF(size,'') AS value FROM aif_sales_history_rows
      ) x WHERE value IS NOT NULL ORDER BY value ASC LIMIT 500`),
      pool.query(`SELECT DISTINCT value FROM (
        SELECT NULLIF(color_name,'') AS value FROM aif_shop_sale_lines
        UNION SELECT NULLIF(color_name,'') AS value FROM aif_shop_exchange_lines
        UNION SELECT NULLIF(color_name,'') AS value FROM aif_sales_history_rows
      ) x WHERE value IS NOT NULL ORDER BY value ASC LIMIT 500`),
    ]);
    const value = {
      locations: locationsResult.rows.map((row) => ({ id: row.id, code: row.code, name: row.name })),
      years: yearsResult.rows.map((row) => numberValue(row.year)),
      employees: employeesResult.rows.map((row) => row.value),
      employeesByLocation: {
        main_warehouse: shopEmployeesResult.rows.filter((row) => row.shop_id === 'csikszereda').map((row) => row.name),
        magazin_targu_secuiesc: shopEmployeesResult.rows.filter((row) => row.shop_id === 'kezdivasarhely').map((row) => row.name),
      },
      brands: brandsResult.rows.map((row) => row.value),
      categories: categoriesResult.rows.map((row) => row.value),
      subcategories: subcategoriesResult.rows.map((row) => row.value),
      sizes: sizesResult.rows.map((row) => row.value),
      colors: colorsResult.rows.map((row) => row.value),
    };
    filterOptionsCache = { expiresAt: now + 60_000, value };
    return value;
  }

  router.get("/sales-command-center/overview", requireAdminOrSecret, async (req, res) => {
    try {
      await ensureAifShopSalesSchema();
      await ensureHistorySchema();

      const today = typeof aifBucharestIsoDate === "function" ? aifBucharestIsoDate() : new Date().toISOString().slice(0, 10);
      const yearStart = `${today.slice(0, 4)}-01-01`;
      let from = typeof aifValidIsoDate === "function" ? aifValidIsoDate(req.query.from, yearStart) : normalizeDateInput(req.query.from) || yearStart;
      let to = typeof aifValidIsoDate === "function" ? aifValidIsoDate(req.query.to, today) : normalizeDateInput(req.query.to) || today;
      if (from > to) [from, to] = [to, from];
      // Egyetlen vizsgált időszak van. Az összehasonlítás mindig ugyanennek
      // az időszaknak az előző évi párja. Régi vagy hibás frontend-érték így
      // nem húzhat 2026-os eladást a 2025-ös összehasonlításba.
      const compareFrom = shiftYear(from, -1);
      const compareTo = shiftYear(to, -1);

      const filters = {
        location: text(req.query.location || "all") || "all",
        employee: text(req.query.employee),
        brand: text(req.query.brand),
        category: text(req.query.category),
        subcategory: text(req.query.subcategory),
        size: text(req.query.size),
        color: text(req.query.color),
        payment: text(req.query.payment || req.query.paymentMethod || req.query.payment_method),
        product: text(req.query.product),
        snCod: text(req.query.snCod || req.query.sn_cod),
        search: text(req.query.search || req.query.q),
        source: cleanSource(req.query.source),
      };
      const days = inclusiveDays(from, to);
      let bucket = cleanBucket(req.query.bucket, days);
      const requestedBucket = normCode(req.query.bucket || "auto") || "auto";
      const hasDimensionDrill = Boolean(
        filters.brand || filters.category || filters.subcategory || filters.size ||
        filters.color || filters.payment || filters.product || filters.snCod || filters.search
      );
      if (requestedBucket === "auto" && filters.source !== "live" && !hasDimensionDrill) {
        const monthlyArgs = [from, to, compareFrom, compareTo];
        const monthlyWhere = [
          `source_granularity='monthly'`,
          `((sold_on BETWEEN $1::date AND $2::date) OR (sold_on BETWEEN $3::date AND $4::date))`,
        ];
        if (filters.location && normCode(filters.location) !== "all") {
          monthlyArgs.push(filters.location);
          monthlyWhere.push(`(location_id::text=$${monthlyArgs.length} OR location_code=$${monthlyArgs.length} OR lower(COALESCE(location_name,''))=lower($${monthlyArgs.length}))`);
        }
        if (filters.employee) {
          monthlyArgs.push(filters.employee);
          monthlyWhere.push(`lower(COALESCE(actor,''))=lower($${monthlyArgs.length})`);
        }
        const monthlyHistory = await pool.query(
          `SELECT 1 FROM aif_sales_history_rows WHERE ${monthlyWhere.join(" AND ")} LIMIT 1`,
          monthlyArgs,
        );
        if (monthlyHistory.rowCount) bucket = "month";
      }
      const salesSettings = typeof readSalesTvaSettings === "function"
        ? await readSalesTvaSettings(pool)
        : { salesTvaRate: 21, sellPriceIncludesTva: true };
      const salesTvaRate = Math.max(0, Math.min(100, numberValue(salesSettings?.salesTvaRate ?? 21)));
      const priceIncludesTva = salesSettings?.sellPriceIncludesTva !== false && salesSettings?.salesPriceIncludesTva !== false;

      const build = (rangeFrom, rangeTo, selectSql) => buildFactsQuery({
        from: rangeFrom,
        to: rangeTo,
        filters,
        salesTvaRate,
        priceIncludesTva,
        selectSql,
      });
      const currentSummaryQuery = build(from, to, summarySelectSql);
      const comparisonSummaryQuery = build(compareFrom, compareTo, summarySelectSql);
      const trendSelect = `SELECT
        ${bucketSql(bucket)} AS bucket_start,
        COALESCE(sum(revenue),0)::numeric AS revenue,
        COALESCE(sum(net_revenue),0)::numeric AS net_revenue,
        COALESCE(sum(estimated_cost),0)::numeric AS estimated_cost,
        COALESCE(sum(quantity),0)::numeric AS items_sold,
        ${transactionCountSql}::numeric AS transactions,
        COALESCE(sum(discount_total),0)::numeric AS discount_total,
        COALESCE(sum(unpaid_total),0)::numeric AS unpaid_total
      FROM filtered
      GROUP BY ${bucketSql(bucket)}
      ORDER BY bucket_start ASC`;
      const currentTrendQuery = build(from, to, trendSelect);
      const comparisonTrendQuery = build(compareFrom, compareTo, trendSelect);
      const currentEmployeeQuery = build(from, to, employeeSelectSql);
      const comparisonEmployeeQuery = build(compareFrom, compareTo, employeeSelectSql);
      const currentDimensionsQuery = build(from, to, dimensionsSelectSql);
      const comparisonDimensionsQuery = build(compareFrom, compareTo, dimensionsSelectSql);
      const currentHeatmapQuery = build(from, to, heatmapSelectSql);
      const comparisonHeatmapQuery = build(compareFrom, compareTo, heatmapSelectSql);
      const detailsQuery = build(from, to, detailsSelectSql);

      const [
        currentSummaryResult,
        comparisonSummaryResult,
        currentTrendResult,
        comparisonTrendResult,
        currentEmployeeResult,
        comparisonEmployeeResult,
        currentDimensionsResult,
        comparisonDimensionsResult,
        currentHeatmapResult,
        comparisonHeatmapResult,
        detailsResult,
        options,
      ] = await Promise.all([
        pool.query(currentSummaryQuery.sql, currentSummaryQuery.args),
        pool.query(comparisonSummaryQuery.sql, comparisonSummaryQuery.args),
        pool.query(currentTrendQuery.sql, currentTrendQuery.args),
        pool.query(comparisonTrendQuery.sql, comparisonTrendQuery.args),
        pool.query(currentEmployeeQuery.sql, currentEmployeeQuery.args),
        pool.query(comparisonEmployeeQuery.sql, comparisonEmployeeQuery.args),
        pool.query(currentDimensionsQuery.sql, currentDimensionsQuery.args),
        pool.query(comparisonDimensionsQuery.sql, comparisonDimensionsQuery.args),
        pool.query(currentHeatmapQuery.sql, currentHeatmapQuery.args),
        pool.query(comparisonHeatmapQuery.sql, comparisonHeatmapQuery.args),
        pool.query(detailsQuery.sql, detailsQuery.args),
        filterOptions(),
      ]);

      const summary = mapSummary(currentSummaryResult.rows[0] || {});
      const comparisonSummary = mapSummary(comparisonSummaryResult.rows[0] || {});
      const employees = mergeNamedRows(currentEmployeeResult.rows, comparisonEmployeeResult.rows, "employee")
        .map((row, index) => ({ actor: row.name, rank: index + 1, current: row.current, comparison: row.comparison, deltaPercent: row.deltaPercent }));
      const dimensionRows = mergeNamedRows(currentDimensionsResult.rows, comparisonDimensionsResult.rows, "dimension");
      const dimensions = {};
      for (const key of ["brand", "category", "subcategory", "product", "size", "color", "store", "payment"]) {
        dimensions[key] = dimensionRows
          .filter((row) => row.dimension === key)
          .map((row, index) => ({
            key: row.key,
            name: key === "store"
              ? (String(row.meta || row.key || "").toLowerCase() === "main_warehouse"
                ? "Csíkszereda"
                : String(row.meta || row.key || "").toLowerCase() === "magazin_targu_secuiesc"
                  ? "Kézdivásárhely"
                  : row.name)
              : key === "payment"
                ? (() => {
                  const rawPayment = text(row.name).toLowerCase();
                  if (rawPayment === "exchange") return "Csere";
                  if (rawPayment === "mixed") return "Vegyes";
                  if (rawPayment === "cash") return "Készpénz";
                  if (rawPayment === "card") return "Bankkártya";
                  if (rawPayment === "bank_transfer") return "Banki átutalás";
                  if (rawPayment === "credit") return "Hitel";
                  return typeof aifPaymentMethodLabel === "function" ? aifPaymentMethodLabel(row.name) : row.name;
                })()
                : row.name,
            rawName: row.name,
            meta: row.meta,
            rank: index + 1,
            current: row.current,
            comparison: row.comparison,
            deltaPercent: row.deltaPercent,
          }));
      }

      return res.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        scope: {
          from,
          to,
          compareFrom,
          compareTo,
          days,
          compareDays: inclusiveDays(compareFrom, compareTo),
          bucket,
          ...filters,
        },
        salesTva: { rate: salesTvaRate, priceIncludesTva },
        pricingRule: {
          targetProfitPercent: 65,
          tvaRate: salesTvaRate,
          formula: `vételár + 65% profit + ${salesTvaRate}% TVA`,
        },
        summary,
        comparisonSummary,
        deltaPercent: comparisonObject(summary, comparisonSummary),
        trend: {
          current: completeTrend(currentTrendResult.rows, from, to, bucket),
          comparison: completeTrend(comparisonTrendResult.rows, compareFrom, compareTo, bucket),
        },
        employees,
        dimensions,
        heatmap: buildHeatmap(
          currentHeatmapResult.rows,
          comparisonHeatmapResult.rows,
          from,
          to,
          compareFrom,
          compareTo,
        ),
        details: mapDetails(detailsResult.rows),
        coverage: {
          current: {
            cost: summary.costCoveragePercent,
            net: summary.netCoveragePercent,
            historyDetail: summary.historyDetailCoveragePercent,
            liveRevenue: summary.liveRevenue,
            historyRevenue: summary.historyRevenue,
            liveRows: summary.liveRows,
            historyRows: summary.historyRows,
          },
          comparison: {
            cost: comparisonSummary.costCoveragePercent,
            net: comparisonSummary.netCoveragePercent,
            historyDetail: comparisonSummary.historyDetailCoveragePercent,
            liveRevenue: comparisonSummary.liveRevenue,
            historyRevenue: comparisonSummary.historyRevenue,
            liveRows: comparisonSummary.liveRows,
            historyRows: comparisonSummary.historyRows,
          },
        },
        filterOptions: options,
      });
    } catch (error) {
      console.error("AIF sales command center overview failed", error);
      const status = Number(error?.statusCode || error?.status || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A vezetői eladási központ adatai nem tölthetők be.",
        code: error?.code || null,
      });
    }
  });

  router.get("/sales-command-center/history/imports", requireAdminOrSecret, async (req, res) => {
    try {
      await ensureHistorySchema();
      const limit = Math.min(300, Math.max(1, Number(req.query.limit || 100)));
      const result = await pool.query(
        `${historyImportAggregateSql()} ORDER BY i.created_at DESC LIMIT $1`,
        [limit],
      );
      return res.json({ ok: true, items: result.rows.map(historyImportMap) });
    } catch (error) {
      console.error("AIF sales history import list failed", error);
      return res.status(500).json({ error: error?.message || "A történeti importok nem tölthetők be." });
    }
  });

  router.get("/sales-command-center/history/imports/:id", requireAdminOrSecret, async (req, res) => {
    try {
      await ensureHistorySchema();
      const id = text(req.params.id);
      const summaryResult = await pool.query(
        `${historyImportAggregateSql("WHERE i.id::text=$1")} LIMIT 1`,
        [id],
      );
      if (!summaryResult.rowCount) return res.status(404).json({ error: "A történeti import nem található." });
      const rowsResult = await pool.query(
        `SELECT * FROM aif_sales_history_rows WHERE import_id::text=$1 ORDER BY row_no ASC`,
        [id],
      );
      return res.json({
        ok: true,
        item: historyImportMap(summaryResult.rows[0]),
        rows: rowsResult.rows.map((row) => ({
          id: String(row.id),
          rowNo: numberValue(row.row_no),
          soldOn: isoDateOnly(row.sold_on),
          locationId: row.location_id ? String(row.location_id) : null,
          locationCode: row.location_code || null,
          locationName: row.location_name || null,
          actor: row.actor,
          sourceGranularity: row.source_granularity,
          transactionKey: row.transaction_key || null,
          brandName: row.brand_name || null,
          categoryName: row.category_name || null,
          subcategoryName: row.subcategory_name || null,
          productTitle: row.product_title || null,
          productCode: row.product_code || null,
          colorName: row.color_name || null,
          size: row.size || null,
          quantity: row.quantity === null ? null : numberValue(row.quantity),
          transactions: row.transactions === null ? null : numberValue(row.transactions),
          revenue: numberValue(row.revenue),
          netRevenue: row.net_revenue === null ? null : numberValue(row.net_revenue),
          tvaRate: row.tva_rate === null ? null : numberValue(row.tva_rate),
          priceIncludesTva: row.price_includes_tva !== false,
          salesBeforeDiscount: row.sales_before_discount === null ? null : numberValue(row.sales_before_discount),
          discountTotal: row.discount_total === null ? null : numberValue(row.discount_total),
          paidTotal: row.paid_total === null ? null : numberValue(row.paid_total),
          unpaidTotal: row.unpaid_total === null ? null : numberValue(row.unpaid_total),
          estimatedCost: row.estimated_cost === null ? null : numberValue(row.estimated_cost),
          paymentMethod: row.payment_method || null,
          note: row.note || null,
        })),
      });
    } catch (error) {
      console.error("AIF sales history import detail failed", error);
      return res.status(500).json({ error: error?.message || "A történeti import nem tölthető be." });
    }
  });

  router.post("/sales-command-center/history/imports", requireAdminOrSecret, async (req, res) => {
    const body = req.body || {};
    const inputRows = Array.isArray(body.rows) ? body.rows : [];
    if (!inputRows.length) return res.status(400).json({ error: "Nincs importálható történeti eladási sor." });
    if (inputRows.length > 25_000) return res.status(400).json({ error: "Egy import legfeljebb 25 000 sort tartalmazhat." });

    const client = await pool.connect();
    try {
      await ensureAifShopSalesSchema();
      await ensureHistorySchema();
      const locations = await readLocations();
      const lookup = locationLookup(locations);
      const defaults = body.defaults && typeof body.defaults === "object" ? body.defaults : {};
      const normalized = inputRows.map((row, index) => normalizeHistoryRow(row, index, defaults, lookup));
      const errors = normalized.flatMap((entry, index) => entry.errors.map((message) => ({
        rowNo: entry.value?.rowNo || index + 1,
        message,
      })));
      if (errors.length) {
        return res.status(400).json({
          error: `${errors.length} hibás történeti sor miatt az import nem indult el.`,
          code: "history_import_validation_failed",
          errors: errors.slice(0, 250),
        });
      }

      const rows = normalized.map((entry) => entry.value);
      const sourceName = text(body.sourceName || body.source_name || "Történeti eladás") || "Történeti eladás";
      const sourceKindRaw = normCode(body.sourceKind || body.source_kind || "manual");
      const sourceKind = ["manual", "xlsx", "xls", "csv", "other"].includes(sourceKindRaw) ? sourceKindRaw : "other";
      const note = text(body.note) || null;
      const actor = typeof actorFrom === "function" ? actorFrom(req) : text(req.session?.actor || "ADMIN") || "ADMIN";
      const baseHash = createHash("sha256").update(JSON.stringify(rows.map((row) => ({
        ...row,
        raw: undefined,
      })))).digest("hex");
      const allowDuplicate = boolValue(body.allowDuplicate || body.allow_duplicate, false);
      const payloadHash = allowDuplicate
        ? createHash("sha256").update(`${baseHash}:${Date.now()}:${actor}`).digest("hex")
        : baseHash;

      await client.query("BEGIN");
      if (!allowDuplicate) {
        const duplicate = await client.query(
          `SELECT id, source_name, created_at FROM aif_sales_history_imports WHERE payload_hash=$1 LIMIT 1`,
          [payloadHash],
        );
        if (duplicate.rowCount) {
          const error = new Error(`Ugyanez a történeti adatcsomag már be lett vezetve: ${duplicate.rows[0].source_name}.`);
          error.statusCode = 409;
          error.code = "history_import_duplicate";
          throw error;
        }
      }

      const importResult = await client.query(
        `INSERT INTO aif_sales_history_imports (
          source_name, source_kind, payload_hash, row_count, imported_by, note, raw
        ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
        RETURNING id`,
        [sourceName, sourceKind, payloadHash, rows.length, actor, note, JSON.stringify({
          originalFileName: body.originalFileName || body.original_file_name || null,
          defaults,
        })],
      );
      const importId = importResult.rows[0].id;
      await insertHistoryRows(client, importId, rows);
      await client.query("COMMIT");
      filterOptionsCache = null;

      const saved = await pool.query(
        `${historyImportAggregateSql("WHERE i.id=$1")} LIMIT 1`,
        [importId],
      );
      return res.json({ ok: true, item: historyImportMap(saved.rows[0] || { id: importId, source_name: sourceName, row_count: rows.length }) });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF sales history import failed", error);
      const status = Number(error?.statusCode || error?.status || (error?.code === "23505" ? 409 : 500));
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A történeti eladások importálása nem sikerült.",
        code: error?.code || null,
      });
    } finally {
      client.release();
    }
  });

  router.delete("/sales-command-center/history/imports/:id", requireAdminOrSecret, async (req, res) => {
    try {
      await ensureHistorySchema();
      const id = text(req.params.id);
      const result = await pool.query(
        `DELETE FROM aif_sales_history_imports WHERE id::text=$1 RETURNING id, source_name, row_count`,
        [id],
      );
      if (!result.rowCount) return res.status(404).json({ error: "A történeti import nem található." });
      filterOptionsCache = null;
      return res.json({
        ok: true,
        id: String(result.rows[0].id),
        sourceName: result.rows[0].source_name,
        deletedRows: numberValue(result.rows[0].row_count),
      });
    } catch (error) {
      console.error("AIF sales history import delete failed", error);
      return res.status(500).json({ error: error?.message || "A történeti import törlése nem sikerült." });
    }
  });

  return router;
}
