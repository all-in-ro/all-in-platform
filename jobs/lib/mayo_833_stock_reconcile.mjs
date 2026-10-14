/**
 * MAYO CHIX 833: stock/retail-book reconciliation.
 *
 * A stock movement variant-id rewrite may invoke DB-side synchronization.
 * Therefore, a source/target stock value can already reflect the desired
 * transfer when the repair reaches the stock table. NEVER apply the same
 * arithmetic delta a second time. Accept only exact baseline or target.
 */
const qty3 = (value) => Math.round(Number(value) * 1000) / 1000;
const price2 = (value) => Math.round(Number(value) * 100) / 100;
const close = (a,b,eps) => Math.abs(Number(a)-Number(b))<=eps;
function num(value,label){
  const n=Number(value ?? 0);
  if(!Number.isFinite(n)) throw Error(`Nem számérték: ${label} (${String(value)})`);
  return n;
}
function choose({label,field,before,observed,after,tolerance}){
  if(close(observed,after,tolerance))return {state:'already_target',needsWrite:false};
  if(close(observed,before,tolerance))return {state:'baseline',needsWrite:true};
  throw Error(`${label}: nem várt ${field} állapot: eredeti ${before}, látott ${observed}, elvárt ${after}. `+
    `Automatikus/idegen készletváltozás lehetséges, javítás leállítva.`);
}
export function reconcileStockQuantity({label='Készlet',baselineQty,observedQty,deltaQty,reservedQty=0}){
  const before=qty3(num(baselineQty,'eredeti darab'));
  const observed=qty3(num(observedQty,'tényleges darab'));
  const delta=qty3(num(deltaQty,'készletkülönbözet'));
  const reserved=qty3(num(reservedQty,'foglalt darab'));
  const expected=qty3(before+delta);
  if(before<0||observed<0||expected<0)throw Error(`${label}: negatív készlet nem engedélyezett (${before}/${observed}/${expected}).`);
  if(reserved!==0)throw Error(`${label}: foglalt készlet (${reserved} db).`);
  return {before,observed,expected,...choose({label,field:'darabszám',before,observed,after:expected,tolerance:0.0001})};
}
export function reconcileRetailBook({label='Retail könyv',baselineQty,baselineValue,observedQty,observedValue,deltaQty,deltaValue}){
  const beforeQty=qty3(num(baselineQty,'eredeti könyv db'));
  const beforeValue=price2(num(baselineValue,'eredeti könyvérték'));
  const seenQty=qty3(num(observedQty,'tényleges könyv db'));
  const seenValue=price2(num(observedValue,'tényleges könyvérték'));
  const expectedQty=qty3(beforeQty+num(deltaQty,'könyv darab változás'));
  const expectedValue=price2(beforeValue+num(deltaValue,'könyvérték változás'));
  if([beforeQty,seenQty,expectedQty].some(n=>n<0))throw Error(`${label}: negatív könyv-darabszám.`);
  if([beforeValue,seenValue,expectedValue].some(n=>n< -0.009))throw Error(`${label}: negatív könyvérték.`);
  const count=choose({label,field:'könyv-darabszám',before:beforeQty,observed:seenQty,after:expectedQty,tolerance:0.0001});
  const value=choose({label,field:'könyvérték',before:beforeValue,observed:seenValue,after:expectedValue,tolerance:0.009});
  return {beforeQty,beforeValue,seenQty,seenValue,expectedQty,expectedValue,
    needsWrite:count.needsWrite||value.needsWrite,qtyState:count.state,valueState:value.state};
}
