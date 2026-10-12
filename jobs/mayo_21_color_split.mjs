import pg from 'pg';

const BATCH = 'bebf7410-053a-4cf9-856e-bae5003a30cd';
const APPLY = process.env.AIF_MAYO_APPLY === 'IGEN';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const c = await pool.connect();
const fail = message => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const txt = value => String(value ?? '').trim();
const key = value => txt(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const qty = value => Number(value || 0);
const same = (a,b) => key(a) === key(b);
const sourceColor = row => txt(row.raw?.CULOARE || row.raw?.raw?.CULOARE || row.normalized?.colorName);
const groupRows = rows => {
  const map = new Map();
  for (const row of rows) {
    const k = key(sourceColor(row));
    assert(k, `Hiányzik az import színe: ${row.row_no}`);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
};
const n2 = value => Math.round(qty(value) * 100);
const retailWeight = row => {
  const unit = Number(row.sell_price_ron ?? row.sell_price);
  return qty(row.qty) * (Number.isFinite(unit) && unit > 0 ? unit : 1);
};
const byId = rows => new Map(rows.map(row => [String(row.id), row]));
const safeJson = data => JSON.stringify(data);

try {
  await c.query('BEGIN');
  await c.query("SET LOCAL lock_timeout='5s'");
  await c.query("SET LOCAL statement_timeout='180s'");
  await c.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`aif_mayo_repair:${BATCH}`]);

  const batch = await c.query(`SELECT * FROM aif_import_batches WHERE id=$1::uuid FOR UPDATE`,[BATCH]);
  assert(batch.rowCount === 1 && batch.rows[0].status === 'committed', 'Az import nem befejezett vagy nem található.');
  const r = await c.query(`SELECT * FROM aif_import_rows WHERE batch_id=$1::uuid ORDER BY row_no FOR UPDATE`,[BATCH]);
  const rows = r.rows;
  assert(rows.length===118 && rows.every(x=>x.status==='committed') && rows.reduce((s,x)=>s+qty(x.qty),0)===192, 'Eltérő számla: nem 118 kész sor és 192 db.');
  const byVariant = new Map();
  for (const row of rows) {
    const id=txt(row.variant_id);
    assert(id,`Hiányzó variáns: ${row.row_no}`);
    if(!byVariant.has(id)) byVariant.set(id,[]);
    byVariant.get(id).push(row);
  }
  assert(byVariant.size===76,'A variánsok száma megváltozott (nem 76).');
  const mixed = [...byVariant.entries()].filter(([,rs])=>groupRows(rs).size>1);
  const originalIds = mixed.map(([id])=>id);
  const mixedRows = mixed.flatMap(([,rs])=>rs);
  assert(mixed.length===21 && mixedRows.length===62 && mixedRows.reduce((s,x)=>s+qty(x.qty),0)===99, 'Nem a várt 21 variáns / 62 sor / 99 db.');
  const vRes=await c.query(`SELECT * FROM aif_product_variants WHERE id=ANY($1::uuid[]) FOR UPDATE`,[originalIds]);
  const variants=byId(vRes.rows);
  assert(variants.size===21,'A 21 régi variánsból valamelyik hiányzik.');
  assert([...variants.values()].every(v=>txt(v.status).toLowerCase()==='active'),'Van nem aktív eredeti variáns.');
  const stRes=await c.query(`SELECT * FROM aif_stock WHERE variant_id=ANY($1::uuid[]) FOR UPDATE`,[originalIds]);
  const stByVariant=new Map(stRes.rows.map(x=>[txt(x.variant_id),x]));
  const scRes=await c.query(`SELECT * FROM aif_variant_supplier_codes WHERE variant_id=ANY($1::uuid[]) FOR UPDATE`,[originalIds]);
  const scByVariant=new Map();
  for(const x of scRes.rows){const id=txt(x.variant_id);assert(!scByVariant.has(id),`Több beszállítói kapcsolat: ${id}`);scByVariant.set(id,x);}
  assert(scRes.rows.length===21,`Nem 21 beszállítói kód található, hanem ${scRes.rows.length}.`);
  const mvRes=await c.query(`SELECT * FROM aif_stock_movements WHERE variant_id=ANY($1::uuid[]) ORDER BY created_at,id FOR UPDATE`,[originalIds]);
  const moves=mvRes.rows;
  const moveByRow=new Map();
  for(const m of moves){const id=txt(m.raw?.rowId);assert(id && !moveByRow.has(id),`Ismeretlen vagy duplikált készletmozgás: ${m.id}`);moveByRow.set(id,m);}
  assert(moves.length===62,`Nem 62 készletmozgás, hanem ${moves.length}.`);
  const batchRowIdSet=new Set(mixedRows.map(x=>String(x.id)));
  for(const m of moves){
    assert(batchRowIdSet.has(txt(m.raw?.rowId)) && txt(m.source_id)===BATCH && m.source_type==='import_batch' && qty(m.qty_delta)>0,`Idegen készletmozgás: ${m.id}`);
  }
  for(const row of mixedRows){
    const m=moveByRow.get(String(row.id));
    assert(m && txt(m.variant_id)===txt(row.variant_id) && qty(m.qty_delta)===qty(row.qty),`Importmozgás-eltérés a(z) ${row.row_no}. soron.`);
    assert(txt(m.location_id)===txt(stByVariant.get(txt(row.variant_id))?.location_id),`Készletmozgás célhelye eltér: ${row.row_no}`);
  }
  assert(stRes.rows.length===21,'Nem 21 készletsor létezik az érintett variánsoknál.');
  for(const [id,rs] of mixed){
    const s=stByVariant.get(id);
    assert(s && qty(s.reserved_qty)===0 && qty(s.qty)===rs.reduce((a,x)=>a+qty(x.qty),0),`Készlet / foglalás eltérés: ${id}`);
    assert(scByVariant.get(id)?.variant_id===id,`Beszállítói kód nem egyezik: ${id}`);
  }
  const retailRes=await c.query(`SELECT * FROM aif_stock_retail_book WHERE variant_id=ANY($1::uuid[]) FOR UPDATE`,[originalIds]);
  const retailByVariant=new Map(retailRes.rows.map(x=>[txt(x.variant_id),x]));
  assert(retailRes.rows.length===21,'Eladási áras készletérték: nem pontosan 21 sor. Megállítva.');
  for(const [id] of mixed){
    const book=retailByVariant.get(id);const st=stByVariant.get(id);
    assert(book && txt(book.location_id)===txt(st.location_id) && qty(book.qty)===qty(st.qty) && qty(book.book_value)>=0,`Eladási áras készletérték eltér: ${id}`);
  }
  const buffer=await c.query(`SELECT variant_id FROM aif_stock_retail_transfer_buffer WHERE variant_id=ANY($1::uuid[]) LIMIT 1`,[originalIds]);
  assert(!buffer.rowCount,'Van nyitott készletérték-áthelyezés. Javítás leállítva.');
  const priceRes=await c.query(`SELECT * FROM aif_price_change_document_lines WHERE variant_id=ANY($1::uuid[]) FOR UPDATE`,[originalIds]);
  for(const line of priceRes.rows){
    assert(line.source_import_row_id!=null,`Importsor nélkül naplózott árváltozás: ${line.id}. Nem mozgatható biztonságosan.`);
    assert(mixedRows.some(x=>String(x.id)===String(line.source_import_row_id)),`Az árváltozás nem a 62 javítandó importsorhoz tartozik: ${line.id}`);
  }
  const pastRows=await c.query(`SELECT count(*)::int AS count FROM aif_import_rows WHERE variant_id=ANY($1::uuid[]) AND batch_id<>$2::uuid`,[originalIds,BATCH]);
  assert(pastRows.rows[0].count===0,'Másik import is használja az érintett variánsokat.');

  const plan=[];
  for(const [oldId,rs] of mixed){
    const old=variants.get(oldId),colors=groupRows(rs),kept=key(old.color_name);
    assert(colors.has(kept),`A régi ${oldId} vonalkódjának színe nem szerepel az Excelben: ${old.color_name}`);
    const oldLink=scByVariant.get(oldId);
    for(const [color,group] of colors){
      const productCodes=[...new Set(group.map(x=>key(x.supplier_product_code)))];
      assert(productCodes.length===1 && productCodes[0],`Eltérő cikkszám egy variánsban: ${oldId} ${color}`);
      const code=txt(group[0].supplier_product_code);
      assert(same(code,oldLink.supplier_product_code),`Eltérő beszállítói cikkszám: ${oldId} ${code}`);
      assert(group.every(x=>same(x.supplier_size,old.size)),`Méreteltérés ${oldId} ${color}`);
      plan.push({oldId,color,label:sourceColor(group[0]),rows:group,keep:color===kept,old,oldLink,stock:stByVariant.get(oldId),book:retailByVariant.get(oldId),code,qty:group.reduce((a,x)=>a+qty(x.qty),0)});
    }
  }
  assert(plan.length===56 && plan.filter(x=>!x.keep).length===35,'Nem 35 új színvariáns lenne.');
  // Ha ugyanez a modell/szín/méret már máshol létezik, ahelyett hogy összevonnánk,
  // megállunk. A szétválasztás csak tiszta, egyértelmű forrásnál engedélyezett.
  const related=await c.query(`SELECT id,model_id,color_code,color_name,size,status FROM aif_product_variants WHERE model_id=ANY($1::uuid[])`,[[...new Set(vRes.rows.map(x=>String(x.model_id)))]]);
  for(const p of plan.filter(x=>!x.keep)){
    const duplicates=related.rows.filter(x=>String(x.model_id)===String(p.old.model_id) && same(x.size,p.old.size) && (same(x.color_name,p.label)||same(x.color_code,p.color)));
    assert(!duplicates.length,`Létező azonos szín/méret: ${p.code} ${p.color} ${p.old.size}. ${duplicates.map(x=>x.id).join(',')}`);
  }
  // Beszállítói kapcsolatok sem duplikálódhatnak. Más cikkszámot nem írunk át.
  const linkConflicts=await c.query(`SELECT id,variant_id,supplier_id,supplier_product_code,supplier_color_code,supplier_size FROM aif_variant_supplier_codes WHERE supplier_id=ANY($1::uuid[])`,[[...new Set(scRes.rows.map(x=>String(x.supplier_id)))]]);
  for(const p of plan.filter(x=>!x.keep)){
    const x=linkConflicts.rows.find(l=>String(l.supplier_id)===String(p.oldLink.supplier_id) && same(l.supplier_product_code,p.code) && same(l.supplier_color_code,p.color) && same(l.supplier_size,p.old.size));
    assert(!x,`Beszállítói színazonosító már foglalt: ${p.code} ${p.color} ${p.old.size}`);
  }
  console.log(`\nMAYO CHIX SZÉTVÁLASZTÁS: ${APPLY?'ÉLES JAVÍTÁS':'PRÓBA / NEM MÓDOSÍT'}`);
  console.table([{szamla:batch.rows[0].invoice_number,importsor:rows.length,darab:192,hibas_varians:mixed.length,erintett_db:99,mozgassor:moves.length,uj_varians:35,meglevo_barcode_megmarad:21,arvaltozas_sor:priceRes.rows.length}]);
  console.table(plan.filter(x=>!x.keep).map(x=>({cikk:x.code,szin:x.color,meret:x.old.size,db:x.qty,eredeti:x.oldId.slice(0,8)})));
  if(!APPLY){await c.query('ROLLBACK');console.log('\n✅ PRÓBA SIKERES. Nem történt módosítás.');console.log('Az éles futtatást csak a próba eredményének ellenőrzése után szabad indítani.');process.exit(0);}

  // Mentett adatbázis-pillantkép a helyreállítás előtti állapotról.
  await c.query(`CREATE TABLE IF NOT EXISTS aif_mayo_import_repair_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    snapshot jsonb NOT NULL,
    result jsonb
  )`);
  const previous=await c.query(`SELECT id FROM aif_mayo_import_repair_audit WHERE batch_id=$1::uuid`,[BATCH]);
  assert(previous.rowCount===0,'Ez a számla már rendelkezik javítási naplóval.');
  const backup={batch:batch.rows[0],variants:vRes.rows,importRows:mixedRows,movements:moves,stock:stRes.rows,retail:retailRes.rows,supplier:scRes.rows,priceLines:priceRes.rows};
  const audit=await c.query(`INSERT INTO aif_mayo_import_repair_audit(batch_id,snapshot) VALUES($1,$2::jsonb) RETURNING id`,[BATCH,safeJson(backup)]);
  const auditId=audit.rows[0].id;
  const newIds=[];

  // Az eredeti variáns mindig a saját, meglévő színéhez és BARCODE-jához marad kötve.
  for(const [oldId,rs] of mixed){
    const own=plan.find(x=>x.oldId===oldId && x.keep);
    const update=await c.query(`UPDATE aif_product_variants SET color_code=$2,color_name=$3,updated_at=now() WHERE id=$1 RETURNING id,barcode`,[oldId,own.color,own.label]);
    assert(update.rowCount===1 && txt(update.rows[0].barcode)===txt(own.old.barcode),`Régi vonalkód változna: ${oldId}`);
    const supplier=await c.query(`UPDATE aif_variant_supplier_codes SET supplier_color_code=$2,supplier_color_name=$3,updated_at=now() WHERE id=$1 RETURNING id`,[own.oldLink.id,own.color,own.label]);
    assert(supplier.rowCount===1,`Beszállítói kapcsolat nem frissíthető: ${oldId}`);
  }

  for(const p of plan.filter(x=>!x.keep)){
    const newest=p.rows[p.rows.length-1];
    const attrs={mayoColorRepair:{repairId:String(auditId),originalVariantId:p.oldId,sourceBatchId:BATCH,actualExcelColor:p.label}};
    const inserted=await c.query(`INSERT INTO aif_product_variants(
      model_id,barcode,color_code,color_name,color_hex,size,buy_price,sell_price,
      compare_at_price,weight_grams,image_url,sn_cod,attributes,status
    ) SELECT model_id,NULL,$2,$3,NULL,size,
        COALESCE($4::numeric,buy_price),COALESCE($5::numeric,sell_price),
        compare_at_price,weight_grams,NULL,NULL,
        (COALESCE(attributes,'{}'::jsonb)-'barcodeAssignedAt'-'barcodeAssignedBy'-'barcodeSource') || $6::jsonb,status
      FROM aif_product_variants WHERE id=$1 RETURNING id`,[
      p.oldId,p.color,p.label,
      newest.buy_price_ron??newest.buy_price??null,
      newest.sell_price_ron??newest.sell_price??null,
      safeJson(attrs)
    ]);
    assert(inserted.rowCount===1,`Új variáns létrehozása sikertelen: ${p.code} ${p.color}`);
    p.target=String(inserted.rows[0].id);newIds.push(p.target);
    const linked=await c.query(`INSERT INTO aif_variant_supplier_codes(
        variant_id,supplier_id,supplier_product_code,supplier_variant_code,
        supplier_color_code,supplier_color_name,supplier_size,supplier_barcode,supplier_sku,raw,is_active
      ) VALUES($1,$2,$3,NULL,$4,$5,$6,NULL,NULL,$7::jsonb,true)`,[
      p.target,p.oldLink.supplier_id,p.code,p.color,p.label,p.old.size,
      safeJson({source:'mayo_color_repair',repairId:String(auditId),originalSupplierCodeId:String(p.oldLink.id)})
    ]);
    assert(linked.rowCount===1,`Új beszállítói kapcsolat sikertelen: ${p.target}`);
  }
  for(const p of plan.filter(x=>x.keep))p.target=p.oldId;

  const mapping=new Map();
  for(const p of plan){for(const row of p.rows)mapping.set(String(row.id),p);}
  for(const row of mixedRows){
    const p=mapping.get(String(row.id));
    const upd=await c.query(`UPDATE aif_import_rows SET variant_id=$2::uuid,supplier_color_code=$4::text,
      normalized=COALESCE(normalized,'{}'::jsonb) || jsonb_build_object(
        'colorName',$3::text,'colorCode',$4::text,'supplierColorCode',$4::text,'supplier_color_code',$4::text,'variantId',$2::text,
        'mayoColorRepairId',$5::text
      ),updated_at=now() WHERE id=$1 AND status='committed' AND variant_id=$6::uuid RETURNING id`,[
      row.id,p.target,p.label,p.color,String(auditId),p.oldId
    ]);
    assert(upd.rowCount===1,`Import variánshivatkozás nem módosult: ${row.row_no}`);
  }

  // Az eladási áras készletérték teljes összege eredeti variánsonként változatlan marad.
  const allocated=new Map();
  for(const [oldId] of mixed){
    const related=plan.filter(x=>x.oldId===oldId);
    const total=n2(retailByVariant.get(oldId).book_value);
    const weightSum=related.reduce((s,p)=>s+p.rows.reduce((a,row)=>a+retailWeight(row),0),0);
    let leftover=total;
    for(let i=0;i<related.length;i++){
      const p=related[i],weight=p.rows.reduce((s,row)=>s+retailWeight(row),0);
      const cents=i===related.length-1?leftover:Math.round(total*(weightSum>0?weight/weightSum:p.qty/mixed.find(x=>x[0]===oldId)[1].reduce((s,row)=>s+qty(row.qty),0)));
      p.retailCents=cents;leftover-=cents;
      allocated.set(p.target,p);
    }
    assert(leftover===0 && related.reduce((s,x)=>s+x.retailCents,0)===total,`Készletérték kerekítés hiba: ${oldId}`);
  }

  // Importsorhoz kötött készletmozgások átkötése; a soronkénti előtt/utána készlet és
  // az eladási áras mozgásérték is újraszámolódik az új, önálló színvariánsban.
  const running=new Map();
  const bookRunning=new Map();
  const movementRowsByTarget=new Map();
  for(const m of moves){
    const p=mapping.get(txt(m.raw?.rowId));
    assert(p,`Hiányzó mozgás/import kapcsolat: ${m.id}`);
    if(!movementRowsByTarget.has(p.target))movementRowsByTarget.set(p.target,[]);
    movementRowsByTarget.get(p.target).push(m);
  }
  const moneyPerMovement=new Map();
  for(const p of plan){
    const relevant=movementRowsByTarget.get(p.target)||[];
    const weights=relevant.map(m=>retailWeight(rows.find(x=>String(x.id)===txt(m.raw?.rowId))));
    const weightSum=weights.reduce((a,b)=>a+b,0);
    let left=p.retailCents;
    relevant.forEach((m,i)=>{
      const cents=i===relevant.length-1?left:Math.round(p.retailCents*(weightSum>0?weights[i]/weightSum:1/relevant.length));
      moneyPerMovement.set(String(m.id),cents);left-=cents;
    });
    assert(left===0,`Árazási sorok összege eltér: ${p.code} ${p.color}`);
  }
  for(const m of moves){
    const p=mapping.get(txt(m.raw?.rowId));
    const before=running.get(p.target)||0,after=before+qty(m.qty_delta);
    const oldValue=bookRunning.get(p.target)||0,deltaCents=moneyPerMovement.get(String(m.id))||0,newValue=oldValue+deltaCents;
    const marker={repairId:String(auditId),originalVariantId:p.oldId,originalQtyBefore:m.qty_before,originalQtyAfter:m.qty_after,actualColor:p.label};
    const newRaw={...(m.raw||{}),retailBookQtyBefore:before,retailBookQtyAfter:after,
      retailBookValueBefore:oldValue/100,retailBookValueAfter:newValue/100,retailBookMovementValue:deltaCents/100,
      retailBookUnitValue:qty(m.qty_delta)?deltaCents/100/qty(m.qty_delta):0,
      mayoColorRepair:marker};
    const upd=await c.query(`UPDATE aif_stock_movements SET variant_id=$2::uuid,qty_before=$3,qty_after=$4,raw=$5::jsonb WHERE id=$1 AND variant_id=$6::uuid RETURNING id`,[
      m.id,p.target,before,after,safeJson(newRaw),p.oldId
    ]);
    assert(upd.rowCount===1,`Készletmozgás javítás sikertelen: ${m.id}`);
    running.set(p.target,after);bookRunning.set(p.target,newValue);
  }
  for(const p of plan){
    assert(running.get(p.target)===p.qty && bookRunning.get(p.target)===p.retailCents,`Nem zár a mozgástörténet: ${p.code} ${p.color}`);
    if(p.keep){
      const s=await c.query(`UPDATE aif_stock SET qty=$3,updated_at=now() WHERE variant_id=$1 AND location_id=$2 RETURNING variant_id`,[p.oldId,p.stock.location_id,p.qty]);
      const b=await c.query(`UPDATE aif_stock_retail_book SET qty=$3,book_value=$4,updated_at=now() WHERE variant_id=$1 AND location_id=$2 RETURNING variant_id`,[p.oldId,p.stock.location_id,p.qty,p.retailCents/100]);
      assert(s.rowCount===1 && b.rowCount===1,`Régi készletsor hibás: ${p.oldId}`);
    }else{
      await c.query(`INSERT INTO aif_stock(location_id,variant_id,qty,reserved_qty,updated_at) VALUES($1,$2,$3,0,now())`,[p.stock.location_id,p.target,p.qty]);
      await c.query(`INSERT INTO aif_stock_retail_book(location_id,variant_id,qty,book_value,seeded,updated_at) VALUES($1,$2,$3,$4,false,now())`,[p.stock.location_id,p.target,p.qty,p.retailCents/100]);
    }
  }
  // Az árváltozási bizonylat sorai, amennyiben importsorhoz kötődnek,
  // ugyanahhoz az új variánshoz kerülnek. Régi vonalkódot nem másolunk át.
  let movedPriceRows=0;
  for(const line of priceRes.rows){
    const p=mapping.get(String(line.source_import_row_id));
    if(p.keep)continue;
    const updated=await c.query(`UPDATE aif_price_change_document_lines SET variant_id=$2::uuid,color_name=$3,barcode=NULL WHERE id=$1 RETURNING id`,[line.id,p.target,p.label]);
    assert(updated.rowCount===1,`Árváltozási bizonylat javítás sikertelen: ${line.id}`);
    movedPriceRows++;
  }

  const final=await c.query(`SELECT count(*)::int AS sorok,COALESCE(sum(qty),0)::int AS db,count(DISTINCT variant_id)::int AS variansok FROM aif_import_rows WHERE batch_id=$1 AND status='committed'`,[BATCH]);
  assert(final.rows[0].sorok===118 && final.rows[0].db===192 && final.rows[0].variansok===111,'Nem 118 sor / 192 db / 111 variáns az eredmény.');
  const finalStock=await c.query(`SELECT COALESCE(sum(qty),0)::int AS db FROM aif_stock WHERE variant_id=ANY($1::uuid[])`,[[...new Set([...originalIds,...newIds])]]);
  const finalBook=await c.query(`SELECT COALESCE(sum(book_value),0)::numeric AS total FROM aif_stock_retail_book WHERE variant_id=ANY($1::uuid[])`,[[...new Set([...originalIds,...newIds])]]);
  const beforeBook=retailRes.rows.reduce((s,x)=>s+n2(x.book_value),0);
  assert(finalStock.rows[0].db===99 && n2(finalBook.rows[0].total)===beforeBook,'Összes készlet vagy eladási áras készletérték megváltozott.');
  const finalBarcodes=await c.query(`SELECT id::text AS id,barcode FROM aif_product_variants WHERE id=ANY($1::uuid[])`,[originalIds]);
  assert(finalBarcodes.rows.every(x=>txt(x.barcode)===txt(variants.get(x.id)?.barcode)),'Egy régi vonalkód megváltozott!');
  await c.query(`UPDATE aif_mayo_import_repair_audit SET result=$2::jsonb WHERE id=$1`,[auditId,safeJson({createdVariants:newIds,sourceRows:mixedRows.length,sourceQty:99,movedPriceRows,after:final.rows[0],retailBookValueRon:beforeBook/100})]);
  await c.query('COMMIT');
  console.log('\n✅ SIKER: 21 vegyes variáns szétválasztva, 35 új variáns létrehozva.');
  console.log('✅ 118 importsor / 192 darab / 111 külön variáns.');
  console.log('✅ 99 darab készlet, eredeti készletérték és minden régi vonalkód változatlan.');
  console.log('✅ Árváltozási sorok átkötve:',movedPriceRows);
  console.log('✅ Visszakereshető adatbázis-mentés azonosító:',auditId);
  console.log('⚠️ Az új 35 variáns vonalkódja még üres. A következő lépés a modellnevek, kategóriák, majd az új kódok rendezése.');
} catch(error){
  try{await c.query('ROLLBACK');}catch{}
  console.error('\n❌ JAVÍTÁS MEGSZAKÍTVA ÉS VISSZAVONVA:',error.message);
  process.exitCode=1;
} finally {c.release();await pool.end();}
