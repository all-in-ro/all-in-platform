import express from "express";
import crypto from "crypto";
import fs from "fs";

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

  const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];
  const DAY_NAMES_HU = { 1: "Hétfő", 2: "Kedd", 3: "Szerda", 4: "Csütörtök", 5: "Péntek", 6: "Szombat", 7: "Vasárnap" };
  const DAY_NAMES_RO = { 1: "Luni", 2: "Marti", 3: "Miercuri", 4: "Joi", 5: "Vineri", 6: "Sambata", 7: "Duminica" };

  function normalizeWorkingDays(value) {
    const raw = Array.isArray(value) ? value : DEFAULT_WORKING_DAYS;
    const unique = Array.from(new Set(raw.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 1 && item <= 7))).sort((a, b) => a - b);
    return unique.length ? unique : [...DEFAULT_WORKING_DAYS];
  }

  function isoDow(date) {
    const utc = date.getUTCDay();
    return utc === 0 ? 7 : utc;
  }

  function periodInfo(startDay, endDay, workingDays) {
    const start = new Date(`${startDay}T00:00:00Z`);
    const end = new Date(`${endDay}T00:00:00Z`);
    const days = [];
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return { calendarDays: 0, workingDays: 0, excludedDays: 0, dates: [] };
    }
    const enabled = new Set(normalizeWorkingDays(workingDays));
    for (let time = start.getTime(); time <= end.getTime(); time += 24 * 3600 * 1000) {
      const current = new Date(time);
      const day = current.toISOString().slice(0, 10);
      days.push({ day, isoDow: isoDow(current), working: enabled.has(isoDow(current)) });
    }
    const counted = days.filter((item) => item.working).length;
    return { calendarDays: days.length, workingDays: counted, excludedDays: days.length - counted, dates: days };
  }

  async function loadVacationSettings() {
    const result = await pool.query(`
      SELECT working_days AS "workingDays", updated_at AS "updatedAt", updated_by AS "updatedBy"
      FROM allin_vacation_settings
      WHERE id = 1
    `);
    const row = result.rows?.[0] || {};
    const workingDays = normalizeWorkingDays(row.workingDays);
    return {
      workingDays,
      dayNames: workingDays.map((day) => DAY_NAMES_HU[day]),
      dayNamesRo: workingDays.map((day) => DAY_NAMES_RO[day]),
      updatedAt: row.updatedAt || null,
      updatedBy: row.updatedBy || null,
    };
  }

  async function cleanupDisabledVacationRows(workingDays) {
    const enabled = normalizeWorkingDays(workingDays);
    const result = await pool.query(
      `DELETE FROM allin_time_events
       WHERE kind = 'vacation'
         AND NOT ((EXTRACT(ISODOW FROM day))::int = ANY($1::int[]))`,
      [enabled]
    );
    return Number(result.rowCount || 0);
  }

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

      CREATE TABLE IF NOT EXISTS allin_vacation_settings (
        id smallint PRIMARY KEY CHECK (id = 1),
        working_days smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::smallint[],
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by text NULL
      );

      INSERT INTO allin_vacation_settings (id, working_days)
      VALUES (1, ARRAY[1,2,3,4,5]::smallint[])
      ON CONFLICT (id) DO NOTHING;
    `);
    const settings = await loadVacationSettings();
    await cleanupDisabledVacationRows(settings.workingDays);
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

  // GET /api/admin/vacations/settings
  router.get("/settings", requireAdminOrSecret, async (req, res) => {
    try {
      await ensureTables();
      const settings = await loadVacationSettings();
      res.json({ settings });
    } catch (e) {
      console.error("vacations settings load failed", e);
      res.status(500).json({ error: "Failed to load vacation settings" });
    }
  });

  // PUT /api/admin/vacations/settings
  router.put("/settings", requireAdminOrSecret, express.json(), async (req, res) => {
    try {
      await ensureTables();
      const workingDays = normalizeWorkingDays(req.body?.workingDays);
      if (!Array.isArray(req.body?.workingDays) || !req.body.workingDays.length) {
        return res.status(400).json({ error: "At least one working day is required" });
      }
      const updatedBy = String(req.session?.actor || req.session?.role || "ADMIN");
      await pool.query(
        `UPDATE allin_vacation_settings
         SET working_days = $1::smallint[], updated_at = now(), updated_by = $2
         WHERE id = 1`,
        [workingDays, updatedBy]
      );
      const removedVacationRows = await cleanupDisabledVacationRows(workingDays);
      const settings = await loadVacationSettings();
      res.json({ ok: true, settings, removedVacationRows });
    } catch (e) {
      console.error("vacations settings save failed", e);
      res.status(500).json({ error: "Failed to save vacation settings" });
    }
  });

  // GET /api/admin/vacations/activity-months?employee=...
  router.get("/activity-months", requireAdminOrSecret, async (req, res) => {
    try {
      await ensureTables();
      const employee = norm(req.query.employee);
      if (!employee) return res.status(400).json({ error: "employee required" });
      const result = await pool.query(
        `SELECT to_char(day, 'YYYY-MM') AS month,
                COUNT(*)::int AS "vacationDays",
                MIN(day)::text AS "firstDay",
                MAX(day)::text AS "lastDay"
         FROM allin_time_events
         WHERE employee_name = $1 AND kind = 'vacation'
         GROUP BY to_char(day, 'YYYY-MM')
         ORDER BY month DESC
         LIMIT 120`,
        [employee]
      );
      res.json({ items: result.rows });
    } catch (e) {
      console.error("vacations activity months failed", e);
      res.status(500).json({ error: "Failed to load vacation months" });
    }
  });

  // GET /api/admin/vacations/request.pdf?employee=...&dayFrom=YYYY-MM-DD&dayTo=YYYY-MM-DD
  router.get("/request.pdf", requireAdminOrSecret, async (req, res) => {
    try {
      await ensureTables();
      const employee = norm(req.query.employee);
      const dayFrom = norm(req.query.dayFrom);
      const dayTo = norm(req.query.dayTo || req.query.dayFrom);
      if (!employee) return res.status(400).json({ error: "employee required" });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dayTo)) {
        return res.status(400).json({ error: "dayFrom/dayTo must be YYYY-MM-DD" });
      }
      const settings = await loadVacationSettings();
      const info = periodInfo(dayFrom, dayTo, settings.workingDays);
      if (!info.calendarDays || info.workingDays <= 0) {
        return res.status(400).json({ error: "The selected period contains no working days" });
      }

      let PDFDocument;
      try {
        const mod = await import("pdfkit");
        PDFDocument = mod.default || mod;
      } catch {
        return res.status(500).json({ error: "PDF engine (pdfkit) is not installed on the server." });
      }

      const safeEmployee = employee.replace(/[^a-zA-Z0-9._ -]+/g, "").trim().replace(/\s+/g, "-") || "angajat";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename=cerere-concediu-${safeEmployee}-${dayFrom}-${dayTo}.pdf`);

      const doc = new PDFDocument({ size: "A4", margin: 0 });
      doc.pipe(res);

      const regularCandidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
      ];
      const boldCandidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
      ];
      const regular = regularCandidates.find((candidate) => fs.existsSync(candidate));
      const bold = boldCandidates.find((candidate) => fs.existsSync(candidate));
      if (regular) doc.registerFont("AllInRegular", regular);
      if (bold) doc.registerFont("AllInBold", bold);
      const fontRegular = regular ? "AllInRegular" : "Helvetica";
      const fontBold = bold ? "AllInBold" : "Helvetica-Bold";

      const roDate = (value) => {
        const date = new Date(`${value}T12:00:00Z`);
        return new Intl.DateTimeFormat("ro-RO", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          timeZone: "UTC",
        }).format(date);
      };
      const generated = new Intl.DateTimeFormat("ro-RO", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date());
      const schedule = settings.dayNamesRo.join(" - ");

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const frameX = 48;
      const frameY = 36;
      const contentX = 60;
      const contentWidth = pageWidth - 120;
      const teal = "#2a8d8b";
      const darkTeal = "#173f3d";
      const ink = "#172033";
      const muted = "#64748b";
      const border = "#d5e2df";
      const pale = "#f2f8f7";

      const requestText = `Subsemnatul/Subsemnata ${employee}, va rog sa aprobati efectuarea concediului de odihna in perioada ${roDate(dayFrom)} - ${roDate(dayTo)}.`;
      doc.font(fontRegular).fontSize(9.5);
      const requestHeight = doc.heightOfString(requestText, { width: contentWidth, lineGap: 2 });
      // The internal note remains stored in AllIn, but is intentionally not printed on the official request.
      const declaration = "Declar ca am luat la cunostinta obligatia de a reveni la serviciu in prima zi lucratoare dupa incheierea perioadei aprobate.";
      doc.font(fontRegular).fontSize(8.8);
      const declarationHeight = Math.max(38, doc.heightOfString(declaration, { width: contentWidth - 24, lineGap: 2 }) + 18);

      const headerY = 54;
      const titleY = 128;
      const recipientY = 164;
      const requestY = 188;
      const cardY = requestY + requestHeight + 17;
      const cardHeight = 106;
      const declarationY = cardY + cardHeight + 12;
      const dateY = declarationY + declarationHeight + 14;
      const signatureTitleY = dateY + 46;
      const signatureLineY = signatureTitleY + 42;
      const footerY = signatureLineY + 30;
      const frameHeight = Math.min(pageHeight - frameY - 34, footerY - frameY + 20);

      // Compact document frame. The form intentionally occupies only the useful upper part of A4.
      doc.save();
      doc.roundedRect(frameX, frameY, pageWidth - frameX * 2, frameHeight, 10)
        .lineWidth(1)
        .strokeColor(border)
        .stroke();
      doc.restore();

      // Company header.
      const registryWidth = 154;
      const registryX = contentX + contentWidth - registryWidth;
      const companyHeaderWidth = contentWidth - registryWidth - 18;

      doc.font(fontBold).fontSize(12.5).fillColor(darkTeal)
        .text("TITAN EURO-COM SRL", contentX, headerY, { width: companyHeaderWidth });
      doc.font(fontRegular).fontSize(8.2).fillColor(muted)
        .text("CUI: RO17495362  |  Nr. Reg. Com.: J19/420/2005", contentX, headerY + 18, { width: companyHeaderWidth });
      doc.font(fontRegular).fontSize(7.8).fillColor(muted)
        .text("Str. Mihail Sadoveanu nr. 33, Miercurea-Ciuc, jud. Harghita", contentX, headerY + 31, { width: companyHeaderWidth });

      // Official registration area, completed by the company when the request is filed.
      doc.save();
      doc.roundedRect(registryX, headerY + 1, registryWidth, 40, 6)
        .fillAndStroke(pale, teal);
      doc.restore();
      doc.font(fontBold).fontSize(7.2).fillColor(darkTeal)
        .text("NR. DE INREGISTRARE", registryX + 8, headerY + 7, { width: registryWidth - 16, align: "center" });
      doc.font(fontRegular).fontSize(8.2).fillColor(ink)
        .text("Nr. ______________", registryX + 10, headerY + 21, { width: registryWidth - 20 });
      doc.font(fontRegular).fontSize(7.8).fillColor(muted)
        .text("Data ____ / ____ / ________", registryX + 10, headerY + 31, { width: registryWidth - 20 });

      doc.moveTo(contentX, headerY + 50)
        .lineTo(contentX + contentWidth, headerY + 50)
        .lineWidth(1.5)
        .strokeColor(teal)
        .stroke();

      // Compact title, no billboard-sized typography.
      doc.font(fontBold).fontSize(13.2).fillColor(ink)
        .text("CERERE DE CONCEDIU DE ODIHNA", contentX, titleY, { width: contentWidth, align: "center" });

      doc.font(fontRegular).fontSize(9.4).fillColor(ink)
        .text("Catre conducerea TITAN EURO-COM SRL", contentX, recipientY, { width: contentWidth });
      doc.font(fontRegular).fontSize(9.5).fillColor(ink)
        .text(requestText, contentX, requestY, { width: contentWidth, lineGap: 2 });

      // Main summary card.
      doc.save();
      doc.roundedRect(contentX, cardY, contentWidth, cardHeight, 8)
        .fillAndStroke(pale, border);
      doc.restore();

      doc.font(fontRegular).fontSize(7.1).fillColor(muted)
        .text("PERIOADA SOLICITATA", contentX + 14, cardY + 14, { width: contentWidth * 0.52 });
      doc.font(fontBold).fontSize(11.3).fillColor(ink)
        .text(`${roDate(dayFrom)} - ${roDate(dayTo)}`, contentX + 14, cardY + 31, { width: contentWidth * 0.58 });

      const countBadgeWidth = 112;
      const countBadgeX = contentX + contentWidth - countBadgeWidth - 12;
      doc.save();
      doc.roundedRect(countBadgeX, cardY + 14, countBadgeWidth, 30, 7).fill(teal);
      doc.restore();
      doc.font(fontBold).fontSize(8.2).fillColor("#ffffff")
        .text(`${info.workingDays} ZILE LUCRATOARE`, countBadgeX + 4, cardY + 24, { width: countBadgeWidth - 8, align: "center" });

      doc.moveTo(contentX + 12, cardY + 50)
        .lineTo(contentX + contentWidth - 12, cardY + 50)
        .lineWidth(0.8)
        .strokeColor(border)
        .stroke();

      const metricGap = 14;
      const metricWidth = (contentWidth - 28 - metricGap * 2) / 3;
      const metrics = [
        ["ZILE CALENDARISTICE", String(info.calendarDays)],
        ["CONCEDIU", String(info.workingDays)],
        ["EXCLUSE", String(info.excludedDays)],
      ];
      metrics.forEach(([metricLabel, metricValue], index) => {
        const metricX = contentX + 14 + index * (metricWidth + metricGap);
        doc.font(fontRegular).fontSize(6.8).fillColor(muted)
          .text(metricLabel, metricX, cardY + 60, { width: metricWidth });
        doc.font(fontBold).fontSize(10.4).fillColor(ink)
          .text(metricValue, metricX, cardY + 76, { width: metricWidth });
      });
      doc.font(fontRegular).fontSize(7.1).fillColor(muted)
        .text(`PROGRAM: ${schedule}`, contentX + 14, cardY + 95, { width: contentWidth - 28 });

      doc.save();
      doc.roundedRect(contentX, declarationY, contentWidth, declarationHeight, 6)
        .fillAndStroke("#fbfcfc", border);
      doc.restore();
      doc.font(fontRegular).fontSize(8.8).fillColor(ink)
        .text(declaration, contentX + 12, declarationY + 10, { width: contentWidth - 24, lineGap: 2 });

      doc.font(fontRegular).fontSize(9).fillColor(ink)
        .text(`Data cererii: ${generated}`, contentX, dateY, { width: contentWidth });

      const signatureGap = 34;
      const signatureWidth = (contentWidth - signatureGap) / 2;
      const signatures = ["Solicitant", "Aprobat / Administrator"];
      signatures.forEach((signatureTitle, index) => {
        const signatureX = contentX + index * (signatureWidth + signatureGap);
        doc.font(fontBold).fontSize(9.1).fillColor(darkTeal)
          .text(signatureTitle, signatureX, signatureTitleY, { width: signatureWidth, align: "center" });
        doc.moveTo(signatureX + 18, signatureLineY)
          .lineTo(signatureX + signatureWidth - 18, signatureLineY)
          .lineWidth(1)
          .strokeColor(muted)
          .stroke();
        doc.font(fontRegular).fontSize(7.2).fillColor(muted)
          .text("Nume, prenume si semnatura", signatureX, signatureLineY + 8, { width: signatureWidth, align: "center" });
      });

      doc.font(fontRegular).fontSize(6.8).fillColor("#94a3b8")
        .text("Document generat din sistemul AllInFashion.", contentX, footerY, { width: contentWidth, align: "center" });
      doc.end();
    } catch (e) {
      console.error("vacation request pdf failed", e);
      if (!res.headersSent) res.status(500).json({ error: "Failed to generate vacation request PDF" });
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
        const settings = await loadVacationSettings();
        const period = periodInfo(startDay, endDay, settings.workingDays);
        if (period.workingDays <= 0) {
          return res.status(400).json({ error: "The selected period contains no working days" });
        }
        await pool.query("BEGIN");
        try {
          for (const item of period.dates) {
            if (!item.working) continue;
            const id = crypto.randomUUID();
            await pool.query(
              `
              INSERT INTO allin_time_events (id, employee_name, day, kind, hours_off, note, created_by)
              VALUES ($1,$2,$3::date,'vacation',NULL,$4,$5)
              ON CONFLICT (employee_name, day, kind)
              DO UPDATE SET note = EXCLUDED.note
              `,
              [id, employeeName, item.day, note, createdBy]
            );
          }
          await pool.query("COMMIT");
          return res.json({
            ok: true,
            savedDays: period.workingDays,
            skippedDays: period.excludedDays,
            calendarDays: period.calendarDays,
            workingDays: settings.workingDays,
          });
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
