import express from "express";
import crypto from "crypto";

// ALL IN – Vacations / time-off
// Admin-only endpoints.
//
// Data model (DB):
// - allin_time_events: one row per employee+day+kind
//   kind:
//     - vacation : full day off
//     - short    : partial day (e.g. 4 hours "elkérezett")
//
// - allin_comp_events: compensation ledger (tartozas / kompenzacio)
//   unit: 'day' | 'hour'
//   amount: integer (positive = we owe employee, negative = we compensated/paid back)

export default function createVacationsRouter({ pool, requireAdminOrSecret }) {
  const router = express.Router();

  let ready = false;
  async function ensureTables() {
    if (ready) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS allin_time_events (
        id uuid PRIMARY KEY,
        employee_name text NOT NULL,
        day date NOT NULL,
        kind text NOT NULL,
        hours_off integer NULL,
        note text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by text NULL
      );

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'allin_time_events_kind_check'
        ) THEN
          ALTER TABLE allin_time_events
            ADD CONSTRAINT allin_time_events_kind_check
            CHECK (kind IN ('vacation','short'));
        END IF;
      END $$;

      CREATE UNIQUE INDEX IF NOT EXISTS allin_time_events_unique
        ON allin_time_events (employee_name, day, kind);

      CREATE INDEX IF NOT EXISTS allin_time_events_day
        ON allin_time_events (day);

      CREATE INDEX IF NOT EXISTS allin_time_events_employee
        ON allin_time_events (employee_name);

      CREATE TABLE IF NOT EXISTS allin_comp_events (
        id uuid PRIMARY KEY,
        employee_name text NOT NULL,
        day date NOT NULL,
        unit text NOT NULL,
        amount integer NOT NULL,
        note text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by text NULL
      );

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'allin_comp_events_unit_check'
        ) THEN
          ALTER TABLE allin_comp_events
            ADD CONSTRAINT allin_comp_events_unit_check
            CHECK (unit IN ('day','hour'));
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS allin_comp_events_day
        ON allin_comp_events (day);

      CREATE INDEX IF NOT EXISTS allin_comp_events_employee
        ON allin_comp_events (employee_name);
    `);
    ready = true;
  }

  const norm = (v) => String(v ?? "").trim();

  function monthRange(monthStr) {
    // monthStr: YYYY-MM
    const m = String(monthStr || "").trim();
    if (!/^\d{4}-\d{2}$/.test(m)) return null;
    const [yy, mm] = m.split("-").map((x) => Number(x));
    const start = new Date(Date.UTC(yy, mm - 1, 1));
    const end = new Date(Date.UTC(yy, mm, 1));
    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    };
  }

  // GET /api/admin/vacations/employees
  // Pull employees from the existing "user creation" module (login_codes).
  // We intentionally ignore shops here (as requested).
  router.get("/employees", requireAdminOrSecret, async (req, res) => {
    try {
      // Names come from login_codes.name (created in the Users module).
      const r = await pool.query(
        `
        SELECT DISTINCT trim(name) AS name
        FROM login_codes
        WHERE name IS NOT NULL AND trim(name) <> ''
        ORDER BY trim(name) ASC
        `
      );
      res.json({ items: r.rows.map((x) => ({ name: x.name })) });
    } catch (e) {
      console.error("vacations employees failed", e);
      res.status(500).json({ error: "Failed to load employees" });
    }
  });

  // GET /api/admin/vacations?month=YYYY-MM&employee=...
  router.get("/", requireAdminOrSecret, async (req, res) => {
    try {
      await ensureTables();
      const month = norm(req.query.month);
      const employee = norm(req.query.employee);
      const range = month ? monthRange(month) : null;

      const where = [];
      const args = [];
      let i = 1;

      if (range) {
        where.push(`day >= $${i++}::date`);
        args.push(range.from);
        where.push(`day < $${i++}::date`);
        args.push(range.to);
      }
      if (employee) {
        where.push(`employee_name = $${i++}`);
        args.push(employee);
      }

      const w = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const events = await pool.query(
        `
        SELECT id, employee_name AS "employeeName", day::text AS day, kind, hours_off AS "hoursOff", note,
               created_at AS "createdAt", created_by AS "createdBy"
        FROM allin_time_events
        ${w}
        ORDER BY day DESC, employee_name ASC, kind ASC
        LIMIT 2000
        `,
        args
      );

      const summary = await pool.query(
        `
        SELECT employee_name AS "employeeName",
               SUM(CASE WHEN kind='vacation' THEN 1 ELSE 0 END)::int AS "vacationDays",
               SUM(CASE WHEN kind='short' THEN 1 ELSE 0 END)::int AS "shortDays",
               SUM(CASE WHEN kind='short' THEN COALESCE(hours_off,0) ELSE 0 END)::int AS "shortHours"
        FROM allin_time_events
        ${w}
        GROUP BY employee_name
        ORDER BY employee_name ASC
        `,
        args
      );

      // Compensation ledger for the same filter (month + optional employee)
      const compItems = await pool.query(
        `
        SELECT id,
               employee_name AS "employeeName",
               day::text AS day,
               unit,
               amount,
               note,
               created_at AS "createdAt",
               created_by AS "createdBy"
        FROM allin_comp_events
        ${w}
        ORDER BY day DESC, employee_name ASC, created_at DESC
        LIMIT 2000
        `,
        args
      );

      const compSummary = await pool.query(
        `
        SELECT employee_name AS "employeeName",
               SUM(CASE WHEN unit='day'  AND amount>0 THEN amount ELSE 0 END)::int AS "creditDays",
               SUM(CASE WHEN unit='hour' AND amount>0 THEN amount ELSE 0 END)::int AS "creditHours",
               SUM(CASE WHEN unit='day'  AND amount<0 THEN -amount ELSE 0 END)::int AS "debitDays",
               SUM(CASE WHEN unit='hour' AND amount<0 THEN -amount ELSE 0 END)::int AS "debitHours",
               (SUM(CASE WHEN unit='day'  THEN amount ELSE 0 END))::int AS "balanceDays",
               (SUM(CASE WHEN unit='hour' THEN amount ELSE 0 END))::int AS "balanceHours"
        FROM allin_comp_events
        ${w}
        GROUP BY employee_name
        ORDER BY employee_name ASC
        `,
        args
      );

      res.json({ items: events.rows, summary: summary.rows, compItems: compItems.rows, compSummary: compSummary.rows });
    } catch (e) {
      console.error("vacations list failed", e);
      res.status(500).json({ error: "Failed to load vacations" });
    }
  });

  

  // GET /api/admin/vacations/summary?year=YYYY
  // Yearly totals per employee: vacation days + short days + short hours.
  router.get("/summary", requireAdminOrSecret, async (req, res) => {
    try {
      await ensureTables();
      const yearRaw = norm(req.query.year);
      const year = yearRaw ? Number(yearRaw) : new Date().getUTCFullYear();
      if (!Number.isFinite(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ error: "year must be a valid YYYY" });
      }

      const from = `${Math.trunc(year)}-01-01`;
      const to = `${Math.trunc(year) + 1}-01-01`;

      const r = await pool.query(
        `
        SELECT employee_name AS "employeeName",
               SUM(CASE WHEN kind='vacation' THEN 1 ELSE 0 END)::int AS "vacationDays",
               SUM(CASE WHEN kind='short' THEN 1 ELSE 0 END)::int AS "shortDays",
               SUM(CASE WHEN kind='short' THEN COALESCE(hours_off,0) ELSE 0 END)::int AS "shortHours"
        FROM allin_time_events
        WHERE day >= $1::date AND day < $2::date
        GROUP BY employee_name
        ORDER BY employee_name ASC
        `,
        [from, to]
      );

      const c = await pool.query(
        `
        SELECT employee_name AS "employeeName",
               SUM(CASE WHEN unit='day'  AND amount>0 THEN amount ELSE 0 END)::int AS "compCreditDays",
               SUM(CASE WHEN unit='hour' AND amount>0 THEN amount ELSE 0 END)::int AS "compCreditHours",
               SUM(CASE WHEN unit='day'  AND amount<0 THEN -amount ELSE 0 END)::int AS "compDebitDays",
               SUM(CASE WHEN unit='hour' AND amount<0 THEN -amount ELSE 0 END)::int AS "compDebitHours",
               (SUM(CASE WHEN unit='day'  THEN amount ELSE 0 END))::int AS "compBalanceDays",
               (SUM(CASE WHEN unit='hour' THEN amount ELSE 0 END))::int AS "compBalanceHours"
        FROM allin_comp_events
        WHERE day >= $1::date AND day < $2::date
        GROUP BY employee_name
        ORDER BY employee_name ASC
        `,
        [from, to]
      );

      const compMap = new Map(c.rows.map((x) => [x.employeeName, x]));

      const merged = r.rows.map((row) => {
        const cc = compMap.get(row.employeeName) || {
          compCreditDays: 0,
          compCreditHours: 0,
          compDebitDays: 0,
          compDebitHours: 0,
          compBalanceDays: 0,
          compBalanceHours: 0,
        };
        return { ...row, ...cc };
      });

      // Employees that ONLY have compensation but no time events
      for (const cc of c.rows) {
        if (merged.some((m) => m.employeeName === cc.employeeName)) continue;
        merged.push({
          employeeName: cc.employeeName,
          vacationDays: 0,
          shortDays: 0,
          shortHours: 0,
          ...cc,
        });
      }

      merged.sort((a, b) => String(a.employeeName).localeCompare(String(b.employeeName)));

      res.json({ year: Math.trunc(year), items: merged });
    } catch (e) {
      console.error("vacations summary failed", e);
      res.status(500).json({ error: "Failed to load yearly summary" });
    }
  });

  // GET /api/admin/vacations/summary.pdf?year=YYYY&employee=...
  // Server-side PDF for bookkeeping. Can generate:
  // - all employees summary (default)
  // - single employee detailed statement (if employee is provided)
  router.get("/summary.pdf", requireAdminOrSecret, async (req, res) => {
    try {
      await ensureTables();
      const yearRaw = norm(req.query.year);
      const year = yearRaw ? Number(yearRaw) : new Date().getUTCFullYear();
      if (!Number.isFinite(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ error: "year must be a valid YYYY" });
      }

      const employee = norm(req.query.employee);
      const YEAR = Math.trunc(year);
      const from = `${YEAR}-01-01`;
      const to = `${YEAR + 1}-01-01`;

      // Lazy import so the app doesn't crash if pdfkit isn't present.
      let PDFDocument;
      try {
        const mod = await import("pdfkit");
        PDFDocument = mod.default || mod;
      } catch {
        return res.status(500).json({ error: "PDF engine (pdfkit) is not installed on the server." });
      }

      // Official RO-style header (keep ASCII to avoid font/diacritics issues on servers).
      const COMPANY = "TITAN EURO-COM SRL";
      const CIF = "RO17495362";
      const genDate = new Date().toISOString().slice(0, 10);

      res.setHeader("Content-Type", "application/pdf");
      const safeEmp = employee ? employee.replace(/[^a-zA-Z0-9._ -]+/g, "").trim().replace(/\s+/g, "-") : "";
      const fileName = employee
        ? `titan-foaie-concedii-invoiri-comp-${safeEmp || "angajat"}-${YEAR}.pdf`
        : `titan-situatie-concedii-invoiri-comp-${YEAR}.pdf`;
      res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

      const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36 });
      doc.pipe(res);

      const drawHeader = (title) => {
        doc.fontSize(11).fillColor("#000000").text(COMPANY, { align: "left" });
        doc.fontSize(10).text(`CIF: ${CIF}`, { align: "left" });
        doc.moveDown(0.6);
        doc.fontSize(14).text(title, { align: "center" });
        doc.moveDown(0.2);
        doc.fontSize(11).text(`Anul: ${YEAR}`, { align: "center" });
        doc.moveDown(0.8);
      };

      const ensureSpace = (needH) => {
        if (doc.y > doc.page.height - doc.page.margins.bottom - needH) doc.addPage();
      };

      // --- Single employee detailed statement ---
      if (employee) {
        // Totals (time events)
        const t = await pool.query(
          `
          SELECT
            SUM(CASE WHEN kind='vacation' THEN 1 ELSE 0 END)::int AS "vacationDays",
            SUM(CASE WHEN kind='short' THEN 1 ELSE 0 END)::int AS "shortDays",
            SUM(CASE WHEN kind='short' THEN COALESCE(hours_off,0) ELSE 0 END)::int AS "shortHours"
          FROM allin_time_events
          WHERE employee_name = $1 AND day >= $2::date AND day < $3::date
          `,
          [employee, from, to]
        );

        // Totals (comp)
        const c = await pool.query(
          `
          SELECT
            SUM(CASE WHEN unit='day'  AND amount>0 THEN amount ELSE 0 END)::int AS "compCreditDays",
            SUM(CASE WHEN unit='hour' AND amount>0 THEN amount ELSE 0 END)::int AS "compCreditHours",
            SUM(CASE WHEN unit='day'  AND amount<0 THEN -amount ELSE 0 END)::int AS "compDebitDays",
            SUM(CASE WHEN unit='hour' AND amount<0 THEN -amount ELSE 0 END)::int AS "compDebitHours",
            (SUM(CASE WHEN unit='day'  THEN amount ELSE 0 END))::int AS "compBalanceDays",
            (SUM(CASE WHEN unit='hour' THEN amount ELSE 0 END))::int AS "compBalanceHours"
          FROM allin_comp_events
          WHERE employee_name = $1 AND day >= $2::date AND day < $3::date
          `,
          [employee, from, to]
        );

        // Lists
        const timeItems = await pool.query(
          `
          SELECT day::text AS day, kind, COALESCE(hours_off,0)::int AS hours, COALESCE(note,'') AS note
          FROM allin_time_events
          WHERE employee_name = $1 AND day >= $2::date AND day < $3::date
          ORDER BY day ASC, kind ASC
          LIMIT 4000
          `,
          [employee, from, to]
        );
        const compItems = await pool.query(
          `
          SELECT day::text AS day, unit, amount::int AS amount, COALESCE(note,'') AS note
          FROM allin_comp_events
          WHERE employee_name = $1 AND day >= $2::date AND day < $3::date
          ORDER BY day ASC
          LIMIT 4000
          `,
          [employee, from, to]
        );

        drawHeader("FOAIE CONCEDII / INVOIRI / COMPENSARI");
        doc.fontSize(11).fillColor("#000000").text(`Angajat: ${employee}`, { align: "left" });
        doc.moveDown(0.6);

        const totalsT = t.rows?.[0] || { vacationDays: 0, shortDays: 0, shortHours: 0 };
        const totalsC = c.rows?.[0] || {
          compCreditDays: 0,
          compCreditHours: 0,
          compDebitDays: 0,
          compDebitHours: 0,
          compBalanceDays: 0,
          compBalanceHours: 0,
        };

        doc.fontSize(10)
          .fillColor("#000000")
          .text(
            `Concediu: ${totalsT.vacationDays ?? 0} zile   |   Invoire: ${totalsT.shortDays ?? 0} zile / ${totalsT.shortHours ?? 0} ore`,
            { align: "left" }
          );
        doc.moveDown(0.2);
        doc.text(
          `Compensari (tartozas): +${totalsC.compCreditDays ?? 0} zile, +${totalsC.compCreditHours ?? 0} ore   |   Compensat: -${totalsC.compDebitDays ?? 0} zile, -${totalsC.compDebitHours ?? 0} ore`,
          { align: "left" }
        );
        doc.moveDown(0.2);
        doc.text(
          `Echilibru (sold): ${totalsC.compBalanceDays ?? 0} zile, ${totalsC.compBalanceHours ?? 0} ore`,
          { align: "left" }
        );
        doc.moveDown(0.8);

        // Table 1: time events
        doc.fontSize(11).text("Detalii concedii / invoiri", { align: "left" });
        doc.moveDown(0.3);
        const x0 = doc.x;
        const rowH = 18;
        const col1 = { day: 90, kind: 110, hours: 80, note: 255 };
        const w1 = col1.day + col1.kind + col1.hours + col1.note;
        const header1 = doc.y;
        doc.save();
        doc.rect(x0, header1 - 2, w1, rowH).fill("#F2F2F2");
        doc.restore();
        doc.fontSize(10).fillColor("#000000");
        doc.text("Data", x0 + 4, header1 + 3, { width: col1.day - 8 });
        doc.text("Tip", x0 + col1.day, header1 + 3, { width: col1.kind - 8 });
        doc.text("Ore", x0 + col1.day + col1.kind, header1 + 3, { width: col1.hours - 8, align: "right" });
        doc.text("Observatii", x0 + col1.day + col1.kind + col1.hours, header1 + 3, { width: col1.note - 8 });
        doc.moveTo(x0, header1 + rowH).lineTo(x0 + w1, header1 + rowH).strokeColor("#999999").stroke();
        let y = header1 + rowH + 2;
        for (const row of timeItems.rows) {
          ensureSpace(120);
          if (y > doc.page.height - doc.page.margins.bottom - rowH - 80) {
            doc.addPage();
            y = doc.y;
          }
          const kindLabel = row.kind === "vacation" ? "Concediu" : "Invoire";
          const hoursVal = row.kind === "short" ? String(row.hours || 0) : "-";
          doc.fontSize(10).fillColor("#000000");
          doc.text(String(row.day || ""), x0 + 4, y + 3, { width: col1.day - 8 });
          doc.text(kindLabel, x0 + col1.day, y + 3, { width: col1.kind - 8 });
          doc.text(hoursVal, x0 + col1.day + col1.kind, y + 3, { width: col1.hours - 8, align: "right" });
          doc.text(String(row.note || ""), x0 + col1.day + col1.kind + col1.hours, y + 3, { width: col1.note - 8 });
          doc.moveTo(x0, y + rowH).lineTo(x0 + w1, y + rowH).strokeColor("#E0E0E0").stroke();
          y += rowH;
        }

        doc.moveDown(0.8);
        ensureSpace(180);

        // Table 2: compensation ledger
        doc.fontSize(11).text("Detalii compensari (tartozas / echilibrare)", { align: "left" });
        doc.moveDown(0.3);
        const x2 = doc.x;
        const col2 = { day: 90, dir: 150, val: 90, note: 205 };
        const w2 = col2.day + col2.dir + col2.val + col2.note;
        const header2 = doc.y;
        doc.save();
        doc.rect(x2, header2 - 2, w2, rowH).fill("#F2F2F2");
        doc.restore();
        doc.fontSize(10).fillColor("#000000");
        doc.text("Data", x2 + 4, header2 + 3, { width: col2.day - 8 });
        doc.text("Tip", x2 + col2.day, header2 + 3, { width: col2.dir - 8 });
        doc.text("Valoare", x2 + col2.day + col2.dir, header2 + 3, { width: col2.val - 8, align: "right" });
        doc.text("Observatii", x2 + col2.day + col2.dir + col2.val, header2 + 3, { width: col2.note - 8 });
        doc.moveTo(x2, header2 + rowH).lineTo(x2 + w2, header2 + rowH).strokeColor("#999999").stroke();
        let y2 = header2 + rowH + 2;
        for (const row of compItems.rows) {
          if (y2 > doc.page.height - doc.page.margins.bottom - rowH - 80) {
            doc.addPage();
            y2 = doc.y;
          }
          const isCredit = Number(row.amount || 0) > 0;
          const unitLabel = row.unit === "day" ? "zile" : "ore";
          const typeLabel = isCredit ? "De primit (+)" : "Compensat (-)";
          const valueLabel = `${Math.abs(Number(row.amount || 0))} ${unitLabel}`;
          doc.fontSize(10).fillColor("#000000");
          doc.text(String(row.day || ""), x2 + 4, y2 + 3, { width: col2.day - 8 });
          doc.text(typeLabel, x2 + col2.day, y2 + 3, { width: col2.dir - 8 });
          doc.text(valueLabel, x2 + col2.day + col2.dir, y2 + 3, { width: col2.val - 8, align: "right" });
          doc.text(String(row.note || ""), x2 + col2.day + col2.dir + col2.val, y2 + 3, { width: col2.note - 8 });
          doc.moveTo(x2, y2 + rowH).lineTo(x2 + w2, y2 + rowH).strokeColor("#E0E0E0").stroke();
          y2 += rowH;
        }

        doc.moveDown(1.2);
        doc.fontSize(9).fillColor("#333333").text(`Data generarii: ${genDate}`, { align: "left" });
        doc.moveDown(1.2);

        // Signatures (3 columns)
        const sigBoxH = 80;
        if (doc.y > doc.page.height - doc.page.margins.bottom - sigBoxH) doc.addPage();
        doc.y = doc.page.height - doc.page.margins.bottom - sigBoxH;
        const sigY = doc.y;
        const totalW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const gap = 16;
        const third = (totalW - gap * 2) / 3;
        doc.fontSize(10).fillColor("#000000");
        doc.text("Administrator", doc.page.margins.left, sigY, { width: third });
        doc.text("Intocmit", doc.page.margins.left + third + gap, sigY, { width: third });
        doc.text("Angajat (luat la cunostinta)", doc.page.margins.left + (third + gap) * 2, sigY, { width: third });
        doc.moveDown(0.6);
        const lineY = doc.y + 10;
        const xL = doc.page.margins.left;
        doc.moveTo(xL, lineY).lineTo(xL + third, lineY).strokeColor("#000000").stroke();
        doc.moveTo(xL + third + gap, lineY).lineTo(xL + third + gap + third, lineY).strokeColor("#000000").stroke();
        doc.moveTo(xL + (third + gap) * 2, lineY).lineTo(xL + (third + gap) * 2 + third, lineY).strokeColor("#000000").stroke();

        doc.end();
        return;
      }

      // --- All employees summary ---
      const r = await pool.query(
        `
        SELECT employee_name AS "employeeName",
               SUM(CASE WHEN kind='vacation' THEN 1 ELSE 0 END)::int AS "vacationDays",
               SUM(CASE WHEN kind='short' THEN 1 ELSE 0 END)::int AS "shortDays",
               SUM(CASE WHEN kind='short' THEN COALESCE(hours_off,0) ELSE 0 END)::int AS "shortHours"
        FROM allin_time_events
        WHERE day >= $1::date AND day < $2::date
        GROUP BY employee_name
        ORDER BY employee_name ASC
        `,
        [from, to]
      );
      const c = await pool.query(
        `
        SELECT employee_name AS "employeeName",
               (SUM(CASE WHEN unit='day'  THEN amount ELSE 0 END))::int AS "compBalanceDays",
               (SUM(CASE WHEN unit='hour' THEN amount ELSE 0 END))::int AS "compBalanceHours"
        FROM allin_comp_events
        WHERE day >= $1::date AND day < $2::date
        GROUP BY employee_name
        ORDER BY employee_name ASC
        `,
        [from, to]
      );
      const compMap = new Map(c.rows.map((x) => [x.employeeName, x]));
      const merged = r.rows.map((row) => {
        const cc = compMap.get(row.employeeName) || { compBalanceDays: 0, compBalanceHours: 0 };
        return { ...row, ...cc };
      });

      drawHeader("SITUATIE CONCEDII / INVOIRI / COMPENSARI");

      const x0 = doc.x;
      const rowH = 18;
      const col = { name: 215, vac: 80, sday: 80, sh: 80, cbd: 80, cbh: 80 };
      const tableW = col.name + col.vac + col.sday + col.sh + col.cbd + col.cbh;

      const yHeader = doc.y;
      doc.save();
      doc.rect(x0, yHeader - 2, tableW, rowH).fill("#F2F2F2");
      doc.restore();

      doc.fontSize(9).fillColor("#000000");
      doc.text("Nume", x0 + 4, yHeader + 3, { width: col.name - 8 });
      doc.text("Concediu", x0 + col.name, yHeader + 3, { width: col.vac, align: "right" });
      doc.text("Invoire(z)", x0 + col.name + col.vac, yHeader + 3, { width: col.sday, align: "right" });
      doc.text("Invoire(o)", x0 + col.name + col.vac + col.sday, yHeader + 3, { width: col.sh, align: "right" });
      doc.text("Sold(z)", x0 + col.name + col.vac + col.sday + col.sh, yHeader + 3, { width: col.cbd, align: "right" });
      doc.text("Sold(o)", x0 + col.name + col.vac + col.sday + col.sh + col.cbd, yHeader + 3, { width: col.cbh, align: "right" });

      doc.moveTo(x0, yHeader + rowH).lineTo(x0 + tableW, yHeader + rowH).strokeColor("#999999").stroke();

      let y = yHeader + rowH + 2;
      for (const row of merged) {
        if (y > doc.page.height - doc.page.margins.bottom - rowH - 80) {
          doc.addPage();
          y = doc.y;
        }
        doc.fontSize(10).fillColor("#000000");
        doc.text(String(row.employeeName || ""), x0 + 4, y + 3, { width: col.name - 8 });
        doc.text(String(row.vacationDays ?? 0), x0 + col.name, y + 3, { width: col.vac, align: "right" });
        doc.text(String(row.shortDays ?? 0), x0 + col.name + col.vac, y + 3, { width: col.sday, align: "right" });
        doc.text(String(row.shortHours ?? 0), x0 + col.name + col.vac + col.sday, y + 3, { width: col.sh, align: "right" });
        doc.text(String(row.compBalanceDays ?? 0), x0 + col.name + col.vac + col.sday + col.sh, y + 3, { width: col.cbd, align: "right" });
        doc.text(String(row.compBalanceHours ?? 0), x0 + col.name + col.vac + col.sday + col.sh + col.cbd, y + 3, { width: col.cbh, align: "right" });
        doc.moveTo(x0, y + rowH).lineTo(x0 + tableW, y + rowH).strokeColor("#E0E0E0").stroke();
        y += rowH;
      }

      doc.moveDown(1.2);
      doc.fontSize(9).fillColor("#333333").text(`Data generarii: ${genDate}`, { align: "left" });
      doc.moveDown(1.6);

      // Signatures
      const sigBoxH2 = 70;
      if (doc.y > doc.page.height - doc.page.margins.bottom - sigBoxH2) doc.addPage();
      doc.y = doc.page.height - doc.page.margins.bottom - sigBoxH2;
      const sigY = doc.y;
      const half = (tableW - 20) / 2;
      doc.fontSize(10).fillColor("#000000");
      doc.text("Administrator", x0, sigY, { width: half, align: "left" });
      doc.text("Intocmit", x0 + half + 20, sigY, { width: half, align: "left" });
      doc.moveDown(0.4);
      const lineY = doc.y + 10;
      doc.moveTo(x0, lineY).lineTo(x0 + half, lineY).strokeColor("#000000").stroke();
      doc.moveTo(x0 + half + 20, lineY).lineTo(x0 + half + 20 + half, lineY).strokeColor("#000000").stroke();

      doc.end();
    } catch (e) {
      console.error("vacations summary pdf failed", e);
      if (!res.headersSent) res.status(500).json({ error: "Failed to generate PDF" });
    }
  });

  // POST /api/admin/vacations/comp
  // Body:
  // { employeeName, day:'YYYY-MM-DD', unit:'day'|'hour', amount:number (positive=owe, negative=compensated), note:string }
  router.post("/comp", requireAdminOrSecret, express.json(), async (req, res) => {
    try {
      await ensureTables();
      const body = req.body || {};
      const employeeName = norm(body.employeeName);
      const day = norm(body.day);
      const unit = norm(body.unit);
      const noteRaw = body.note != null ? String(body.note) : "";
      const note = noteRaw.trim();

      const amountRaw = body.amount;
      const amountNum = Number(amountRaw);
      const amount = Number.isFinite(amountNum) ? Math.trunc(amountNum) : NaN;

      if (!employeeName) return res.status(400).json({ error: "employeeName required" });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return res.status(400).json({ error: "day must be YYYY-MM-DD" });
      if (!['day','hour'].includes(unit)) return res.status(400).json({ error: "unit must be day|hour" });
      if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: "amount must be non-zero" });
      if (!note) return res.status(400).json({ error: "note required" });

      // Guardrails
      if (unit === "day" && (amount < -62 || amount > 62)) return res.status(400).json({ error: "day amount too large" });
      if (unit === "hour" && (amount < -24 || amount > 24)) return res.status(400).json({ error: "hour amount too large" });

      const id = crypto.randomUUID();
      const createdBy = String(req.session?.actor || req.session?.role || "ADMIN");

      await pool.query(
        `
        INSERT INTO allin_comp_events (id, employee_name, day, unit, amount, note, created_by)
        VALUES ($1,$2,$3::date,$4,$5,$6,$7)
        `,
        [id, employeeName, day, unit, amount, note, createdBy]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error("vacations comp create failed", e);
      res.status(500).json({ error: "Failed to save compensation" });
    }
  });

  // DELETE /api/admin/vacations/comp/:id
  router.delete("/comp/:id", requireAdminOrSecret, async (req, res) => {
    try {
      await ensureTables();
      const id = norm(req.params.id);
      if (!id) return res.status(400).json({ error: "id required" });

      const r = await pool.query(`DELETE FROM allin_comp_events WHERE id = $1`, [id]);
      if (!r.rowCount) return res.status(404).json({ error: "Not found" });

      res.json({ ok: true });
    } catch (e) {
      console.error("vacations comp delete failed", e);
      res.status(500).json({ error: "Failed to delete compensation" });
    }
  });

// POST /api/admin/vacations
  // Body:
  // Vacation can be a single day or a period:
  // { employeeName, day?: 'YYYY-MM-DD', dayFrom?: 'YYYY-MM-DD', dayTo?: 'YYYY-MM-DD', kind: 'vacation'|'short', hoursOff?: number, note?: string }
  router.post("/", requireAdminOrSecret, express.json(), async (req, res) => {
    try {
      await ensureTables();

      const body = req.body || {};
      const employeeName = norm(body.employeeName);
      const day = norm(body.day);
      const dayFrom = norm(body.dayFrom);
      const dayTo = norm(body.dayTo);
      const kind = norm(body.kind);
      const note = body.note != null ? String(body.note) : null;

      const hoursOffRaw = body.hoursOff;
      const hoursOff = hoursOffRaw === null || hoursOffRaw === undefined || String(hoursOffRaw).trim() === ""
        ? null
        : Number(hoursOffRaw);

      if (!employeeName) return res.status(400).json({ error: "employeeName required" });
      if (!['vacation','short'].includes(kind)) return res.status(400).json({ error: "kind must be vacation|short" });

      // Vacation: support single day OR period.
      // - Prefer dayFrom/dayTo if present.
      // - Fallback to day.
      const startDay = dayFrom || day;
      const endDay = dayTo || startDay;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDay)) return res.status(400).json({ error: "day/dayFrom must be YYYY-MM-DD" });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(endDay)) return res.status(400).json({ error: "dayTo must be YYYY-MM-DD" });

      const startDate = new Date(`${startDay}T00:00:00Z`);
      const endDate = new Date(`${endDay}T00:00:00Z`);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return res.status(400).json({ error: "Invalid date" });
      }
      if (endDate.getTime() < startDate.getTime()) {
        return res.status(400).json({ error: "dayTo must be on or after dayFrom" });
      }

      // Guardrail: humans love clicking too much.
      // Keep it sane (max 62 days).
      const diffDays = Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 3600 * 1000)) + 1;
      if (diffDays > 62) {
        return res.status(400).json({ error: "Vacation period too long (max 62 days)" });
      }

      let hours = null;
      if (kind === "short") {
        // Default to 4 hours if nothing provided.
        // Allow 1..12 hours (user requested that it can be 1 hour too).
        const h = Number.isFinite(hoursOff) ? Math.trunc(hoursOff) : 4;
        if (h < 1 || h > 12) return res.status(400).json({ error: "hoursOff must be between 1 and 12" });
        hours = h;
      }

      const createdBy = String(req.session?.actor || req.session?.role || "ADMIN");

      // Save:
      // - short: exactly one day
      // - vacation: one or many days (period)
      if (kind === "short") {
        const id = crypto.randomUUID();
        await pool.query(
          `
          INSERT INTO allin_time_events (id, employee_name, day, kind, hours_off, note, created_by)
          VALUES ($1,$2,$3::date,$4,$5,$6,$7)
          ON CONFLICT (employee_name, day, kind)
          DO UPDATE SET hours_off = EXCLUDED.hours_off,
                        note = EXCLUDED.note
          `,
          [id, employeeName, startDay, kind, hours, note, createdBy]
        );
      } else {
        await pool.query("BEGIN");
        try {
          for (let n = 0; n < diffDays; n++) {
            const d = new Date(startDate.getTime() + n * 24 * 3600 * 1000);
            const yyyy = d.getUTCFullYear();
            const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
            const dd = String(d.getUTCDate()).padStart(2, "0");
            const dayStr = `${yyyy}-${mm}-${dd}`;
            const id = crypto.randomUUID();

            await pool.query(
              `
              INSERT INTO allin_time_events (id, employee_name, day, kind, hours_off, note, created_by)
              VALUES ($1,$2,$3::date,'vacation',NULL,$4,$5)
              ON CONFLICT (employee_name, day, kind)
              DO UPDATE SET note = EXCLUDED.note
              `,
              [id, employeeName, dayStr, note, createdBy]
            );
          }
          await pool.query("COMMIT");
        } catch (e) {
          await pool.query("ROLLBACK");
          throw e;
        }
      }

      res.json({ ok: true });
    } catch (e) {
      console.error("vacations create failed", e);
      res.status(500).json({ error: "Failed to save" });
    }
  });

  // DELETE /api/admin/vacations/:id
  router.delete("/:id", requireAdminOrSecret, async (req, res) => {
    try {
      await ensureTables();
      const id = norm(req.params.id);
      if (!id) return res.status(400).json({ error: "id required" });

      const r = await pool.query(`DELETE FROM allin_time_events WHERE id = $1`, [id]);
      if (!r.rowCount) return res.status(404).json({ error: "Not found" });

      res.json({ ok: true });
    } catch (e) {
      console.error("vacations delete failed", e);
      res.status(500).json({ error: "Failed to delete" });
    }
  });

  return router;
}
