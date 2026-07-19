const schemaPromises = new WeakMap();

const cleanText = (value) => String(value ?? "").trim();
const nullableText = (value) => {
  const out = cleanText(value);
  return out || null;
};
const cleanInt = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(String(value).replace(",", "."), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const cleanMoney = (value, fallback = null) => {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  const parsed = Number(String(value).replace(",", ".").trim());
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : fallback;
};
const multiplyMoney = (quantity, unitPrice) => {
  const qty = Math.max(0, cleanInt(quantity, 0) || 0);
  const price = cleanMoney(unitPrice, null);
  return price === null ? null : Math.round((qty * price + Number.EPSILON) * 100) / 100;
};
const cleanBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const raw = cleanText(value).toLowerCase();
  if (["1", "true", "yes", "da", "igen", "on"].includes(raw)) return true;
  if (["0", "false", "no", "nu", "nem", "off"].includes(raw)) return false;
  return fallback;
};

function actorFromRequest(req) {
  return cleanText(
    req?.session?.actor ||
    req?.session?.user?.email ||
    req?.session?.email ||
    req?.session?.username ||
    req?.session?.shopId ||
    req?.session?.role ||
    req?.user?.email ||
    req?.user?.username ||
    req?.user?.id ||
    "system"
  ) || "system";
}

function safeSeries(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "PV";
}

export const AIF_STOCK_DOCUMENT_TYPES = Object.freeze({
  internal_transfer: { series: "PV", title: "PROCES-VERBAL DE PREDARE-PRIMIRE", subtitle: "TRANSFER INTERN DE STOC", priceBasis: "selling_price" },
  supplier_return: { series: "RET", title: "AVIZ DE RETUR CĂTRE FURNIZOR", subtitle: "RETUR DE MARFĂ CĂTRE FURNIZOR", priceBasis: "purchase_price" },
  damaged_writeoff: { series: "DET", title: "PROCES-VERBAL DE CONSTATARE ȘI SCOATERE DIN GESTIUNE", subtitle: "PRODUSE DETERIORATE", priceBasis: "purchase_price" },
  stock_correction: { series: "COR", title: "NOTĂ DE CORECȚIE A STOCULUI", subtitle: "CORECȚIE JUSTIFICATĂ DE STOC", priceBasis: "purchase_price" },
});

export function cleanAifStockDocumentType(value, fallback = null) {
  const raw = cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const aliases = {
    transfer: "internal_transfer", stock_transfer: "internal_transfer", aviz: "internal_transfer",
    retur: "supplier_return", return: "supplier_return",
    damaged: "damaged_writeoff", deteriorated: "damaged_writeoff", writeoff: "damaged_writeoff",
    correction: "stock_correction", adjustment: "stock_correction",
  };
  const normalized = aliases[raw] || raw;
  return Object.prototype.hasOwnProperty.call(AIF_STOCK_DOCUMENT_TYPES, normalized) ? normalized : fallback;
}

function formatDocumentNumber(settings, year, sequenceNumber) {
  const series = safeSeries(settings.series || "PV");
  const padding = Math.min(12, Math.max(1, cleanInt(settings.padding, 6) || 6));
  const seq = String(Math.max(1, cleanInt(sequenceNumber, 1) || 1)).padStart(padding, "0");
  const includeYear = settings.include_year !== false;
  return includeYear ? `${series}/${year}/${seq}` : `${series}/${seq}`;
}

function settingsPreview(settings, year = new Date().getFullYear()) {
  return formatDocumentNumber(settings, year, settings.next_number || 1);
}

