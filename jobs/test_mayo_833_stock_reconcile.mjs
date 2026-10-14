import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {reconcileStockQuantity as stock, reconcileRetailBook as book} from './lib/mayo_833_stock_reconcile.mjs';

let passed=0;
const check=(name,fn)=>{fn();passed++;};
const throws=(name,fn,pattern)=>check(name,()=>assert.throws(fn,pattern));
const scenario=(name,params,exp,write)=>check(name,()=>{
  const r=stock({label:name,...params});
  assert.equal(r.expected,exp);
  assert.equal(r.needsWrite,write);
});
scenario('S forrás 5 -> 0 DB trigger elvégezte',{baselineQty:5,observedQty:0,deltaQty:-5},0,false);
scenario('S forrás 5 -> 0 még nem vezetődött át',{baselineQty:5,observedQty:5,deltaQty:-5},0,true);
scenario('M forrás 2 -> 1 automatikus',{baselineQty:2,observedQty:1,deltaQty:-1},1,false);
scenario('M forrás 2 -> 1 kézi',{baselineQty:2,observedQty:2,deltaQty:-1},1,true);
scenario('L forrás 6 -> 3 automatikus',{baselineQty:6,observedQty:3,deltaQty:-3},3,false);
scenario('L forrás 6 -> 3 kézi',{baselineQty:6,observedQty:6,deltaQty:-3},3,true);
scenario('832-es cél 2 -> 3, előző készlet megmarad',{baselineQty:2,observedQty:2,deltaQty:1},3,true);
scenario('832-es cél 2 -> 3, DB trigger már elvégezte',{baselineQty:2,observedQty:3,deltaQty:1},3,false);
scenario('új variáns 0 -> 2 kézi',{baselineQty:0,observedQty:0,deltaQty:2},2,true);
scenario('új variáns 0 -> 2 trigger',{baselineQty:0,observedQty:2,deltaQty:2},2,false);
throws('nem várt részleges készlet',()=>stock({baselineQty:5,observedQty:3,deltaQty:-5}),/nem várt darabszám/);
throws('nem lehet negatív forráskészlet',()=>stock({baselineQty:2,observedQty:2,deltaQty:-5}),/negatív készlet/);
throws('foglalt készlet tiltva',()=>stock({baselineQty:2,observedQty:2,deltaQty:-1,reservedQty:1}),/foglalt készlet/);
check('S retail 697,50 -> 0 trigger',()=>{
  const r=book({baselineQty:5,baselineValue:697.5,observedQty:0,observedValue:0,deltaQty:-5,deltaValue:-697.5});
  assert.equal(r.needsWrite,false);assert.equal(r.expectedValue,0);
});
check('S retail mennyiség már 0, érték még 697,50',()=>{
  const r=book({baselineQty:5,baselineValue:697.5,observedQty:0,observedValue:697.5,deltaQty:-5,deltaValue:-697.5});
  assert.equal(r.needsWrite,true);assert.equal(r.expectedValue,0);
});
check('832-es eladott fehér L meglévő könyvérték megtartása',()=>{
  const r=book({baselineQty:2,baselineValue:279,observedQty:2,observedValue:279,deltaQty:1,deltaValue:139.5});
  assert.equal(r.expectedQty,3);assert.equal(r.expectedValue,418.5);assert.equal(r.needsWrite,true);
});
check('832-es eltérő vételár, de az eladásiár-alapú könyvérték helyes',()=>{
  const r=book({baselineQty:2,baselineValue:279,observedQty:3,observedValue:418.5,deltaQty:1,deltaValue:139.5});
  assert.equal(r.needsWrite,false);
});
throws('ismeretlen könyvérték tiltva',()=>book({baselineQty:2,baselineValue:279,observedQty:2,observedValue:500,deltaQty:1,deltaValue:139.5}),/nem várt könyvérték/);
throws('negatív könyvérték tiltva',()=>book({baselineQty:2,baselineValue:279,observedQty:2,observedValue:279,deltaQty:-2,deltaValue:-300}),/negatív könyvérték/);
check('V4 sorrend és tranzakciós próba statikus ellenőrzése',()=>{
  const source=fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'aif_mayo_833_repair.mjs'),'utf8');
  const bookkeeping=source.indexOf('const locationId=String(d.batch.target_location_id);');
  const archive=source.indexOf('for(const id of pendingArchives){');
  const ledger=source.indexOf('const touched=[...new Set(');
  assert.ok(bookkeeping>0 && ledger>bookkeeping && archive>ledger);
  assert.ok(!source.includes('qty >= abs($3)'));
  assert.ok(source.includes('reconcileStockQuantity('));
  assert.ok(source.includes('reconcileRetailBook('));
  assert.match(source,/const TRIAL = process\.argv\.includes\('--trial'\)/);
  assert.match(source,/if\(TRIAL\)\{\s*await client\.query\('ROLLBACK'\)/);
  assert.ok(source.includes('BEGIN READ ONLY'));
});
console.log(`SIKER: ${passed} készlet/retail könyv, archiválási sorrend és tranzakciós próba teszt`);
