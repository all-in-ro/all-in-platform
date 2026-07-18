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
        source_before integer NULL,
        source_after integer NULL,
        target_before integer NULL,
        target_after integer NULL,
        raw jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (document_id, line_no)
      )
    `);
    await target.query(`CREATE INDEX IF NOT EXISTS aif_stock_transfer_document_lines_document_idx ON aif_stock_transfer_document_lines (document_id, line_no)`);
    await target.query(`CREATE INDEX IF NOT EXISTS aif_stock_transfer_document_lines_variant_idx ON aif_stock_transfer_document_lines (variant_id)`);
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
  const rows = Array.isArray(input.items) ? input.items : [];
  const fromLocations = Array.from(new Set(rows.map((row) => cleanText(row.fromLocation || row.from_location_name)).filter(Boolean)));
  const toLocations = Array.from(new Set(rows.map((row) => cleanText(row.toLocation || row.to_location_name)).filter(Boolean)));
  const totalQty = rows.reduce((sum, row) => sum + Math.max(0, cleanInt(row.qty, 0) || 0), 0);
  const actor = nullableText(input.actor) || "system";

  const inserted = await client.query(
    `INSERT INTO aif_stock_transfer_documents (
       transfer_id, idempotency_key, document_number, series, sequence_number, document_year,
       document_title, document_subtitle, transfer_title, note, status, line_count, total_qty,
       from_locations, to_locations, created_by, raw, created_at, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'completed',$11,$12,$13::text[],$14::text[],$15,$16::jsonb,now(),now()
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
      fromLocations,
      toLocations,
      actor,
      JSON.stringify({
        source: "aif_stock_transfer",
        transferId,
        idempotencyKey: nullableText(input.idempotencyKey || input.idempotency_key),
      }),
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
         qty, source_before, source_after, target_before, target_after, raw
       ) VALUES (
         $1,$2,NULLIF($3,'')::uuid,$4,$5,$6,$7,$8,$9,$10,$11,
         NULLIF($12,'')::uuid,$13,NULLIF($14,'')::uuid,$15,
         $16,$17,$18,$19,$20,$21::jsonb
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
        Math.max(0, cleanInt(row.qty, 0) || 0),
        cleanInt(row.sourceBefore, null),
        cleanInt(row.sourceAfter, null),
        cleanInt(row.targetBefore, null),
        cleanInt(row.targetAfter, null),
        JSON.stringify(row),
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
       'documentTitle',$4::text
     )
     WHERE raw->>'transferId'=$1`,
    [transferId, document.id, documentNumber, document.document_title]
  );

  return {
    ...document,
    official: true,
    legacy: false,
    lines: rows.map((row, index) => ({ ...row, line_no: index + 1 })),
  };
}

async function legacyDocument(client, transferId) {
  const key = cleanText(transferId).replace(/^legacy:/, "");
  if (!key) return null;
  const rows = await client.query(
    `SELECT
       sm.id, sm.created_at, sm.actor, sm.qty_delta, sm.qty_before, sm.qty_after, sm.raw,
       v.id AS variant_id, v.internal_sku, v.barcode AS current_barcode, v.color_name, v.size, v.image_url,
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
       CASE WHEN COALESCE(sm.raw->>'lineNo','') ~ '^\\d+$' THEN (sm.raw->>'lineNo')::integer ELSE 999999 END,
       sm.created_at ASC,
       sm.id ASC`,
    [key]
  );
  if (!rows.rowCount) return null;
  const first = rows.rows[0];
  const lines = rows.rows.map((row, index) => {
    const raw = row.raw && typeof row.raw === "object" ? row.raw : {};
    return {
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
      qty: Math.abs(Number(row.qty_delta || raw.qty || 0)),
      source_before: cleanInt(row.qty_before, null),
      source_after: cleanInt(row.qty_after, null),
      target_before: null,
      target_after: null,
      raw,
    };
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
         COALESCE(sum(abs(sm.qty_delta)) FILTER (WHERE sm.raw->>'side'='source' OR sm.qty_delta < 0),0)::integer AS total_qty
       FROM aif_stock_movements sm
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
      res.json({ ok: true, item: { ...settings, preview: settingsPreview(settings, year) } });
    } catch (error) {
      console.error("AIF stock transfer document settings load failed", error);
      res.status(500).json({ error: "A transferbizonylat beállításainak betöltése nem sikerült." });
    }
  });

  const saveSettings = async (req, res) => {
    try {
      await ensureAifStockTransferDocumentSchema(pool);
      const current = await readSettings(pool, false);
      const body = req.body || {};
      const series = safeSeries(body.series ?? current.series);
      const nextNumber = Math.max(1, cleanInt(body.nextNumber ?? body.next_number, current.next_number) || 1);
      const padding = Math.min(12, Math.max(1, cleanInt(body.padding, current.padding) || 6));
      const includeYear = cleanBool(body.includeYear ?? body.include_year, current.include_year !== false);
      const resetYearly = cleanBool(body.resetYearly ?? body.reset_yearly, current.reset_yearly !== false);
      const documentTitle = cleanText(body.documentTitle ?? body.document_title ?? current.document_title) || "PROCES-VERBAL DE PREDARE-PRIMIRE";
      const documentSubtitle = cleanText(body.documentSubtitle ?? body.document_subtitle ?? current.document_subtitle) || "TRANSFER INTERN DE STOC";
      const actor = actorFromRequest(req);
      const updated = await pool.query(
        `UPDATE aif_stock_transfer_document_settings
         SET series=$1, next_number=$2, padding=$3, include_year=$4, reset_yearly=$5,
             document_title=$6, document_subtitle=$7, updated_by=$8, updated_at=now()
         WHERE id=1
         RETURNING *`,
        [series, nextNumber, padding, includeYear, resetYearly, documentTitle, documentSubtitle, actor]
      );
      const year = await currentBucharestYear(pool);
      res.json({ ok: true, item: { ...updated.rows[0], preview: settingsPreview(updated.rows[0], year) } });
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
      const [official, legacy] = await Promise.all([listOfficialDocuments(pool), listLegacyDocuments(pool)]);
      const filters = {
        q: req.query.q || req.query.search,
        from: cleanText(req.query.from),
        to: cleanText(req.query.to),
        fromLocation: req.query.fromLocation || req.query.from_location,
        toLocation: req.query.toLocation || req.query.to_location,
        kind: ["official", "legacy"].includes(cleanText(req.query.kind)) ? cleanText(req.query.kind) : "all",
        status: cleanText(req.query.status || "all"),
      };
      const all = [...official, ...legacy]
        .filter((item) => documentMatches(item, filters))
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      const total = all.length;
      const limit = Math.min(500, Math.max(1, cleanInt(req.query.limit, 100) || 100));
      const offset = Math.max(0, cleanInt(req.query.offset, 0) || 0);
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      res.json({
        ok: true,
        items: all.slice(offset, offset + limit),
        total,
        locations: {
          from: Array.from(new Set([...official, ...legacy].flatMap((item) => Array.isArray(item.from_locations) ? item.from_locations : []).filter(Boolean))).sort(),
          to: Array.from(new Set([...official, ...legacy].flatMap((item) => Array.isArray(item.to_locations) ? item.to_locations : []).filter(Boolean))).sort(),
        },
        summary: {
          official: official.length,
          legacy: legacy.length,
          totalQty: all.reduce((sum, item) => sum + Number(item.total_qty || 0), 0),
          thisMonth: all.filter((item) => new Date(item.created_at || 0).getTime() >= monthStart).length,
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
      if (official) return res.json({ ok: true, item: official });
      const legacy = await legacyDocument(pool, key);
      if (!legacy) return res.status(404).json({ error: "Transferbizonylat nem található." });
      return res.json({ ok: true, item: legacy });
    } catch (error) {
      console.error("AIF stock transfer document detail failed", error);
      res.status(500).json({ error: "A transferbizonylat részleteinek betöltése nem sikerült." });
    }
  });
}
