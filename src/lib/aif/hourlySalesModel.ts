import type { AifHourlyDay, AifHourlyHour, AifHourlyShop } from './api';
export type HourlyMetric = 'purchases' | 'units' | 'value';
export type HourlyAggregate = 'average' | 'total';
export const WEEKDAYS = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'];
export const SHOP_COLORS = ['#50d5c2', '#82b4ff'];
export function localToday(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(x => [x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function moveDate(date: string, count: number) { return new Date(Date.parse(`${date}T12:00:00Z`) + count * 86400000).toISOString().slice(0,10); }
export function hourLabel(hour: number) { return `${String(hour).padStart(2,'0')}:00–${String(hour + 1).padStart(2,'0')}:00`; }
export function sumHour(days: AifHourlyDay[], hour: number): AifHourlyHour {
  return days.reduce((out, d) => {
    const h = d.hours.find(x => x.hour === hour);
    if (h) for (const key of ['purchases','units','value','credit','refunded'] as const) out[key] += h[key];
    return out;
  }, { hour, purchases:0, units:0, value:0, credit:0, refunded:0 });
}
export function sampleShops(shops: AifHourlyShop[], weekdays: number[], common: boolean) {
  const selected = shops.map(s => ({ ...s, days: s.days.filter(d => weekdays.includes(d.weekday)) }));
  if (!common || selected.length < 2) return selected;
  const dates = new Set(selected[0].days.map(d => d.date));
  for (const s of selected.slice(1)) for (const date of dates) if (!s.days.some(d => d.date === date)) dates.delete(date);
  return selected.map(s => ({ ...s, days: s.days.filter(d => dates.has(d.date)) }));
}
export function metricValue(days: AifHourlyDay[], hour: number, metric: HourlyMetric, aggregate: HourlyAggregate): number | null {
  if (!days.length) return null;
  const total = sumHour(days, hour)[metric];
  return aggregate === 'average' ? total / days.length : total;
}
export function dateList(from: string, to: string) {
  const result: string[] = [];
  for (let d = from; d <= to && result.length < 366; d = moveDate(d, 1)) result.push(d);
  return result;
}
