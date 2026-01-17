// api/routes/car-expenses.js (ESM)
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
  return String(v).slice(0, 10) || null;
}

export default function createCarExpensesRouter(ctx) {
  const { pool, requireAuthed, requireAdminOrSecret } = ctx || {};
  if (!pool || typeof pool.query !== "function") {
    throw new Error("car-expenses router requires ctx.pool (pg pool)");
  }
  if (typeof requireAuthed !== "function") {
    throw new Error("car-expenses router requires ctx.requireAuthed middleware");
  }
  if (typeof requireAdminOrSecret !== "function") {
    throw new Error("car-expenses router requires ctx.requireAdminOrSecret middleware");
  }

  const router = express.Router();

  // GET /api/car-expenses?car_id=&date_from=&date_to=&q=&category=
  router.get("/", requireAuthed, async (req, res) => {
    try {
      const { car_id, date_from, date_to, q, category } = req.query || {};

      const where = [];
      const params = [];

      if (car_id) {
        params.push(normInt(car_id));
        where.push(`e.car_id = $${params.length}`);
      }
      if (date_from) {
        params.push(normDate(date_from));
        where.push(`e.date >= $${params.length}`);
      }
      if (date_to) {
        params.push(normDate(date_to));
        where.push(`e.date <= $${params.length}`);
      }
      if (category) {
        params.push(normText(category));
        where.push(`e.category = $${params.length}`);
      }
      if (q) {
        params.push(`%${String(q)}%`);
        where.push(`(e.description ILIKE $${params.length} OR e.vendor ILIKE $${params.length} OR e.invoice_no ILIKE $${params.length})`);
      }

      const sql = `
        select
          e.*, 
          c.plate as car_plate,
          c.make_model as car_make_model
        from car_expenses e
        left join cars c on c.id = e.car_id
        ${where.length ? `where ${where.join(" and ")}` : ""}
        order by e.date desc, e.id desc
      `;

      const r = await pool.query(sql, params);
      res.json(r.rows);
    } catch (e) {
      res.status(500).json({ error: "db_error", detail: String(e?.message || e) });
    }
  });

  // POST /api/car-expenses
  router.post("/", requireAdminOrSecret, async (req, res) => {
    try {
      const b = req.body || {};
      const vals = [
        normInt(b.car_id),
        normDate(b.date) || normDate(new Date().toISOString()),
        normInt(b.odometer_km),
        normText(b.category),
        normText(b.description),
        b.cost === null || b.cost === undefined || b.cost === "" ? null : Number(b.cost),
        normText(b.currency) || "RON",
        normText(b.vendor),
        normText(b.invoice_no),
      ];

      const r = await pool.query(
        `
        insert into car_expenses (
          car_id, date, odometer_km, category, description, cost, currency, vendor, invoice_no
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        returning *
        `,
        vals
      );

      res.status(201).json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ error: "db_error", detail: String(e?.message || e) });
    }
  });

  // PATCH /api/car-expenses/:id (also supports { _action: 'delete' })
  router.patch("/:id", requireAdminOrSecret, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });

    const b = req.body || {};
    if (b && b._action === "delete") {
      try {
        const del = await pool.query(`delete from car_expenses where id = $1`, [id]);
        if (!del.rowCount) return res.status(404).json({ error: "not_found" });
        return res.json({ ok: true });
      } catch (e) {
        return res.status(500).json({ error: "db_error", detail: String(e?.message || e) });
      }
    }

    try {
      const map = {
        car_id: () => normInt(b.car_id),
        date: () => normDate(b.date),
        odometer_km: () => normInt(b.odometer_km),
        category: () => normText(b.category),
        description: () => normText(b.description),
        cost: () => (b.cost === null || b.cost === undefined || b.cost === "" ? null : Number(b.cost)),
        currency: () => normText(b.currency),
        vendor: () => normText(b.vendor),
        invoice_no: () => normText(b.invoice_no),
      };

      const sets = [];
      const params = [];

      for (const k of Object.keys(map)) {
        if (!(k in b)) continue;
        params.push(map[k]());
        sets.push(`${k} = $${params.length}`);
      }

      sets.push(`updated_at = now()`);

      params.push(id);
      const r = await pool.query(
        `update car_expenses set ${sets.join(", ")} where id = $${params.length} returning *`,
        params
      );

      if (!r.rowCount) return res.status(404).json({ error: "not_found" });
      res.json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ error: "db_error", detail: String(e?.message || e) });
    }
  });

  // DELETE /api/car-expenses/:id
  router.delete("/:id", requireAdminOrSecret, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
    try {
      const r = await pool.query(`delete from car_expenses where id = $1`, [id]);
      if (!r.rowCount) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "db_error", detail: String(e?.message || e) });
    }
  });

  return router;
}
