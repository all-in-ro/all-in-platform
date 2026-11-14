// Hourly purchase activity. No payment, stock or document writes.
export const HOURLY_SHOPS = [
  { code: 'main_warehouse', name: 'Csíkszereda' },
  { code: 'magazin_targu_secuiesc', name: 'Kézdivásárhely' },
];
export function bucharestDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function shiftDate(date, days) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function hourlyRange(query = {}, now = new Date()) {
  const lastDate = shiftDate(bucharestDate(now), -1);
  const to = query.to === undefined ? lastDate : query.to;
  const from = query.from === undefined ? (validDate(to) ? shiftDate(to, -27) : '') : query.from;
  const bad = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
  if (!validDate(from) || !validDate(to)) bad('Érvényes kezdő és záró dátum szükséges.');
  if (from > to) bad('A kezdő dátum nem lehet későbbi a záró dátumnál.');
  if (to > lastDate) bad('Legfeljebb tegnapig kérhető kimutatás; a mai nap még nem teljes.');
  const calendarDays = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (calendarDays > 366) bad('Egyszerre legfeljebb 366 nap kérhető le.');
  return { from, to, calendarDays, lastDate };
}
export const HOURLY_SALES_SQL = `
  WITH selected_sales AS (
    SELECT s.id, s.location_id, s.sale_type, s.status, s.total,
           (s.sold_at AT TIME ZONE 'Europe/Bucharest')::date::text AS date,
           EXTRACT(HOUR FROM s.sold_at AT TIME ZONE 'Europe/Bucharest')::int AS hour
    FROM aif_shop_sales s
    JOIN aif_locations l ON l.id=s.location_id
    WHERE l.code=ANY($3::text[])
      AND s.status IN ('completed','refunded') AND s.sale_type IN ('sale','credit')
      AND s.sold_at >= ($1::date::timestamp AT TIME ZONE 'Europe/Bucharest')
      AND s.sold_at < (($2::date + 1)::timestamp AT TIME ZONE 'Europe/Bucharest')
  ), line_counts AS (
    SELECT sl.sale_id, SUM(sl.quantity)::numeric AS units
    FROM aif_shop_sale_lines sl JOIN selected_sales s ON s.id=sl.sale_id
    GROUP BY sl.sale_id
  )
  SELECT s.location_id::text, s.date, s.hour,
         COUNT(*)::int AS purchases,
         COUNT(*) FILTER (WHERE s.sale_type='credit')::int AS credit,
         COUNT(*) FILTER (WHERE s.status='refunded')::int AS refunded,
         COALESCE(SUM(lc.units),0)::numeric AS units,
         COALESCE(SUM(s.total),0)::numeric AS value
  FROM selected_sales s LEFT JOIN line_counts lc ON lc.sale_id=s.id
  GROUP BY s.location_id, s.date, s.hour ORDER BY s.location_id, s.date, s.hour
`;
export async function loadHourlySales(db, range) {
  const codes = HOURLY_SHOPS.map(s => s.code);
  const locations = await db.query('SELECT id::text, code FROM aif_locations WHERE code=ANY($1::text[])', [codes]);
  const sales = await db.query(HOURLY_SALES_SQL, [range.from, range.to, codes]);
  const closures = await db.query(`SELECT c.location_id::text, c.work_date::text AS date
    FROM aif_shop_day_closures c JOIN aif_locations l ON l.id=c.location_id
    WHERE l.code=ANY($3::text[]) AND c.work_date BETWEEN $1::date AND $2::date`, [range.from, range.to, codes]);
  const shops = HOURLY_SHOPS.map(shop => {
    const id = locations.rows.find(l => l.code === shop.code)?.id || null;
    const days = new Map();
    const day = date => {
      if (!days.has(date)) days.set(date, { date, weekday: (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7, closed: false, hours: [] });
      return days.get(date);
    };
    for (const r of closures.rows) if (r.location_id === id) day(r.date).closed = true;
    for (const r of sales.rows) if (r.location_id === id) day(r.date).hours.push({
      hour: Number(r.hour), purchases: Number(r.purchases), credit: Number(r.credit), refunded: Number(r.refunded), units: Number(r.units), value: Number(r.value),
    });
    return { ...shop, available: Boolean(id), days: [...days.values()].sort((a,b) => a.date.localeCompare(b.date)) };
  });
  return { ok: true, ...range, timezone: 'Europe/Bucharest', generatedAt: new Date().toISOString(), shops };
}
export function registerAifHourlySales(router, { pool, requireAuthed, requireAdminOrSecret }) {
  router.get('/admin/shop-hourly-sales', requireAuthed, requireAdminOrSecret, async (req, res) => {
    let db;
    try {
      const range = hourlyRange(req.query);
      db = await pool.connect();
      await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await db.query("SET LOCAL statement_timeout = '20s'");
      const result = await loadHourlySales(db, range);
      await db.query('COMMIT');
      res.set('Cache-Control', 'no-store').json(result);
    } catch (error) {
      if (db) await db.query('ROLLBACK').catch(() => {});
      const status = error.statusCode === 400 ? 400 : 500;
      if (status === 500) console.error('AIF hourly sales read failed', error);
      res.status(status).json({ error: status === 400 ? error.message : 'Az órás kimutatás nem tölthető be. Próbáld újra.', code: 'hourly_sales_failed' });
    } finally { db?.release(); }
  });
}
