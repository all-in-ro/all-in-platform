import { localToday, moveDate, type HourlyAggregate, type HourlyMetric } from './hourlySalesModel';
export const HOURLY_PREFERENCES_KEY = 'allinfashion:hourly-sales:preferences:v1';
export const HOURLY_PERIODS = [
  {key:'today',label:'Mai nap'}, {key:'yesterday',label:'Tegnap'},
  {key:'week',label:'Ez a hét'}, {key:'month',label:'Ez a hónap'},
  {key:'last-month',label:'Múlt hónap'},
] as const;
export type HourlyPeriod = typeof HOURLY_PERIODS[number]['key'];
export function hourlyPresetRange(period: HourlyPeriod, today=localToday()) {
  const monthStart=today.slice(0,7)+'-01';
  if(period==='today')return {from:today,to:today};
  if(period==='yesterday'){const date=moveDate(today,-1);return {from:date,to:date};}
  if(period==='week')return {from:moveDate(today,-((new Date(today+'T12:00:00Z').getUTCDay()+6)%7)),to:today};
  if(period==='last-month'){const end=moveDate(monthStart,-1);return {from:end.slice(0,7)+'-01',to:end};}
  return {from:monthStart,to:today};
}
export type HourlyPreferences = {
  startHour: number; endHour: number; scope: string; weekdays: number[];
  metric: HourlyMetric; aggregate: HourlyAggregate; common: boolean;
  from: string; to: string; periodPreset: HourlyPeriod | null;
};
const validDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T12:00:00Z`)) && new Date(`${v}T12:00:00Z`).toISOString().slice(0,10) === v;
export function normalizeHourlyPreferences(raw: unknown, yesterday = moveDate(localToday(), -1)): HourlyPreferences {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const today=moveDate(yesterday,1);
  const defaults: HourlyPreferences = { startHour:8, endHour:21, scope:'both', weekdays:[0,1,2,3,4,5,6], metric:'purchases', aggregate:'average', common:false, ...hourlyPresetRange('month',today), periodPreset:'month' };
  const result = { ...defaults };
  if (typeof r.startHour==='number' && Number.isInteger(r.startHour) && r.startHour>=0 && r.startHour<=23 && typeof r.endHour==='number' && Number.isInteger(r.endHour) && r.endHour>r.startHour && r.endHour<=24) { result.startHour=r.startHour; result.endHour=r.endHour; }
  if (['both','main_warehouse','magazin_targu_secuiesc'].includes(String(r.scope))) result.scope=String(r.scope);
  if (Array.isArray(r.weekdays)) { const days=[...new Set(r.weekdays.filter((n): n is number=>typeof n==='number' && Number.isInteger(n) && n>=0 && n<=6))].sort(); if(days.length) result.weekdays=days; }
  if (r.metric==='purchases'||r.metric==='units'||r.metric==='value') result.metric=r.metric;
  if (r.aggregate==='total'||r.aggregate==='average') result.aggregate=r.aggregate;
  result.common=r.common===true;
  if (HOURLY_PERIODS.some(p=>p.key===r.periodPreset)) {
    result.periodPreset=r.periodPreset as HourlyPeriod;
    Object.assign(result,hourlyPresetRange(result.periodPreset,today));
  } else if ((r.periodPreset===null || (r.periodPreset===undefined && r.periodDays===null)) && validDate(r.from) && validDate(r.to) && r.from<=r.to && r.to<=today && Date.parse(r.to)-Date.parse(r.from)<=365*86400000) {
    result.periodPreset=null; result.from=r.from; result.to=r.to;
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