export async function ensureAifStockTransferDocumentSchema(target) {
  if (!target || typeof target.query !== "function") throw new Error("PostgreSQL client/pool required");
  const poolKey = typeof target.connect === "function" ? target : null;
  if (poolKey && schemaPromises.has(poolKey)) return schemaPromises.get(poolKey);

  const run = async () => {
    await target.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await target.query(`
      CREATE TABLE IF NOT EXISTS aif_stock_transfer_document_settings (
        id smallint PRIMARY KEY DEFAULT 1 CHECK (id=1),
        series text NOT NULL DEFAULT 'PV',
        next_number bigint NOT NULL DEFAULT 1 CHECK (next_number > 0),
        padding smallint NOT NULL DEFAULT 6 CHECK (padding BETWEEN 1 AND 12),
        include_year boolean NOT NULL DEFAULT true,
        reset_yearly boolean NOT NULL DEFAULT true,
        current_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer,
        document_title text NOT NULL DEFAULT 'PROCES-VERBAL DE PREDARE-PRIMIRE',
        document_subtitle text NOT NULL DEFAULT 'TRANSFER INTERN DE STOC',
        updated_by text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await target.query(`
      INSERT INTO aif_stock_transfer_document_settings (id)
      VALUES (1)
      ON CONFLICT (id) DO NOTHING
    `);

    await target.query(`
      CREATE TABLE IF NOT EXISTS aif_stock_transfer_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        transfer_id text NOT NULL UNIQUE,
        idempotency_key text NULL,
        document_number text NOT NULL UNIQUE,
        series text NOT NULL,
        sequence_number bigint NOT NULL,
        document_year integer NOT NULL,
        document_title text NOT NULL,
        document_subtitle text NULL,
        transfer_title text NULL,
        note text NULL,
        status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','cancelled')),
        line_count integer NOT NULL DEFAULT 0,
        total_qty integer NOT NULL DEFAULT 0,
        total_value numeric(14,2) NOT NULL DEFAULT 0,
        currency_code text NOT NULL DEFAULT 'RON',
        from_locations text[] NOT NULL DEFAULT '{}'::text[],
        to_locations text[] NOT NULL DEFAULT '{}'::text[],
        created_by text NULL,
        raw jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await target.query(`CREATE INDEX IF NOT EXISTS aif_stock_transfer_documents_created_idx ON aif_stock_transfer_documents (created_at DESC)`);
    await target.query(`CREATE INDEX IF NOT EXISTS aif_stock_transfer_documents_number_idx ON aif_stock_transfer_documents (document_number)`);
    await target.query(`CREATE INDEX IF NOT EXISTS aif_stock_transfer_documents_status_idx ON aif_stock_transfer_documents (status, created_at DESC)`);

    await target.query(`
      CREATE TABLE IF NOT EXISTS aif_stock_transfer_document_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id uuid NOT NULL REFERENCES aif_stock_transfer_documents(id) ON DELETE CASCADE,
        line_no integer NOT NULL,
        variant_id uuid NULL,
        product_title text NULL,
        brand_name text NULL,
        category_name text NULL,
        product_code text NULL,
        barcode text NULL,
        color_name text NULL,
        size text NULL,
        image_url text NULL,
        from_location_id uuid NULL,
        from_location_name text NULL,
        to_location_id uuid NULL,
        to_location_name text NULL,
        qty integer NOT NULL DEFAULT 0,
        unit_price numeric(14,2) NULL,
        line_total numeric(14,2) NULL,
        currency_code text NOT NULL DEFAULT 'RON',
        source_before integer NULL,
        source_after integer NULL,
        target_before integer NULL,
        target_after integer NULL,
        raw jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (document_id, line_no)
      )
    `);
    await target.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS total_value numeric(14,2) NOT NULL DEFAULT 0`);
    await target.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'RON'`);
    await target.query(`ALTER TABLE IF EXISTS aif_stock_transfer_document_lines ADD COLUMN IF NOT EXISTS unit_price numeric(14,2) NULL`);
    await target.query(`ALTER TABLE IF EXISTS aif_stock_transfer_document_lines ADD COLUMN IF NOT EXISTS line_total numeric(14,2) NULL`);
    await target.query(`ALTER TABLE IF EXISTS aif_stock_transfer_document_lines ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'RON'`);
    await target.query(`ALTER TABLE IF EXISTS aif_stock_transfer_document_lines ADD COLUMN IF NOT EXISTS price_basis text NULL`);
    await target.query(`ALTER TABLE IF EXISTS aif_stock_transfer_document_lines ADD COLUMN IF NOT EXISTS qty_delta integer NULL`);
    await target.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'internal_transfer'`);
    await target.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS source_location_id text NULL`);
    await target.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS target_location_id text NULL`);
    await target.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS supplier_id text NULL`);
    await target.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS supplier_name text NULL`);
    await target.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS reception_id text NULL`);
    await target.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS external_reference text NULL`);
    await target.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS reason_code text NULL`);
    await target.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS reason_text text NULL`);
    await target.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS operation_direction text NULL`);
    await target.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS price_basis text NOT NULL DEFAULT 'selling_price'`);
    await target.query(`CREATE INDEX IF NOT EXISTS aif_stock_transfer_documents_type_created_idx ON aif_stock_transfer_documents (document_type, created_at DESC)`);
    await target.query(`CREATE TABLE IF NOT EXISTS aif_stock_document_settings (
      document_type text PRIMARY KEY,
      series text NOT NULL,
      next_number bigint NOT NULL DEFAULT 1,
      digits integer NOT NULL DEFAULT 6,
      include_year boolean NOT NULL DEFAULT true,
      yearly_reset boolean NOT NULL DEFAULT true,
      sequence_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer,
      document_title text NOT NULL,
      document_subtitle text NULL,
      updated_by text NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await target.query(`INSERT INTO aif_stock_document_settings (document_type,series,document_title,document_subtitle) VALUES
      ('internal_transfer','PV','PROCES-VERBAL DE PREDARE-PRIMIRE','Transfer intern de stoc'),
      ('supplier_return','RET','AVIZ DE RETUR CĂTRE FURNIZOR','Retur de marfă către furnizor'),
      ('damaged_writeoff','DET','PROCES-VERBAL DE CONSTATARE ȘI SCOATERE DIN GESTIUNE','Produse deteriorate / scoatere din gestiune'),
      ('stock_correction','COR','NOTĂ DE CORECȚIE A STOCULUI','Corecție justificată de stoc')
      ON CONFLICT (document_type) DO NOTHING`);
    await target.query(`CREATE INDEX IF NOT EXISTS aif_stock_transfer_document_lines_document_idx ON aif_stock_transfer_document_lines (document_id, line_no)`);
    await target.query(`CREATE INDEX IF NOT EXISTS aif_stock_transfer_document_lines_variant_idx ON aif_stock_transfer_document_lines (variant_id)`);

    // Régi hivatalos bizonylatok: ahol az átadáskor még nem készült árpillanatkép,
    // egyszer feltöltjük a termék jelenlegi ELADÁSI árából. Vételárhoz itt szándékosan nem nyúlunk.
    await target.query(`
      UPDATE aif_stock_transfer_document_lines l
      SET unit_price=round(v.sell_price::numeric, 2),
          line_total=round(l.qty::numeric * v.sell_price::numeric, 2),
          currency_code='RON'
      FROM aif_product_variants v
      WHERE l.variant_id::text=v.id::text
        AND l.unit_price IS NULL
        AND v.sell_price IS NOT NULL
    `);
    await target.query(`
      UPDATE aif_stock_transfer_document_lines
      SET line_total=round(qty::numeric * unit_price::numeric, 2)
      WHERE line_total IS NULL AND unit_price IS NOT NULL
    `);
    await target.query(`
      UPDATE aif_stock_transfer_documents d
      SET total_value=COALESCE(x.total_value, 0),
          currency_code='RON'
      FROM (
        SELECT document_id, round(COALESCE(sum(line_total),0)::numeric,2) AS total_value
        FROM aif_stock_transfer_document_lines
        GROUP BY document_id
      ) x
      WHERE x.document_id=d.id
        AND (d.total_value IS DISTINCT FROM x.total_value OR d.currency_code IS DISTINCT FROM 'RON')
    `);
    return true;
  };

  if (!poolKey) return run();
  const promise = run().catch((error) => {
    schemaPromises.delete(poolKey);
    throw error;
  });
  schemaPromises.set(poolKey, promise);
  return promise;
}

