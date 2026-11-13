// Call within the transaction, after locking reception document settings.
export function receptionDateKey(value) {
  if (value instanceof Date) {
    const parts = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);
    const get = type => parts.find(p => p.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  return String(value || '').slice(0, 10);
}

export function assertReceptionDateWindow(date, {year, previous, next} = {}) {
  const fail = message => { throw Object.assign(new Error(message), {statusCode:409}); };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) {
    fail('Érvényes bevételezési dátum szükséges.');
  }
  if (year && Number(date.slice(0,4)) !== Number(year)) fail(`A bizonylat ${year}. évi sorszámot kapott. A dátum csak ezen az éven belül módosítható.`);
  if (previous?.date && date < previous.date) fail(`A bevételezés dátuma nem lehet korábbi, mint ${previous.date} (${previous.number}).`);
  if (next?.date && date > next.date) fail(`A bevételezés dátuma nem lehet későbbi, mint ${next.date} (${next.number}).`);
}

export async function validateReceptionChronology(client, id, settings) {
  const {rows} = await client.query(`SELECT id,aviz_number,aviz_series,aviz_sequence_number,aviz_sequence_year,
    reception_date::text AS reception_date FROM aif_receptions WHERE id::text=$1`, [String(id)]);
  const row = rows[0];
  if (!row) throw Object.assign(new Error('Receptió nem található.'), {statusCode:404});
  const date = row.reception_date;
  assertReceptionDateWindow(date);
  if (!row.aviz_number) return;
  if (!row.aviz_series || !row.aviz_sequence_number) throw Object.assign(new Error('A dátum ellenőrzéséhez értelmezhető Aviz sorozat és sorszám szükséges.'), {statusCode:409});
  const annual = settings.yearly_reset !== false;
  const year = Number(row.aviz_sequence_year || date.slice(0,4));
  // Counter restarts/manual historical numbers do not determine chronology.
  // Compare reception creation order in SQL, preserving microsecond precision.
  const {rows: others} = await client.query(`SELECT r.aviz_number AS number,
    r.reception_date::text AS date,
    CASE WHEN (r.created_at,r.id) < (current.created_at,current.id) THEN -1 ELSE 1 END AS direction,
    (r.aviz_sequence_number=current.aviz_sequence_number
      AND ($2::boolean=false OR r.aviz_sequence_year IS NOT DISTINCT FROM current.aviz_sequence_year)) AS duplicate
    FROM aif_receptions current
    JOIN aif_receptions r ON r.aviz_series=current.aviz_series AND r.id<>current.id
    WHERE current.id::text=$1 AND r.aviz_number IS NOT NULL`,
    [String(id),settings.include_year !== false]);
  let previous, next;
  for (const other of others) {
    if (other.duplicate) throw Object.assign(new Error(`Ez a sorszám már használatban van: ${other.number}.`), {statusCode:409});
    if (!other.date) continue;
    if (Number(other.direction) < 0 && (!previous || other.date > previous.date)) previous = other;
    if (Number(other.direction) > 0 && (!next || other.date < next.date)) next = other;
  }
  assertReceptionDateWindow(date, {year:annual ? year : null,previous,next});
}
