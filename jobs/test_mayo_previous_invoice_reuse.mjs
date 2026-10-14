import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source=fs.readFileSync(path.join(root,'api/routes/aif.js'),'utf8');
const a=source.indexOf('  async function findExactExistingSupplierVariant(');
const b=source.indexOf('  async function upsertSupplierCode(',a);
assert(a>=0 && b>a,'Missing previous invoice match helper');
const normCode=v=>String(v??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
const sameAifVariantSize=(a,b)=>{
 const normalize=v=>['one_size','onesize','os','osfm','uni'].includes(normCode(v))?'one_size':normCode(v);
 return Boolean(normalize(a)&&normalize(a)===normalize(b));
};
const fn=vm.runInNewContext(`${source.slice(a,b)}\nfindExactExistingSupplierVariant`,{
 text:v=>String(v??'').trim(),normCode,sameAifVariantSize
});
const makeRow=(extras={})=>({
 id:'832-old',model_id:'model-832',title_ro:'LIGHT MATRICA',brand_id:'brand-a',
 color_name:'CARAMEL',color_code:'CARAMEL',size:'M',
 supplier_color_name:'CARAMEL',supplier_color_code:'CARAMEL',supplier_size:'M',
 ...extras
});
const fake=(list)=>({query:async(sql)=>sql.includes('SELECT brand_id FROM')?{rows:[{brand_id:'brand-a'}]}:{rows:list}});
const n={supplierProductCode:'116005690-01',colorName:'CARAMEL',colorCode:'CARAMEL',size:'M',titleRo:'LIGHT MATRICA'};
{
 const r=await fn(fake([makeRow()]),{supplierId:'supplier-a',normalized:n,newModelId:'model-833'});
 assert.equal(r.id,'832-old');
}
{
 const r=await fn(fake([makeRow({color_name:'NEGRU'})]),{supplierId:'supplier-a',normalized:n,newModelId:'model-833'});
 assert.equal(r,null);
}
{
 const r=await fn(fake([makeRow({title_ro:'DIFFERENT PRODUCT'})]),{supplierId:'supplier-a',normalized:n,newModelId:'model-833'});
 assert.equal(r,null);
}
{
 const r=await fn(fake([makeRow()]),{supplierId:'supplier-a',normalized:{...n,barcode:'2901234567890'},newModelId:'model-833'});
 assert.equal(r,null);
}
{
 await assert.rejects(()=>fn(fake([makeRow(),makeRow({id:'832-duplicate'})]),{
  supplierId:'supplier-a',normalized:n,newModelId:'model-833'}),e=>e.code==='supplier_variant_ambiguous');
}
{
 const r=await fn(fake([makeRow({size:'One Size',supplier_size:'One Size',color_name:'CREM',color_code:'CREM',supplier_color_name:'CREM',supplier_color_code:'CREM',title_ro:'NAPOLY DOMBOR CSILI'})]),{
  supplierId:'supplier-a',normalized:{...n,supplierProductCode:'300025890-10',titleRo:'NAPOLY DOMBOR CSILI',colorName:'CREM',colorCode:'CREM',size:'ONE SIZE'},newModelId:'model-833'});
 assert.equal(r.id,'832-old');
}
{
 await assert.rejects(()=>fn(fake([makeRow({color_code:'01'})]),{
  supplierId:'supplier-a',normalized:n,newModelId:'model-833'}),e=>e.code==='supplier_variant_color_code_conflict');
}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'jobs/data/mayo_833_original.json'),'utf8'));
assert.equal(manifest.rows.length,57);
assert.equal(manifest.rows.reduce((s,r)=>s+r.qty,0),88);
assert.equal(manifest.rows.find(r=>r.rowNo===21).sellPrice,139.5);
console.log('SIKER: 7 régi-variáns egyezés/ütközés próba, 57/88 eredeti sor és 60A ár ellenőrizve');
