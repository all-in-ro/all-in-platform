// Deterministic module checks. Does not connect to the production database.
import assert from 'node:assert/strict';
import { hourlyRange, bucharestDate, loadHourlySales, registerAifHourlySales } from '../api/lib/aifHourlySales.js';
const now = new Date('2026-11-14T10:00:00Z');
assert.equal(hourlyRange({}, now).to, '2026-11-13');
assert.equal(hourlyRange({}, now).calendarDays, 28);
assert.equal(bucharestDate(new Date('2026-11-13T23:01:00Z')), '2026-11-14');
for (const q of [{ to:'hibás' }, { from:'2026-02-30',to:'2026-03-01' }, { from:'2026-11-03',to:'2026-11-02' }, { to:'2026-11-14' }, { from:'2025-01-01',to:'2026-11-03' }, { from:['2026-11-01'],to:'2026-11-03' }]) {
  assert.throws(() => hourlyRange(q, now), e => e.statusCode === 400);
}
const resultRows = [
  [{ id:'ciuc', code:'main_warehouse' }, { id:'kezdi', code:'magazin_targu_secuiesc' }],
  [{ location_id:'ciuc',date:'2026-11-02',hour:12,purchases:1,credit:1,refunded:0,units:'1',value:'284.53' }],
  [{ location_id:'ciuc',date:'2026-11-02' }, { location_id:'ciuc',date:'2026-11-03' }],
];
let queryCount=0;
const result = await loadHourlySales({ query: async () => ({ rows:resultRows[queryCount++] }) },hourlyRange({ from:'2026-11-02',to:'2026-11-03' }, now));
assert.equal(result.shops[0].days.length,2);
assert.equal(result.shops[0].days[0].hours[0].value,284.53);
assert.equal(result.shops[0].days[0].hours[0].credit,1);
assert.deepEqual(result.shops[0].days[1].hours,[]);
assert.equal(result.shops[1].days.length,0);
const auth=()=>{},admin=()=>{};let registration;
registerAifHourlySales({ get:(...args)=>{ registration=args; } },{pool:{},requireAuthed:auth,requireAdminOrSecret:admin});
assert.equal(registration[0],'/admin/shop-hourly-sales');
assert.equal(registration[1],auth);assert.equal(registration[2],admin);
console.log('OK: dátumellenőrzés, romániai napváltás, adatfeldolgozás, nulla/adathiány és jogosultsági bekötés.');