async function currentBucharestYear(client) {
  const result = await client.query(`SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer AS year`);
  return Number(result.rows[0]?.year || new Date().getFullYear());
}

async function readSettings(client, lock = false) {
  const result = await client.query(
    `SELECT * FROM aif_stock_transfer_document_settings WHERE id=1 ${lock ? "FOR UPDATE" : ""}`
  );
  return result.rows[0];
}

function settingsResponse(settings, year = new Date().getFullYear()) {
  const currentYear = Number(settings?.current_year || year);
  return {
    series: safeSeries(settings?.series || "PV"),
    nextNumber: Math.max(1, Number(settings?.next_number || 1)),
    digits: Math.min(12, Math.max(1, Number(settings?.padding || 6))),
    includeYear: settings?.include_year !== false,
    yearlyReset: settings?.reset_yearly !== false,
    sequenceYear: currentYear,
    documentTitle: cleanText(settings?.document_title) || "PROCES-VERBAL DE PREDARE-PRIMIRE",
    documentSubtitle: cleanText(settings?.document_subtitle) || "TRANSFER INTERN DE STOC",
    previewNumber: settingsPreview(settings || {}, year),
    updatedAt: settings?.updated_at || null,
    updatedBy: settings?.updated_by || null,
  };
}

function documentLocationSummary(values) {
  const unique = Array.from(new Set((Array.isArray(values) ? values : []).map(cleanText).filter(Boolean)));
  if (!unique.length) return null;
  return unique.length === 1 ? unique[0] : "Conform tabelului";
}

function serializeDocument(item) {
  if (!item) return null;
  const legacy = Boolean(item.legacy || item.isLegacy || item.status === "legacy");
  const status = legacy ? "legacy" : item.status === "cancelled" ? "cancelled" : "issued";
  return {
    ...item,
    id: cleanText(item.id),
    transfer_id: cleanText(item.transfer_id),
    document_number: cleanText(item.document_number),
    series: nullableText(item.series),
    sequence_number: item.sequence_number ?? null,
    sequence_year: item.sequence_year ?? item.document_year ?? null,
    title: nullableText(item.title || item.document_title) || "PROCES-VERBAL DE PREDARE-PRIMIRE",
    subtitle: nullableText(item.subtitle || item.document_subtitle || item.transfer_title) || "TRANSFER INTERN DE STOC",
    status,
    actor: nullableText(item.actor || item.created_by),
    owner_key: nullableText(item.owner_key),
    line_count: Number(item.line_count || 0),
    total_qty: Number(item.total_qty || 0),
    total_value: cleanMoney(item.total_value, 0) || 0,
    currency_code: cleanText(item.currency_code || "RON") || "RON",
    from_location_summary: nullableText(item.from_location_summary) || documentLocationSummary(item.from_locations),
    to_location_summary: nullableText(item.to_location_summary) || documentLocationSummary(item.to_locations),
    document_type: cleanAifStockDocumentType(item.document_type, "internal_transfer"),
    source_location_id: nullableText(item.source_location_id),
    target_location_id: nullableText(item.target_location_id),
    supplier_id: nullableText(item.supplier_id),
    supplier_name: nullableText(item.supplier_name),
    reception_id: nullableText(item.reception_id),
    external_reference: nullableText(item.external_reference),
    reason_code: nullableText(item.reason_code),
    reason_text: nullableText(item.reason_text),
    operation_direction: nullableText(item.operation_direction) || (legacy ? "transfer" : null),
    price_basis: nullableText(item.price_basis) || "selling_price",
    isLegacy: legacy,
    source: legacy ? "legacy" : "official",
  };
}

function serializeLine(line) {
  const quantity = Math.max(0, cleanInt(line?.qty, 0) || 0);
  const unitPrice = cleanMoney(line?.unit_price ?? line?.unitPrice ?? line?.sell_price ?? line?.sellPrice, null);
  const lineTotal = cleanMoney(line?.line_total ?? line?.lineTotal, multiplyMoney(quantity, unitPrice));
  return {
    ...line,
    qty: quantity,
    unit_price: unitPrice,
    line_total: lineTotal,
    currency_code: cleanText(line?.currency_code || line?.currencyCode || "RON") || "RON",
    price_basis: nullableText(line?.price_basis || line?.priceBasis),
    qty_delta: cleanInt(line?.qty_delta ?? line?.qtyDelta, null),
  };
}

