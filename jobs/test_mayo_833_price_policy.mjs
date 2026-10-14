import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkReusePrices,price2} from './lib/mayo_833_price_policy.mjs';

const cases = [
  {oldBuy:64.33,newBuy:81.69,oldSell:139.50,newSell:139.50,quantity:1,code:'LIGHT MATRICA'},
  {oldBuy:66.59,newBuy:84.56,oldSell:139.50,newSell:139.50,quantity:2,code:'NAPOLY DOMBOR CSILI'},
  {oldBuy:64.33,newBuy:64.33,oldSell:139.50,newSell:139.50,quantity:1,code:'Azonos vételár'},
];
let count=0;
for(const c of cases){
  const p=checkReusePrices({
    existingBuyPrice:c.oldBuy,existingSellPrice:c.oldSell,
    incomingBuyPrice:c.newBuy,incomingSellPrice:c.newSell,
    previousInvoiceSellPrice:c.oldSell,
  });
  assert.equal(p.ok,true,c.code);
  assert.equal(p.historicalBuyPriceDiffers,c.oldBuy!==c.newBuy);
  assert.equal(p.preserveExistingVariantBuyPrice,true);
  assert.equal(p.sellPrice,139.50);
  count++;
}
{
  const p=checkReusePrices({existingBuyPrice:64.33,existingSellPrice:139.50,
    incomingBuyPrice:81.69,incomingSellPrice:149.50});
  assert.equal(p.ok,false);
  assert.match(p.reason,/Eltérő aktuális eladási ár/);
  count++;
}
{
  const p=checkReusePrices({existingBuyPrice:64.33,existingSellPrice:139.50,
    incomingBuyPrice:81.69,incomingSellPrice:139.50,previousInvoiceSellPrice:169.50});
  assert.equal(p.ok,false);
  assert.match(p.reason,/832-es forrássor/);
  count++;
}
{
  const p=checkReusePrices({existingBuyPrice:null,existingSellPrice:139.50,
    incomingBuyPrice:81.69,incomingSellPrice:139.50});
  assert.equal(p.ok,false);
  count++;
}
assert.equal(price2('84.56'),84.56);
count++;
const here=path.dirname(fileURLToPath(import.meta.url));
const repair=fs.readFileSync(path.join(here,'aif_mayo_833_repair.mjs'),'utf8');
assert.match(repair,/checkReusePrices\(/);
assert.match(repair,/buyPriceDifferences/);
assert.match(repair,/832-es vételár/);
count++;
// Az eredeti Excel RON vételára importonként külön áll, az eltérő vételár
// nem jogosít ár-felülírásra vagy egy új (duplikált) variáns létrehozására.
const manifest=JSON.parse(fs.readFileSync(path.join(here,'data/mayo_833_original.json'),'utf8'));
assert.equal(manifest.rows.find(x=>x.rowNo===6).buyPrice,81.69);
assert.equal(manifest.rows.find(x=>x.rowNo===16).buyPrice,84.56);
assert.equal(manifest.rows.length,57);
count++;
console.log(`SIKER: ${count} számla-vételár és eladásiár regresszióteszt`);
