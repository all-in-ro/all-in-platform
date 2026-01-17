// api/routes/cars.js (ESM)
// Factory router: export default (ctx) => router
// ctx: { pool, requireAuthed, requireAdminOrSecret }

import express from "express";

function normInt(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normText(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function normDate(v) {
  if (!v) return null;
  // accept Date, ISO, YYYY-MM-DD
  const s = String(v).slice(0, 10);
  return s || null;
}

function normalizeItpValidity(body) {
  // Accept either itp_years or itp_months or both.
  // If years provided but months missing => months = 0 (explicit)
  // If months provided but years missing => years = 0 (explicit)
  const years = normInt(body.itp_years);
  const months = normInt(body.itp_months);
  const hasY = years !== null;
  const hasM = months !== null;

  if (!hasY && !hasM) return { itp_years: null, itp_months: null };
  return {
    itp_years: hasY ? years : 0,
    itp_months: hasM ? months : 0,
  };
}

export default function createCarsRouter(ctx) {
  const { pool, requireAuthed, requireAdminOrSecret } = ctx || {};
  if (!pool || typeof pool.query !== "function") {
    throw new Error("cars router requires ctx.pool (pg pool)");
  }
  if (typeof requireAuthed !== "function") {
    throw new Error("cars router requires ctx.requireAuthed middleware");
  }
  if (typeof requireAdminOrSecret !== "function") {
    throw new Error("cars router requires ctx.requireAdminOrSecret middleware");
  }

  const router = express.Router();

  // GET /api/cars
  router.get("/", requireAuthed, async (_req, res) => {
    try {
      const r = await pool.query(
        `
        select
          id,
          photo_url,
          plate,
          make_model,
          itp_date,
          itp_years,
          itp_months,
          rca_date,
          casco_start,
          casco_months,
          rovinieta_start,
          rovinieta_months,
          vin,
          civ,
          color,
          engine_cc,
          power_kw,
          total_mass,
          fuel,
          year,
          created_at,
          updated_at
        from cars
        order by id desc
        `
      );
      res.json(r.rows);
    } catch (e) {
      res.status(500).json({ error: "db_error", detail: String(e?.message || e) });
    }
  });

  // POST /api/cars
  router.post("/", requireAdminOrSecret, async (req, res) => {
    try {
      const b = req.body || {};
      const itp = normalizeItpValidity(b);

      const cols = [
        "photo_url",
        "plate",
        "make_model",
        "itp_date",
        "itp_years",
        "itp_months",
        "rca_date",
        "casco_start",
        "casco_months",
        "rovinieta_start",
        "rovinieta_months",
        "vin",
        "civ",
        "color",
        "engine_cc",
        "power_kw",
        "total_mass",
        "fuel",
        "year",
      ];

      const vals = [
        normText(b.photo_url),
        normText(b.plate),
        normText(b.make_model),
        normDate(b.itp_date),
        itp.itp_years,
        itp.itp_months,
        normDate(b.rca_date),
        normDate(b.casco_start),
        normInt(b.casco_months),
        normDate(b.rovinieta_start),
        normInt(b.rovinieta_months),
        normText(b.vin),
        normText(b.civ),
        normText(b.color),
        normInt(b.engine_cc),
        normInt(b.power_kw),
        normInt(b.total_mass),
        normText(b.fuel),
        normInt(b.year),
      ];

      const placeholders = vals.map((_, i) => `$${i + 1}`).join(",");

      const r = await pool.query(
        `insert into cars (${cols.join(",")}) values (${placeholders}) returning *`,
        vals
      );

      res.status(201).json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ error: "db_error", detail: String(e?.message || e) });
    }
  });

  // PATCH /api/cars/:id (also supports { _action: 'delete' } fallback)
  router.patch("/:id", requireAdminOrSecret, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });

    const b = req.body || {};

    // Fallback delete action
    if (b && b._action === "delete") {
      try {
        const del = await pool.query(`delete from cars where id = $1`, [id]);
        if (!del.rowCount) return res.status(404).json({ error: "not_found" });
        return res.json({ ok: true });
      } catch (e) {
        return res.status(500).json({ error: "db_error", detail: String(e?.message || e) });
      }
    }

    try {
      const itp = ("itp_years" in b || "itp_months" in b) ? normalizeItpValidity(b) : null;

      const map = {
        photo_url: () => normText(b.photo_url),
        plate: () => normText(b.plate),
        make_model: () => normText(b.make_model),
        itp_date: () => normDate(b.itp_date),
        itp_years: () => (itp ? itp.itp_years : normInt(b.itp_years)),
        itp_months: () => (itp ? itp.itp_months : normInt(b.itp_months)),
        rca_date: () => normDate(b.rca_date),
        casco_start: () => normDate(b.casco_start),
        casco_months: () => normInt(b.casco_months),
        rovinieta_start: () => normDate(b.rovinieta_start),
        rovinieta_months: () => normInt(b.rovinieta_months),
        vin: () => normText(b.vin),
        civ: () => normText(b.civ),
        color: () => normText(b.color),
        engine_cc: () => normInt(b.engine_cc),
        power_kw: () => normInt(b.power_kw),
        total_mass: () => normInt(b.total_mass),
        fuel: () => normText(b.fuel),
        year: () => normInt(b.year),
      };

      const sets = [];
      const params = [];

      for (const k of Object.keys(map)) {
        if (!(k in b)) continue;
        params.push(map[k]());
        sets.push(`${k} = $${params.length}`);
      }

      // always update updated_at
      sets.push(`updated_at = now()`);

      if (sets.length === 1) {
        // only updated_at
        const r0 = await pool.query(`select * from cars where id = $1`, [id]);
        if (!r0.rowCount) return res.status(404).json({ error: "not_found" });
        return res.json(r0.rows[0]);
      }

      params.push(id);

      const r = await pool.query(
        `update cars set ${sets.join(", ")} where id = $${params.length} returning *`,
        params
      );

      if (!r.rowCount) return res.status(404).json({ error: "not_found" });
      res.json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ error: "db_error", detail: String(e?.message || e) });
    }
  });

  // DELETE /api/cars/:id (hard delete)
  router.delete("/:id", requireAdminOrSecret, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
    try {
      const r = await pool.query(`delete from cars where id = $1`, [id]);
      if (!r.rowCount) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "db_error", detail: String(e?.message || e) });
    }
  });

  return router;
}