function detailResponse(item) {
  const document = serializeDocument(item);
  const lines = (item?.lines || []).map(serializeLine);
  return { document, lines };
}

function explicitSellingPrice(row) {
  // Csak ELADÁSI ár. Sem buyPrice, sem vételár, sem beszerzési ár nem kerülhet ide.
  return cleanMoney(
    row?.unitPrice ?? row?.unit_price ??
    row?.sellPriceRon ?? row?.sell_price_ron ??
    row?.sellPrice ?? row?.sell_price ??
    row?.salePrice ?? row?.sale_price,
    null
  );
}

async function variantSellingPriceMap(client, rows) {
  const ids = Array.from(new Set((rows || [])
    .map((row) => cleanText(row?.variantId || row?.variant_id))
    .filter(Boolean)));
  if (!ids.length) return new Map();
  const result = await client.query(
    `SELECT id::text AS id, sell_price
     FROM aif_product_variants
     WHERE id::text = ANY($1::text[])`,
    [ids]
  );
  return new Map(result.rows.map((row) => [cleanText(row.id), cleanMoney(row.sell_price, null)]));
}

async function readOfficialDocument(client, value) {
  const key = cleanText(value);
  if (!key) return null;
  const result = await client.query(
    `SELECT d.*
     FROM aif_stock_transfer_documents d
     WHERE d.id::text=$1 OR d.transfer_id=$1 OR d.document_number=$1
     LIMIT 1`,
    [key]
  );
  if (!result.rowCount) return null;
  const item = result.rows[0];
  const lines = await client.query(
    `SELECT * FROM aif_stock_transfer_document_lines WHERE document_id=$1 ORDER BY line_no ASC`,
    [item.id]
  );
  return {
    ...item,
    official: true,
    legacy: false,
    lines: lines.rows,
  };
}

export async function createAifStockTransferDocument(client, input = {}) {
  const transferId = cleanText(input.transferId || input.transfer_id);
  if (!transferId) throw new Error("transferId required for transfer document");

  const existing = await readOfficialDocument(client, transferId);
  if (existing) return existing;

  const year = await currentBucharestYear(client);
  const settings = await readSettings(client, true);
  let sequenceNumber = Number(settings.next_number || 1);
  let currentYear = Number(settings.current_year || year);
  if (settings.reset_yearly && currentYear !== year) {
    sequenceNumber = 1;
    currentYear = year;
  }

  const documentNumber = formatDocumentNumber(settings, year, sequenceNumber);
  const sourceRows = Array.isArray(input.items) ? input.items : [];
  const priceMap = await variantSellingPriceMap(client, sourceRows);
  const rows = sourceRows.map((sourceRow) => {
    const variantId = cleanText(sourceRow?.variantId || sourceRow?.variant_id);
    const quantity = Math.max(0, cleanInt(sourceRow?.qty, 0) || 0);
    const unitPrice = explicitSellingPrice(sourceRow) ?? priceMap.get(variantId) ?? null;
    const lineTotal = multiplyMoney(quantity, unitPrice);
    return {
      ...sourceRow,
      variantId,
      qty: quantity,
      unitPrice,
      unit_price: unitPrice,
      lineTotal,
      line_total: lineTotal,
      currencyCode: "RON",
      currency_code: "RON",
    };
  });

  const fromLocations = Array.from(new Set(rows.map((row) => cleanText(row.fromLocation || row.from_location_name)).filter(Boolean)));
  const toLocations = Array.from(new Set(rows.map((row) => cleanText(row.toLocation || row.to_location_name)).filter(Boolean)));
  const totalQty = rows.reduce((sum, row) => sum + row.qty, 0);
  const totalValue = Math.round((rows.reduce((sum, row) => sum + (cleanMoney(row.line_total, 0) || 0), 0) + Number.EPSILON) * 100) / 100;
  const actor = nullableText(input.actor) || "system";

  const inserted = await client.query(
    `INSERT INTO aif_stock_transfer_documents (
       transfer_id, idempotency_key, document_number, series, sequence_number, document_year,
       document_title, document_subtitle, transfer_title, note, status, line_count, total_qty,
       total_value, currency_code, from_locations, to_locations, created_by, raw,
       document_type, source_location_id, target_location_id, operation_direction, price_basis,
       created_at, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'completed',$11,$12,$13,'RON',$14::text[],$15::text[],$16,$17::jsonb,
       'internal_transfer',$18,$19,'transfer','selling_price',now(),now()
     ) RETURNING *`,
    [
      transferId,
      nullableText(input.idempotencyKey || input.idempotency_key),
      documentNumber,
      safeSeries(settings.series),
      sequenceNumber,
      year,
      cleanText(settings.document_title) || "PROCES-VERBAL DE PREDARE-PRIMIRE",
      nullableText(settings.document_subtitle) || "TRANSFER INTERN DE STOC",
      nullableText(input.title),
      nullableText(input.note),
      rows.length,
      totalQty,
      totalValue,
      fromLocations,
      toLocations,
      actor,
      JSON.stringify({
        source: "aif_stock_transfer",
        documentType: "internal_transfer",
        transferId,
        idempotencyKey: nullableText(input.idempotencyKey || input.idempotency_key),
        valuation: "selling_price_snapshot",
        currencyCode: "RON",
        totalValue,
      }),
      nullableText(rows[0]?.fromLocationId || rows[0]?.from_location_id),
      nullableText(rows[0]?.toLocationId || rows[0]?.to_location_id),
    ]
  );
  const document = inserted.rows[0];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || {};
    await client.query(
      `INSERT INTO aif_stock_transfer_document_lines (
         document_id, line_no, variant_id, product_title, brand_name, category_name,
         product_code, barcode, color_name, size, image_url,
         from_location_id, from_location_name, to_location_id, to_location_name,
         qty, unit_price, line_total, currency_code, price_basis, qty_delta,
         source_before, source_after, target_before, target_after, raw
       ) VALUES (
         $1,$2,NULLIF($3,'')::uuid,$4,$5,$6,$7,$8,$9,$10,$11,
         NULLIF($12,'')::uuid,$13,NULLIF($14,'')::uuid,$15,
         $16,$17,$18,'RON','selling_price',0,$19,$20,$21,$22,$23::jsonb
       )`,
      [
        document.id,
        index + 1,
        cleanText(row.variantId || row.variant_id),
        nullableText(row.title || row.productTitle),
        nullableText(row.brand || row.brandName),
        nullableText(row.category || row.categoryName),
        nullableText(row.productCode || row.product_code),
        nullableText(row.barcode),
        nullableText(row.color || row.colorName),
        nullableText(row.size),
        nullableText(row.imageUrl || row.image_url),
        cleanText(row.fromLocationId || row.from_location_id),
        nullableText(row.fromLocation || row.from_location_name),
        cleanText(row.toLocationId || row.to_location_id),
        nullableText(row.toLocation || row.to_location_name),
        row.qty,
        cleanMoney(row.unit_price, null),
        cleanMoney(row.line_total, null),
        cleanInt(row.sourceBefore, null),
        cleanInt(row.sourceAfter, null),
        cleanInt(row.targetBefore, null),
        cleanInt(row.targetAfter, null),
        JSON.stringify({
          ...row,
          valuation: "selling_price_snapshot",
          unitPrice: cleanMoney(row.unit_price, null),
          lineTotal: cleanMoney(row.line_total, null),
          currencyCode: "RON",
        }),
      ]
    );
  }

  await client.query(
    `UPDATE aif_stock_transfer_document_settings
     SET next_number=$1, current_year=$2, updated_by=$3, updated_at=now()
     WHERE id=1`,
    [sequenceNumber + 1, currentYear, actor]
  );

  await client.query(
    `UPDATE aif_stock_movements
     SET raw=COALESCE(raw,'{}'::jsonb) || jsonb_build_object(
       'documentId',$2::text,
       'documentNumber',$3::text,
       'documentTitle',$4::text,
       'documentTotalValue',$5::numeric,
       'documentCurrency','RON',
       'documentType','internal_transfer',
       'valuation','selling_price_snapshot'
     )
     WHERE raw->>'transferId'=$1`,
    [transferId, document.id, documentNumber, document.document_title, totalValue]
  );

  return {
    ...document,
    official: true,
    legacy: false,
    lines: rows.map((row, index) => serializeLine({ ...row, line_no: index + 1 })),
  };
}

