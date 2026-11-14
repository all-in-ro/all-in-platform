import { localToday, moveDate, type HourlyAggregate, type HourlyMetric } from './hourlySalesModel';
export const HOURLY_PREFERENCES_KEY = 'allinfashion:hourly-sales:preferences:v1';
export type HourlyPreferences = {
  startHour: number; endHour: number; scope: string; weekdays: number[];
  metric: HourlyMetric; aggregate: HourlyAggregate; common: boolean;
  from: string; to: string; periodDays: number | null;
};
const validDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T12:00:00Z`)) && new Date(`${v}T12:00:00Z`).toISOString().slice(0,10) === v;
export function normalizeHourlyPreferences(raw: unknown, yesterday = moveDate(localToday(), -1)): HourlyPreferences {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const defaults: HourlyPreferences = { startHour:8, endHour:21, scope:'both', weekdays:[0,1,2,3,4,5,6], metric:'purchases', aggregate:'average', common:false, from:moveDate(yesterday,-27), to:yesterday, periodDays:28 };
  const result = { ...defaults };
  if (typeof r.startHour==='number' && Number.isInteger(r.startHour) && r.startHour>=0 && r.startHour<=23 && typeof r.endHour==='number' && Number.isInteger(r.endHour) && r.endHour>r.startHour && r.endHour<=24) { result.startHour=r.startHour; result.endHour=r.endHour; }
  if (['both','main_warehouse','magazin_targu_secuiesc'].includes(String(r.scope))) result.scope=String(r.scope);
  if (Array.isArray(r.weekdays)) { const days=[...new Set(r.weekdays.filter((n): n is number=>typeof n==='number' && Number.isInteger(n) && n>=0 && n<=6))].sort(); if(days.length) result.weekdays=days; }
  if (r.metric==='purchases'||r.metric==='units'||r.metric==='value') result.metric=r.metric;
  if (r.aggregate==='total'||r.aggregate==='average') result.aggregate=r.aggregate;
  result.common=r.common===true;
  if (typeof r.periodDays==='number' && [7,28,90].includes(r.periodDays)) {
    result.periodDays=r.periodDays; result.from=moveDate(yesterday,1-r.periodDays); result.to=yesterday;
  } else if (r.periodDays===null && validDate(r.from) && validDate(r.to) && r.from<=r.to && r.to<=yesterday && Date.parse(r.to)-Date.parse(r.from)<=365*86400000) {
    result.periodDays=null; result.from=r.from; result.to=r.to;
  }
  return result;
}
export function readHourlyPreferences(yesterday?: string): HourlyPreferences {
  try { return normalizeHourlyPreferences(JSON.parse(window.localStorage.getItem(HOURLY_PREFERENCES_KEY)||'null'),yesterday); }
  catch { return normalizeHourlyPreferences(null,yesterday); }
}
export function saveHourlyPreferences(value: HourlyPreferences): boolean {
  try { window.localStorage.setItem(HOURLY_PREFERENCES_KEY,JSON.stringify(value)); return true; }
  catch { return false; }
}
