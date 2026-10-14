import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source=fs.readFileSync(path.join(root,'api/routes/aif.js'),'utf8');
const begin=source.indexOf('  function splitBrandProductCode(value) {');
const end=source.indexOf('  function importBarcodeValue(normalized = {}, row = {}) {',begin);
assert(begin!==-1 && end!==-1);
const helpers=source.slice(begin,end);
const shared={
 text:v=>String(v??'').trim(),
 emptyToNull:v=>String(v??'').trim()||null,
 normCode:v=>String(v??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,''),
 rawValueByHeaders:(raw,heads)=>{
   if(!raw||typeof raw!=='object')return null;
   const norm=v=>String(v).trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
   const names=new Set(heads.map(norm));
   for(const [k,v] of Object.entries(raw))if(names.has(norm(k))&&String(v??'').trim())return String(v).trim();
   return null;
 },
 aifVariantSizeIdentity:v=>String(v??'').trim().toLowerCase(),
};
const {applyProductCodeSplit,correctImportedClassification,importBarcodeIdentity}=vm.runInNewContext(
  helpers+'\n({applyProductCodeSplit,correctImportedClassification,importBarcodeIdentity})',shared);
function x(code,color,raw={CULOARE:color}){
  const n={supplierProductCode:code,modelCode:code,colorCode:code.split('-').at(-1),supplierColorCode:code.split('-').at(-1),colorName:color,size:'S'};
  applyProductCodeSplit(n,raw);return n;
}
{
 const m=x('121907100-01','MARO',{'CULOARE':'MARO','COD CULOARE ':null});
 const b=x('121907100-01','NEGRU',{'CULOARE':'NEGRU','COD CULOARE ':null});
 assert.equal(m.colorCode,'MARO');assert.equal(b.colorCode,'NEGRU');
 assert.equal(m.supplierColorCode,'MARO');
 assert.notEqual(importBarcodeIdentity(m).key,importBarcodeIdentity(b).key);
 assert.equal(m.modelCode,'121907100');
}
{
 const m=x('300025890-10','BURGUNDI');
 const b=x('300025890-10','CREM');
 assert.equal(m.colorCode,'BURGUNDI');assert.equal(b.colorCode,'CREM');
}
{
 const n=x('121907100-01','MARO',{'CULOARE':'MARO','COD CULOARE':'71'});
 assert.equal(n.colorCode,'71');assert.equal(n.supplierColorCode,'71');
}
{
 const n=x('112430-65B','NEGRU');assert.equal(n.colorCode,'65B');
}
{
 const n={productType:'FASHION',categoryCode:'imbracaminte',subcategoryCode:'imbracaminte_rochie',titleRo:'MONTEVERDI DOMBOR HIMZES'};
 correctImportedClassification(n,{'RODESCR':'ROCHIE'});
 assert.equal(n.productType,'ROCHIE');assert.equal(n.subcategoryCode,'imbracaminte_rochie');
}
{
 const n={productType:'FASHION',categoryCode:'imbracaminte',subcategoryCode:'imbracaminte_rochie',titleRo:'HAJGUMI'};
 correctImportedClassification(n,{});
 assert.equal(n.productType,'ELASTIC DE PAR');assert.equal(n.categoryCode,'ACCESORII');assert.equal(n.subcategoryCode,null);
}
{
 const n={supplierProductCode:'121907100-01',modelCode:'121907100-01',colorCode:'01',supplierColorCode:'01',colorName:'NEGRU',size:'S'};
 applyProductCodeSplit(n);
 assert.equal(n.colorCode,'01','Kézi színkódot forrás Excel nélkül nem írhat át');
}
{
 const n={productType:'FASHION',categoryId:'régi-téves-uuid',parentCategoryCode:'APPAREL',subCategoryId:'régi-rossz',categoryCode:'fashion',subcategoryCode:'imbracaminte_blugi',titleRo:'Farmer'};
 correctImportedClassification(n,{'RODESCR':'BLUGI'});
 assert.equal(n.categoryId,null);
 assert.equal(n.parentCategoryCode,null);
 assert.equal(n.subCategoryId,null);
 assert.equal(n.categoryCode,'IMBRACAMINTE');
}
console.log('SIKER: 8 import/regresszióteszt');
