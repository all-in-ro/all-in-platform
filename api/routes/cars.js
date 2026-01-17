/**
 * server/api/routes/cars.js (ESM)
 * ALL IN – Cars router (modular)
 *
 * Mount:
 *   app.use('/api/cars', createCarsRouter({ pool, requireAuthed, requireAdminOrSecret }))
 *
 * Auth:
 *   - GET: requireAuthed
 *   - POST/PATCH/DELETE: requireAdminOrSecret
 *
 * Supports fallback delete: PATCH /:id with { _action: 'delete' }
 */

import express from "express";

function normInt(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normText(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function normDate(v) {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return s || null;
}

/**
 * Normalize ITP validity:
 * - years and/or months may come
 * - if only years provided, months = years*12
 * - clamp to 1..2 years (12/24 months)
 */
function normalizeItpFromBody(b = {}) {
  let years = normInt(b.itp_years);
  let months = normInt(b.itp_months);

  // aliases
  if (years == null) {
    years =
      normInt(b.itp_valid_years) ??
      normInt(b.itp_interval_years) ??
      normInt(b.itp_period_years) ??
      normInt(b.years_itp) ??
      normInt(b.itpValidityYears) ??
      null;
  }
  if (months == null && years != null) months = years * 12;

  if (years != null) years = Math.max(1, Math.min(2, years));
  if (months != null) months = months <= 12 ? 12 : 24;

  if (years != null && months == null) months = years * 12;
  if (months != null && years == null) years = months <= 12 ? 1 : 2;

  return { years, months };
}

export default function createCarsRouter({ pool, requireAuthed, requireAdminOrSecret }) {
  if (!pool) throw new Error("createCarsRouter: pool is required");
  if (typeof requireAuthed !== "function") throw new Error("createCarsRouter: requireAuthed is required");
  if (typeof requireAdminOrSecret !== "function") throw new Error("createCarsRouter: requireAdminOrSecret is required");

  const router = express.Router();

  // GET /api/cars
  router.get("/", requireAuthed, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, photo_url, plate, make_model,
                itp_date, itp_years, itp_months,
                rca_date,
                casco_start, casco_months,
                rovinieta_start, rovinieta_months,
                vin, civ, color,
                engine_cc, power_kw, total_mass,
                fuel, year,
                created_at, updated_at
           FROM public.cars
           ORDER BY plate NULLS LAST, id ASC`
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "db_error", detail: String(e?.message || e) });
    }
  });

  // POST /api/cars
  router.post("/", requireAdminOrSecret, async (req, res) => {
    const b = req.body || {};
    const cascoMonths = [1, 3, 6, 12].includes(Number(b.casco_months)) ? Number(b.casco_months) : (b.casco_months == null ? null : Number(b.casco_months));
    const roviMonths = [1, 12].includes(Number(b.rovinieta_months)) ? Number(b.rovinieta_months) : (b.rovinieta_months == null ? null : Number(b.rovinieta_months));
    const itp = normalizeItpFromBody(b);

    try {
      const { rows } = await pool.query(
        `INSERT INTO public.cars
           (photo_url, plate, make_model,
            itp_date, itp_years, itp_months,
            rca_date,
            casco_start, casco_months,
            rovinieta_start, rovinieta_months,
            vin, civ, color,
            engine_cc, power_kw, total_mass,
            fuel, year,
            created_at, updated_at)
         VALUES
           ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20, now(), now())
         RETURNING *`,
        [
          normText(b.photo_url),
          normText(b.plate),
          normText(b.make_model),
          normDate(b.itp_date),
          itp.years ?? 1,
          itp.months ?? 12,
          normDate(b.rca_date),
          normDate(b.casco_start),
          cascoMonths,
          normDate(b.rovinieta_start),
          roviMonths,
          normText(b.vin),
          normText(b.civ),
          normText(b.color),
          normInt(b.engine_cc),
          normInt(b.power_kw),
          normInt(b.total_mass),
          normText(b.fuel),
          normInt(b.year),
        ]
      );
      res.status(201).json(rows[0]);
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes("duplicate key")) {
        return res.status(409).json({ error: "duplicate", field: "plate" });
      }
      res.status(500).json({ error: "db_error", detail: msg });
    }
  });

  // PATCH /api/cars/:id
  router.patch("/:id", requireAdminOrSecret, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });

    if (req.body && String(req.body._action || "").toLowerCase() === "delete") {
      try {
        const { rowCount } = await pool.query("DELETE FROM public.cars WHERE id = $1", [id]);
        if (!rowCount) return res.status(404).json({ error: "not_found" });
        return res.json({ ok: true });
      } catch (e) {
        return res.status(500).json({ error: "db_error", detail: String(e?.message || e) });
      }
    }

    const b = req.body || {};
    const itp = normalizeItpFromBody(b);

    // allow updating with either itp_years or itp_months
    if (itp.years != null && !Object.prototype.hasOwnProperty.call(b, "itp_years")) b.itp_years = itp.years;
    if (itp.months != null && !Object.prototype.hasOwnProperty.call(b, "itp_months")) b.itp_months = itp.months;

    const fields = [
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

    const sets = [];
    const vals = [];

    for (const k of fields) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) continue;

      if (["itp_date", "rca_date", "casco_start", "rovinieta_start"].includes(k)) {
        vals.push(normDate(b[k]));
        sets.push(`${k} = $${vals.length}`);
        continue;
      }
      if (k === "itp_years") {
        vals.push(itp.years ?? null);
        sets.push(`${k} = $${vals.length}`);
        continue;
      }
      if (k === "itp_months") {
        vals.push(itp.months ?? null);
        sets.push(`${k} = $${vals.length}`);
        continue;
      }
      if (["engine_cc", "power_kw", "total_mass", "year", "casco_months", "rovinieta_months"].includes(k)) {
        vals.push(normInt(b[k]));
        sets.push(`${k} = $${vals.length}`);
        continue;
      }

      vals.push(normText(b[k]));
      sets.push(`${k} = $${vals.length}`);
    }

    if (!sets.length) return res.status(400).json({ error: "empty_patch" });

    vals.push(id);

    try {
      const { rows } = await pool.query(
        `UPDATE public.cars
            SET ${sets.join(", ")}, updated_at = now()
          WHERE id = $${vals.length}
          RETURNING *`,
        vals
      );
      if (!rows.length) return res.status(404).json({ error: "not_found" });
      res.json(rows[0]);
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes("duplicate key")) {
        return res.status(409).json({ error: "duplicate", field: "plate" });
      }
      res.status(500).json({ error: "db_error", detail: msg });
    }
  });

  // DELETE /api/cars/:id (hard delete)
  router.delete("/:id", requireAdminOrSecret, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });

    try {
      const { rowCount } = await pool.query("DELETE FROM public.cars WHERE id = $1", [id]);
      if (!rowCount) return res.status(404).json({ error: "not_found" });
      res.status(204).end();
    } catch (e) {
      res.status(500).json({ error: "db_error", detail: String(e?.message || e) });
    }
  });

  return router;
}