async function legacyDocument(client, transferId) {
  const key = cleanText(transferId).replace(/^legacy:/, "");
  if (!key) return null;
  const rows = await client.query(
    `SELECT
       sm.id, sm.created_at, sm.actor, sm.qty_delta, sm.qty_before, sm.qty_after, sm.raw,
       v.id AS variant_id, v.internal_sku, v.barcode AS current_barcode, v.color_name, v.size, v.image_url,
       v.sell_price AS current_sell_price,
       m.title_ro, m.model_code, m.product_type,
       b.name AS brand_name,
       c.name_ro AS category_name,
       sc.supplier_product_code
     FROM aif_stock_movements sm
     LEFT JOIN aif_product_variants v ON v.id=sm.variant_id
     LEFT JOIN aif_product_models m ON m.id=v.model_id
     LEFT JOIN aif_brands b ON b.id=m.brand_id
     LEFT JOIN aif_categories c ON c.id=m.category_id
     LEFT JOIN LATERAL (
       SELECT supplier_product_code
       FROM aif_variant_supplier_codes x
       WHERE x.variant_id=v.id AND x.is_active=true
       ORDER BY x.updated_at DESC
       LIMIT 1
     ) sc ON true
     WHERE sm.source_type='stock_transfer'
       AND sm.raw->>'transferId'=$1
       AND (sm.raw->>'side'='source' OR sm.qty_delta < 0)
     ORDER BY
       CASE WHEN COALESCE(sm.raw->>'lineNo','') ~ '^\d+$' THEN (sm.raw->>'lineNo')::integer ELSE 999999 END,
       sm.created_at ASC,
       sm.id ASC`,
    [key]
  );
  if (!rows.rowCount) return null;
  const first = rows.rows[0];
  const lines = rows.rows.map((row, index) => {
    const raw = row.raw && typeof row.raw === "object" ? row.raw : {};
    const quantity = Math.abs(Number(row.qty_delta || raw.qty || 0));
    const unitPrice = explicitSellingPrice(raw) ?? cleanMoney(row.current_sell_price, null);
    return serializeLine({
      id: `legacy-line:${row.id}`,
      line_no: cleanInt(raw.lineNo, index + 1) || index + 1,
      variant_id: row.variant_id,
      product_title: nullableText(raw.productTitle) || row.title_ro || "Produs",
      brand_name: row.brand_name,
      category_name: row.category_name || row.product_type,
      product_code: row.supplier_product_code || row.model_code || row.internal_sku,
      barcode: nullableText(raw.barcode) || row.current_barcode,
      color_name: row.color_name,
      size: row.size,
      image_url: row.image_url,
      from_location_id: nullableText(raw.fromLocationId),
      from_location_name: nullableText(raw.fromLocationName),
      to_location_id: nullableText(raw.toLocationId),
      to_location_name: nullableText(raw.toLocationName),
      qty: quantity,
      unit_price: unitPrice,
      line_total: multiplyMoney(quantity, unitPrice),
      currency_code: "RON",
      price_basis: "selling_price",
      qty_delta: 0,
      source_before: cleanInt(row.qty_before, null),
      source_after: cleanInt(row.qty_after, null),
      target_before: null,
      target_after: null,
      raw,
    });
  });
  const fromLocations = Array.from(new Set(lines.map((row) => row.from_location_name).filter(Boolean)));
  const toLocations = Array.from(new Set(lines.map((row) => row.to_location_name).filter(Boolean)));
  const shortId = key.replace(/^transfer:/, "").replace(/[^a-zA-Z0-9]+/g, "-").toUpperCase().slice(-18) || String(first.id);
  return {
    id: `legacy:${key}`,
    transfer_id: key,
    document_number: `ARHIVĂ/${shortId}`,
    series: "ARHIVĂ",
    sequence_number: null,
    document_year: new Date(first.created_at).getFullYear(),
    document_title: "PROCES-VERBAL DE PREDARE-PRIMIRE",
    document_subtitle: "TRANSFER INTERN DE STOC",
    transfer_title: nullableText(first.raw?.title) || "Transfer intern de stoc",
    note: nullableText(first.raw?.note),
    status: "legacy",
    line_count: lines.length,
    total_qty: lines.reduce((sum, row) => sum + Number(row.qty || 0), 0),
    total_value: Math.round((lines.reduce((sum, row) => sum + (cleanMoney(row.line_total, 0) || 0), 0) + Number.EPSILON) * 100) / 100,
    currency_code: "RON",
    document_type: "internal_transfer",
    operation_direction: "transfer",
    price_basis: "selling_price",
    from_locations: fromLocations,
    to_locations: toLocations,
    created_by: first.actor || null,
    created_at: first.created_at,
    updated_at: first.created_at,
    official: false,
    legacy: true,
    lines,
  };
}

