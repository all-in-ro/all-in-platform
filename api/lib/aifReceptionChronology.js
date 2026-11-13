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
  const {rows: others} = await client.query(`SELECT aviz_number AS number, reception_date::text AS date,
    aviz_sequence_number AS sequence, COALESCE(aviz_sequence_year,EXTRACT(YEAR FROM reception_date)::integer) AS year
    FROM aif_receptions WHERE id::text<>$1 AND aviz_series=$2
      AND aviz_number IS NOT NULL AND aviz_sequence_number IS NOT NULL AND reception_date IS NOT NULL`,
    [String(id),row.aviz_series]);
  let previous, next;
  for (const other of others) {
    const direction = annual && Number(other.year) !== year
      ? Number(other.year) - year : Number(other.sequence) - Number(row.aviz_sequence_number);
    if (direction === 0) throw Object.assign(new Error(`Ez a sorszám már használatban van: ${other.number}.`), {statusCode:409});
    if (direction < 0 && (!previous || other.date > previous.date)) previous = other;
    if (direction > 0 && (!next || other.date < next.date)) next = other;
  }
  assertReceptionDateWindow(date, {year:annual ? year : null,previous,next});
}
