/**
 * server/api/routes/car-expenses.js (ESM)
 * ALL IN – Car expenses router (modular)
 *
 * Mount:
 *   app.use('/api/car-expenses', createCarExpensesRouter({ pool, requireAuthed, requireAdminOrSecret }))
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

function normNum(v) {
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
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export default function createCarExpensesRouter({ pool, requireAuthed, requireAdminOrSecret }) {
  if (!pool) throw new Error("createCarExpensesRouter: pool is required");
  if (typeof requireAuthed !== "function") throw new Error("createCarExpensesRouter: requireAuthed is required");
  if (typeof requireAdminOrSecret !== "function") throw new Error("createCarExpensesRouter: requireAdminOrSecret is required");

  const router = express.Router();

  // GET /api/car-expenses?car_id=&date_from=&date_to=&q=&category=&limit=&offset=
  router.get("/", requireAuthed, async (req, res) => {
    try {
      const car_id = req.query.car_id ? Number(req.query.car_id) : null;
      const date_from = normDate(req.query.date_from);
      const date_to = normDate(req.query.date_to);
      const qtext = (req.query.q || "").toString().trim();
      const category = (req.query.category || "").toString().trim();
      const limit = Math.max(0, Math.min(500, Number(req.query.limit) || 200));
      const offset = Math.max(0, Number(req.query.offset) || 0);

      const where = [];
      const params = [];

      if (car_id) {
        params.push(car_id);
        where.push(`e.car_id = $${params.length}`);
      }
      if (date_from) {
        params.push(date_from);
        where.push(`e.date >= $${params.length}`);
      }
      if (date_to) {
        params.push(date_to);
        where.push(`e.date <= $${params.length}`);
      }
      if (category) {
        params.push(`%${category}%`);
        where.push(`e.category ILIKE $${params.length}`);
      }
      if (qtext) {
        params.push(`%${qtext}%`);
        const a = params.length;
        params.push(`%${qtext}%`, `%${qtext}%`, `%${qtext}%`, `%${qtext}%`);
        where.push(
          `(e.vendor ILIKE $${a} OR e.invoice_no ILIKE $${a + 1} OR e.description ILIKE $${a + 2} OR c.plate ILIKE $${a + 3} OR c.make_model ILIKE $${a + 4})`
        );
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const sql = `
        SELECT e.*, c.plate, c.make_model
        FROM car_expenses e
        LEFT JOIN cars c ON c.id = e.car_id
        ${whereSql}
        ORDER BY e.date DESC, e.id DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      const { rows } = await pool.query(sql, params);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "db_error", detail: String(e?.message || e) });
    }
  });

  // POST /api/car-expenses
  router.post("/", requireAdminOrSecret, async (req, res) => {
    try {
      const b = req.body || {};

      const car_id = b.car_id == null || b.car_id === "" ? null : Number(b.car_id);
      const date = normDate(b.date);
      if (!date) return res.status(400).json({ error: "invalid_date" });

      const odometer_km = b.odometer_km == null ? null : normInt(b.odometer_km);
      const category = normText(b.category);
      const description = normText(b.description);
      const cost = normNum(b.cost);
      const currency = (b.currency || "RON").toString().toUpperCase().slice(0, 8);
      const vendor = normText(b.vendor);
      const invoice_no = normText(b.invoice_no);

      const { rows } = await pool.query(
        `INSERT INTO car_expenses (car_id, date, odometer_km, category, description, cost, currency, vendor, invoice_no, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now(), now())
         RETURNING *`,
        [car_id, date, odometer_km, category, description, cost, currency, vendor, invoice_no]
      );

      // return enriched row (plate, make_model)
      const id = rows[0]?.id;
      if (!id) return res.status(201).json(rows[0]);

      const withCar = await pool.query(
        `SELECT e.*, c.plate, c.make_model
           FROM car_expenses e
           LEFT JOIN cars c ON c.id = e.car_id
          WHERE e.id = $1`,
        [id]
      );

      res.status(201).json(withCar.rows[0] || rows[0]);
    } catch (e) {
      res.status(500).json({ error: "db_error", detail: String(e?.message || e) });
    }
  });

  // PATCH /api/car-expenses/:id
  router.patch("/:id", requireAdminOrSecret, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });

      if (req.body && String(req.body._action || "").toLowerCase() === "delete") {
        const del = await pool.query("DELETE FROM car_expenses WHERE id=$1", [id]);
        if (!del.rowCount) return res.status(404).json({ error: "not_found" });
        return res.json({ ok: true });
      }

      const b = req.body || {};

      const sets = [];
      const params = [];
      const set = (col, val) => {
        params.push(val);
        sets.push(`${col} = $${params.length}`);
      };

      if (Object.prototype.hasOwnProperty.call(b, "car_id")) set("car_id", b.car_id == null || b.car_id === "" ? null : Number(b.car_id));
      if (Object.prototype.hasOwnProperty.call(b, "date")) set("date", normDate(b.date));
      if (Object.prototype.hasOwnProperty.call(b, "odometer_km")) set("odometer_km", b.odometer_km == null ? null : normInt(b.odometer_km));
      if (Object.prototype.hasOwnProperty.call(b, "category")) set("category", normText(b.category));
      if (Object.prototype.hasOwnProperty.call(b, "description")) set("description", normText(b.description));
      if (Object.prototype.hasOwnProperty.call(b, "cost")) set("cost", normNum(b.cost));
      if (Object.prototype.hasOwnProperty.call(b, "currency")) set("currency", (b.currency || "RON").toString().toUpperCase().slice(0, 8));
      if (Object.prototype.hasOwnProperty.call(b, "vendor")) set("vendor", normText(b.vendor));
      if (Object.prototype.hasOwnProperty.call(b, "invoice_no")) set("invoice_no", normText(b.invoice_no));

      if (!sets.length) return res.status(400).json({ error: "no_fields" });

      params.push(id);

      const upd = await pool.query(
        `UPDATE car_expenses
            SET ${sets.join(", ")}, updated_at = now()
          WHERE id = $${params.length}
          RETURNING *`,
        params
      );

      if (!upd.rowCount) return res.status(404).json({ error: "not_found" });

      const withCar = await pool.query(
        `SELECT e.*, c.plate, c.make_model
           FROM car_expenses e
           LEFT JOIN cars c ON c.id = e.car_id
          WHERE e.id = $1`,
        [id]
      );

      res.json(withCar.rows[0] || upd.rows[0]);
    } catch (e) {
      res.status(500).json({ error: "db_error", detail: String(e?.message || e) });
    }
  });

  // DELETE /api/car-expenses/:id
  router.delete("/:id", requireAdminOrSecret, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });

      const del = await pool.query("DELETE FROM car_expenses WHERE id=$1", [id]);
      if (!del.rowCount) return res.status(404).json({ error: "not_found" });
      res.status(204).end();
    } catch (e) {
      res.status(500).json({ error: "db_error", detail: String(e?.message || e) });
    }
  });

  return router;
}