async function listOfficialDocuments(client) {
  const result = await client.query(
    `SELECT d.*
     FROM aif_stock_transfer_documents d
     ORDER BY d.created_at DESC
     LIMIT 5000`
  );
  return result.rows.map((row) => ({ ...row, official: true, legacy: false }));
}

async function listLegacyDocuments(client) {
  const result = await client.query(
    `WITH legacy AS (
       SELECT
         sm.raw->>'transferId' AS transfer_id,
         min(sm.created_at) AS created_at,
         max(sm.actor) AS created_by,
         max(NULLIF(sm.raw->>'title','')) AS transfer_title,
         max(NULLIF(sm.raw->>'note','')) AS note,
         array_remove(array_agg(DISTINCT NULLIF(sm.raw->>'fromLocationName','')),NULL) AS from_locations,
         array_remove(array_agg(DISTINCT NULLIF(sm.raw->>'toLocationName','')),NULL) AS to_locations,
         count(*) FILTER (WHERE sm.raw->>'side'='source' OR sm.qty_delta < 0)::integer AS line_count,
         COALESCE(sum(abs(sm.qty_delta)) FILTER (WHERE sm.raw->>'side'='source' OR sm.qty_delta < 0),0)::integer AS total_qty,
         round(COALESCE(sum(abs(sm.qty_delta)::numeric * COALESCE(v.sell_price,0)::numeric)
           FILTER (WHERE sm.raw->>'side'='source' OR sm.qty_delta < 0),0)::numeric,2) AS total_value
       FROM aif_stock_movements sm
       LEFT JOIN aif_product_variants v ON v.id=sm.variant_id
       WHERE sm.source_type='stock_transfer'
         AND COALESCE(sm.raw->>'transferId','') <> ''
         AND NOT EXISTS (
           SELECT 1 FROM aif_stock_transfer_documents d WHERE d.transfer_id=sm.raw->>'transferId'
         )
       GROUP BY sm.raw->>'transferId'
     )
     SELECT * FROM legacy ORDER BY created_at DESC LIMIT 5000`
  );
  return result.rows.map((row) => {
    const shortId = String(row.transfer_id || "").replace(/^transfer:/, "").replace(/[^a-zA-Z0-9]+/g, "-").toUpperCase().slice(-18);
    return {
      id: `legacy:${row.transfer_id}`,
      ...row,
      document_number: `ARHIVĂ/${shortId || "TRANSFER"}`,
      document_title: "PROCES-VERBAL DE PREDARE-PRIMIRE",
      document_subtitle: "TRANSFER INTERN DE STOC",
      currency_code: "RON",
      document_type: "internal_transfer",
      operation_direction: "transfer",
      price_basis: "selling_price",
      status: "legacy",
      official: false,
      legacy: true,
    };
  });
}

