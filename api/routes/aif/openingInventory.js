import express from "express";

/**
 * ALL IN - store inventory / physical stock count
 *
 * This flow is reusable for both stores. It supports:
 * - a normal recurring inventory where the current system stock is the expected baseline;
 * - a recovery inventory for the first large cleanup when historical store stock is incomplete.
 *
 * Rules:
 * - shop staff count blindly; expected/system quantities are never returned by shop endpoints;
 * - the manager sees the live comparison and discrepancies;
 * - sales and stock movements may continue while counting, even for several days;
 * - movements after a product's last count are replayed onto that physical count;
 * - applying the inventory updates stock only after manager review and logs every correction.
 *
 * The existing aif_opening_inventory_* table names are intentionally kept for
 * backward compatibility with already-created production tables.
 */
export default function createAifOpeningInventoryRouter({
  pool,
  requireAuthed,
  requireAdminOrSecret,
  aifResolveShopLocation,
  actorFrom,
  text,
  normCode,
  aifNumber,
  insertStockMovementSafe,
}) {
  const router = express.Router();
  let schemaPromise = null;

  const ACTIVE_STATUSES = new Set(["draft", "counting", "review"]);
  const EDITABLE_STATUSES = new Set(["draft", "counting"]);
  const TRUSTED_ALWAYS_SOURCE_TYPES = ["import_batch", "manual_product_add", "stock_transfer"];
  const TRUSTED_SALES_SOURCE_TYPES = [
    "shop_sale",
    "shop_exchange_return",
    "shop_exchange_out",
    "shop_exchange_cancel",
    "shop_return",
    "shop_sale_return",
    "shop_refund",
  ];

  function numberOrNull(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const parsed = Number(String(value).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function intOrNull(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function cleanIsoDate(value) {
    const raw = text(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    return raw;
  }

  function sessionCode() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `INV-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  function openingStatus(value) {
    const status = normCode(value);
    return ["draft", "counting", "review", "applied", "cancelled"].includes(status) ? status : null;
  }

  function trustedMovementWhere({ alias = "sm", salesTrustedFromParam = "$2", baselineParam = "$3" } = {}) {
    const always = TRUSTED_ALWAYS_SOURCE_TYPES.map((item) => `'${item.replace(/'/g, "''")}'`).join(",");
    const sales = TRUSTED_SALES_SOURCE_TYPES.map((item) => `'${item.replace(/'/g, "''")}'`).join(",");
    return `
      ${alias}.created_at <= ${baselineParam}::timestamptz
      AND (
        ${alias}.source_type IN (${always})
        OR (${alias}.source_type IN (${sales}) AND ${alias}.created_at >= ${salesTrustedFromParam}::date)
      )
      AND NOT (
        ${alias}.source_type='stock_transfer'
        AND EXISTS (
          SELECT 1
          FROM aif_stock_transfer_document_deletions del
          WHERE del.transfer_id = COALESCE(${alias}.raw->>'transferId', ${alias}.raw->>'operationId', '')
        )
      )
    `;
  }

  function isAdminLike(req) {
    const role = normCode(req.session?.role);
    return ["admin", "administrator", "secret", "secretariat"].includes(role);
  }

  async function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_opening_inventory_sessions (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          code text NOT NULL UNIQUE,
          location_id uuid NOT NULL REFERENCES aif_locations(id) ON DELETE RESTRICT,
          title text NOT NULL,
          status text NOT NULL DEFAULT 'draft',
          inventory_mode text NOT NULL DEFAULT 'recovery',
          sales_trusted_from date NOT NULL,
          legacy_retail_value numeric(16,2) NULL,
          baseline_at timestamptz NOT NULL DEFAULT now(),
          started_at timestamptz NOT NULL DEFAULT now(),
          counting_closed_at timestamptz NULL,
          applied_at timestamptz NULL,
          cancelled_at timestamptz NULL,
          started_by text NULL,
          closed_by text NULL,
          applied_by text NULL,
          cancelled_by text NULL,
          note text NULL,
          raw jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CHECK (status IN ('draft','counting','review','applied','cancelled')),
          CHECK (legacy_retail_value IS NULL OR legacy_retail_value >= 0)
        )`);
        await pool.query(`ALTER TABLE IF EXISTS aif_opening_inventory_sessions
          ADD COLUMN IF NOT EXISTS inventory_mode text NOT NULL DEFAULT 'recovery'`);
        await pool.query(`UPDATE aif_opening_inventory_sessions
          SET inventory_mode='standard'
          WHERE lower(COALESCE(raw->>'mode','')) IN ('standard','standard_inventory','regular_inventory')
            AND inventory_mode IS DISTINCT FROM 'standard'`);
        await pool.query(`UPDATE aif_opening_inventory_sessions
          SET inventory_mode='recovery'
          WHERE inventory_mode IS NULL OR inventory_mode NOT IN ('recovery','standard')`);
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS aif_opening_inventory_one_active_location_uq
          ON aif_opening_inventory_sessions (location_id)
          WHERE status IN ('draft','counting','review')`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_opening_inventory_sessions_location_created_idx
          ON aif_opening_inventory_sessions (location_id, created_at DESC)`);

        await pool.query(`CREATE TABLE IF NOT EXISTS aif_opening_inventory_lines (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id uuid NOT NULL REFERENCES aif_opening_inventory_sessions(id) ON DELETE CASCADE,
          variant_id uuid NOT NULL REFERENCES aif_product_variants(id) ON DELETE RESTRICT,
          system_qty_start numeric NOT NULL DEFAULT 0,
          system_reserved_start numeric NOT NULL DEFAULT 0,
          trusted_net_qty numeric NOT NULL DEFAULT 0,
          trusted_in_qty numeric NOT NULL DEFAULT 0,
          trusted_out_qty numeric NOT NULL DEFAULT 0,
          known_min_qty numeric NOT NULL DEFAULT 0,
          counted_qty numeric NULL,
          buy_price numeric NULL,
          sell_price numeric NULL,
          first_scanned_at timestamptz NULL,
          last_scanned_at timestamptz NULL,
          last_scanned_by text NULL,
          auto_zeroed boolean NOT NULL DEFAULT false,
          note text NULL,
          raw jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (session_id, variant_id),
          CHECK (known_min_qty >= 0),
          CHECK (counted_qty IS NULL OR counted_qty >= 0)
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_opening_inventory_lines_session_scan_idx
          ON aif_opening_inventory_lines (session_id, last_scanned_at DESC NULLS LAST)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_opening_inventory_lines_variant_idx
          ON aif_opening_inventory_lines (variant_id)`);

        await pool.query(`CREATE TABLE IF NOT EXISTS aif_opening_inventory_scans (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id uuid NOT NULL REFERENCES aif_opening_inventory_sessions(id) ON DELETE CASCADE,
          line_id uuid NULL REFERENCES aif_opening_inventory_lines(id) ON DELETE SET NULL,
          variant_id uuid NULL REFERENCES aif_product_variants(id) ON DELETE SET NULL,
          scan_code text NULL,
          event_type text NOT NULL DEFAULT 'scan',
          qty_delta numeric NOT NULL DEFAULT 0,
          counted_before numeric NULL,
          counted_after numeric NULL,
          actor text NULL,
          raw jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          CHECK (event_type IN ('scan','manual_set','unknown_reconcile','admin_correction'))
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_opening_inventory_scans_session_created_idx
          ON aif_opening_inventory_scans (session_id, created_at DESC)`);

        await pool.query(`CREATE TABLE IF NOT EXISTS aif_opening_inventory_unknown_scans (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id uuid NOT NULL REFERENCES aif_opening_inventory_sessions(id) ON DELETE CASCADE,
          scan_code text NOT NULL,
          qty numeric NOT NULL DEFAULT 0,
          first_scanned_at timestamptz NOT NULL DEFAULT now(),
          last_scanned_at timestamptz NOT NULL DEFAULT now(),
          last_scanned_by text NULL,
          resolved_variant_id uuid NULL REFERENCES aif_product_variants(id) ON DELETE SET NULL,
          resolved_at timestamptz NULL,
          resolved_by text NULL,
          raw jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (session_id, scan_code),
          CHECK (qty >= 0)
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_opening_inventory_unknown_session_idx
          ON aif_opening_inventory_unknown_scans (session_id, resolved_at, last_scanned_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_opening_inventory_movements_lookup_idx
          ON aif_stock_movements (location_id, variant_id, created_at)`);
        return true;
      })().catch((error) => {
        schemaPromise = null;
        throw error;
      });
    }
    return schemaPromise;
  }

  async function resolveLocation(req, client, requested = null) {
    return aifResolveShopLocation(req, client, requested);
  }

  async function activeSession(client, locationId, { lock = false } = {}) {
    const result = await client.query(
      `SELECT s.*, l.code AS location_code, l.name AS location_name, l.location_type
       FROM aif_opening_inventory_sessions s
       JOIN aif_locations l ON l.id=s.location_id
       WHERE s.location_id=$1
         AND s.status IN ('draft','counting','review')
       ORDER BY s.created_at DESC
       LIMIT 1
       ${lock ? "FOR UPDATE OF s" : ""}`,
      [locationId],
    );
    return result.rows[0] || null;
  }

  async function sessionById(client, id, { lock = false } = {}) {
    const result = await client.query(
      `SELECT s.*, l.code AS location_code, l.name AS location_name, l.location_type
       FROM aif_opening_inventory_sessions s
       JOIN aif_locations l ON l.id=s.location_id
       WHERE s.id::text=$1
       LIMIT 1
       ${lock ? "FOR UPDATE OF s" : ""}`,
      [text(id)],
    );
    return result.rows[0] || null;
  }

  async function findVariantByCode(client, rawCode) {
    const code = text(rawCode).replace(/[\r\n\t]+/g, "").trim();
    if (!code) return { code, matches: [] };
    const result = await client.query(
      `SELECT DISTINCT ON (v.id)
         v.id AS variant_id,
         v.internal_sku,
         v.barcode,
         v.sn_cod,
         v.size,
         v.color_code,
         v.color_name,
         v.color_hex,
         v.image_url,
         v.buy_price,
         v.sell_price,
         m.model_code,
         m.title_ro,
         m.shopify_title,
         b.name AS brand_name,
         b.code AS brand_code,
         cat.name_ro AS category_name,
         sc.supplier_product_code,
         sc.supplier_barcode,
         sc.supplier_sku
       FROM aif_product_variants v
       JOIN aif_product_models m ON m.id=v.model_id
       LEFT JOIN aif_brands b ON b.id=m.brand_id
       LEFT JOIN aif_categories cat ON cat.id=m.category_id
       LEFT JOIN aif_variant_supplier_codes sc
         ON sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
       WHERE COALESCE(v.status,'active') <> 'archived'
         AND (
           lower(btrim(COALESCE(v.barcode,'')))=lower(btrim($1))
           OR lower(btrim(COALESCE(v.internal_sku,'')))=lower(btrim($1))
           OR lower(btrim(COALESCE(v.sn_cod,'')))=lower(btrim($1))
           OR lower(btrim(COALESCE(m.model_code,'')))=lower(btrim($1))
           OR lower(btrim(COALESCE(sc.supplier_barcode,'')))=lower(btrim($1))
           OR lower(btrim(COALESCE(sc.supplier_sku,'')))=lower(btrim($1))
           OR lower(btrim(COALESCE(sc.supplier_product_code,'')))=lower(btrim($1))
         )
       ORDER BY v.id, sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST`,
      [code],
    );
    const byVariant = new Map();
    for (const row of result.rows) {
      if (!byVariant.has(String(row.variant_id))) byVariant.set(String(row.variant_id), row);
    }
    return { code, matches: Array.from(byVariant.values()) };
  }

  function productPayload(row) {
    return {
      variantId: String(row.variant_id || ""),
      title: row.title_ro || row.shopify_title || "Névtelen termék",
      internalSku: row.internal_sku || null,
      modelCode: row.model_code || null,
      productCode: row.supplier_product_code || row.model_code || row.internal_sku || null,
      barcode: row.barcode || row.supplier_barcode || null,
      snCod: row.sn_cod || null,
      brandName: row.brand_name || null,
      categoryName: row.category_name || null,
      colorCode: row.color_code || null,
      colorName: row.color_name || null,
      colorHex: row.color_hex || null,
      size: row.size || null,
      imageUrl: row.image_url || null,
    };
  }

  async function preloadSessionLines(client, session) {
    const mode = String(session?.inventory_mode || "recovery").toLowerCase();

    if (mode === "standard") {
      const result = await client.query(
        `SELECT
           v.id AS variant_id,
           COALESCE(cs.qty,0)::numeric AS system_qty_start,
           COALESCE(cs.reserved_qty,0)::numeric AS system_reserved_start,
           0::numeric AS trusted_net_qty,
           0::numeric AS trusted_in_qty,
           0::numeric AS trusted_out_qty,
           GREATEST(COALESCE(cs.qty,0),0)::numeric AS known_min_qty,
           v.buy_price,
           v.sell_price
         FROM aif_product_variants v
         JOIN aif_stock cs ON cs.variant_id=v.id AND cs.location_id=$1
         WHERE COALESCE(v.status,'active') <> 'archived'
           AND (COALESCE(cs.qty,0) <> 0 OR COALESCE(cs.reserved_qty,0) <> 0)`,
        [session.location_id],
      );

      for (const row of result.rows) {
        await client.query(
          `INSERT INTO aif_opening_inventory_lines (
             session_id, variant_id, system_qty_start, system_reserved_start,
             trusted_net_qty, trusted_in_qty, trusted_out_qty, known_min_qty,
             buy_price, sell_price, raw
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
           ON CONFLICT (session_id, variant_id) DO NOTHING`,
          [
            session.id,
            row.variant_id,
            row.system_qty_start,
            row.system_reserved_start,
            row.trusted_net_qty,
            row.trusted_in_qty,
            row.trusted_out_qty,
            row.known_min_qty,
            row.buy_price,
            row.sell_price,
            JSON.stringify({
              baseline: true,
              baselineAt: session.baseline_at,
              inventoryMode: "standard",
              expectedSource: "system_stock_at_start",
            }),
          ],
        );
      }
      return result.rowCount || 0;
    }

    const result = await client.query(
      `WITH trusted AS (
         SELECT
           sm.variant_id,
           COALESCE(sum(sm.qty_delta),0)::numeric AS trusted_net_qty,
           COALESCE(sum(GREATEST(sm.qty_delta,0)),0)::numeric AS trusted_in_qty,
           COALESCE(sum(GREATEST(-sm.qty_delta,0)),0)::numeric AS trusted_out_qty
         FROM aif_stock_movements sm
         WHERE sm.location_id=$1
           AND ${trustedMovementWhere({ alias: "sm", salesTrustedFromParam: "$2", baselineParam: "$3" })}
         GROUP BY sm.variant_id
       ), current_stock AS (
         SELECT variant_id, COALESCE(qty,0)::numeric AS qty, COALESCE(reserved_qty,0)::numeric AS reserved_qty
         FROM aif_stock
         WHERE location_id=$1
       )
       SELECT
         v.id AS variant_id,
         COALESCE(cs.qty,0)::numeric AS system_qty_start,
         COALESCE(cs.reserved_qty,0)::numeric AS system_reserved_start,
         COALESCE(t.trusted_net_qty,0)::numeric AS trusted_net_qty,
         COALESCE(t.trusted_in_qty,0)::numeric AS trusted_in_qty,
         COALESCE(t.trusted_out_qty,0)::numeric AS trusted_out_qty,
         GREATEST(COALESCE(t.trusted_net_qty,0),0)::numeric AS known_min_qty,
         v.buy_price,
         v.sell_price
       FROM aif_product_variants v
       LEFT JOIN current_stock cs ON cs.variant_id=v.id
       LEFT JOIN trusted t ON t.variant_id=v.id
       WHERE COALESCE(v.status,'active') <> 'archived'
         AND (
           COALESCE(cs.qty,0) <> 0
           OR COALESCE(cs.reserved_qty,0) <> 0
           OR COALESCE(t.trusted_net_qty,0) <> 0
         )`,
      [session.location_id, session.sales_trusted_from, session.baseline_at],
    );

    for (const row of result.rows) {
      await client.query(
        `INSERT INTO aif_opening_inventory_lines (
           session_id, variant_id, system_qty_start, system_reserved_start,
           trusted_net_qty, trusted_in_qty, trusted_out_qty, known_min_qty,
           buy_price, sell_price, raw
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
         ON CONFLICT (session_id, variant_id) DO NOTHING`,
        [
          session.id,
          row.variant_id,
          row.system_qty_start,
          row.system_reserved_start,
          row.trusted_net_qty,
          row.trusted_in_qty,
          row.trusted_out_qty,
          row.known_min_qty,
          row.buy_price,
          row.sell_price,
          JSON.stringify({
            baseline: true,
            baselineAt: session.baseline_at,
            inventoryMode: "recovery",
            salesTrustedFrom: session.sales_trusted_from,
          }),
        ],
      );
    }
    return result.rowCount || 0;
  }

  async function syncSessionLinesFromLiveStock(client, session) {
    if (!session || !ACTIVE_STATUSES.has(session.status)) return 0;
    const inserted = await client.query(
      `INSERT INTO aif_opening_inventory_lines (
         session_id, variant_id, system_qty_start, system_reserved_start,
         trusted_net_qty, trusted_in_qty, trusted_out_qty, known_min_qty,
         buy_price, sell_price, raw
       )
       SELECT
         $1, v.id, 0, 0, 0, 0, 0, 0,
         v.buy_price, v.sell_price,
         jsonb_build_object(
           'baseline', false,
           'discoveredDuringSession', true,
           'baselineAt', $3::text,
           'inventoryMode', COALESCE($4::text,'recovery')
         )
       FROM aif_product_variants v
       WHERE COALESCE(v.status,'active') <> 'archived'
         AND NOT EXISTS (
           SELECT 1
           FROM aif_opening_inventory_lines l
           WHERE l.session_id=$1 AND l.variant_id=v.id
         )
         AND (
           EXISTS (
             SELECT 1
             FROM aif_stock st
             WHERE st.location_id=$2
               AND st.variant_id=v.id
               AND (COALESCE(st.qty,0)<>0 OR COALESCE(st.reserved_qty,0)<>0)
           )
           OR EXISTS (
             SELECT 1
             FROM aif_stock_movements sm
             WHERE sm.location_id=$2
               AND sm.variant_id=v.id
               AND sm.created_at > $3::timestamptz
               AND COALESCE(sm.qty_delta,0)<>0
               AND COALESCE(sm.source_type,'') <> 'opening_inventory'
               AND COALESCE(sm.raw->>'reason','') NOT IN ('opening_inventory_apply','opening_inventory_live_sale_sync','opening_inventory_sale_bridge')
               AND NOT (
                 sm.source_type='stock_transfer'
                 AND EXISTS (
                   SELECT 1
                   FROM aif_stock_transfer_document_deletions del
                   WHERE del.transfer_id = COALESCE(sm.raw->>'transferId', sm.raw->>'operationId', '')
                 )
               )
           )
         )
       ON CONFLICT (session_id, variant_id) DO NOTHING`,
      [session.id, session.location_id, session.baseline_at, session.inventory_mode || "recovery"],
    );
    return inserted.rowCount || 0;
  }

  function adminLineStatus(row) {
    if (row.counted_qty === null || row.counted_qty === undefined) {
      return Number(row.known_min_qty || 0) > 0 ? "awaiting_known" : "uncounted";
    }
    const counted = Number(row.counted_qty || 0);
    const minimum = Number(row.known_min_qty || 0);
    if (counted < minimum) return "missing";
    if (counted > minimum) return "untracked";
    return "ok";
  }

  async function loadAdminLines(client, session, { lock = false } = {}) {
    const result = await client.query(
      `SELECT
         l.id, l.session_id, l.variant_id,
         l.system_qty_start, l.system_reserved_start,
         l.trusted_net_qty, l.trusted_in_qty, l.trusted_out_qty, l.known_min_qty,
         l.counted_qty,
         l.buy_price, l.sell_price, l.first_scanned_at, l.last_scanned_at, l.last_scanned_by,
         l.auto_zeroed, l.note, l.raw, l.created_at, l.updated_at,
         COALESCE(st.qty,0)::numeric AS current_system_qty,
         COALESCE(st.reserved_qty,0)::numeric AS current_reserved_qty,
         v.internal_sku, v.barcode, v.sn_cod, v.size, v.color_code, v.color_name, v.color_hex, v.image_url,
         m.model_code, m.title_ro, m.shopify_title,
         b.name AS brand_name, b.code AS brand_code,
         cat.name_ro AS category_name,
         sc.supplier_product_code, sc.supplier_barcode, sc.supplier_sku
       FROM aif_opening_inventory_lines l
       JOIN aif_product_variants v ON v.id=l.variant_id
       JOIN aif_product_models m ON m.id=v.model_id
       LEFT JOIN aif_stock st ON st.location_id=$2 AND st.variant_id=l.variant_id
       LEFT JOIN aif_brands b ON b.id=m.brand_id
       LEFT JOIN aif_categories cat ON cat.id=m.category_id
       LEFT JOIN LATERAL (
         SELECT supplier_product_code, supplier_barcode, supplier_sku
         FROM aif_variant_supplier_codes sc
         WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
         ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST
         LIMIT 1
       ) sc ON true
       WHERE l.session_id=$1
       ORDER BY
         l.last_scanned_at DESC NULLS LAST,
         b.name ASC NULLS LAST,
         m.title_ro ASC,
         v.color_name ASC NULLS LAST,
         v.size ASC
       ${lock ? "FOR UPDATE OF l" : ""}`,
      [session.id, session.location_id],
    );

    const cutoff = session.applied_at || session.cancelled_at || null;
    const movements = await client.query(
      `SELECT sm.variant_id, sm.qty_delta, sm.created_at
       FROM aif_stock_movements sm
       WHERE sm.location_id=$1
         AND sm.created_at > $2::timestamptz
         AND ($3::timestamptz IS NULL OR sm.created_at <= $3::timestamptz)
         AND COALESCE(sm.qty_delta,0)<>0
         AND COALESCE(sm.source_type,'') <> 'opening_inventory'
         AND COALESCE(sm.raw->>'reason','') NOT IN ('opening_inventory_apply','opening_inventory_live_sale_sync','opening_inventory_sale_bridge')
               AND NOT (
                 sm.source_type='stock_transfer'
                 AND EXISTS (
                   SELECT 1
                   FROM aif_stock_transfer_document_deletions del
                   WHERE del.transfer_id = COALESCE(sm.raw->>'transferId', sm.raw->>'operationId', '')
                 )
               )
       ORDER BY sm.created_at ASC`,
      [session.location_id, session.baseline_at, cutoff],
    );

    const movementByVariant = new Map();
    for (const movement of movements.rows) {
      const key = String(movement.variant_id || "");
      if (!key) continue;
      const list = movementByVariant.get(key) || [];
      list.push({
        qty: Number(movement.qty_delta || 0),
        at: movement.created_at ? new Date(movement.created_at).getTime() : 0,
      });
      movementByVariant.set(key, list);
    }

    return result.rows.map((row) => {
      const variantMovements = movementByVariant.get(String(row.variant_id)) || [];
      let liveNet = 0;
      let liveIn = 0;
      let liveOut = 0;
      for (const movement of variantMovements) {
        liveNet += movement.qty;
        if (movement.qty > 0) liveIn += movement.qty;
        if (movement.qty < 0) liveOut += Math.abs(movement.qty);
      }

      const physicalCounted = row.counted_qty === null || row.counted_qty === undefined
        ? null
        : Number(row.counted_qty || 0);
      const observationRaw = row.last_scanned_at
        || (row.auto_zeroed ? session.counting_closed_at : null)
        || (physicalCounted !== null ? session.counting_closed_at : null)
        || session.baseline_at;
      const observationAt = observationRaw ? new Date(observationRaw).getTime() : 0;
      let movementAfterCountQty = 0;
      let movementAfterCountCount = 0;
      if (physicalCounted !== null) {
        for (const movement of variantMovements) {
          if (movement.at > observationAt) {
            movementAfterCountQty += movement.qty;
            movementAfterCountCount += 1;
          }
        }
      }

      const baselineKnownMin = Number(row.known_min_qty || 0);
      const baselineTrustedNet = Number(row.trusted_net_qty || 0);
      const currentKnownMin = Math.max(0, baselineKnownMin + liveNet);
      const effectiveCounted = physicalCounted === null
        ? null
        : Math.max(0, physicalCounted + movementAfterCountQty);
      const currentSystemQty = Number(row.current_system_qty || 0);
      const systemCorrection = effectiveCounted === null ? null : effectiveCounted - currentSystemQty;
      const currentTrustedNet = baselineTrustedNet + liveNet;
      const currentTrustedIn = Number(row.trusted_in_qty || 0) + liveIn;
      const currentTrustedOut = Number(row.trusted_out_qty || 0) + liveOut;

      const decorated = {
        ...row,
        baseline_trusted_net_qty: baselineTrustedNet,
        baseline_known_min_qty: baselineKnownMin,
        physical_counted_qty: physicalCounted,
        live_net_qty: liveNet,
        live_in_qty: liveIn,
        live_out_qty: liveOut,
        movement_after_count_qty: movementAfterCountQty,
        movement_after_count_count: movementAfterCountCount,
        trusted_net_qty: currentTrustedNet,
        trusted_in_qty: currentTrustedIn,
        trusted_out_qty: currentTrustedOut,
        known_min_qty: currentKnownMin,
        counted_qty: effectiveCounted,
        definite_missing_qty: effectiveCounted === null ? null : Math.max(0, currentKnownMin - effectiveCounted),
        untracked_qty: effectiveCounted === null ? null : Math.max(0, effectiveCounted - currentKnownMin),
        system_correction_qty: systemCorrection,
        current_system_qty: currentSystemQty,
        current_reserved_qty: Number(row.current_reserved_qty || 0),
        observation_at: physicalCounted === null ? null : observationRaw,
        product: productPayload(row),
      };
      return {
        ...decorated,
        status: adminLineStatus(decorated),
      };
    }).sort((a, b) => {
      const rank = (line) => {
        if (line.status === "awaiting_known") return 0;
        if (line.status === "missing") return 1;
        if (line.status === "untracked") return 2;
        if (line.status === "uncounted") return 3;
        return 4;
      };
      const byRank = rank(a) - rank(b);
      if (byRank) return byRank;
      const aTime = a.last_scanned_at ? new Date(a.last_scanned_at).getTime() : 0;
      const bTime = b.last_scanned_at ? new Date(b.last_scanned_at).getTime() : 0;
      return bTime - aTime;
    });
  }

  function summarizeAdminLines(lines, unknown) {
    const summary = {
      line_count: lines.length,
      counted_lines: 0,
      counted_qty: 0,
      system_qty_start: 0,
      trusted_net_qty: 0,
      trusted_in_qty: 0,
      trusted_out_qty: 0,
      known_min_qty: 0,
      definite_missing_qty: 0,
      unseen_known_min_qty: 0,
      untracked_qty: 0,
      system_correction_qty: 0,
      counted_retail_value: 0,
      comparison_retail_value: 0,
      trusted_net_retail_value: 0,
      definite_missing_retail_value: 0,
      untracked_retail_value: 0,
      system_correction_retail_value: 0,
      live_net_qty: 0,
      live_in_qty: 0,
      live_out_qty: 0,
      live_movement_lines: 0,
      unknown_rows: 0,
      unknown_qty: 0,
    };

    for (const line of lines) {
      const sell = Number(line.sell_price || 0);
      const counted = line.counted_qty === null || line.counted_qty === undefined ? null : Number(line.counted_qty || 0);
      summary.system_qty_start += Number(line.system_qty_start || 0);
      summary.trusted_net_qty += Number(line.trusted_net_qty || 0);
      summary.trusted_in_qty += Number(line.trusted_in_qty || 0);
      summary.trusted_out_qty += Number(line.trusted_out_qty || 0);
      summary.known_min_qty += Number(line.known_min_qty || 0);
      summary.live_net_qty += Number(line.live_net_qty || 0);
      summary.live_in_qty += Number(line.live_in_qty || 0);
      summary.live_out_qty += Number(line.live_out_qty || 0);
      if (Math.abs(Number(line.live_net_qty || 0)) > 0.0001) summary.live_movement_lines += 1;
      summary.trusted_net_retail_value += Number(line.trusted_net_qty || 0) * sell;
      summary.comparison_retail_value += Number(line.known_min_qty || 0) * sell;
      if (counted === null) {
        summary.unseen_known_min_qty += Number(line.known_min_qty || 0);
        continue;
      }
      summary.counted_lines += 1;
      summary.counted_qty += counted;
      summary.definite_missing_qty += Number(line.definite_missing_qty || 0);
      summary.untracked_qty += Number(line.untracked_qty || 0);
      summary.system_correction_qty += Number(line.system_correction_qty || 0);
      summary.counted_retail_value += counted * sell;
      summary.definite_missing_retail_value += Number(line.definite_missing_qty || 0) * sell;
      summary.untracked_retail_value += Number(line.untracked_qty || 0) * sell;
      summary.system_correction_retail_value += Number(line.system_correction_qty || 0) * sell;
    }

    const unresolved = (unknown || []).filter((item) => !item.resolved_at && Number(item.qty || 0) > 0);
    summary.unknown_rows = unresolved.length;
    summary.unknown_qty = unresolved.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    for (const key of [
      "counted_retail_value",
      "comparison_retail_value",
      "trusted_net_retail_value",
      "definite_missing_retail_value",
      "untracked_retail_value",
      "system_correction_retail_value",
    ]) {
      summary[key] = Math.round((Number(summary[key] || 0) + Number.EPSILON) * 100) / 100;
    }
    return summary;
  }

  async function loadUnknown(client, sessionId) {
    const result = await client.query(
      `SELECT id, scan_code, qty, first_scanned_at, last_scanned_at, last_scanned_by,
              resolved_variant_id, resolved_at, resolved_by, raw
       FROM aif_opening_inventory_unknown_scans
       WHERE session_id=$1
       ORDER BY (resolved_at IS NULL) DESC, last_scanned_at DESC`,
      [sessionId],
    );
    return result.rows;
  }

  async function adminDetail(client, session) {
    if (session && ACTIVE_STATUSES.has(session.status)) {
      await syncSessionLinesFromLiveStock(client, session);
    }
    const [lines, unknown] = await Promise.all([
      loadAdminLines(client, session),
      loadUnknown(client, session.id),
    ]);
    const summary = summarizeAdminLines(lines, unknown);
    const mode = String(session?.inventory_mode || "recovery").toLowerCase();
    const legacy = numberOrNull(session.legacy_retail_value);
    const trustedRetail = Number(summary.trusted_net_retail_value || 0);
    const countedRetail = Number(summary.counted_retail_value || 0);
    const bookExpected = mode === "standard"
      ? Number(summary.comparison_retail_value || 0)
      : legacy === null
        ? null
        : legacy + trustedRetail;
    return {
      session,
      summary: {
        ...summary,
        inventory_mode: mode,
        legacy_retail_value: legacy,
        book_expected_retail_value: bookExpected,
        book_diff_retail_value: bookExpected === null ? null : countedRetail - bookExpected,
      },
      lines,
      unknown,
    };
  }

  function shopSessionPayload(session) {
    if (!session) return null;
    return {
      id: String(session.id),
      code: session.code,
      title: session.title,
      status: session.status,
      inventoryMode: session.inventory_mode || "recovery",
      inventory_mode: session.inventory_mode || "recovery",
      location: {
        id: String(session.location_id),
        code: session.location_code,
        name: session.location_name,
      },
      startedAt: session.started_at ? new Date(session.started_at).toISOString() : null,
      updatedAt: session.updated_at ? new Date(session.updated_at).toISOString() : null,
      editable: EDITABLE_STATUSES.has(session.status),
    };
  }

  async function loadShopRecent(client, sessionId, limit = 40) {
    const result = await client.query(
      `SELECT
         l.id, l.variant_id, l.counted_qty, l.first_scanned_at, l.last_scanned_at, l.last_scanned_by,
         v.internal_sku, v.barcode, v.sn_cod, v.size, v.color_code, v.color_name, v.color_hex, v.image_url,
         m.model_code, m.title_ro, m.shopify_title,
         b.name AS brand_name,
         sc.supplier_product_code, sc.supplier_barcode
       FROM aif_opening_inventory_lines l
       JOIN aif_product_variants v ON v.id=l.variant_id
       JOIN aif_product_models m ON m.id=v.model_id
       LEFT JOIN aif_brands b ON b.id=m.brand_id
       LEFT JOIN LATERAL (
         SELECT supplier_product_code, supplier_barcode
         FROM aif_variant_supplier_codes sc
         WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
         ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST
         LIMIT 1
       ) sc ON true
       WHERE l.session_id=$1 AND l.counted_qty IS NOT NULL
       ORDER BY l.last_scanned_at DESC NULLS LAST, l.updated_at DESC
       LIMIT $2`,
      [sessionId, Math.min(100, Math.max(1, Number(limit || 40)))],
    );
    return result.rows.map((row) => ({
      id: String(row.id),
      countedQty: Number(row.counted_qty || 0),
      firstScannedAt: row.first_scanned_at ? new Date(row.first_scanned_at).toISOString() : null,
      lastScannedAt: row.last_scanned_at ? new Date(row.last_scanned_at).toISOString() : null,
      lastScannedBy: row.last_scanned_by || null,
      product: productPayload(row),
    }));
  }

  async function recordUnknown(client, session, code, qty, actor) {
    const result = await client.query(
      `INSERT INTO aif_opening_inventory_unknown_scans (
         session_id, scan_code, qty, first_scanned_at, last_scanned_at, last_scanned_by, raw
       ) VALUES ($1,$2,$3,now(),now(),$4,$5::jsonb)
       ON CONFLICT (session_id, scan_code)
       DO UPDATE SET qty=aif_opening_inventory_unknown_scans.qty + EXCLUDED.qty,
                     last_scanned_at=now(), last_scanned_by=$4, updated_at=now(), resolved_at=NULL, resolved_variant_id=NULL, resolved_by=NULL
       RETURNING *`,
      [session.id, code, qty, actor, JSON.stringify({ reason: "unmatched_scan" })],
    );
    return result.rows[0];
  }

  async function ensureDynamicLine(client, session, variant) {
    const existing = await client.query(
      `SELECT * FROM aif_opening_inventory_lines WHERE session_id=$1 AND variant_id=$2 FOR UPDATE`,
      [session.id, variant.variant_id],
    );
    if (existing.rowCount) return existing.rows[0];

    // A session indulásakor ez a variáns 0 rendszerkészlet és 0 igazolt nettó mozgás miatt
    // nem került az előtöltött sorok közé. A későbbi eladásokat / mozgásokat időbélyeggel
    // rávezetjük a fizikai számolásra, ezért többnapos leltár mellett is biztonságosan kezelhető.
    const inserted = await client.query(
      `INSERT INTO aif_opening_inventory_lines (
         session_id, variant_id, system_qty_start, system_reserved_start,
         trusted_net_qty, trusted_in_qty, trusted_out_qty, known_min_qty,
         buy_price, sell_price, raw
       ) VALUES ($1,$2,0,0,0,0,0,0,$3,$4,$5::jsonb)
       ON CONFLICT (session_id, variant_id) DO UPDATE SET updated_at=now()
       RETURNING *`,
      [session.id, variant.variant_id, variant.buy_price, variant.sell_price, JSON.stringify({ baseline: false, discoveredByScan: true, inventoryMode: session.inventory_mode || "recovery" })],
    );
    return inserted.rows[0];
  }

  async function scanIntoSession(req, res) {
    const body = req.body || {};
    const rawCode = body.code || body.barcode || body.scanCode || body.scan_code;
    const qty = Math.max(1, Math.min(9999, intOrNull(body.qty || body.quantity || 1) || 1));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSchema();
      const location = await resolveLocation(req, client, body.location || req.query.location);
      const session = await activeSession(client, location.id, { lock: true });
      if (!session) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Ehhez az üzlethez nincs aktív leltár.", code: "opening_inventory_not_active" });
      }
      if (!EDITABLE_STATUSES.has(session.status)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "A főnök lezárta a beolvasást. Ez a leltár most csak ellenőrizhető.", code: "opening_inventory_readonly" });
      }

      const matched = await findVariantByCode(client, rawCode);
      const actor = actorFrom(req);
      if (!matched.code) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Olvass be egy érvényes bárkódot vagy termékkódot." });
      }
      if (matched.matches.length === 0) {
        const unknown = await recordUnknown(client, session, matched.code, qty, actor);
        await client.query(
          `UPDATE aif_opening_inventory_sessions SET status=CASE WHEN status='draft' THEN 'counting' ELSE status END, updated_at=now() WHERE id=$1`,
          [session.id],
        );
        await client.query("COMMIT");
        return res.status(404).json({
          error: `Nem találom ezt a kódot a terméktörzsben: ${matched.code}. A beolvasást eltároltam a főnöknek ellenőrzésre.`,
          code: "opening_inventory_unknown_code",
          unknownRecorded: true,
          unknown: { id: String(unknown.id), code: unknown.scan_code, qty: Number(unknown.qty || 0) },
        });
      }
      if (matched.matches.length > 1) {
        const unknown = await recordUnknown(client, session, matched.code, qty, actor);
        await client.query("COMMIT");
        return res.status(409).json({
          error: `A ${matched.code} kód több termékhez tartozik. Nem számoltam bele automatikusan, a főnöknek megjelöltem ellenőrzésre.`,
          code: "opening_inventory_barcode_conflict",
          unknownRecorded: true,
          unknown: { id: String(unknown.id), code: unknown.scan_code, qty: Number(unknown.qty || 0) },
          candidates: matched.matches.slice(0, 8).map(productPayload),
        });
      }

      const variant = matched.matches[0];
      const line = await ensureDynamicLine(client, session, variant);
      const before = line.counted_qty === null || line.counted_qty === undefined ? 0 : Number(line.counted_qty || 0);
      const after = before + qty;
      const updated = await client.query(
        `UPDATE aif_opening_inventory_lines
         SET counted_qty=$3,
             first_scanned_at=COALESCE(first_scanned_at,now()),
             last_scanned_at=now(), last_scanned_by=$4,
             auto_zeroed=false, updated_at=now()
         WHERE session_id=$1 AND id=$2
         RETURNING *`,
        [session.id, line.id, after, actor],
      );
      await client.query(
        `INSERT INTO aif_opening_inventory_scans (
           session_id,line_id,variant_id,scan_code,event_type,qty_delta,counted_before,counted_after,actor,raw
         ) VALUES ($1,$2,$3,$4,'scan',$5,$6,$7,$8,$9::jsonb)`,
        [session.id, line.id, variant.variant_id, matched.code, qty, before, after, actor, JSON.stringify({ locationCode: location.code })],
      );
      await client.query(
        `UPDATE aif_opening_inventory_sessions
         SET status=CASE WHEN status='draft' THEN 'counting' ELSE status END, updated_at=now()
         WHERE id=$1`,
        [session.id],
      );
      await client.query("COMMIT");
      return res.json({
        ok: true,
        session: shopSessionPayload({ ...session, status: session.status === "draft" ? "counting" : session.status }),
        line: {
          id: String(updated.rows[0].id),
          countedQty: after,
          product: productPayload(variant),
        },
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF opening inventory scan failed", error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "A leltári beolvasás nem sikerült.", code: error?.code || null });
    } finally {
      client.release();
    }
  }

  router.get("/active", requireAuthed, async (req, res) => {
    const client = await pool.connect();
    try {
      await ensureSchema();
      const location = await resolveLocation(req, client, req.query.location);
      const session = await activeSession(client, location.id);
      if (!session) return res.json({ ok: true, active: false, location: { id: String(location.id), code: location.code, name: location.name }, session: null, recent: [] });
      const recent = await loadShopRecent(client, session.id, req.query.limit || 40);
      const countResult = await client.query(
        `SELECT count(*) FILTER (WHERE counted_qty IS NOT NULL)::int AS counted_lines,
                COALESCE(sum(counted_qty) FILTER (WHERE counted_qty IS NOT NULL),0)::numeric AS counted_qty
         FROM aif_opening_inventory_lines WHERE session_id=$1`,
        [session.id],
      );
      return res.json({
        ok: true,
        active: true,
        session: shopSessionPayload(session),
        progress: {
          countedLines: Number(countResult.rows[0]?.counted_lines || 0),
          countedQty: Number(countResult.rows[0]?.counted_qty || 0),
        },
        recent,
      });
    } catch (error) {
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "A leltár állapota nem tölthető be.", code: error?.code || null });
    } finally {
      client.release();
    }
  });

  router.post("/scan", requireAuthed, scanIntoSession);

  router.patch("/lines/:lineId", requireAuthed, async (req, res) => {
    const countedQty = intOrNull(req.body?.countedQty ?? req.body?.counted_qty ?? req.body?.qty);
    if (countedQty === null || countedQty < 0) return res.status(400).json({ error: "A talált darabszám 0 vagy nagyobb egész szám legyen." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSchema();
      const location = await resolveLocation(req, client, req.body?.location || req.query.location);
      const session = await activeSession(client, location.id, { lock: true });
      if (!session) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Nincs aktív leltár.", code: "opening_inventory_not_active" });
      }
      if (!EDITABLE_STATUSES.has(session.status)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "A leltár beolvasása már le van zárva.", code: "opening_inventory_readonly" });
      }
      const lineResult = await client.query(
        `SELECT l.*, v.internal_sku, v.barcode, v.sn_cod, v.size, v.color_code, v.color_name, v.color_hex, v.image_url,
                v.buy_price, v.sell_price, m.model_code, m.title_ro, m.shopify_title, b.name AS brand_name,
                sc.supplier_product_code, sc.supplier_barcode
         FROM aif_opening_inventory_lines l
         JOIN aif_product_variants v ON v.id=l.variant_id
         JOIN aif_product_models m ON m.id=v.model_id
         LEFT JOIN aif_brands b ON b.id=m.brand_id
         LEFT JOIN LATERAL (
           SELECT supplier_product_code, supplier_barcode
           FROM aif_variant_supplier_codes sc
           WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
           ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST
           LIMIT 1
         ) sc ON true
         WHERE l.id::text=$1 AND l.session_id=$2
         FOR UPDATE OF l`,
        [req.params.lineId, session.id],
      );
      if (!lineResult.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "A leltársor nem található ebben az üzletben." });
      }
      const line = lineResult.rows[0];
      const before = line.counted_qty === null || line.counted_qty === undefined ? 0 : Number(line.counted_qty || 0);
      const actor = actorFrom(req);
      const updated = await client.query(
        `UPDATE aif_opening_inventory_lines
         SET counted_qty=$3,
             first_scanned_at=COALESCE(first_scanned_at,now()),
             last_scanned_at=now(), last_scanned_by=$4,
             auto_zeroed=false, updated_at=now()
         WHERE session_id=$1 AND id=$2
         RETURNING *`,
        [session.id, line.id, countedQty, actor],
      );
      await client.query(
        `INSERT INTO aif_opening_inventory_scans (
           session_id,line_id,variant_id,scan_code,event_type,qty_delta,counted_before,counted_after,actor,raw
         ) VALUES ($1,$2,$3,NULL,'manual_set',$4,$5,$6,$7,$8::jsonb)`,
        [session.id, line.id, line.variant_id, countedQty - before, before, countedQty, actor, JSON.stringify({ source: isAdminLike(req) ? "admin" : "shop" })],
      );
      await client.query(`UPDATE aif_opening_inventory_sessions SET status=CASE WHEN status='draft' THEN 'counting' ELSE status END,updated_at=now() WHERE id=$1`, [session.id]);
      await client.query("COMMIT");
      return res.json({
        ok: true,
        line: {
          id: String(updated.rows[0].id),
          countedQty,
          product: productPayload(line),
        },
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "A leltári mennyiség módosítása nem sikerült.", code: error?.code || null });
    } finally {
      client.release();
    }
  });

  // Manager endpoints -------------------------------------------------------

  router.get("/admin/sessions", requireAdminOrSecret, async (req, res) => {
    const client = await pool.connect();
    try {
      await ensureSchema();
      const locationInput = text(req.query.location);
      const status = openingStatus(req.query.status);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
      const args = [];
      const where = [];
      if (locationInput) {
        args.push(locationInput);
        where.push(`(s.location_id::text=$${args.length} OR l.code=$${args.length})`);
      }
      if (status) {
        args.push(status);
        where.push(`s.status=$${args.length}`);
      }
      args.push(limit);
      const result = await client.query(
        `SELECT s.*,l.code AS location_code,l.name AS location_name,l.location_type,
                count(li.id)::int AS line_count,
                count(li.id) FILTER (WHERE li.counted_qty IS NOT NULL)::int AS counted_lines,
                COALESCE(sum(li.counted_qty) FILTER (WHERE li.counted_qty IS NOT NULL),0)::numeric AS counted_qty
         FROM aif_opening_inventory_sessions s
         JOIN aif_locations l ON l.id=s.location_id
         LEFT JOIN aif_opening_inventory_lines li ON li.session_id=s.id
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         GROUP BY s.id,l.id
         ORDER BY s.created_at DESC
         LIMIT $${args.length}`,
        args,
      );
      return res.json({ ok: true, items: result.rows });
    } catch (error) {
      return res.status(500).json({ error: error?.message || "A leltárak listája nem tölthető be." });
    } finally {
      client.release();
    }
  });

  router.post("/admin/sessions", requireAdminOrSecret, async (req, res) => {
    const body = req.body || {};
    const requestedMode = normCode(body.inventoryMode || body.inventory_mode || body.mode);
    const inventoryMode = requestedMode === "standard" ? "standard" : "recovery";
    const requestedSalesTrustedFrom = cleanIsoDate(body.salesTrustedFrom || body.sales_trusted_from);
    if (inventoryMode === "recovery" && !requestedSalesTrustedFrom) {
      return res.status(400).json({
        error: "Helyreállító leltárnál add meg, melyik naptól tekinthetők a bolti eladások biztos rendszeradatnak.",
        code: "opening_inventory_sales_cutoff_required",
      });
    }
    const requestedLegacyRetailValue = numberOrNull(body.legacyRetailValue ?? body.legacy_retail_value);
    if (requestedLegacyRetailValue !== null && requestedLegacyRetailValue < 0) {
      return res.status(400).json({ error: "A papír szerinti készletérték nem lehet negatív." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSchema();
      const location = await resolveLocation(req, client, body.location || body.locationCode || body.locationId);
      const existing = await activeSession(client, location.id, { lock: true });
      if (existing) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "Ehhez az üzlethez már van aktív leltár.",
          code: "opening_inventory_already_active",
          sessionId: String(existing.id),
        });
      }

      const actor = actorFrom(req);
      const nowResult = await client.query(
        `SELECT now() AS now, (now() AT TIME ZONE 'Europe/Bucharest')::date::text AS local_date`,
      );
      const baselineAt = nowResult.rows[0]?.now || new Date();
      const salesTrustedFrom = requestedSalesTrustedFrom || nowResult.rows[0]?.local_date || new Date().toISOString().slice(0, 10);
      const legacyRetailValue = inventoryMode === "recovery" ? requestedLegacyRetailValue : null;
      const defaultTitle = inventoryMode === "recovery"
        ? `Helyreállító leltár - ${location.name}`
        : `Leltár - ${location.name}`;

      const inserted = await client.query(
        `INSERT INTO aif_opening_inventory_sessions (
           code,location_id,title,status,inventory_mode,sales_trusted_from,legacy_retail_value,
           baseline_at,started_at,started_by,note,raw
         ) VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$7,$8,$9,$10::jsonb)
         RETURNING *`,
        [
          sessionCode(),
          location.id,
          text(body.title) || defaultTitle,
          inventoryMode,
          salesTrustedFrom,
          legacyRetailValue,
          baselineAt,
          actor,
          text(body.note) || null,
          JSON.stringify({
            mode: inventoryMode === "standard" ? "standard_inventory" : "recovery_inventory",
            inventoryMode,
            blindShopCounting: true,
            salesAllowedDuringCount: true,
            trustedAlwaysSourceTypes: inventoryMode === "recovery" ? TRUSTED_ALWAYS_SOURCE_TYPES : [],
            trustedSalesSourceTypes: inventoryMode === "recovery" ? TRUSTED_SALES_SOURCE_TYPES : [],
            salesTrustedFrom,
          }),
        ],
      );
      const session = {
        ...inserted.rows[0],
        location_code: location.code,
        location_name: location.name,
        location_type: location.location_type,
      };
      const preloaded = await preloadSessionLines(client, session);
      await client.query(
        `UPDATE aif_opening_inventory_sessions
         SET raw=COALESCE(raw,'{}'::jsonb) || $2::jsonb, updated_at=now()
         WHERE id=$1`,
        [session.id, JSON.stringify({ preloadedLines: preloaded })],
      );
      await client.query("COMMIT");
      const fresh = await sessionById(client, session.id);
      const detail = await adminDetail(client, fresh);
      return res.json({ ok: true, ...detail });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF store inventory start failed", error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A leltár indítása nem sikerült.",
        code: error?.code || null,
      });
    } finally {
      client.release();
    }
  });

  router.get("/admin/sessions/:id", requireAdminOrSecret, async (req, res) => {
    const client = await pool.connect();
    try {
      await ensureSchema();
      const session = await sessionById(client, req.params.id);
      if (!session) return res.status(404).json({ error: "A leltár nem található." });
      const detail = await adminDetail(client, session);
      return res.json({ ok: true, ...detail });
    } catch (error) {
      return res.status(500).json({ error: error?.message || "A leltár nem tölthető be." });
    } finally {
      client.release();
    }
  });

  router.post("/admin/sessions/:id/reconcile-unknown", requireAdminOrSecret, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSchema();
      const session = await sessionById(client, req.params.id, { lock: true });
      if (!session) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "A leltár nem található." });
      }
      if (!["draft", "counting", "review"].includes(session.status)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Lezárt leltár nem egyeztethető újra." });
      }
      const unknowns = await client.query(
        `SELECT * FROM aif_opening_inventory_unknown_scans
         WHERE session_id=$1 AND resolved_at IS NULL AND qty>0
         ORDER BY created_at ASC FOR UPDATE`,
        [session.id],
      );
      let resolved = 0;
      let remaining = 0;
      const actor = actorFrom(req);
      for (const unknown of unknowns.rows) {
        const match = await findVariantByCode(client, unknown.scan_code);
        if (match.matches.length !== 1) {
          remaining += 1;
          continue;
        }
        const variant = match.matches[0];
        const line = await ensureDynamicLine(client, session, variant);
        const before = line.counted_qty === null || line.counted_qty === undefined ? 0 : Number(line.counted_qty || 0);
        const qty = Number(unknown.qty || 0);
        const after = before + qty;
        const updated = await client.query(
          `UPDATE aif_opening_inventory_lines
           SET counted_qty=$3,first_scanned_at=COALESCE(first_scanned_at,$4),last_scanned_at=GREATEST(COALESCE(last_scanned_at,$5),$5),
               last_scanned_by=$6,auto_zeroed=false,updated_at=now()
           WHERE session_id=$1 AND id=$2 RETURNING *`,
          [session.id, line.id, after, unknown.first_scanned_at, unknown.last_scanned_at, unknown.last_scanned_by || actor],
        );
        await client.query(
          `INSERT INTO aif_opening_inventory_scans (
             session_id,line_id,variant_id,scan_code,event_type,qty_delta,counted_before,counted_after,actor,raw
           ) VALUES ($1,$2,$3,$4,'unknown_reconcile',$5,$6,$7,$8,$9::jsonb)`,
          [session.id, line.id, variant.variant_id, unknown.scan_code, qty, before, after, actor, JSON.stringify({ unknownScanId: String(unknown.id) })],
        );
        await client.query(
          `UPDATE aif_opening_inventory_unknown_scans
           SET resolved_variant_id=$2,resolved_at=now(),resolved_by=$3,updated_at=now()
           WHERE id=$1`,
          [unknown.id, variant.variant_id, actor],
        );
        void updated;
        resolved += 1;
      }
      await client.query(`UPDATE aif_opening_inventory_sessions SET updated_at=now() WHERE id=$1`, [session.id]);
      await client.query("COMMIT");
      const fresh = await sessionById(client, session.id);
      const detail = await adminDetail(client, fresh);
      return res.json({ ok: true, resolution: { resolved, remaining }, ...detail });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "Az ismeretlen kódok újraegyeztetése nem sikerült." });
    } finally {
      client.release();
    }
  });

  router.post("/admin/sessions/:id/close", requireAdminOrSecret, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSchema();
      const session = await sessionById(client, req.params.id, { lock: true });
      if (!session) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "A leltár nem található." });
      }
      if (!EDITABLE_STATUSES.has(session.status)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: session.status === "review" ? "A beolvasás már le van zárva." : "Ez a leltár már nem zárható le." });
      }
      const actor = actorFrom(req);
      await syncSessionLinesFromLiveStock(client, session);
      const closeTimeResult = await client.query(`SELECT now() AS now`);
      const closeTime = closeTimeResult.rows[0]?.now || new Date();
      await client.query(
        `UPDATE aif_opening_inventory_lines
         SET counted_qty=0,
             first_scanned_at=COALESCE(first_scanned_at,$2),
             last_scanned_at=COALESCE(last_scanned_at,$2),
             last_scanned_by=COALESCE(last_scanned_by,$3),
             auto_zeroed=true,
             updated_at=now()
         WHERE session_id=$1 AND counted_qty IS NULL`,
        [session.id, closeTime, actor],
      );
      await client.query(
        `UPDATE aif_opening_inventory_sessions
         SET status='review',counting_closed_at=$3,closed_by=$2,updated_at=now()
         WHERE id=$1`,
        [session.id, actor, closeTime],
      );
      await client.query("COMMIT");
      const fresh = await sessionById(client, session.id);
      const detail = await adminDetail(client, fresh);
      return res.json({ ok: true, ...detail });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      return res.status(500).json({ error: error?.message || "A beolvasás lezárása nem sikerült." });
    } finally {
      client.release();
    }
  });

  router.post("/admin/sessions/:id/reopen", requireAdminOrSecret, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSchema();
      const session = await sessionById(client, req.params.id, { lock: true });
      if (!session) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "A leltár nem található." });
      }
      if (session.status !== "review") {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Csak ellenőrzés alatt lévő leltár nyitható újra." });
      }
      await client.query(
        `UPDATE aif_opening_inventory_lines
         SET counted_qty=NULL,
             first_scanned_at=NULL,
             last_scanned_at=NULL,
             last_scanned_by=NULL,
             auto_zeroed=false,
             updated_at=now()
         WHERE session_id=$1 AND auto_zeroed=true`,
        [session.id],
      );
      await client.query(
        `UPDATE aif_opening_inventory_sessions
         SET status='counting',counting_closed_at=NULL,closed_by=NULL,updated_at=now()
         WHERE id=$1`,
        [session.id],
      );
      await client.query("COMMIT");
      const fresh = await sessionById(client, session.id);
      const detail = await adminDetail(client, fresh);
      return res.json({ ok: true, ...detail });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      return res.status(500).json({ error: error?.message || "A leltár újranyitása nem sikerült." });
    } finally {
      client.release();
    }
  });

  router.post("/admin/sessions/:id/apply", requireAdminOrSecret, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSchema();
      const session = await sessionById(client, req.params.id, { lock: true });
      if (!session) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "A leltár nem található." });
      }
      if (session.status !== "review") {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "A készlet csak a beolvasás lezárása és ellenőrzése után alkalmazható.", code: "opening_inventory_review_required" });
      }

      const unknown = await client.query(
        `SELECT count(*)::int AS c,COALESCE(sum(qty),0)::numeric AS qty
         FROM aif_opening_inventory_unknown_scans
         WHERE session_id=$1 AND resolved_at IS NULL AND qty>0`,
        [session.id],
      );
      if (Number(unknown.rows[0]?.c || 0) > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: `Még ${unknown.rows[0].c} ismeretlen / ütköző kód nincs rendezve. Előbb ezeket tisztázd.`,
          code: "opening_inventory_unknown_codes_pending",
          unknownRows: Number(unknown.rows[0].c || 0),
          unknownQty: Number(unknown.rows[0].qty || 0),
        });
      }

      // A bolt a leltár alatt is működhet. Ugyanazzal a lokációs advisory lockkal
      // sorba állítjuk a készlet-véglegesítést és a bolti eladást, így az utolsó
      // pillanatban rögzített eladás sem veszhet el.
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`,
        [`aif_opening_inventory_stock:${session.location_id}`],
      );

      await syncSessionLinesFromLiveStock(client, session);

      // Ha a leltár lezárása után érkezett be új termék, az a zárási időpontban
      // 0-nak tekintett sor lesz, majd a későbbi hiteles mozgásokat rávezetjük.
      const observationAt = session.counting_closed_at || session.baseline_at;
      await client.query(
        `UPDATE aif_opening_inventory_lines
         SET counted_qty=0,
             first_scanned_at=COALESCE(first_scanned_at,$2),
             last_scanned_at=COALESCE(last_scanned_at,$2),
             last_scanned_by=COALESCE(last_scanned_by,$3),
             auto_zeroed=true,
             updated_at=now()
         WHERE session_id=$1 AND counted_qty IS NULL`,
        [session.id, observationAt, actorFrom(req)],
      );

      // A már létező stock sorokat lezárjuk a tranzakció végéig. A bolti eladás
      // ugyanezen session alatt az advisory lock miatt amúgy is megvár minket.
      await client.query(
        `SELECT variant_id
         FROM aif_stock
         WHERE location_id=$1
         ORDER BY variant_id
         FOR UPDATE`,
        [session.location_id],
      );

      const lines = await loadAdminLines(client, session, { lock: true });

      const actor = actorFrom(req);
      let changed = 0;
      let netDiff = 0;
      let correctionRetailValue = 0;
      for (const line of lines) {
        const stock = await client.query(
          `SELECT qty,reserved_qty FROM aif_stock WHERE location_id=$1 AND variant_id=$2 FOR UPDATE`,
          [session.location_id, line.variant_id],
        );
        const beforeQty = Number(stock.rows[0]?.qty || 0);
        const reserved = Number(stock.rows[0]?.reserved_qty || 0);
        const afterQty = Number(line.counted_qty || 0);
        if (!Number.isFinite(afterQty) || afterQty < 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: `Érvénytelen talált darabszám: ${line.title_ro || line.variant_id}` });
        }
        if (reserved > afterQty) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: `${line.title_ro || "Egy termék"}: ${reserved} db foglalt, de csak ${afterQty} db lett megszámolva. Előbb rendezd a foglalást.`,
            code: "opening_inventory_reserved_conflict",
            variantId: String(line.variant_id),
          });
        }

        await client.query(
          `INSERT INTO aif_stock (location_id,variant_id,qty,reserved_qty,updated_at)
           VALUES ($1,$2,$3,$4,now())
           ON CONFLICT (location_id,variant_id)
           DO UPDATE SET qty=$3,reserved_qty=$4,updated_at=now()`,
          [session.location_id, line.variant_id, afterQty, reserved],
        );

        const delta = afterQty - beforeQty;
        if (delta !== 0) {
          const logged = await insertStockMovementSafe(client, {
            movementType: "manual_adjustment",
            sourceType: "opening_inventory",
            sourcePrefix: "openinv",
            fallbackSourceType: "manual_stock_edit",
            sourceId: String(session.id),
            locationId: session.location_id,
            variantId: line.variant_id,
            qtyDelta: delta,
            qtyBefore: beforeQty,
            qtyAfter: afterQty,
            actor,
            raw: {
              reason: "opening_inventory_apply",
              openingInventoryId: String(session.id),
              openingInventoryCode: session.code,
              openingInventoryLineId: String(line.id),
              systemQtyAtStart: Number(line.system_qty_start || 0),
              currentSystemQtyBeforeApply: beforeQty,
              baselineTrustedNetQty: Number(line.baseline_trusted_net_qty || 0),
              trustedNetQty: Number(line.trusted_net_qty || 0),
              baselineKnownMinimumQty: Number(line.baseline_known_min_qty || 0),
              knownMinimumQty: Number(line.known_min_qty || 0),
              physicalCountedQty: Number(line.physical_counted_qty || 0),
              movementAfterCountQty: Number(line.movement_after_count_qty || 0),
              effectiveCountedQty: afterQty,
              countedQty: afterQty,
              definiteMissingQty: Math.max(0, Number(line.known_min_qty || 0) - afterQty),
              untrackedQty: Math.max(0, afterQty - Number(line.known_min_qty || 0)),
              sellPriceSnapshot: numberOrNull(line.sell_price),
              locationCode: session.location_code,
              locationName: session.location_name,
            },
          });
          if (!logged) throw Object.assign(new Error("A leltár egyik készletkorrekcióját nem sikerült naplózni."), { statusCode: 500 });
          changed += 1;
          netDiff += delta;
          correctionRetailValue += delta * Number(line.sell_price || 0);
        }
      }

      await client.query(
        `UPDATE aif_opening_inventory_sessions
         SET status='applied',applied_at=now(),applied_by=$2,
             raw=COALESCE(raw,'{}'::jsonb) || $3::jsonb,updated_at=now()
         WHERE id=$1`,
        [session.id, actor, JSON.stringify({
          changed,
          netDiff,
          correctionRetailValue,
          liveMovementReconciliation: true,
          movementPolicy: "physical_count_plus_movements_after_last_count",
        })],
      );
      await client.query("COMMIT");
      const fresh = await sessionById(client, session.id);
      const detail = await adminDetail(client, fresh);
      return res.json({ ok: true, result: { changed, netDiff, correctionRetailValue }, ...detail });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF opening inventory apply failed", error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || "A leltár készletre alkalmazása nem sikerült.", code: error?.code || null });
    } finally {
      client.release();
    }
  });

  router.post("/admin/sessions/:id/cancel", requireAdminOrSecret, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSchema();
      const session = await sessionById(client, req.params.id, { lock: true });
      if (!session) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "A leltár nem található." });
      }
      if (session.status === "applied") {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Alkalmazott leltár nem törölhető vagy vonható vissza innen." });
      }
      if (session.status === "cancelled") {
        await client.query("ROLLBACK");
        return res.json({ ok: true, already: true, session });
      }
      await client.query(
        `UPDATE aif_opening_inventory_sessions
         SET status='cancelled',cancelled_at=now(),cancelled_by=$2,updated_at=now()
         WHERE id=$1`,
        [session.id, actorFrom(req)],
      );
      await client.query("COMMIT");
      const fresh = await sessionById(client, session.id);
      return res.json({ ok: true, session: fresh });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      return res.status(500).json({ error: error?.message || "A leltár megszakítása nem sikerült." });
    } finally {
      client.release();
    }
  });

  return router;
}
