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
const KEY = `mayo_833_20261014_v2:${BATCH}`;
const PREVIOUS_BATCH = 'bebf7410-053a-4cf9-856e-bae5003a30cd';
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
const normalizedSize = value => ['one size','one-size','onesize','os','osfm','uni'].includes(norm(value)) ? 'one_size' : norm(value);
const sameSize = (a,b) => normalizedSize(a) !== '' && normalizedSize(a) === normalizedSize(b);


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
  // A nullás ForIT migráció csak termékazonosító, nem 0 feletti készlet.
  // Csak a pontosan bizonyított nulla sor engedhető át, minden más referencia blokkol.
  const legacyRefs=await tableExists('aif_legacy_migration_rows')
    ? await rows(`SELECT * FROM aif_legacy_migration_rows WHERE variant_id=ANY($1::uuid[])`,[variants]) : [];
  const benignLegacy=legacyRefs.every(x =>
    int(x.target_qty)===0 && int(x.stock_before)===0 && int(x.stock_after)===0 &&
    String(x.variant_id)==='4d2962fc-b1e1-41d3-b1d8-6f6dd9b7c062' && x.process_status==='done');
  const realExternal=external.filter(x=>x.table!=='aif_legacy_migration_rows');
  const unexpectedMovements=movements.filter(m=>
    m.source_type!=='import_batch' || String(m.source_id)!==BATCH ||
    !byId.has(String(m.raw?.rowId || m.raw?.row_id || ''))
  );
  const badMovementRows=importRows.filter(r=>repairIds.has(String(r.variant_id))).filter(r=>{
    const mv=rowMovements.get(String(r.id)) || [];
    return mv.length!==1 || String(mv[0].variant_id)!==String(r.variant_id) ||
      int(mv[0].qty_delta)!==int(r.qty) || String(mv[0].location_id)!==String(batch.target_location_id);
  });
  const problems=[];
  if(realExternal.length) problems.push(`Más modul is hivatkozik ezekre a variánsokra: ${JSON.stringify(realExternal)}`);
  if(!benignLegacy) problems.push('A ForIT migráció nem kizárólag nulla mennyiségű MONTEVERDI történeti sor.');
  if(unexpectedMovements.length) problems.push(`${unexpectedMovements.length} nem vizsgált készletmozgás van a 833-as érintett variánsokon.`);
  if(badMovementRows.length) problems.push(`${badMovementRows.length} import sorhoz nem egyértelmű készletmozgás tartozik.`);
  if(stocks.some(s=>int(s.reserved_qty)!==0)) problems.push('Van lefoglalt készlet a 833-as eredeti variánsokon.');
  for(const vid of variants){
    const s=stocks.filter(x=>String(x.variant_id)===vid);
    const m=movements.filter(x=>String(x.variant_id)===vid);
    const sum=int(m.reduce((acc,row)=>acc+int(row.qty_delta),0));
    const qty=int(s.reduce((acc,row)=>acc+int(row.qty),0));
    if(sum!==qty) problems.push(`833 készlet és tényleges mozgás nem egyezik: ${vid} ${qty} ≠ ${sum}`);
    if(s.some(x=>String(x.location_id)!==String(batch.target_location_id)))
      problems.push(`A 833-as forrás más helyen is készlettel rendelkezik: ${vid}`);
    if((supplierCodeByVariant.get(vid)||[]).length!==1)
      problems.push(`Nem egyértelmű 833-as beszállítói kapcsolat: ${vid}`);
    const b=books.filter(x=>String(x.variant_id)===vid);
    if(b.length!==1 || int(b[0].qty)!==qty || String(b[0].location_id)!==String(batch.target_location_id))
      problems.push(`833 retail book mennyiség/hely eltérés: ${vid}`);
    if(b.length && byVariant.has(vid)){
      // Az Excelből számolunk, nem az egyszer már hibásan feldolgozott sorárból.
      // Például a MONTEVERDI 60A: 279 RON a helyes könyvérték, nem 339.
      const expectedBookValue=money(byVariant.get(vid).reduce((acc,r)=>
        acc+int(r.qty)*money(lookup.get(int(r.row_no)).sellPrice),0));
      if(Math.abs(money(b[0].book_value)-expectedBookValue)>0.02)
        problems.push(`Retail könyvérték a forrás Excelhez képest eltér: ${vid} (könyv ${b[0].book_value}, Excel ${expectedBookValue})`);
    }
  }

  // Kizárólag a korábbi 832-es számla biztos, színhelyes variánsai lehetnek
  // célpontok: az ottani árakat, eladásokat és bevételezési sorokat megőrizzük.
  const previousSourceRows=await rows(`SELECT id,variant_id,qty FROM aif_import_rows WHERE batch_id=$1`,[PREVIOUS_BATCH]);
  assert(previousSourceRows.length===118,'A 832-es referencia 118 soros állománya időközben változott.');
  const previousRows=await rows(`SELECT rw.id AS source_row_id, rw.variant_id,
      rw.supplier_product_code, rw.supplier_size, rw.qty,
      rw.normalized->>'colorName' AS incoming_color,
      rw.normalized->>'titleRo' AS incoming_title,
      v.id, v.model_id, v.color_code, v.color_name, v.size, v.barcode,
      v.buy_price, v.sell_price, v.status,
      m.title_ro, m.brand_id,m.model_code,
      sc.id AS supplier_code_id, sc.supplier_id, sc.supplier_product_code AS link_code,
      sc.supplier_color_code AS link_color_code,sc.supplier_color_name AS link_color_name,
      sc.supplier_size AS link_size
    FROM aif_import_rows rw
    JOIN aif_import_batches b ON b.id=rw.batch_id
    JOIN aif_product_variants v ON v.id=rw.variant_id
    JOIN aif_product_models m ON m.id=v.model_id
    JOIN aif_variant_supplier_codes sc ON sc.variant_id=v.id AND sc.supplier_id=b.supplier_id
    WHERE b.id=$1 AND rw.status='committed' AND b.status='committed'`,[PREVIOUS_BATCH]);
  const sourceVariantSet=new Set(importRows.map(r=>String(r.variant_id)));
  const oldVariantDetails=new Map(variantDetails.map(x=>[String(x.id),x]));
  const oldModelDetails=new Map(models.map(x=>[String(x.id),x]));
  const reuseIds=new Set();
  const plans=[];
  for(const [vid,rr] of byVariant){
    const colors=[...new Set(rr.map(r=>norm(lookup.get(int(r.row_no)).color)))];
    if(colors.length<2) continue;
    const existing=oldVariantDetails.get(vid);
    assert(existing,`Hiányzó érintett variáns: ${vid}`);
    const keeperColor=norm(existing.color_name);
    if(!colors.includes(keeperColor)) problems.push(`Egyik eredeti szín sem egyezik az eredeti variánssal: ${vid}`);
    const oldModel=oldModelDetails.get(String(existing.model_id));
    const sourceLink=(supplierCodeByVariant.get(vid)||[])[0];
    const liveSiblings=await rows(`SELECT id,color_name,size,color_code FROM aif_product_variants
      WHERE model_id=$1 AND id<>$2 AND COALESCE(status,'active')<>'archived'`,[existing.model_id,vid]);
    const groups=colors.map(c=>{
      const colorRows=rr.filter(r=>norm(lookup.get(int(r.row_no)).color)===c);
      const ref=lookup.get(int(colorRows[0].row_no));
      return {color:ref.color,key:colKey(c),qty:colorRows.reduce((s,r)=>s+int(r.qty),0),
        rowNumbers:colorRows.map(r=>int(r.row_no)),keep:c===keeperColor,
        sourceCode:ref.code,sourceSize:ref.size,sourceTitle:ref.title,
        buyPrice:ref.buyPrice,sellPrice:ref.sellPrice,
        targetType:c===keeperColor?'keep':'create',targetVariantId:c===keeperColor?vid:null};
    });
    for(const g of groups){
      const previous=previousRows.filter(x=>
        !sourceVariantSet.has(String(x.id)) &&
        norm(x.supplier_product_code)===norm(g.sourceCode) &&
        sameSize(x.supplier_size,g.sourceSize) && sameSize(x.size,g.sourceSize) &&
        norm(x.color_name)===norm(g.color) && norm(x.incoming_color)===norm(g.color) &&
        norm(x.title_ro)===norm(g.sourceTitle) && norm(x.incoming_title)===norm(g.sourceTitle) &&
        String(x.brand_id)===String(oldModel?.brand_id) &&
        norm(x.link_code)===norm(g.sourceCode) && sameSize(x.link_size,g.sourceSize) &&
        (norm(x.link_color_name)===norm(g.color) || norm(x.link_color_code)===norm(g.key)) &&
        String(x.supplier_id)===String(batch.supplier_id) &&
        x.status!=='archived');
      const unique=[...new Map(previous.map(x=>[String(x.id),x])).values()];
      if(unique.length>1) problems.push(`Több 832-es célvariáns: ${g.sourceCode} / ${g.color} / ${g.sourceSize}`);
      if(unique.length===1){
        const candidate=unique[0];
        if(money(candidate.sell_price)!==money(g.sellPrice) || money(candidate.buy_price)!==money(g.buyPrice))
          problems.push(`832-es variánsár eltér az Exceltől: ${g.sourceCode} / ${g.color} / ${g.sourceSize} (${candidate.buy_price}/${candidate.sell_price})`);
        g.targetType='reuse';g.targetVariantId=String(candidate.id);
        reuseIds.add(String(candidate.id));
      }
      const sameModelConflict=liveSiblings.filter(x=>sameSize(x.size,existing.size) &&
        (norm(x.color_name)===norm(g.color) || norm(x.color_code)===norm(g.key)));
      if(sameModelConflict.length) problems.push(`A 833-as modellen belül már létezik külön szín-/méretvariáns: ${vid} / ${g.color} -> ${sameModelConflict[0].id}`);
      // Új vagy megtartott variánsnál új beszállítói kulcs szükséges; régi 832-es
      // felhasználásánál NEM hozunk létre új kapcsolatsort.
      if(g.targetType!=='reuse' && sourceLink){
        const duplicates=await rows(`SELECT id,variant_id FROM aif_variant_supplier_codes
          WHERE supplier_id=$1 AND lower(btrim(COALESCE(supplier_product_code,'')))=lower(btrim($2))
          AND lower(btrim(COALESCE(supplier_size,'')))=lower(btrim($3))
          AND lower(btrim(COALESCE(supplier_color_code,'')))=lower(btrim($4))
          AND id<>$5`,[sourceLink.supplier_id,sourceLink.supplier_product_code,sourceLink.supplier_size,g.key,sourceLink.id]);
        if(duplicates.length)problems.push(`Nem 832-es, ellenőrizendő beszállítói kulcs: ${vid} / ${g.color} -> ${duplicates[0].variant_id}`);
      }
    }
    plans.push({oldVariant:vid,modelCode:rr[0].live_model_code,name:rr[0].live_title,
      size:existing.size,totalQty:rr.reduce((s,r)=>s+int(r.qty),0),groups});
  }
  // A 832-es variáns lehet már eladással érintett. A 833-as készletet HOZZÁADJUK,
  // a régi készletet és mozgást soha nem írjuk újra.
  const reuseIdsArray=[...reuseIds];
  const candidateStocks=reuseIdsArray.length?await rows(`SELECT * FROM aif_stock WHERE variant_id=ANY($1::uuid[])`,[reuseIdsArray]):[];
  const candidateBooks=reuseIdsArray.length && await tableExists('aif_stock_retail_book')
    ? await rows(`SELECT * FROM aif_stock_retail_book WHERE variant_id=ANY($1::uuid[])`,[reuseIdsArray]):[];
  const candidateVariants=reuseIdsArray.length?await rows(`SELECT * FROM aif_product_variants WHERE id=ANY($1::uuid[])`,[reuseIdsArray]):[];
  const candidateMovements=reuseIdsArray.length?await rows(`SELECT * FROM aif_stock_movements WHERE variant_id=ANY($1::uuid[]) ORDER BY created_at,id`,[reuseIdsArray]):[];
  for(const vid of reuseIdsArray){
    const s=candidateStocks.filter(x=>String(x.variant_id)===vid);
    const b=candidateBooks.filter(x=>String(x.variant_id)===vid);
    const quantity=s.reduce((n,x)=>n+int(x.qty),0);
    if(!s.length||s.some(x=>int(x.reserved_qty)!==0))problems.push(`832-es célváltozat készlete hiányzik vagy foglalt: ${vid}`);
    if(b.length!==s.length || b.some(x=>{
       const match=s.find(st=>String(st.location_id)===String(x.location_id));
       return !match || Math.abs(int(x.qty)-int(match.qty))>0.001;
    }))problems.push(`832-es célváltozat retail könyv nem egyezik a készlettel: ${vid}`);
    const realMovements=candidateMovements.filter(x=>String(x.variant_id)===vid && x.source_type!=='stock_table_audit');
    if(realMovements.some(x=>!['import_batch','shop_sale'].includes(x.source_type)))
      problems.push(`832-es célváltozat ismeretlen készletmozgással: ${vid}`);
    const physicalByMovement=realMovements.reduce((n,x)=>n+int(x.qty_delta),0);
    if(Math.abs(physicalByMovement-quantity)>0.001)
      problems.push(`832-es célváltozat valós készletmozgásai nem adják ki a fizikai készletet: ${vid}: ${physicalByMovement}/${quantity}`);
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
    external, expected:manifest.rows, legacyRefs, reuseIds:reuseIdsArray,
    candidateStocks,candidateBooks,candidateVariants,candidateMovements,previousSourceRows };
}