function normalizeSearch(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function documentMatches(item, filters) {
  const q = normalizeSearch(filters.q);
  if (q) {
    const haystack = normalizeSearch([
      item.document_number,
      item.transfer_id,
      item.transfer_title,
      item.note,
      item.created_by,
      ...(Array.isArray(item.from_locations) ? item.from_locations : []),
      ...(Array.isArray(item.to_locations) ? item.to_locations : []),
    ].filter(Boolean).join(" "));
    if (!haystack.includes(q)) return false;
  }
  if (filters.kind === "official" && !item.official) return false;
  if (filters.kind === "legacy" && !item.legacy) return false;
  const requestedDocumentType = cleanAifStockDocumentType(filters.kind, null);
  if (requestedDocumentType && cleanAifStockDocumentType(item.document_type, "internal_transfer") !== requestedDocumentType) return false;
  if (filters.status && filters.status !== "all" && String(item.status) !== filters.status) return false;
  const fromNeedle = normalizeSearch(filters.fromLocation);
  if (fromNeedle && !((item.from_locations || []).some((value) => normalizeSearch(value).includes(fromNeedle)))) return false;
  const toNeedle = normalizeSearch(filters.toLocation);
  if (toNeedle && !((item.to_locations || []).some((value) => normalizeSearch(value).includes(toNeedle)))) return false;
  const created = item.created_at ? new Date(item.created_at).getTime() : 0;
  if (filters.from) {
    const start = new Date(`${filters.from}T00:00:00`).getTime();
    if (created && created < start) return false;
  }
  if (filters.to) {
    const end = new Date(`${filters.to}T23:59:59.999`).getTime();
    if (created && created > end) return false;
  }
  return true;
}

export function registerAifStockTransferDocumentRoutes(router, { pool, requireAuthed, requireAdminOrSecret }) {
  router.get("/stock-transfer-documents/settings", requireAuthed, async (_req, res) => {
    try {
      await ensureAifStockTransferDocumentSchema(pool);
      const settings = await readSettings(pool, false);
      const year = await currentBucharestYear(pool);
      const response = settingsResponse(settings, year);
      res.json({ ok: true, settings: response, item: response });
    } catch (error) {
      console.error("AIF stock transfer document settings load failed", error);
      res.status(500).json({ error: "A transferbizonylat beállításainak betöltése nem sikerült." });
    }
  });

  const saveSettings = async (req, res) => {
    try {
      await ensureAifStockTransferDocumentSchema(pool);
      const current = await readSettings(pool, false);
      const body = req.body?.settings && typeof req.body.settings === "object" ? req.body.settings : (req.body || {});
      const series = safeSeries(body.series ?? current.series);
      const nextNumber = Math.max(1, cleanInt(body.nextNumber ?? body.next_number, current.next_number) || 1);
      const padding = Math.min(12, Math.max(1, cleanInt(body.digits ?? body.padding, current.padding) || 6));
      const includeYear = cleanBool(body.includeYear ?? body.include_year, current.include_year !== false);
      const resetYearly = cleanBool(body.yearlyReset ?? body.resetYearly ?? body.reset_yearly, current.reset_yearly !== false);
      const sequenceYear = Math.max(2000, Math.min(2100, cleanInt(body.sequenceYear ?? body.current_year, current.current_year) || new Date().getFullYear()));
      const documentTitle = cleanText(body.documentTitle ?? body.document_title ?? current.document_title) || "PROCES-VERBAL DE PREDARE-PRIMIRE";
      const documentSubtitle = cleanText(body.documentSubtitle ?? body.document_subtitle ?? current.document_subtitle) || "TRANSFER INTERN DE STOC";
      const actor = actorFromRequest(req);
      const updated = await pool.query(
        `UPDATE aif_stock_transfer_document_settings
         SET series=$1, next_number=$2, padding=$3, include_year=$4, reset_yearly=$5,
             current_year=$6, document_title=$7, document_subtitle=$8, updated_by=$9, updated_at=now()
         WHERE id=1
         RETURNING *`,
        [series, nextNumber, padding, includeYear, resetYearly, sequenceYear, documentTitle, documentSubtitle, actor]
      );
      const year = await currentBucharestYear(pool);
      const response = settingsResponse(updated.rows[0], year);
      res.json({ ok: true, settings: response, item: response });
    } catch (error) {
      console.error("AIF stock transfer document settings save failed", error);
      res.status(500).json({ error: error?.message || "A transferbizonylat beállításainak mentése nem sikerült." });
    }
  };

  router.put("/stock-transfer-documents/settings", requireAdminOrSecret, saveSettings);
  router.patch("/stock-transfer-documents/settings", requireAdminOrSecret, saveSettings);

  router.get("/stock-transfer-documents", requireAuthed, async (req, res) => {
    try {
      await ensureAifStockTransferDocumentSchema(pool);
      const [official, legacy, locationResult] = await Promise.all([
        listOfficialDocuments(pool),
        listLegacyDocuments(pool),
        pool.query(`SELECT id::text AS id, code, name FROM aif_locations WHERE COALESCE(is_active,true)=true ORDER BY name ASC`),
      ]);
      const locations = locationResult.rows || [];
      const resolveLocation = (value) => {
        const key = normalizeSearch(value);
        if (!key) return "";
        const found = locations.find((location) => [location.id, location.code, location.name].map(normalizeSearch).includes(key));
        return found?.name || cleanText(value);
      };
      const type = cleanText(req.query.type || req.query.kind || "all");
      const filters = {
        q: req.query.q || req.query.search,
        from: cleanText(req.query.from),
        to: cleanText(req.query.to),
        fromLocation: resolveLocation(req.query.fromLocation || req.query.from_location),
        toLocation: resolveLocation(req.query.toLocation || req.query.to_location),
        kind: (["official", "legacy"].includes(type) || cleanAifStockDocumentType(type, null)) ? type : "all",
        status: type === "cancelled" ? "cancelled" : cleanText(req.query.status || "all"),
      };
      const allRaw = [...official, ...legacy]
        .filter((item) => documentMatches(item, filters))
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      const all = allRaw.map(serializeDocument);
      const total = all.length;
      const limit = Math.min(500, Math.max(1, cleanInt(req.query.limit, 30) || 30));
      const requestedPage = Math.max(1, cleanInt(req.query.page, 1) || 1);
      const pages = Math.max(1, Math.ceil(total / limit));
      const offsetFromQuery = cleanInt(req.query.offset, null);
      const page = offsetFromQuery === null
        ? Math.min(requestedPage, pages)
        : Math.min(Math.max(1, Math.floor(Math.max(0, offsetFromQuery) / limit) + 1), pages);
      const offset = (page - 1) * limit;
      const slicedItems = all.slice(offset, offset + limit);
      const totals = {
        total,
        official: all.filter((item) => item.source === "official" && item.status !== "cancelled").length,
        legacy: all.filter((item) => item.isLegacy).length,
        cancelled: all.filter((item) => item.status === "cancelled").length,
        totalQty: all.reduce((sum, item) => sum + Number(item.total_qty || 0), 0),
        totalValue: Math.round((all.reduce((sum, item) => sum + (cleanMoney(item.total_value, 0) || 0), 0) + Number.EPSILON) * 100) / 100,
        currencyCode: "RON",
      };
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      res.json({
        ok: true,
        items: slicedItems,
        totals,
        page,
        pages,
        limit,
        total,
        locations,
        summary: {
          official: totals.official,
          legacy: totals.legacy,
          cancelled: totals.cancelled,
          totalQty: totals.totalQty,
          totalValue: totals.totalValue,
          currencyCode: "RON",
          thisMonth: all.filter((item) => new Date(item.created_at || 0).getTime() >= monthStart).length,
        },
        locationOptions: {
          from: Array.from(new Set([...official, ...legacy].flatMap((item) => Array.isArray(item.from_locations) ? item.from_locations : []).filter(Boolean))).sort(),
          to: Array.from(new Set([...official, ...legacy].flatMap((item) => Array.isArray(item.to_locations) ? item.to_locations : []).filter(Boolean))).sort(),
        },
      });
    } catch (error) {
      console.error("AIF stock transfer documents list failed", error);
      res.status(500).json({ error: "A transferbizonylatok betöltése nem sikerült." });
    }
  });

  router.get("/stock-transfer-documents/:id", requireAuthed, async (req, res) => {
    try {
      await ensureAifStockTransferDocumentSchema(pool);
      const key = cleanText(req.params.id);
      const official = await readOfficialDocument(pool, key);
      if (official) {
        const response = detailResponse(official);
        return res.json({ ok: true, ...response, item: { ...response.document, lines: response.lines } });
      }
      const legacy = await legacyDocument(pool, key);
      if (!legacy) return res.status(404).json({ error: "Transferbizonylat nem található." });
      const response = detailResponse(legacy);
      return res.json({ ok: true, ...response, item: { ...response.document, lines: response.lines } });
    } catch (error) {
      console.error("AIF stock transfer document detail failed", error);
      res.status(500).json({ error: "A transferbizonylat részleteinek betöltése nem sikerült." });
    }
  });

  router.delete("/stock-transfer-documents/:id", requireAdminOrSecret, async (req, res) => {
    const key = cleanText(req.params.id);
    if (!key) return res.status(400).json({ error: "Transferbizonylat azonosító szükséges." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureAifStockTransferDocumentSchema(client);
      const officialTarget = await client.query(
        `SELECT id, transfer_id, document_number
         FROM aif_stock_transfer_documents
         WHERE id::text=$1 OR transfer_id=$1 OR document_number=$1
         LIMIT 1
         FOR UPDATE`,
        [key]
      );
      if (officialTarget.rowCount) {
        const target = officialTarget.rows[0];
        await client.query(`DELETE FROM aif_stock_transfer_documents WHERE id=$1`, [target.id]);
        // A készletállapotot nem írjuk vissza. Csak a hozzá tartozó naplósorokat töröljük,
        // különben a hivatalos bizonylat a következő listázásnál „Régi átadásként” feltámadna.
        const movements = await client.query(
          `DELETE FROM aif_stock_movements
           WHERE source_type='stock_transfer' AND raw->>'transferId'=$1
           RETURNING id`,
          [target.transfer_id]
        );
        await client.query("COMMIT");
        return res.json({
          ok: true,
          mode: "official_document_deleted",
          item: target,
          deletedMovements: movements.rowCount,
        });
      }

      const transferId = key.replace(/^legacy:/, "");
      const deletedLegacy = await client.query(
        `DELETE FROM aif_stock_movements
         WHERE source_type='stock_transfer' AND raw->>'transferId'=$1
         RETURNING id`,
        [transferId]
      );
      if (!deletedLegacy.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Transferbizonylat nem található." });
      }
      await client.query("COMMIT");
      return res.json({ ok: true, mode: "legacy_archive_deleted", deletedMovements: deletedLegacy.rowCount });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF stock transfer document permanent delete failed", error);
      res.status(500).json({ error: error?.message || "A transferbizonylat végleges törlése nem sikerült." });
    } finally {
      client.release();
    }
  });
}
