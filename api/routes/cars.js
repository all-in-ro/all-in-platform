/**
 * server/api/routes/cars.js (ESM)
 * Express router a "cars" erőforráshoz – kompatibilis "type: module" környezetben.
 * Javítva: ITP érvényesség kezelése (itp_years / itp_months) GET/POST/PATCH-ben.
 */
import express from "express";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("neon.tech")
    ? { rejectUnauthorized: true }
    : undefined,
});

async function q(text, params) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

const router = express.Router();

/* ---------------- Helpers ---------------- */
function normInt(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function normDate(v) {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return s || null;
}
/** Normalizáljuk az ITP érvényességet:
 *  - év és/vagy hónap is jöhet
 *  - ha csak év jött, hónap=év*12
 *  - év értékét 1..2 közé szorítjuk; hónapot 12/24-re
 */
function normalizeItpFromBody(b = {}) {
  let years = normInt(b.itp_years);
  let months = normInt(b.itp_months);

  // aliasok, ha a kliens több néven küld
  if (years == null) {
    years = normInt(b.itp_valid_years) ?? normInt(b.itp_interval_years) ?? normInt(b.itp_period_years) ?? normInt(b.years_itp) ?? normInt(b.itpValidityYears);
  }
  if (months == null && years != null) months = years * 12;

  if (years != null) {
    years = Math.max(1, Math.min(2, years));
  }
  if (months != null) {
    // 12 vagy 24 hónapra kerekítjük
    months = months <= 12 ? 12 : 24;
  }

  if (years != null && months == null) months = years * 12;
  if (months != null && years == null) years = months <= 12 ? 1 : 2;

  return { years, months };
}

/* ---------------- Routes ---------------- */

// GET /api/cars  → lista (most már visszaadja itp_years és itp_months-t is)
router.get("/", async (_req, res) => {
  try {
    const { rows } = await q(
      `select id, photo_url, plate, make_model, itp_date, itp_years, itp_months, rca_date,
              casco_start, casco_months, rovinieta_start, rovinieta_months, vin, civ, color,
              engine_cc, power_kw, total_mass, fuel, year, created_at, updated_at
         from public.cars
        order by plate nulls last, id asc`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "db_error", detail: String(e?.message || e) });
  }
});

// POST /api/cars  → új beszúrás (kezeli az itp_years / itp_months párost)
router.post("/", express.json(), async (req, res) => {
  const b = req.body || {};
  const cascoMonths = [1,3,6,12].includes(Number(b.casco_months)) ? Number(b.casco_months) : 12;
  const roviMonths  = [1,12].includes(Number(b.rovinieta_months)) ? Number(b.rovinieta_months) : 12;

  const itp = normalizeItpFromBody(b);

  try {
    const { rows } = await q(
      `insert into public.cars
         (photo_url, plate, make_model, itp_date, itp_years, itp_months, rca_date, casco_start, casco_months,
          rovinieta_start, rovinieta_months, vin, civ, color, engine_cc, power_kw, total_mass,
          fuel, year)
       values
         ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       returning *`,
      [
        b.photo_url ?? null,
        b.plate ?? null,
        b.make_model ?? null,
        normDate(b.itp_date),
        itp.years ?? 1,
        itp.months ?? 12,
        normDate(b.rca_date),
        normDate(b.casco_start),
        cascoMonths,
        normDate(b.rovinieta_start),
        roviMonths,
        normInt(b.vin) ? String(b.vin) : (b.vin ?? null),
        b.civ ?? null,
        b.color ?? null,
        normInt(b.engine_cc),
        normInt(b.power_kw),
        normInt(b.total_mass),
        b.fuel ?? null,
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

// PATCH /api/cars/:id  → részleges módosítás (most már írja itp_years / itp_months-t is)
router.patch("/:id", express.json(), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  const b = req.body || {};

  // ide felvesszük az új mezőket is
  const fields = [
    "photo_url","plate","make_model","itp_date","itp_years","itp_months","rca_date","casco_start","casco_months",
    "rovinieta_start","rovinieta_months","vin","civ","color","engine_cc","power_kw",
    "total_mass","fuel","year"
  ];

  // először normalizáljuk az itp párost
  const itp = normalizeItpFromBody(b);
  if (itp.years != null && !Object.prototype.hasOwnProperty.call(b, "itp_years")) b.itp_years = itp.years;
  if (itp.months != null && !Object.prototype.hasOwnProperty.call(b, "itp_months")) b.itp_months = itp.months;

  // értékek összerakása
  const sets = [];
  const vals = [];
  for (const k of fields) {
    if (Object.prototype.hasOwnProperty.call(b, k)) {
      if (k === "itp_date" || k === "rca_date" || k === "casco_start" || k === "rovinieta_start") {
        sets.push(`${k} = $${vals.length + 1}`);
        vals.push(normDate(b[k]));
      } else if (k === "itp_years") {
        sets.push(`${k} = $${vals.length + 1}`);
        vals.push(itp.years ?? null);
      } else if (k === "itp_months") {
        sets.push(`${k} = $${vals.length + 1}`);
        vals.push(itp.months ?? null);
      } else if (["engine_cc","power_kw","total_mass","year","casco_months","rovinieta_months"].includes(k)) {
        sets.push(`${k} = $${vals.length + 1}`);
        vals.push(normInt(b[k]));
      } else {
        sets.push(`${k} = $${vals.length + 1}`);
        vals.push(b[k] ?? null);
      }
    }
  }

  if (!sets.length) return res.status(400).json({ error: "empty_patch" });
  vals.push(id);

  try {
    const { rows } = await q(
      `update public.cars set ${sets.join(", ")} where id = $${vals.length} returning *`,
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

// (opcionális) DELETE /api/cars/:id
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  try {
    const { rowCount } = await q(`delete from public.cars where id = $1`, [id]);
    if (!rowCount) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "db_error", detail: String(e?.message || e) });
  }
});

export default router;
export { router };
