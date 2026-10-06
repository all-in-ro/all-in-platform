import express from "express";

// Utólagos, terméksor-szintű megjegyzések üzleti eladásokhoz.
// Szándékosan append-only: az eredeti eladást és az eladó eredeti megjegyzését nem módosítja.
export default function createAifShopSaleLineNotesRouter(deps) {
  const {
    pool,
    requireAuthed,
    ensureAifShopSalesSchema,
    aifResolveShopLocation,
    actorFrom,
    text,
    normCode,
    isUuidText,
  } = deps;

  const router = express.Router();
  let schemaPromise = null;

  async function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await ensureAifShopSalesSchema();
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_shop_sale_line_notes (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          location_id uuid NOT NULL REFERENCES aif_locations(id) ON DELETE RESTRICT,
          sale_id uuid NOT NULL REFERENCES aif_shop_sales(id) ON DELETE CASCADE,
          sale_line_id uuid NOT NULL REFERENCES aif_shop_sale_lines(id) ON DELETE CASCADE,
          note text NOT NULL,
          actor text NOT NULL,
          actor_role text NULL,
          raw jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_shop_sale_line_notes_line_idx
          ON aif_shop_sale_line_notes (sale_line_id, created_at ASC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_shop_sale_line_notes_sale_idx
          ON aif_shop_sale_line_notes (sale_id, created_at ASC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_shop_sale_line_notes_location_idx
          ON aif_shop_sale_line_notes (location_id, created_at DESC)`);
        await pool.query(`ALTER TABLE IF EXISTS aif_shop_sale_line_notes
          ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL`);
        await pool.query(`ALTER TABLE IF EXISTS aif_shop_sale_line_notes
          ADD COLUMN IF NOT EXISTS deleted_by text NULL`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_shop_sale_line_notes_active_line_idx
          ON aif_shop_sale_line_notes (sale_line_id, created_at ASC)
          WHERE deleted_at IS NULL`);
        return true;
      })().catch((error) => {
        schemaPromise = null;
        throw error;
      });
    }
    return schemaPromise;
  }

  function cleanNote(value) {
    return text(value).slice(0, 1000);
  }

  function isAdminSession(req) {
    return ["admin", "administrator"].includes(normCode(req.session?.role));
  }

  function displayNoteActor(actor, actorRole) {
    const normalizedActor = normCode(actor);
    const normalizedRole = normCode(actorRole);
    if (["admin", "administrator"].includes(normalizedRole) || ["admin", "administrator"].includes(normalizedActor)) {
      return "Kerekes Zsolt";
    }
    return text(actor) || null;
  }

  function noteActorFrom(req) {
    return isAdminSession(req) ? "Kerekes Zsolt" : actorFrom(req);
  }

  function mapNote(row) {
    return {
      id: String(row.id),
      lineId: String(row.sale_line_id),
      saleId: String(row.sale_id),
      note: text(row.note),
      actor: displayNoteActor(row.actor, row.actor_role),
      actorRole: row.actor_role || null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    };
  }

  async function loadThreads(locationId, lineIds) {
    if (!lineIds.length) return [];

    const result = await pool.query(
      `SELECT
         sl.id::text AS line_id,
         sl.sale_id::text AS sale_id,
         sl.line_no,
         s.sale_number,
         s.sold_at,
         s.actor AS sale_actor,
         NULLIF(btrim(COALESCE(s.note,'')),'') AS sale_note,
         n.id::text AS note_id,
         n.note,
         n.actor AS note_actor,
         n.actor_role,
         n.created_at AS note_created_at
       FROM aif_shop_sale_lines sl
       JOIN aif_shop_sales s ON s.id=sl.sale_id
       LEFT JOIN aif_shop_sale_line_notes n
         ON n.sale_line_id=sl.id
        AND n.deleted_at IS NULL
       WHERE s.location_id=$1
         AND sl.id = ANY($2::uuid[])
       ORDER BY sl.sale_id, sl.line_no, n.created_at ASC, n.id ASC`,
      [locationId, lineIds]
    );

    const byLine = new Map();
    for (const row of result.rows) {
      const key = String(row.line_id);
      let thread = byLine.get(key);
      if (!thread) {
        thread = {
          lineId: key,
          saleId: String(row.sale_id),
          lineNo: Number(row.line_no || 0),
          saleNumber: row.sale_number || null,
          soldAt: row.sold_at ? new Date(row.sold_at).toISOString() : null,
          saleActor: row.sale_actor || null,
          saleNote: text(row.sale_note) || null,
          notes: [],
        };
        byLine.set(key, thread);
      }
      if (row.note_id) {
        thread.notes.push({
          id: String(row.note_id),
          lineId: key,
          saleId: String(row.sale_id),
          note: text(row.note),
          actor: displayNoteActor(row.note_actor, row.actor_role),
          actorRole: row.actor_role || null,
          createdAt: row.note_created_at ? new Date(row.note_created_at).toISOString() : null,
        });
      }
    }
    return Array.from(byLine.values());
  }

  // Több terméksor megjegyzéseinek lekérése egyetlen kérésben.
  router.post("/query", requireAuthed, async (req, res) => {
    try {
      await ensureSchema();
      const location = await aifResolveShopLocation(req, pool, req.body?.location ?? req.query?.location);
      const rawIds = Array.isArray(req.body?.lineIds)
        ? req.body.lineIds
        : Array.isArray(req.body?.line_ids)
          ? req.body.line_ids
          : [];
      const lineIds = Array.from(new Set(
        rawIds.map((value) => text(value)).filter((value) => value && isUuidText(value))
      )).slice(0, 500);

      const threads = await loadThreads(location.id, lineIds);
      return res.json({ ok: true, count: threads.length, threads });
    } catch (error) {
      console.error("AIF shop sale line note query failed", error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A termékmegjegyzések betöltése nem sikerült.",
        code: error?.code || null,
      });
    }
  });

  // Új utólagos megjegyzés. Nem UPDATE: minden bejegyzés külön auditnyom marad.
  router.post("/", requireAuthed, async (req, res) => {
    try {
      await ensureSchema();
      const location = await aifResolveShopLocation(req, pool, req.body?.location ?? req.query?.location);
      const lineId = text(req.body?.lineId || req.body?.line_id || req.body?.saleLineId || req.body?.sale_line_id);
      const note = cleanNote(req.body?.note);

      if (!lineId || !isUuidText(lineId)) {
        return res.status(400).json({ error: "Érvénytelen eladási terméksor.", code: "invalid_sale_line_id" });
      }
      if (!note) {
        return res.status(400).json({ error: "A megjegyzés nem lehet üres.", code: "empty_sale_line_note" });
      }

      const lineResult = await pool.query(
        `SELECT sl.id, sl.sale_id, sl.line_no, s.sale_number
         FROM aif_shop_sale_lines sl
         JOIN aif_shop_sales s ON s.id=sl.sale_id
         WHERE sl.id=$1::uuid
           AND s.location_id=$2
         LIMIT 1`,
        [lineId, location.id]
      );
      if (!lineResult.rowCount) {
        return res.status(404).json({ error: "Az eladási terméksor nem található ebben az üzletben.", code: "sale_line_not_found" });
      }

      const line = lineResult.rows[0];
      const actor = noteActorFrom(req);
      const actorRole = normCode(req.session?.role || req.user?.role || "") || null;
      const inserted = await pool.query(
        `INSERT INTO aif_shop_sale_line_notes (
           location_id, sale_id, sale_line_id, note, actor, actor_role, raw
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
         RETURNING id, sale_line_id, sale_id, note, actor, actor_role, created_at`,
        [
          location.id,
          line.sale_id,
          line.id,
          note,
          actor,
          actorRole,
          JSON.stringify({ source: "post_sale_line_note" }),
        ]
      );

      return res.status(201).json({
        ok: true,
        item: mapNote(inserted.rows[0]),
      });
    } catch (error) {
      console.error("AIF shop sale line note create failed", error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A termékmegjegyzés mentése nem sikerült.",
        code: error?.code || null,
      });
    }
  });


  // Megjegyzést kizárólag Admin törölhet. Soft-delete marad auditnyomként,
  // de a normál lekérdezésekből azonnal eltűnik.
  router.delete("/:noteId", requireAuthed, async (req, res) => {
    try {
      await ensureSchema();
      if (!isAdminSession(req)) {
        return res.status(403).json({
          error: "A termékmegjegyzést csak az Admin törölheti.",
          code: "admin_only",
        });
      }

      const location = await aifResolveShopLocation(req, pool, req.body?.location ?? req.query?.location);
      const noteId = text(req.params?.noteId);
      if (!noteId || !isUuidText(noteId)) {
        return res.status(400).json({ error: "Érvénytelen megjegyzés-azonosító.", code: "invalid_sale_line_note_id" });
      }

      const deletedBy = noteActorFrom(req);
      const deleted = await pool.query(
        `UPDATE aif_shop_sale_line_notes n
         SET deleted_at=now(),
             deleted_by=$3::text,
             raw=COALESCE(n.raw,'{}'::jsonb) || jsonb_build_object(
               'deletedBy',$3::text,
               'deletedAt',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
             )
         FROM aif_shop_sale_lines sl
         JOIN aif_shop_sales s ON s.id=sl.sale_id
         WHERE n.id=$1::uuid
           AND n.sale_line_id=sl.id
           AND s.location_id=$2
           AND n.deleted_at IS NULL
         RETURNING n.id::text, n.sale_line_id::text, n.sale_id::text, n.deleted_at, n.deleted_by`,
        [noteId, location.id, deletedBy]
      );

      if (!deleted.rowCount) {
        return res.status(404).json({
          error: "A megjegyzés nem található, vagy már törölve lett.",
          code: "sale_line_note_not_found",
        });
      }

      return res.json({
        ok: true,
        deleted: true,
        id: String(deleted.rows[0].id),
        lineId: String(deleted.rows[0].sale_line_id),
        saleId: String(deleted.rows[0].sale_id),
        deletedBy: deleted.rows[0].deleted_by || deletedBy,
        deletedAt: deleted.rows[0].deleted_at ? new Date(deleted.rows[0].deleted_at).toISOString() : null,
      });
    } catch (error) {
      console.error("AIF shop sale line note delete failed", error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "A termékmegjegyzés törlése nem sikerült.",
        code: error?.code || null,
      });
    }
  });

  return router;
}
