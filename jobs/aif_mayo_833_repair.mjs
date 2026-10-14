/**
 * AllInFashion | MAYO CHIX NE-MC1-2026-833 data repair.
 * Default: READ-ONLY AUDIT. --apply: single atomic PostgreSQL transaction with guardrails.
 * This script is intentionally specific to this invoice, never a generic database rewrite.
 * Run from project root: node jobs/aif_mayo_833_repair.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'data/mayo_833_original.json'), 'utf8'));
const BATCH = manifest.batchId;
const KEY = `mayo_833_20261014_v1:${BATCH}`;
const APPLY = process.argv.includes('--apply');
const silent = process.argv.includes('--json');
const TYPE_MAP = {
  BLUZA: ['IMBRACAMINTE', 'imbracaminte_bluza'],
  BLUGI: ['IMBRACAMINTE', 'imbracaminte_blugi'],
  PANTALONI: ['IMBRACAMINTE', 'imbracaminte_pantaloni'],
  ROCHIE: ['IMBRACAMINTE', 'imbracaminte_rochie'],
  TRENING: ['IMBRACAMINTE', 'imbracaminte_treninguri'],
  GEACA: ['IMBRACAMINTE', 'jachete_jachete'],
  'ELASTIC DE PAR': ['ACCESORII', null],
};
const norm = value => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
const colKey = value => norm(value).replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').toUpperCase();
const money = value => Math.round(Number(value ?? 0) * 100) / 100;
const int = value => Number(value || 0);
const assert = (ok, message) => { if (!ok) throw Error(message); };
const qident = value => '"' + String(value).replace(/"/g, '""') + '"';
const isUuid = value => /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(value ?? ''));

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
let client;
let tx = false;

async function rows(sql, params=[]) { return (await client.query(sql,params)).rows; }
async function one(sql, params=[]) { return (await rows(sql,params))[0] || null; }
async function tableExists(table) {
  return Boolean((await one(`SELECT to_regclass($1) IS NOT NULL AS ok`, [table]))?.ok);
}
async function fieldRefs(variantIds) {
  // Block unexpected downstream references: sales, transfers, Shopify, reservations, etc.
  // Whitelist only tables repaired in this script.
  const safe = new Set([
    'aif_import_rows','aif_stock_movements','aif_stock','aif_stock_retail_book',
    'aif_variant_supplier_codes'
  ]);
  const cols = await rows(`
    SELECT c.table_schema,c.table_name,c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema=c.table_schema AND t.table_name=c.table_name
    WHERE c.column_name='variant_id' AND t.table_type='BASE TABLE'
      AND c.table_schema=current_schema()
    ORDER BY c.table_name`);
  const found=[];
  for (const t of cols) {
    if (safe.has(t.table_name)) continue;
    const tab = `${qident(t.table_schema)}.${qident(t.table_name)}`;
    const n = await one(`SELECT count(*)::int AS n FROM ${tab} WHERE ${qident(t.column_name)}::text = ANY($1::text[])`,[variantIds]);
    if (n?.n) found.push({table:t.table_name,rows:n.n});
  }
  return found;
}

async function load() {
  const batch = await one(`SELECT b.*,s.name AS supplier_name,l.name AS location_name
    FROM aif_import_batches b
    JOIN aif_suppliers s ON s.id=b.supplier_id
    JOIN aif_locations l ON l.id=b.target_location_id
    WHERE b.id=$1`,[BATCH]);
  assert(batch,`Nem létezik a vizsgált batch: ${BATCH}`);
  assert(batch.status==='committed','A batch állapota nem committed. Megálltunk.');
  assert(batch.invoice_number===manifest.invoiceNumber,`Más számla: ${batch.invoice_number}`);
  const importRows=await rows(`SELECT rw.*,v.model_id,v.color_code AS live_color_code,
    v.color_name AS live_color_name,v.size AS live_size,v.sell_price AS live_sell_price,
    v.barcode AS live_barcode,v.status AS live_status,
    m.model_code AS live_model_code,m.title_ro AS live_title
    FROM aif_import_rows rw
    LEFT JOIN aif_product_variants v ON v.id=rw.variant_id
    LEFT JOIN aif_product_models m ON m.id=v.model_id
    WHERE rw.batch_id=$1 ORDER BY rw.row_no,rw.id`,[BATCH]);
  assert(importRows.length===57,`Az import ${importRows.length} soros, nem 57.`);
  assert(importRows.reduce((s,r)=>s+int(r.qty),0)===88,'Nem 88 darab az összesen.');
  assert(importRows.every(r=>r.status==='committed' && isUuid(r.variant_id)),'Nem minden sor committed / variánshoz kötött.');
  const lookup=new Map(manifest.rows.map(r=>[int(r.rowNo),r]));
  assert(lookup.size===57, 'A referencia Excel sorszámai nem egyediek.');
  const mismatches=[];
  for (const r of importRows) {
    const x=lookup.get(int(r.row_no));
    assert(x,`Nincs eredeti Excel-sor az ${r.row_no} importhoz`);
    for (const [field,a,b] of [
      ['kód',r.supplier_product_code,x.code],
      ['méret',r.supplier_size,x.size],
      ['szín',r.normalized?.colorName || r.normalized?.color_name,x.color],
      ['név',r.normalized?.titleRo || r.normalized?.title_ro,x.title]
    ]) {
      if (norm(a)!==norm(b)) mismatches.push({rowNo:r.row_no,field,db:a,excel:b});
    }
    if (int(r.qty)!==x.qty) mismatches.push({rowNo:r.row_no,field:'mennyiség',db:r.qty,excel:x.qty});
  }
  assert(!mismatches.length,`Az adatbázis eltér az eredeti Excel soraitól: ${JSON.stringify(mismatches.slice(0,12))}`);
  const byId=new Map(importRows.map(r=>[String(r.id),r]));
  const byVariant=new Map();
  for(const r of importRows){
    const key=String(r.variant_id);
    if(!byVariant.has(key)) byVariant.set(key,[]);
    byVariant.get(key).push(r);
  }
  // The older 832 invoice may share perfectly good variants with 833.
  // Do not block/alter those: inspect only the six collided variants and the
  // four MONTEVERDI variants whose model or price needs repair.
  const repairIds=new Set();
  for(const [vid,rr] of byVariant){
    if(new Set(rr.map(r=>norm(lookup.get(int(r.row_no)).color))).size>1)repairIds.add(vid);
  }
  for(const r of importRows){
    if(String(r.supplier_product_code).startsWith('112430-') || int(r.row_no)===21)
      repairIds.add(String(r.variant_id));
  }
  const variants=[...repairIds];
  const models=await rows(`SELECT * FROM aif_product_models
    WHERE id = ANY($1::uuid[])`,[[...new Set(importRows.map(r=>String(r.model_id)))] ]);
  const categories=await rows(`SELECT id,code,parent_id,name_ro FROM aif_categories`);
  const categoryByCode=new Map(categories.map(r=>[norm(r.code),r]));
  for(const [type,codes] of Object.entries(TYPE_MAP)) {
    const root=categoryByCode.get(norm(codes[0]));
    assert(root,`Hiányzik a fő kategória: ${codes[0]}`);
    if(codes[1]){
      const child=categoryByCode.get(norm(codes[1]));
      assert(child,`Hiányzik az alkategória: ${codes[1]}`);
      assert(String(child.parent_id)===String(root.id),`Rossz kategóriaszülő: ${codes[1]}`);
    }
  }
  const stocks=await rows(`SELECT * FROM aif_stock WHERE variant_id=ANY($1::uuid[])`,[variants]);
  const movements=await rows(`SELECT * FROM aif_stock_movements WHERE variant_id=ANY($1::uuid[])
    ORDER BY created_at,id`,[variants]);
  const supp=await rows(`SELECT * FROM aif_variant_supplier_codes WHERE variant_id=ANY($1::uuid[])`,[variants]);
  const variantDetails=await rows(`SELECT * FROM aif_product_variants WHERE id=ANY($1::uuid[])`,[variants]);
  const books=(await tableExists('aif_stock_retail_book'))
    ? await rows(`SELECT * FROM aif_stock_retail_book WHERE variant_id=ANY($1::uuid[])`,[variants]) : [];
  const supplierCodeByVariant=new Map();
  for(const s of supp){
    const k=String(s.variant_id);
    if(!supplierCodeByVariant.has(k)) supplierCodeByVariant.set(k,[]);
    supplierCodeByVariant.get(k).push(s);
  }
  const rowMovements=new Map();
  for (const m of movements){
    const id=String(m.raw?.rowId || m.raw?.row_id || '');
    if(id){
      if(!rowMovements.has(id)) rowMovements.set(id,[]);
      rowMovements.get(id).push(m);
    }
  }
  const external=await fieldRefs(variants);
  const unexpectedMovements=movements.filter(m=>
    m.source_type!=='import_batch' || String(m.source_id)!==BATCH ||
    !byId.has(String(m.raw?.rowId || m.raw?.row_id || ''))
  );
  // A javító script csak az érintett variánsok mozgásait tölti be.
  // A többi 57-es számlasor nem hiányzó mozgás, ezért nem itt vizsgáljuk.
  const badMovementRows=importRows.filter(r=>repairIds.has(String(r.variant_id))).filter(r=>{
    const mv=rowMovements.get(String(r.id)) || [];
    return mv.length!==1 || String(mv[0].variant_id)!==String(r.variant_id) ||
      int(mv[0].qty_delta)!==int(r.qty) || String(mv[0].location_id)!==String(batch.target_location_id);
  });
  const problems=[];
  if(external.length) problems.push(`Más modul is hivatkozik ezekre a variánsokra: ${JSON.stringify(external)}`);
  if(unexpectedMovements.length) problems.push(`${unexpectedMovements.length} nem vizsgált készletmozgás van.`);
  if(badMovementRows.length) problems.push(`${badMovementRows.length} import sorhoz nem egyértelmű készletmozgás tartozik.`);
  if(stocks.some(s=>int(s.reserved_qty)!==0)) problems.push('Van lefoglalt készlet.');
  for(const vid of variants){
    const s=stocks.filter(x=>String(x.variant_id)===vid);
    const m=movements.filter(x=>String(x.variant_id)===vid);
    const sum=int(m.reduce((acc,row)=>acc+int(row.qty_delta),0));
    const q=int(s.reduce((acc,row)=>acc+int(row.qty),0));
    if(sum!==q) problems.push(`Készlet és mozgások nem egyeznek: ${vid} ${q} ≠ ${sum}`);
    if(s.some(x=>String(x.location_id)!==String(batch.target_location_id)))
      problems.push(`Más helyen is van készlet: ${vid}`);
    if((supplierCodeByVariant.get(vid)||[]).length!==1)
      problems.push(`Nem egyértelmű a beszállítói kapcsolat: ${vid}`);
    const b=books.filter(x=>String(x.variant_id)===vid);
    if(b.length>1) problems.push(`Több retail book sor: ${vid}`);
    if(b.length && (int(b[0].qty)!==q || String(b[0].location_id)!==String(batch.target_location_id)))
      problems.push(`Retail book mennyiség/hely eltérés: ${vid}`);
    if(b.length && byVariant.has(vid)){
      const expectedBookValue=money(byVariant.get(vid).reduce((acc,r)=>acc+int(r.qty)*money(r.sell_price_ron),0));
      if(Math.abs(money(b[0].book_value)-expectedBookValue)>0.02)
        problems.push(`Retail könyvérték eltérés: ${vid} (könyv ${b[0].book_value}, import ${expectedBookValue})`);
    }
  }
  const plans=[];
  for(const [vid,rr] of byVariant){
    const colors=[...new Set(rr.map(r=>norm(lookup.get(int(r.row_no)).color)))];
    if(colors.length<2) continue;
    const existing=variantDetails.find(v=>String(v.id)===vid);
    assert(existing,`Hiányzó érintett variáns: ${vid}`);
    const keeperColor=norm(existing.color_name);
    if(!colors.includes(keeperColor)) problems.push(`Egyik eredeti szín sem egyezik a megtartott variánssal: ${vid}`);
    const groups=colors.map(c=>({
      color:rr.find(r=>norm(lookup.get(int(r.row_no)).color)===c)
        ? lookup.get(int(rr.find(r=>norm(lookup.get(int(r.row_no)).color)===c).row_no)).color : c,
      key:colKey(c),
      qty:rr.filter(r=>norm(lookup.get(int(r.row_no)).color)===c).reduce((s,r)=>s+int(r.qty),0),
      rowNumbers:rr.filter(r=>norm(lookup.get(int(r.row_no)).color)===c).map(r=>int(r.row_no)),
      keep:c===keeperColor,
    }));
    const existingAll=await rows(`SELECT id,color_name,size,color_code FROM aif_product_variants
      WHERE model_id=$1 AND id<>$2 AND COALESCE(status,'active')<>'archived'`,[existing.model_id,vid]);
    for(const g of groups) {
      const collision=existingAll.find(x=>norm(x.size)===norm(existing.size) &&
        (norm(x.color_name)===norm(g.color) || norm(x.color_code)===norm(g.key)));
      if(collision) problems.push(`Már létezik az elérni kívánt szín-/méretvariáns: ${vid} -> ${g.color} / ${existing.size} (${collision.id})`);
    }
    // Supplier key must be unique, including all variants from earlier invoices.
    for(const g of groups){
      const originalSupplier=(supplierCodeByVariant.get(vid)||[])[0];
      if(!originalSupplier)continue;
      const dup=await rows(`SELECT id,variant_id FROM aif_variant_supplier_codes
        WHERE supplier_id=$1
          AND lower(btrim(COALESCE(supplier_product_code,'')))=lower(btrim($2))
          AND lower(btrim(COALESCE(supplier_size,'')))=lower(btrim($3))
          AND lower(btrim(COALESCE(supplier_color_code,'')))=lower(btrim($4))
          AND id<>$5`,[originalSupplier.supplier_id,originalSupplier.supplier_product_code,
          originalSupplier.supplier_size,g.key,originalSupplier.id]);
      if(dup.length)problems.push(`Már létezik szín szerinti beszállítói kulcs: ${vid} / ${g.color} -> ${dup[0].variant_id}`);
    }
    plans.push({ oldVariant:vid, modelCode:rr[0].live_model_code, name:rr[0].live_title,
      size:existing.size, totalQty:rr.reduce((s,r)=>s+int(r.qty),0), groups });
  }
  const priceCorrections=importRows.filter(r=>money(r.sell_price_ron)!==money(lookup.get(int(r.row_no)).sellPrice))
    .map(r=>({rowNo:int(r.row_no),variantId:String(r.variant_id),previous:money(r.sell_price_ron),excel:lookup.get(int(r.row_no)).sellPrice, qty:int(r.qty)}));
  // The 2026-10-14 source comparison found a single, independently verified discrepancy.
  for(const p of priceCorrections){
    if(p.rowNo!==21 || p.previous!==169.5 || p.excel!==139.5)
      problems.push(`Nem jóváhagyott áreltérés: ${JSON.stringify(p)}`);
  }
  // For any correction, all rows sharing that variant must refer to the same desired price.
  for (const p of priceCorrections){
    const rr=byVariant.get(p.variantId);
    if(rr.some(r=>money(lookup.get(int(r.row_no)).sellPrice)!==p.excel))
      problems.push(`Vegyes eladási ár ugyanazon javítandó variánsban: ${p.variantId}`);
  }
  const modelTitleCollisions=[];
  const byModel=new Map();
  for(const r of importRows){
    const k=String(r.model_id);
    if(!byModel.has(k))byModel.set(k,[]);
    byModel.get(k).push(r);
  }
  for(const [mid, rr] of byModel){
    const names=[...new Set(rr.map(r=>norm(lookup.get(int(r.row_no)).title)))];
    if(names.length===1) continue;
    // The only approved model split in this invoice is the two MONTEVERDI titles.
    if(rr[0].live_model_code!=='mayo_chix:112430' ||
       !names.includes('monteverdi nagy csili') || !names.includes('monteverdi dombor himzes') || names.length!==2)
      problems.push(`Nem várt modellnév-ütközés: ${mid}: ${names.join('/')}`);
    modelTitleCollisions.push({modelId:mid,modelCode:rr[0].live_model_code,
      names:rr.map(r=>({rowNo:int(r.row_no),title:lookup.get(int(r.row_no)).title,variantId:String(r.variant_id)}))});
  }
  if(await tableExists('aif_price_change_document_lines')){
    const priceRefs=await rows(`SELECT variant_id::text,count(*)::int AS n FROM aif_price_change_document_lines
      WHERE variant_id=ANY($1::uuid[]) GROUP BY variant_id`,[variants]);
    if(priceRefs.length) problems.push(`Az érintett variánsoknak már van ármegállapító bizonylata: ${JSON.stringify(priceRefs)}`);
  }
  if(await tableExists('aif_data_repair_backups')) {
    if(await one(`SELECT repair_key FROM aif_data_repair_backups WHERE repair_key=$1`,[KEY]))
      problems.push('Ez a helyreállítás már korábban megtörtént. Újrafuttatás tilos.');
  }
  return { batch, importRows, byId, byVariant, variants, models, categories, categoryByCode,
    movements,rowMovements,stocks,books,supp,variantDetails,plans,priceCorrections,modelTitleCollisions,
    problems, totals:{rows:importRows.length,qty:importRows.reduce((s,r)=>s+int(r.qty),0)},
    external, expected:manifest.rows };
}

function report(d){
  const moved=d.plans.reduce((s,p)=>s+p.groups.filter(g=>!g.keep).reduce((n,g)=>n+g.qty,0),0);
  console.log('\n=== MAYO CHIX 833 | '+(APPLY?'JAVÍTÁS ELŐTTI ELLENŐRZÉS':'CSAK OLVASÓ ELŐNÉZET')+' ===');
  console.log('Számla:',d.batch.invoice_number,'| sor:',d.totals.rows,'| darab:',d.totals.qty);
  console.log('Szétválasztandó variánscsoport:',d.plans.length,'| új változatok:',d.plans.reduce((n,p)=>n+p.groups.filter(g=>!g.keep).length,0),'| átkönyvelendő db:',moved);
  for(const p of d.plans){
    console.log('\n'+p.name+' '+p.size+' (eredeti variáns '+p.oldVariant+')');
    console.table(p.groups.map(g=>({szin:g.color,kod:g.key,db:g.qty,import_sor:g.rowNumbers.join(','),muvelet:g.keep?'meglévő megtartása':'új variáns'})));
  }
  console.log('\nKülön modellt igénylő ütközések:',d.modelTitleCollisions.length);
  for(const p of d.modelTitleCollisions)console.log(p.modelCode,'-> MONTEVERDI NAGY CSILI / DOMBOR HIMZES');
  console.log('Excelhez viszonyított áreltérések:',JSON.stringify(d.priceCorrections));
  console.log('Kategóriahelyreállítás: az összes 57 sor szerinti 7 terméktípus, a meglévő kategóriatörzsben.');
  if(d.problems.length){
    console.log('\n!!! A javítás NEM INDÍTHATÓ !!!');
    for(const x of d.problems)console.log(' -',x);
  } else console.log('\nMinden előfeltétel rendben. A DRY-RUN semmit nem írt át.');
}

async function uniqueBarcode(){
  for(let i=0;i<40;i++){
    const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const candidate='AIF'+[...randomBytes(7)].map(x=>alphabet[x%alphabet.length]).join('');
    if(!(await one(`SELECT 1 FROM aif_product_variants WHERE barcode=$1`,[candidate])))return candidate;
  }
  throw Error('Nem sikerült ütközésmentes belső vonalkódot generálni.');
}

async function apply(d){
  assert(!d.problems.length,'Az előellenőrzésben eltérés van. Semmi nem módosítható.');
  // Create persistent, full original snapshot INSIDE the same transaction; rollback removes it too.
  await client.query(`CREATE TABLE IF NOT EXISTS aif_data_repair_backups (
    repair_key text PRIMARY KEY,
    batch_id uuid NOT NULL,
    snapshot jsonb NOT NULL,
    repair_note text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  assert(!(await one(`SELECT 1 FROM aif_data_repair_backups WHERE repair_key=$1`,[KEY])),'Korábban már megtörtént a javítás.');
  const snapshot={
    batch:d.batch,
    importRows:d.importRows.map(r=>({...r})),
    models:d.models,
    variants:d.variantDetails,
    supplierCodes:d.supp,
    stock:d.stocks,
    movements:d.movements,
    retailBook:d.books,
    originalExcel:d.expected,
    anticipatedPlan:d.plans,
    priceCorrections:d.priceCorrections,
    capturedAt:new Date().toISOString(),
  };
  await client.query(`INSERT INTO aif_data_repair_backups(repair_key,batch_id,snapshot,repair_note)
    VALUES ($1,$2,$3::jsonb,$4)`,[KEY,BATCH,JSON.stringify(snapshot),'MAYO CHIX 833: összevont színek, kategóriák, MONTEVERDI név, 60A eladási ár']);

  const targetIdByRow = new Map(d.importRows.map(r=>[int(r.row_no),String(r.variant_id)]));
  const updatedVariants=new Set();
  for(const plan of d.plans){
    const keeper=plan.groups.find(x=>x.keep);
    assert(keeper,`A megtartandó szín hiányzik: ${plan.oldVariant}`);
    await client.query(`UPDATE aif_product_variants
      SET color_code=$2,color_name=$3,updated_at=now() WHERE id=$1`,
      [plan.oldVariant,keeper.key,keeper.color]);
    updatedVariants.add(plan.oldVariant);
    for(const group of plan.groups){
      if(group.keep)continue;
      const barcode=await uniqueBarcode();
      const item=await one(`INSERT INTO aif_product_variants (
        model_id,barcode,color_code,color_name,color_hex,size,buy_price,sell_price,
        compare_at_price,weight_grams,image_url,sn_cod,attributes,status)
        SELECT model_id,$2,$3,$4,NULL,size,buy_price,sell_price,
          compare_at_price,weight_grams,image_url,sn_cod,
          COALESCE(attributes,'{}'::jsonb)||$5::jsonb,'active'
        FROM aif_product_variants WHERE id=$1
        RETURNING id`,[plan.oldVariant,barcode,group.key,group.color,
          JSON.stringify({aifRepair:{batchId:BATCH,originalVariantId:plan.oldVariant,source:'color_split',color:group.color}})]);
      assert(item?.id,'Új variáns létrehozása nem sikerült.');
      updatedVariants.add(String(item.id));
      for(const rowNo of group.rowNumbers)targetIdByRow.set(rowNo,String(item.id));
    }
  }
  // Each original import row retains its identity and qty, but points to its own real color.
  for(const r of d.importRows){
    const x=manifest.rows.find(m=>int(m.rowNo)===int(r.row_no));
    const variant=targetIdByRow.get(int(r.row_no));
    if(String(r.variant_id)!==variant){
      await client.query(`UPDATE aif_import_rows SET variant_id=$2,
        supplier_color_code=$3,
        normalized=COALESCE(normalized,'{}'::jsonb)||$4::jsonb,
        updated_at=now() WHERE id=$1`,[r.id,variant,colKey(x.color),JSON.stringify({
          colorCode:colKey(x.color),supplierColorCode:colKey(x.color),colorName:x.color,
          aifColorIdentitySource:'color_name_without_explicit_code',
          aifDataRepair:{key:KEY,originalVariantId:String(r.variant_id),correctColor:x.color},
        })]);
    } else if(d.plans.some(p=>p.oldVariant===String(r.variant_id))){
      await client.query(`UPDATE aif_import_rows SET supplier_color_code=$2,
        normalized=COALESCE(normalized,'{}'::jsonb)||$3::jsonb,updated_at=now()
        WHERE id=$1`,[r.id,colKey(x.color),JSON.stringify({
          colorCode:colKey(x.color),supplierColorCode:colKey(x.color),colorName:x.color,
          aifColorIdentitySource:'color_name_without_explicit_code',
          aifDataRepair:{key:KEY,originalVariantId:String(r.variant_id),correctColor:x.color}
        })]);
    }
  }
  // Rebuild the supplier-code mapping for split groups, without touching other batches.
  for(const plan of d.plans){
    const supplierRow=d.supp.find(s=>String(s.variant_id)===plan.oldVariant);
    assert(supplierRow && String(supplierRow.supplier_id)===String(d.batch.supplier_id),'Beszállítói kapcsolat megváltozott.');
    for(const group of plan.groups){
      const targetId=targetIdByRow.get(group.rowNumbers[0]);
      if(group.keep){
        await client.query(`UPDATE aif_variant_supplier_codes SET
          supplier_color_code=$2,supplier_color_name=$3,raw=COALESCE(raw,'{}'::jsonb)||$4::jsonb,
          updated_at=now() WHERE id=$1`,[supplierRow.id,group.key,group.color,
          JSON.stringify({colorCode:group.key,supplierColorCode:group.key,colorName:group.color,
            supplierColorName:group.color,aifDataRepair:{key:KEY,color:group.color}})]);
      } else {
        await client.query(`INSERT INTO aif_variant_supplier_codes (
          variant_id,supplier_id,supplier_product_code,supplier_variant_code,
          supplier_color_code,supplier_color_name,supplier_size,supplier_barcode,supplier_sku,raw,is_active)
          SELECT $2,supplier_id,supplier_product_code,supplier_variant_code,
            $3,$4,supplier_size,NULL,supplier_sku,COALESCE(raw,'{}'::jsonb)||$5::jsonb,true
          FROM aif_variant_supplier_codes WHERE id=$1`,[
          supplierRow.id,targetId,group.key,group.color,
          JSON.stringify({colorCode:group.key,supplierColorCode:group.key,colorName:group.color,
            supplierColorName:group.color,aifDataRepair:{key:KEY,color:group.color}})
        ]);
      }
    }
  }
  // Assign historic *incoming* movement to the correct source row's new variant.
  // No quantity/source/timestamp is deleted or changed.
  for(const r of d.importRows){
    const oldVariant=String(r.variant_id);
    const newVariant=targetIdByRow.get(int(r.row_no));
    if(newVariant===oldVariant)continue;
    const oldMovement=d.rowMovements.get(String(r.id))?.[0];
    assert(oldMovement,'Az import mozgás hiányzik.');
    await client.query(`UPDATE aif_stock_movements
      SET variant_id=$2,raw=COALESCE(raw,'{}'::jsonb)||$3::jsonb
      WHERE id=$1`,[oldMovement.id,newVariant,
      JSON.stringify({aifDataRepair:{key:KEY,originalVariantId:oldVariant,correctVariantId:newVariant}})]);
  }
  // Move the virtual stock and retail book values atomically with the movements.
  for(const plan of d.plans){
    const targets=new Map();
    for(const group of plan.groups){
      const id=targetIdByRow.get(group.rowNumbers[0]);
      const value=group.rowNumbers.reduce((sum,rowNo)=>{
        const r=d.importRows.find(x=>int(x.row_no)===rowNo);
        return sum+int(r.qty)*money(manifest.rows.find(x=>int(x.rowNo)===rowNo).sellPrice);
      },0);
      targets.set(id,{qty:group.qty,book:money(value)});
    }
    for(const [variantId,values] of targets){
      await client.query(`INSERT INTO aif_stock(location_id,variant_id,qty,reserved_qty,updated_at)
        VALUES ($1,$2,$3,0,now())
        ON CONFLICT(location_id,variant_id)
        DO UPDATE SET qty=EXCLUDED.qty,updated_at=now()`,[d.batch.target_location_id,variantId,values.qty]);
      if(await tableExists('aif_stock_retail_book')){
        await client.query(`INSERT INTO aif_stock_retail_book(location_id,variant_id,qty,book_value,seeded,updated_at)
          VALUES ($1,$2,$3,$4,false,now())
          ON CONFLICT(location_id,variant_id)
          DO UPDATE SET qty=EXCLUDED.qty,book_value=EXCLUDED.book_value,seeded=false,updated_at=now()`,
          [d.batch.target_location_id,variantId,values.qty,values.book]);
      }
    }
  }
  // Recalculate the before/after history per affected variant, chronological order.
  const affectedIds=[...new Set([...d.plans.map(p=>p.oldVariant), ...updatedVariants])];
  for(const id of affectedIds){
    const moves=await rows(`SELECT id,qty_delta FROM aif_stock_movements
      WHERE variant_id=$1 ORDER BY created_at,id`,[id]);
    let amount=0;
    for(const m of moves){
      const before=amount;amount+=int(m.qty_delta);
      assert(amount>=0,`Negatív időrendbeli készlet: ${id}`);
      await client.query(`UPDATE aif_stock_movements SET qty_before=$2,qty_after=$3 WHERE id=$1`,
        [m.id,before,amount]);
    }
    const stockQty=int((await one(`SELECT qty FROM aif_stock WHERE location_id=$1 AND variant_id=$2`,[d.batch.target_location_id,id]))?.qty);
    assert(amount===stockQty,`Készletmozgás és készlet nem egyezik a javítás végén: ${id}`);
  }
  // Give MONTEVERDI NAGY CSILI its own stable model, without rewriting DOMBOR's title.
  for(const c of d.modelTitleCollisions){
    const main=await one(`SELECT * FROM aif_product_models WHERE id=$1`,[c.modelId]);
    assert(norm(main.title_ro)==='monteverdi dombor himzes','MONTEVERDI megnevezése időközben megváltozott.');
    const altCode=`${main.model_code}__monteverdi_nagy_csili`;
    assert(!(await one(`SELECT id FROM aif_product_models WHERE model_code=$1`,[altCode])),`Már létezik a MONTEVERDI külön modell: ${altCode}`);
    const m=await one(`INSERT INTO aif_product_models (
      brand_id,category_id,subcategory_id,model_code,title_ro,title_hu,description_ro,
      gender,product_type,season,material,shopify_title,status)
      SELECT brand_id,category_id,subcategory_id,$2,$3,title_hu,description_ro,
        gender,product_type,season,material,$3,'active'
      FROM aif_product_models WHERE id=$1 RETURNING id`,[c.modelId,altCode,'MONTEVERDI NAGY CSILI']);
    for(const entry of c.names.filter(x=>norm(x.title)==='monteverdi nagy csili')){
      await client.query(`UPDATE aif_product_variants SET model_id=$2,updated_at=now() WHERE id=$1`,[entry.variantId,m.id]);
    }
  }
  // Restore known category + true product type. No new category is created.
  for(const r of d.importRows){
    const source=manifest.rows.find(x=>int(x.rowNo)===int(r.row_no));
    const codes=TYPE_MAP[source.type];
    assert(codes,`Ismeretlen típus: ${source.type}`);
    const cat=d.categoryByCode.get(norm(codes[0]));
    const sub=codes[1]?d.categoryByCode.get(norm(codes[1])):null;
    const variantId=targetIdByRow.get(int(r.row_no));
    const mm=await one(`SELECT model_id FROM aif_product_variants WHERE id=$1`,[variantId]);
    assert(mm,'Eltűnt az import variánsa.');
    const titleModels=await rows(`SELECT id,title_ro FROM aif_product_models WHERE id=$1`,[mm.model_id]);
    assert(norm(titleModels[0].title_ro)===norm(source.title),
      `Modell név eltérés a ${r.row_no}. sorban: ${titleModels[0].title_ro} / ${source.title}`);
    await client.query(`UPDATE aif_product_models SET category_id=$2,subcategory_id=$3,product_type=$4,updated_at=now()
      WHERE id=$1`,[mm.model_id,cat.id,sub?.id || null,source.type]);
    // After a correction, this committed row has the original correct, non-generic classification.
    await client.query(`UPDATE aif_import_rows SET
      normalized=COALESCE(normalized,'{}'::jsonb)||$2::jsonb,updated_at=now()
      WHERE id=$1`,[r.id,JSON.stringify({
        productType:source.type,categoryCode:cat.code,subcategoryCode:sub?.code || null,
        aifCategorySource:'original_rodescr_excel_verified',
      })]);
  }
  // Fix the invoice/source discrepancy on the 60A cream L item after the 57-row audit.
  for(const correction of d.priceCorrections){
    const r=d.importRows.find(x=>int(x.row_no)===correction.rowNo);
    const vid=targetIdByRow.get(correction.rowNo);
    await client.query(`UPDATE aif_import_rows SET sell_price=$2,sell_price_ron=$2,
      normalized=COALESCE(normalized,'{}'::jsonb)||$3::jsonb,updated_at=now()
      WHERE id=$1`,[r.id,correction.excel,JSON.stringify({
        sellPrice:correction.excel,sellPriceRon:correction.excel,
        sellPriceGrossRon:correction.excel,
        aifOriginalExcelPriceCorrection:{key:KEY,old:correction.previous,new:correction.excel}
      })]);
    await client.query(`UPDATE aif_product_variants SET sell_price=$2,updated_at=now() WHERE id=$1`,
      [vid,correction.excel]);
    if(await tableExists('aif_stock_retail_book')){
      await client.query(`UPDATE aif_stock_retail_book SET book_value=$2*qty,updated_at=now()
        WHERE variant_id=$1`,[vid,correction.excel]);
    }
  }
  const finalRows=await rows(`SELECT rw.row_no,rw.qty,rw.variant_id::text AS variant_id,
    rw.normalized->>'colorName' AS color_name,v.color_name AS live_color,
    rw.sell_price_ron,v.sell_price AS live_price,m.title_ro,m.product_type,
    c.code AS category_code,sc.code AS subcategory_code
    FROM aif_import_rows rw JOIN aif_product_variants v ON v.id=rw.variant_id
    JOIN aif_product_models m ON m.id=v.model_id
    LEFT JOIN aif_categories c ON c.id=m.category_id
    LEFT JOIN aif_categories sc ON sc.id=m.subcategory_id
    WHERE rw.batch_id=$1 ORDER BY rw.row_no`,[BATCH]);
  let finalQty=0;
  for(const rw of finalRows){
    const reference=manifest.rows.find(x=>int(x.rowNo)===int(rw.row_no));
    assert(norm(rw.live_color)===norm(reference.color),`Végső szín eltérés: ${rw.row_no}`);
    assert(norm(rw.title_ro)===norm(reference.title),`Végső megnevezés eltérés: ${rw.row_no}`);
    assert(norm(rw.product_type)===norm(reference.type),`Végső terméktípus eltérés: ${rw.row_no}`);
    assert(money(rw.live_price)===reference.sellPrice && money(rw.sell_price_ron)===reference.sellPrice,
      `Végső eladási ár eltérés: ${rw.row_no}`);
    const cats=TYPE_MAP[reference.type];
    assert(norm(rw.category_code)===norm(cats[0]) && norm(rw.subcategory_code)===norm(cats[1]),
      `Végső kategória eltérés: ${rw.row_no}`);
    finalQty+=int(rw.qty);
  }
  assert(finalRows.length===57 && finalQty===88,'Hibás végső 57 sor / 88 db.');
  // Existing correct variants may also have earlier invoices. Compare the 833
  // receipt's movements, not the all-time stock of those variants.
  const batchMovements=await one(`SELECT COALESCE(sum(qty_delta),0) AS qty,count(*)::int AS entries
    FROM aif_stock_movements WHERE source_type='import_batch' AND source_id=$1`,[BATCH]);
  assert(int(batchMovements.qty)===88 && int(batchMovements.entries)===57,
    'A helyreállított számla 57 importmozgása / 88 darabja nem egyezik.');
  console.log('\nVÉGSŐ ELLENŐRZÉS: 57 külön import sor, összesen 88 db, helyes színek, típusok, modellnevek és árak.');
  return finalRows;
}

try {
  assert(process.env.DATABASE_URL,'Hiányzik a Render DATABASE_URL.');
  client=await pool.connect();
  await client.query(APPLY?'BEGIN':'BEGIN READ ONLY'); tx=true;
  await client.query("SET LOCAL statement_timeout='120s'");
  await client.query("SET LOCAL lock_timeout='5s'");
  if(APPLY){
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`,[KEY]);
    await client.query(`SELECT id FROM aif_import_batches WHERE id=$1 FOR UPDATE`,[BATCH]);
    // A konkurens eladás, átadás, készletkorrekció nem módosíthatja közben
    // ugyanazokat a fizikai készletsorokat. MINDEN érintett sort csak ezután olvasunk.
    await client.query(`SELECT v.id FROM aif_product_variants v
      WHERE v.id IN (SELECT DISTINCT variant_id FROM aif_import_rows WHERE batch_id=$1)
      ORDER BY v.id FOR UPDATE`,[BATCH]);
    await client.query(`SELECT s.location_id,s.variant_id FROM aif_stock s
      WHERE s.variant_id IN (SELECT DISTINCT variant_id FROM aif_import_rows WHERE batch_id=$1)
      ORDER BY s.location_id,s.variant_id FOR UPDATE`,[BATCH]);
  }
  const d=await load();
  if(!silent)report(d);
  if(d.problems.length)throw Error('Az audit biztonsági eltérést talált. Semmi nem változott.');
  if(APPLY){
    await apply(d);
    await client.query('COMMIT');tx=false;
    console.log('SIKER: A javítás atomikusan mentve. Helyreállítási pillanatkép:',KEY);
  }else{
    await client.query('ROLLBACK');tx=false;
    console.log('DRY-RUN VÉGE. Az éles adatbázis változatlan.');
    console.log('Külön jóváhagyás után: node jobs/aif_mayo_833_repair.mjs --apply');
  }
}catch(error){
  if(tx){try{await client.query('ROLLBACK');}catch{} }
  console.error('\nMEGÁLLT, nincs részleges javítás:',error?.message || String(error));
  process.exitCode=1;
}finally{
  client?.release();
  await pool.end();
}