function report(d){
  console.log('\n=== MAYO CHIX 833 | '+(APPLY?'JAVÍTÁS ELŐTTI ELLENŐRZÉS':'CSAK OLVASÓ ELŐNÉZET')+' ===');
  console.log('Számla:',d.batch.invoice_number,'| sor:',d.totals.rows,'| darab:',d.totals.qty);
  console.log('Szétválasztandó variánscsoport:',d.plans.length,
    '| valóban ÚJ variánsok:',d.plans.reduce((n,p)=>n+p.groups.filter(g=>g.targetType==='create').length,0),
    '| 832-es meglévőhöz csatlakozik:',d.plans.reduce((n,p)=>n+p.groups.filter(g=>g.targetType==='reuse').length,0),
    '| átvezetett db:',d.plans.reduce((n,p)=>n+p.groups.filter(g=>g.targetType!=='keep').reduce((acc,g)=>acc+g.qty,0),0));
  for(const p of d.plans){
    console.log('\n'+p.name+' '+p.size+' (eredeti variáns '+p.oldVariant+')');
    console.table(p.groups.map(g=>({szin:g.color,kod:g.key,db:g.qty,import_sor:g.rowNumbers.join(','),muvelet:g.targetType==='reuse'?'832-eshez hozzáad':g.targetType==='keep'?'833-as megtartása':'új variáns',cel:g.targetVariantId || '-'})));
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
  // A teljes célzott pillanatkép és minden átvezetés ugyanabban a tranzakcióban történik.
  await client.query(`CREATE TABLE IF NOT EXISTS aif_data_repair_backups (
    repair_key text PRIMARY KEY, batch_id uuid NOT NULL, snapshot jsonb NOT NULL,
    repair_note text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  )`);
  assert(!(await one(`SELECT 1 FROM aif_data_repair_backups WHERE repair_key=$1`,[KEY])),
    'Ez a helyreállítás már korábban megtörtént.');
  const snapshot={
    batch:d.batch, importRows:d.importRows, models:d.models,
    originalVariants:d.variantDetails,originalSupplierCodes:d.supp,
    originalStock:d.stocks,originalMovements:d.movements,originalRetailBook:d.books,
    reusedEarlierVariants:d.candidateVariants,
    reusedEarlierStock:d.candidateStocks,
    reusedEarlierRetailBook:d.candidateBooks,
    reusedEarlierMovements:d.candidateMovements,
    previous832SourceRows:d.previousSourceRows,
    zeroQuantityLegacyReferences:d.legacyRefs,
    originalExcel:d.expected,plans:d.plans,priceCorrections:d.priceCorrections,
    capturedAt:new Date().toISOString()
  };
  await client.query(`INSERT INTO aif_data_repair_backups(repair_key,batch_id,snapshot,repair_note)
    VALUES($1,$2,$3::jsonb,$4)`,[KEY,BATCH,JSON.stringify(snapshot),
    'MAYO CHIX 833: 832-es színhelyes variánsok újrahasznosítása, 833 szín/cikkszám/kategória és MONTEVERDI ár/modell javítás']);

  // Minden 833-as forrássor célvariánsát egyszer, még a mozgások előtt eldöntjük.
  const originalLedgerTotal=money([...d.books,...d.candidateBooks].reduce((n,b)=>n+Number(b.book_value||0),0));
  const originalStockTotal=[...d.stocks,...d.candidateStocks].reduce((n,s)=>n+Number(s.qty||0),0);
  const targetIdByRow=new Map(d.importRows.map(r=>[int(r.row_no),String(r.variant_id)]));
  const changedVariants=new Set();
  const newVariants=new Set();
  const groupByOld=new Map(d.plans.map(p=>[p.oldVariant,p]));
  for(const plan of d.plans){
    for(const group of plan.groups){
      let variantId=group.targetVariantId;
      if(group.targetType==='create'){
        const barcode=await uniqueBarcode();
        const inserted=await one(`INSERT INTO aif_product_variants(
          model_id,barcode,color_code,color_name,color_hex,size,buy_price,sell_price,
          compare_at_price,weight_grams,image_url,sn_cod,attributes,status)
          SELECT model_id,$2,$3,$4,NULL,size,$6,$7,
            compare_at_price,weight_grams,image_url,sn_cod,
            COALESCE(attributes,'{}'::jsonb)||$5::jsonb,'active'
          FROM aif_product_variants WHERE id=$1
          RETURNING id`,[plan.oldVariant,barcode,group.key,group.color,
            JSON.stringify({aifDataRepair:{key:KEY,originalVariantId:plan.oldVariant,
              color:group.color,sourceInvoice:d.batch.invoice_number}}),
            group.buyPrice,group.sellPrice]);
        assert(inserted?.id,`Nem sikerült variánst létrehozni: ${group.sourceCode} / ${group.color}`);
        variantId=String(inserted.id);
        newVariants.add(variantId);
        changedVariants.add(variantId);
      }
      assert(isUuid(variantId),`Nincs biztonságos célvariáns: ${plan.name} ${group.color}`);
      group.targetVariantId=variantId;
      for(const rowNo of group.rowNumbers)targetIdByRow.set(rowNo,variantId);
    }
    const keeper=plan.groups.find(g=>g.targetType==='keep');
    if(keeper){
      await client.query(`UPDATE aif_product_variants
        SET color_code=$2,color_name=$3,updated_at=now() WHERE id=$1`,
        [plan.oldVariant,keeper.key,keeper.color]);
    }else{
      // A rosszul felvett 833-as, most már üres variáns nem aktív termék.
      // Nem töröljük: helyreállítási nyoma és vonalkódja megmarad.
      await client.query(`UPDATE aif_product_variants SET status='archived',updated_at=now()
        WHERE id=$1 AND COALESCE(status,'active')<>'archived'`,[plan.oldVariant]);
    }
    changedVariants.add(plan.oldVariant);
  }

  // Az 57 sor száma, eredeti kódja, mennyisége megmarad. Csak a bizonyított
  // hibás színvariáns-kapcsolatok javulnak.
  for(const r of d.importRows){
    const plan=groupByOld.get(String(r.variant_id));
    if(!plan)continue;
    const x=manifest.rows.find(m=>int(m.rowNo)===int(r.row_no));
    const variantId=targetIdByRow.get(int(r.row_no));
    await client.query(`UPDATE aif_import_rows
      SET variant_id=$2,supplier_color_code=$3,
          normalized=COALESCE(normalized,'{}'::jsonb)||$4::jsonb,
          updated_at=now()
      WHERE id=$1`,[r.id,variantId,colKey(x.color),JSON.stringify({
        colorCode:colKey(x.color),supplierColorCode:colKey(x.color),colorName:x.color,
        aifColorIdentitySource:'color_name_without_explicit_code',
        aifDataRepair:{key:KEY,originalVariantId:String(r.variant_id),
          correctVariantId:variantId,correctColor:x.color},
      })]);
  }

  // A 832-es beszállítói azonosítókat nem írjuk át. Az újonnan létrehozott
  // 833-as színhez külön beszállítói kapcsolatsor kell.
  for(const plan of d.plans){
    const supplier=d.supp.find(s=>String(s.variant_id)===plan.oldVariant);
    assert(supplier && String(supplier.supplier_id)===String(d.batch.supplier_id),
      `Beszállítói kapcsolat időközben változott: ${plan.oldVariant}`);
    const keeper=plan.groups.find(g=>g.targetType==='keep');
    if(keeper){
      await client.query(`UPDATE aif_variant_supplier_codes SET
        supplier_color_code=$2,supplier_color_name=$3,
        raw=COALESCE(raw,'{}'::jsonb)||$4::jsonb,updated_at=now()
        WHERE id=$1`,[supplier.id,keeper.key,keeper.color,
          JSON.stringify({colorCode:keeper.key,supplierColorCode:keeper.key,
            colorName:keeper.color,supplierColorName:keeper.color,
            aifDataRepair:{key:KEY,color:keeper.color}})]);
    }else{
      await client.query(`UPDATE aif_variant_supplier_codes
        SET is_active=false,updated_at=now() WHERE id=$1`,[supplier.id]);
    }
    for(const group of plan.groups.filter(g=>g.targetType==='create')){
      const targetId=group.targetVariantId;
      await client.query(`INSERT INTO aif_variant_supplier_codes (
        variant_id,supplier_id,supplier_product_code,supplier_variant_code,
        supplier_color_code,supplier_color_name,supplier_size,supplier_barcode,
        supplier_sku,raw,is_active)
        SELECT $2,supplier_id,supplier_product_code,supplier_variant_code,
          $3,$4,supplier_size,NULL,supplier_sku,
          COALESCE(raw,'{}'::jsonb)||$5::jsonb,true
        FROM aif_variant_supplier_codes WHERE id=$1`,[
        supplier.id,targetId,group.key,group.color,
        JSON.stringify({colorCode:group.key,supplierColorCode:group.key,
          colorName:group.color,supplierColorName:group.color,
          aifDataRepair:{key:KEY,color:group.color}})
      ]);
    }
  }

  // Darab- és könyvérték-delták: forrásból kivonjuk, célhoz HOZZÁADJUK.
  // Egy korábban eladott 832-es terméknél a jelenlegi készlet nem írható felül!
  const deltas=new Map();
  const addDelta=(id,qty,value)=>{
    const current=deltas.get(id)||{qty:0,value:0};
    current.qty+=qty;current.value=money(current.value+value);
    deltas.set(id,current);
  };
  for(const plan of d.plans){
    for(const group of plan.groups){
      if(group.targetVariantId===plan.oldVariant)continue;
      const value=money(group.rowNumbers.reduce((total,rowNo)=>{
        const r=d.importRows.find(x=>int(x.row_no)===rowNo);
        const x=manifest.rows.find(x=>int(x.rowNo)===rowNo);
        return total+int(r.qty)*money(x.sellPrice);
      },0));
      addDelta(plan.oldVariant,-group.qty,-value);
      addDelta(group.targetVariantId,+group.qty,+value);
    }
  }

  // Csak a saját 833-as készletbevételezési esemény variánsát változtatjuk.
  // A korábbi 832-es számlasorok, eladások, stock_table_audit bejegyzések maradnak.
  for(const r of d.importRows){
    if(!groupByOld.has(String(r.variant_id)))continue;
    const newVariant=targetIdByRow.get(int(r.row_no));
    if(newVariant===String(r.variant_id))continue;
    const event=d.rowMovements.get(String(r.id))?.[0];
    assert(event && String(event.source_id)===BATCH,'A 833-as sor bevételezési mozgása hiányzik.');
    await client.query(`UPDATE aif_stock_movements SET variant_id=$2,
      raw=COALESCE(raw,'{}'::jsonb)||$3::jsonb
      WHERE id=$1 AND variant_id=$4`,[event.id,newVariant,
      JSON.stringify({aifDataRepair:{key:KEY,originalVariantId:String(r.variant_id),correctVariantId:newVariant}}),r.variant_id]);
  }

  const locationId=String(d.batch.target_location_id);
  for(const [id,delta] of deltas){
    if(!delta.qty)continue;
    if(delta.qty<0){
      const existing=await one(`UPDATE aif_stock SET qty=qty+$3,updated_at=now()
        WHERE location_id=$1 AND variant_id=$2 AND qty >= abs($3)
        AND COALESCE(reserved_qty,0)=0 RETURNING qty`,[locationId,id,delta.qty]);
      assert(existing,`Nem vonható le a 833-as készlet ${id} variánsról.`);
      if(await tableExists('aif_stock_retail_book')){
        const book=await one(`UPDATE aif_stock_retail_book
          SET qty=qty+$3,book_value=round((book_value+$4)::numeric,2),
          seeded=false,updated_at=now()
          WHERE location_id=$1 AND variant_id=$2
          AND qty >= abs($3) AND book_value+$4>=-0.01
          RETURNING qty,book_value`,[locationId,id,delta.qty,delta.value]);
        assert(book,`Nem vonható le a 833-as könyvérték ${id} variánsról.`);
      }
    }else{
      await client.query(`INSERT INTO aif_stock(location_id,variant_id,qty,reserved_qty,updated_at)
        VALUES($1,$2,$3,0,now())
        ON CONFLICT(location_id,variant_id) DO UPDATE SET
          qty=aif_stock.qty+EXCLUDED.qty,updated_at=now()`,[locationId,id,delta.qty]);
      if(await tableExists('aif_stock_retail_book')){
        await client.query(`INSERT INTO aif_stock_retail_book(location_id,variant_id,qty,book_value,seeded,updated_at)
          VALUES($1,$2,$3,$4,false,now())
          ON CONFLICT(location_id,variant_id) DO UPDATE SET
            qty=aif_stock_retail_book.qty+EXCLUDED.qty,
            book_value=round((aif_stock_retail_book.book_value+EXCLUDED.book_value)::numeric,2),
            seeded=false,updated_at=now()`,[locationId,id,delta.qty,delta.value]);
      }
    }
  }

  // A stock_table_audit duplikáló, nem fizikai árumozgás, így nem vesz részt
  // a darabok időrendi rekonstruálásában. A valódi 832-es események adatát nem
  // írjuk át. A 833-as események helyes, új variánshoz tartozó pillanatképet kapnak.
  const touched=[...new Set([...d.plans.map(x=>x.oldVariant),...d.reuseIds,...newVariants])];
  for(const id of touched){
    const movements=await rows(`SELECT id,location_id,source_type,source_id,qty_delta,
         created_at,qty_before,qty_after
         FROM aif_stock_movements WHERE variant_id=$1
         ORDER BY created_at,id`,[id]);
    const ledger=new Map();
    for(const event of movements){
      if(event.source_type==='stock_table_audit')continue;
      const key=String(event.location_id);
      const before=ledger.get(key)||0;
      const after=before+int(event.qty_delta);
      assert(after>=0,`Időrendben negatív készlet: ${id} / ${key}`);
      ledger.set(key,after);
      if(event.source_type==='import_batch' && String(event.source_id)===BATCH){
        await client.query(`UPDATE aif_stock_movements SET qty_before=$2,qty_after=$3
          WHERE id=$1`,[event.id,before,after]);
      }
    }
    const stock=await rows(`SELECT location_id,qty,reserved_qty
      FROM aif_stock WHERE variant_id=$1`,[id]);
    const locations=new Set([...ledger.keys(),...stock.map(x=>String(x.location_id))]);
    for(const loc of locations){
      const q=stock.find(x=>String(x.location_id)===loc);
      assert(Math.abs((ledger.get(loc)||0)-int(q?.qty))<0.001,
        `Készletmozgások és fizikai készlet eltér: ${id} / ${loc} (${ledger.get(loc)||0} / ${q?.qty||0})`);
    }
  }

  // Két MONTEVERDI megnevezéshez két modell kell. A 60A krém L ForIT
  // migrációs kapcsolata a DOMBOR modellben marad, azon 0 készlet volt.
  for(const c of d.modelTitleCollisions){
    const main=await one(`SELECT * FROM aif_product_models WHERE id=$1`,[c.modelId]);
    assert(norm(main.title_ro)==='monteverdi dombor himzes',
      'MONTEVERDI modellneve időközben megváltozott.');
    const altCode=`${main.model_code}__monteverdi_nagy_csili`;
    assert(!(await one(`SELECT id FROM aif_product_models WHERE model_code=$1`,[altCode])),
      `Már létezik a MONTEVERDI külön modell: ${altCode}`);
    const fresh=await one(`INSERT INTO aif_product_models (
      brand_id,category_id,subcategory_id,model_code,title_ro,title_hu,description_ro,
      gender,product_type,season,material,shopify_title,status)
      SELECT brand_id,category_id,subcategory_id,$2,$3,title_hu,description_ro,
        gender,product_type,season,material,$3,'active'
      FROM aif_product_models WHERE id=$1 RETURNING id`,
      [c.modelId,altCode,'MONTEVERDI NAGY CSILI']);
    for(const entry of c.names.filter(x=>norm(x.title)==='monteverdi nagy csili')){
      assert(!d.legacyRefs.some(x=>String(x.variant_id)===entry.variantId),
        'ForIT történettel rendelkező MONTEVERDI variáns nem helyezhető át név alapján.');
      await client.query(`UPDATE aif_product_variants SET model_id=$2,updated_at=now()
        WHERE id=$1`,[entry.variantId,fresh.id]);
    }
  }

  // Meglévő törzskategóriákat használunk; egyetlen kategóriát sem hozunk létre.
  for(const r of d.importRows){
    const source=manifest.rows.find(x=>int(x.rowNo)===int(r.row_no));
    const codes=TYPE_MAP[source.type];
    assert(codes,`Ismeretlen eredeti típus: ${source.type}`);
    const cat=d.categoryByCode.get(norm(codes[0]));
    const sub=codes[1]?d.categoryByCode.get(norm(codes[1])):null;
    const variantId=targetIdByRow.get(int(r.row_no));
    const model=await one(`SELECT m.id,m.title_ro,m.product_type FROM aif_product_variants v
      JOIN aif_product_models m ON m.id=v.model_id WHERE v.id=$1`,[variantId]);
    assert(model && norm(model.title_ro)===norm(source.title),
      `Modellnév eltérés: ${r.row_no}. sor (${model?.title_ro} / ${source.title})`);
    await client.query(`UPDATE aif_product_models SET
      category_id=$2,subcategory_id=$3,product_type=$4,updated_at=now()
      WHERE id=$1`,[model.id,cat.id,sub?.id||null,source.type]);
    await client.query(`UPDATE aif_import_rows SET
      normalized=COALESCE(normalized,'{}'::jsonb)||$2::jsonb,updated_at=now()
      WHERE id=$1`,[r.id,JSON.stringify({
        productType:source.type,categoryCode:cat.code,subcategoryCode:sub?.code||null,
        aifCategorySource:'original_rodescr_excel_verified'
      })]);
  }

  // A 60A eladási árát visszaállítjuk 139,50-re. A 279 RON könyvérték
  // MÁR ELEVE HELYES: nem könyveljük rá újra a 2 db árát.
  for(const fix of d.priceCorrections){
    const r=d.importRows.find(x=>int(x.row_no)===fix.rowNo);
    const vid=targetIdByRow.get(fix.rowNo);
    await client.query(`UPDATE aif_import_rows SET
      sell_price=$2,sell_price_ron=$2,
      normalized=COALESCE(normalized,'{}'::jsonb)||$3::jsonb,updated_at=now()
      WHERE id=$1`,[r.id,fix.excel,JSON.stringify({
        sellPrice:fix.excel,sellPriceRon:fix.excel,sellPriceGrossRon:fix.excel,
        aifOriginalExcelPriceCorrection:{key:KEY,old:fix.previous,new:fix.excel}
      })]);
    const corrected=await one(`UPDATE aif_product_variants
      SET sell_price=$2,updated_at=now()
      WHERE id=$1 AND sell_price=$3 RETURNING id`,[vid,fix.excel,fix.previous]);
    assert(corrected,`Az ár időközben változott: ${vid}`);
  }

  // A helyreállítás nem módosíthatja a teljes készlet darabszámát és könyvértékét.
  // A 60A 279 lejes könyvértéke már eleve a helyes forrásár volt.
  const conservationIds=[...new Set([...d.variants,...d.reuseIds,...newVariants])];
  const stockAfter=await rows(`SELECT location_id,variant_id,qty,reserved_qty
    FROM aif_stock WHERE variant_id=ANY($1::uuid[])`,[conservationIds]);
  const booksAfter=await rows(`SELECT location_id,variant_id,qty,book_value
    FROM aif_stock_retail_book WHERE variant_id=ANY($1::uuid[])`,[conservationIds]);
  const finalStockTotal=stockAfter.reduce((n,x)=>n+Number(x.qty||0),0);
  const finalBookTotal=money(booksAfter.reduce((n,x)=>n+Number(x.book_value||0),0));
  assert(Math.abs(originalStockTotal-finalStockTotal)<0.001,
    `Készletkonzervációs hiba: előtte ${originalStockTotal}, utána ${finalStockTotal}`);
  assert(Math.abs(originalLedgerTotal-finalBookTotal)<0.02,
    `Könyvérték-konzervációs hiba: előtte ${originalLedgerTotal}, utána ${finalBookTotal}`);
  for(const s of stockAfter){
    const book=booksAfter.find(x=>String(x.variant_id)===String(s.variant_id)
      && String(x.location_id)===String(s.location_id));
    assert(book && Math.abs(int(s.qty)-Number(book.qty||0))<0.001,
      `Retail könyv és fizikai készlet nem egyezik: ${s.variant_id}`);
  }
  // A 832-es számlát adatbázisban is újra ellenőrizzük: sorazonosítók,
  // kötött variánsok és számlán szereplő mennyiségek nem változhattak.
  const previousSourceRows=await rows(`SELECT rw.id,rw.variant_id,rw.qty
    FROM aif_import_rows rw WHERE rw.batch_id=$1`,[PREVIOUS_BATCH]);
  assert(previousSourceRows.length===118,'A 832-es számla 118 forrássora hiányzik.');
  const originalPrevious=new Map(d.previousSourceRows.map(x=>[String(x.id),x]));
  for(const r of previousSourceRows){
    const old=originalPrevious.get(String(r.id));
    assert(old && String(old.variant_id)===String(r.variant_id) && int(old.qty)===int(r.qty),
      `A 832-es számla forrássora megváltozott: ${r.id}`);
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
    // A 832-es lehetséges célvariánsokat is zároljuk a döntés ELŐTT.
    // Más kassza nem adhatja el közben az áthelyezés céljául kiválasztott darabot.
    const lockIds=await rows(`SELECT DISTINCT v.id::text AS id
      FROM aif_product_variants v
      WHERE v.id IN (SELECT DISTINCT variant_id FROM aif_import_rows WHERE batch_id=$1)
         OR v.id IN (
           SELECT sc.variant_id FROM aif_variant_supplier_codes sc
           JOIN aif_import_batches b ON b.id=$1 AND b.supplier_id=sc.supplier_id
           WHERE sc.supplier_product_code IN (
             SELECT supplier_product_code FROM aif_import_rows WHERE batch_id=$1
           )
         ) ORDER BY id`,[BATCH]);
    const allIds=lockIds.map(x=>x.id);
    await client.query(`SELECT id FROM aif_product_variants WHERE id=ANY($1::uuid[])
      ORDER BY id FOR UPDATE`,[allIds]);
    await client.query(`SELECT location_id,variant_id FROM aif_stock
      WHERE variant_id=ANY($1::uuid[]) ORDER BY location_id,variant_id FOR UPDATE`,[allIds]);
    if(await tableExists('aif_stock_retail_book')){
      await client.query(`SELECT location_id,variant_id FROM aif_stock_retail_book
        WHERE variant_id=ANY($1::uuid[]) ORDER BY location_id,variant_id FOR UPDATE`,[allIds]);
    }
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
