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
const sourceTitle = row => txt(row.raw?.ARTICOL || row.raw?.['ARTICOL/ DENUMIRE PRODUS'] || row.raw?.raw?.ARTICOL || row.normalized?.titleRo);
const sourceType = row => txt(row.raw?.RODESCR || row.raw?.raw?.RODESCR || row.normalized?.sourceSubCategory || '');
const modelCodeFor = code => 'mayo_chix:' + txt(code).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
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

  // Éles futtatáshoz a módosítási kapcsoló MELLETT a számlát is külön meg kell erősíteni.
  assert(!APPLY || process.env.AIF_MAYO_CONFIRM === 'E-MC1-2026-832',
    'Éles javításhoz a számla külön megerősítése hiányzik. Nincs módosítás.');
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
  // Az eredeti import 24 alapmodell alá rakta a 29 KÜLÖNBÖZŐ teljes cikkszámot.
  // A javított backend már a teljes cikkszámra keres modellt. Itt a meglévő
  // 76 variánst is az új, stabil modell-identitáshoz igazítjuk, ID és barcode cseréje nélkül.
  const allOriginalIds=[...byVariant.keys()];
  const allVResult=await c.query(`SELECT * FROM aif_product_variants WHERE id=ANY($1::uuid[]) FOR UPDATE`,[allOriginalIds]);
  const allVById=byId(allVResult.rows);
  assert(allVById.size===76,'A 76 számlavariánsból hiányzik legalább egy.');
  const originalModelIds=[...new Set(allVResult.rows.map(v=>txt(v.model_id)))];
  const allModelResult=await c.query(`SELECT * FROM aif_product_models WHERE id=ANY($1::uuid[]) FOR UPDATE`,[originalModelIds]);
  const oldModels=byId(allModelResult.rows);
  assert(oldModels.size===24,`Nem 24 Mayo alapmodell található, hanem ${oldModels.size}.`);
  assert([...oldModels.values()].every(m=>txt(m.model_code).startsWith('mayo_chix:')),'Nem Mayo Chix modell is található a számlában.');
  // A nem összevont régi variánsok beszállítói színkódját is rendezni kell.
  // Új import már a valódi színt használja, tehát a régi -01/-03A kód nem maradhat
  // színazonosítóként egyik készleten levő Mayo-variánsnál sem.
  const allLinkRes=await c.query(`SELECT * FROM aif_variant_supplier_codes WHERE variant_id=ANY($1::uuid[]) FOR UPDATE`,[allOriginalIds]);
  const allLinkByVariant=new Map();
  for(const link of allLinkRes.rows){
    const id=txt(link.variant_id);
    assert(!allLinkByVariant.has(id),`Több beszállítói kapcsolat tartozik egy régi variánshoz: ${id}`);
    allLinkByVariant.set(id,link);
  }
  assert(allLinkByVariant.size===76,`Nem pontosan 76 beszállítói variánshivatkozás található, hanem ${allLinkByVariant.size}.`);
  const relatedAll=await c.query(`SELECT id::text AS id,model_id::text AS model_id,barcode,color_code,color_name,size,status FROM aif_product_variants WHERE model_id=ANY($1::uuid[])`,[originalModelIds]);
  const outside=relatedAll.rows.filter(v=>!byVariant.has(v.id));
  // A számlán KÍVÜLI 37 variáns közül 9-nek van korábbi készlete vagy mozgása.
  // Ezeket NEM módosítjuk; a négy érintett régi alapkódos modell is változatlan marad.
  const protectedModelIds=new Set(outside.map(v=>txt(v.model_id)));
  assert(outside.length===37 && protectedModelIds.size===4,
    `Megváltoztak a számlán kívüli variánsok / modellek: ${outside.length} variáns, ${protectedModelIds.size} modell. Új ellenőrzés szükséges.`);
  const outsideSnapshot=byId(outside);
  const protectedModelsSnapshot=new Map([...protectedModelIds].map(id=>[id,oldModels.get(id)]));
  assert([...protectedModelsSnapshot.values()].every(Boolean),'Nem található a védett régi modellek valamelyike.');
  console.log('\n=== VÉDETT KORÁBBI MAYO-TERMÉKEK ===');
  console.table([...protectedModelIds].map(id=>({
    modell:oldModels.get(id)?.model_code,
    erintetlen_variansok:outside.filter(v=>txt(v.model_id)===id).length,
    teendo:'RÉGI MODELL VÁLTOZATLAN MARAD'
  })));
  console.log('Összesen 37 számlán kívüli variáns, egyik sem része a javításnak.');
  const externalImports=await c.query(`SELECT count(*)::int AS c FROM aif_import_rows WHERE variant_id=ANY($1::uuid[]) AND batch_id<>$2::uuid`,[allOriginalIds,BATCH]);
  assert(Number(externalImports.rows[0].c)===0,'A 76 variáns közül valamelyik másik importnál is szerepel.');
  const extraInvoiceMoves=await c.query(`
    SELECT variant_id::text AS variant_id,source_type,source_id::text AS source_id
    FROM aif_stock_movements
    WHERE variant_id=ANY($1::uuid[])
      AND NOT (source_type='import_batch' AND source_id::text=$2::text)
    LIMIT 20`,[allOriginalIds,BATCH]);
  assert(!extraInvoiceMoves.rowCount,
    `A számla 76 variánsa közül valamelyik már más mozgásban szerepel: ${extraInvoiceMoves.rows.map(x=>x.variant_id).join(', ')}. Kézi egyeztetés szükséges.`);

  const modelGroups=new Map();
  const existingRowsByVariant=new Map();
  for(const [id,group] of byVariant){
    const v=allVById.get(id);
    assert(v,`Nincs meg a régi variáns: ${id}`);
    const codes=[...new Set(group.map(row=>key(row.supplier_product_code)))];
    const titles=[...new Set(group.map(row=>key(sourceTitle(row))))];
    const types=[...new Set(group.map(row=>key(sourceType(row))))];
    assert(codes.length===1 && codes[0],`Egyetlen régi variáns több cikkszámot hordoz: ${id}`);
    assert(titles.length===1 && titles[0],`Azonos cikkszám alatt eltérő nevek vannak: ${id}`);
    assert(types.length===1 && types[0],`Egy cikkszámhoz eltérő RODESCR tartozik: ${id}`);
    assert(group.every(row=>same(row.supplier_size,v.size)),`Méretütközés a(z) ${id} variánsnál.`);
    if(groupRows(group).size===1){
      assert(same(v.color_name,sourceColor(group[0])),`Nem összevont, de hibás színű variáns: ${id}. Nem írom át ellenőrzés nélkül.`);
    }
    const code=txt(group[0].supplier_product_code);
    const link=allLinkByVariant.get(id);
    assert(link && same(link.supplier_product_code,code) && same(link.supplier_size,v.size),`Nem a megfelelő beszállítói cikkszám/méret van a variánshoz kötve: ${id}`);
    const descriptor={id,oldModelId:txt(v.model_id),code,name:sourceTitle(group[0]),type:sourceType(group[0]),rowQty:group.reduce((a,row)=>a+qty(row.qty),0)};
    existingRowsByVariant.set(id,descriptor);
    const k=descriptor.oldModelId;
    if(!modelGroups.has(k))modelGroups.set(k,new Map());
    const models=modelGroups.get(k);
    const ident=modelCodeFor(code);
    if(!models.has(ident))models.set(ident,[]);
    models.get(ident).push(descriptor);
  }
  const modelPlan=[];
  const modelPlanByCode=new Map();
  for(const [oldModelId,codes] of modelGroups){
    const oldModel=oldModels.get(oldModelId);
    assert(oldModel,`Ismeretlen modell ${oldModelId}`);
    const entries=[...codes].map(([code,vs])=>{
      const names=[...new Set(vs.map(x=>key(x.name)))];
      const types=[...new Set(vs.map(x=>key(x.type)))];
      assert(names.length===1 && types.length===1,`Inkonzisztens név vagy típus: ${code}`);
      return {oldModelId,oldModel,code,codeValue:vs[0].code,name:vs[0].name,type:vs[0].type,variants:vs,qty:vs.reduce((s,x)=>s+x.rowQty,0),keep:false,target:null};
    });
    entries.sort((a,b)=>(Number(same(b.name,oldModel.title_ro))-Number(same(a.name,oldModel.title_ro))) || b.qty-a.qty || a.code.localeCompare(b.code));
    // Csak a régi, számlán KÍVÜLI variáns NÉLKÜLI modell nevezhető át.
    // Amelyikhez másik készlet tartozik, azt érintetlenül hagyjuk, és az
    // aktuális számla minden teljes cikkszámához ÚJ modell kerül.
    if(!protectedModelIds.has(oldModelId))entries[0].keep=true;
    for(const item of entries){
      assert(!modelPlanByCode.has(item.code),`Ugyanaz a teljes cikkszám több modell alatt: ${item.code}`);
      modelPlanByCode.set(item.code,item);
      modelPlan.push(item);
    }
  }
  assert(modelPlan.length===29 && modelPlan.filter(x=>!x.keep).length===9 && modelPlan.filter(x=>x.keep).length===20,
    'Nem 29 számlamodell, 9 új és 20 biztonságosan átnevezhető modell adódik.');
  const collisions=await c.query(`SELECT id::text AS id,model_code FROM aif_product_models WHERE model_code=ANY($1::text[])`,[modelPlan.map(p=>p.code)]);
  for(const hit of collisions.rows){
    const wanted=modelPlanByCode.get(hit.model_code);
    assert(wanted?.keep && wanted.oldModelId===hit.id,`Már van másik modell ezzel a teljes cikkszámmal: ${hit.model_code} (${hit.id})`);
  }
  // A végleges modell + tényleges szín + méret egyértelmű legyen minden importsornál.
  const expectedCombos=new Set();
  for(const row of rows){
    const combo=[modelCodeFor(row.supplier_product_code),key(sourceColor(row)),key(row.supplier_size)].join('|');
    expectedCombos.add(combo);
  }
  assert(expectedCombos.size===111,`A tervezett modell/szín/méret variánsok száma ${expectedCombos.size}, nem 111.`);

  // A korábbi, két téves "ütközés" (FULTON/FULTON HIMZES) ezzel megszűnik:
  // más TELJES cikkszám --> más modell, az egyedi indexet sem sértjük.
  const sourceModelForVariant=id=>{
    const descriptor=existingRowsByVariant.get(id);
    return descriptor && modelPlanByCode.get(modelCodeFor(descriptor.code));
  };
  // Eltérő teljes cikkszámok színnév-egyezése nem termékazonosság. Az
  // adatbázis UNIQUE (model_id,color_code,size) kulcsát a külön modell védi.
  // A már meglevő, pontosan ugyanilyen teljes cikkszám / szín / méret esetén
  // továbbra is megszakítjuk az új variáns létrehozását.
  const finalOriginalIdentities=new Set();
  for(const [id,group] of byVariant){
    if(groupRows(group).size!==1)continue;
    const m=sourceModelForVariant(id);
    const composite=[m.code,key(sourceColor(group[0])),key(allVById.get(id).size)].join('|');
    assert(!finalOriginalIdentities.has(composite),`Duplikált meglévő termékazonosság: ${composite}`);
    finalOriginalIdentities.add(composite);
  }
  for(const p of plan.filter(x=>!x.keep)){
    const targetModel=modelPlanByCode.get(modelCodeFor(p.code));
    assert(targetModel,`Nincs célmodell: ${p.code}`);
    const composite=[targetModel.code,p.color,key(p.old.size)].join('|');
    assert(!finalOriginalIdentities.has(composite),`Létező azonos termék/szín/méret: ${p.code} ${p.color} ${p.old.size}`);
  }
  // Az egyedi beszállítói kulcsot nemcsak a 35 új sornál, hanem a 76 régi
  // színkódjának ÁTÍRÁSA után is ellenőrizzük. Az adatbázis UNIQUE kulcsa:
  // supplier_id + product_code + variant_code + color_code + size.
  const linkDbKey=l=>[
    txt(l.supplier_id),txt(l.supplier_product_code),txt(l.supplier_variant_code),
    txt(l.supplier_color_code),txt(l.supplier_size)
  ].join('\u001f');
  const wantedSupplierLinks=[];
  for(const [id,group] of byVariant){
    const link=allLinkByVariant.get(id);
    const groupColors=groupRows(group);
    const kept=groupColors.size>1 ? plan.find(p=>p.oldId===id && p.keep) : null;
    const targetColor=kept?.label || sourceColor(group[0]);
    wantedSupplierLinks.push({...link,supplier_color_code:key(targetColor)});
  }
  for(const p of plan.filter(x=>!x.keep))wantedSupplierLinks.push({
    variant_id:null,supplier_id:p.oldLink.supplier_id,
    supplier_product_code:p.code,supplier_variant_code:null,
    supplier_color_code:p.color,supplier_size:p.old.size
  });
  assert(wantedSupplierLinks.length===111,'Nem 111 beszállítói azonosító szerepel a javítási tervben.');
  const wantedKeys=new Set();
  for(const link of wantedSupplierLinks){
    const identity=linkDbKey(link);
    assert(!wantedKeys.has(identity),
      `Az új besorolásban duplikált beszállítói kulcs lenne: ${link.supplier_product_code} ${link.supplier_color_code} ${link.supplier_size}`);
    wantedKeys.add(identity);
  }
  const currentSupplierLinks=await c.query(`SELECT id,variant_id,supplier_id,supplier_product_code,supplier_variant_code,supplier_color_code,supplier_size
    FROM aif_variant_supplier_codes WHERE supplier_id=ANY($1::uuid[])`,
    [[...new Set(allLinkRes.rows.map(x=>txt(x.supplier_id)))]]);
  const oldLinkIds=new Set(allLinkRes.rows.map(x=>txt(x.id)));
  for(const existing of currentSupplierLinks.rows){
    if(oldLinkIds.has(txt(existing.id)))continue;
    assert(!wantedKeys.has(linkDbKey(existing)),
      `Másik variáns már használja ezt a beszállítói cikkszám/szín/méret kulcsot: ${existing.supplier_product_code} ${existing.supplier_color_code} ${existing.supplier_size} (${existing.variant_id}).`);
  }
  console.log('\n=== TELJES CIKKSZÁM SZERINTI MODELLTERV ===');
  console.table(modelPlan.filter(x=>!x.keep).map(x=>({uj_modell:x.code,termek:x.name,tipus:x.type,db:x.qty,eredeti_modell:x.oldModel.model_code})));
  console.log(`Számlamodell: 29 (20 biztonságosan átnevezett + 9 új). A 4 korábban használt régi modell változatlan.`);
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
  const backup={batch:batch.rows[0],variants:vRes.rows,allOriginalVariants:allVResult.rows,allSupplierLinks:allLinkRes.rows,originalModels:allModelResult.rows,unrelatedVariants:outside,protectedModelIds:[...protectedModelIds],modelPlan:modelPlan.map(p=>({oldModelId:p.oldModelId,modelCode:p.code,keep:p.keep,name:p.name,type:p.type})),importRows:mixedRows,movements:moves,stock:stRes.rows,retail:retailRes.rows,supplier:scRes.rows,priceLines:priceRes.rows};
  const audit=await c.query(`INSERT INTO aif_mayo_import_repair_audit(batch_id,snapshot) VALUES($1,$2::jsonb) RETURNING id`,[BATCH,safeJson(backup)]);
  const auditId=audit.rows[0].id;
  const newIds=[];
  const newModelIds=[];

  // Előbb a modelleket válasszuk szét TELJES cikkszámra (24 -> 29), majd az
  // eredeti 76 variáns model_id-jét kössük a megfelelő modellhez.
  // Sem az eredeti variáns-ID, sem a vonalkód nem változhat meg.
  for(const mp of modelPlan.filter(x=>!x.keep)){
    const insert=await c.query(`INSERT INTO aif_product_models (
      brand_id,category_id,subcategory_id,model_code,title_ro,title_hu,
      description_ro,gender,product_type,season,material,shopify_title,status
    ) SELECT brand_id,category_id,subcategory_id,$2,$3,title_hu,
        description_ro,gender,$4,season,material,$3,status
      FROM aif_product_models WHERE id=$1 RETURNING id`,[
      mp.oldModelId,mp.code,mp.name,mp.type
    ]);
    assert(insert.rowCount===1,`Új Mayo-modell létrehozása sikertelen: ${mp.code}`);
    mp.target=String(insert.rows[0].id);newModelIds.push(mp.target);
  }
  for(const mp of modelPlan.filter(x=>x.keep)){
    const updated=await c.query(`UPDATE aif_product_models
      SET model_code=$2,title_ro=$3,shopify_title=$3,product_type=$4,updated_at=now()
      WHERE id=$1 RETURNING id`,[mp.oldModelId,mp.code,mp.name,mp.type]);
    assert(updated.rowCount===1,`Meglévő Mayo-modell azonosítója nem frissült: ${mp.code}`);
    mp.target=mp.oldModelId;
  }
  let movedOriginalVariants=0;
  for(const [id,v] of allVById){
    const mp=sourceModelForVariant(id);
    assert(mp?.target,`Nincs célmodell a variánshoz: ${id}`);
    if(mp.target===txt(v.model_id))continue;
    const updated=await c.query(`UPDATE aif_product_variants SET model_id=$2::uuid,updated_at=now()
      WHERE id=$1::uuid AND model_id=$3::uuid RETURNING id,barcode`,[id,mp.target,v.model_id]);
    assert(updated.rowCount===1 && txt(updated.rows[0].barcode)===txt(v.barcode),`Régi variáns vagy vonalkód sérülne: ${id}`);
    movedOriginalVariants++;
  }

  // MIND a 76 régi variáns valódi Excel-színt kap a régi barcode változtatása nélkül.
  // A 21 kevert változat a saját eddigi címkeszínét tartja meg, a többi 55
  // egyszerűen a már korábban is helyes színnevet használja a kódmezőben is.
  for(const [id,group] of byVariant){
    const orig=allVById.get(id);
    const colors=groupRows(group);
    const kept=colors.size>1 ? plan.find(p=>p.oldId===id && p.keep) : null;
    const desiredLabel=kept?.label || sourceColor(group[0]);
    const desiredCode=key(desiredLabel);
    assert(desiredCode && colors.has(desiredCode),`Az eredeti szín nem egyértelmű: ${id}`);
    const update=await c.query(`UPDATE aif_product_variants SET color_code=$2,color_name=$3,updated_at=now()
       WHERE id=$1::uuid RETURNING id,barcode`,[id,desiredCode,desiredLabel]);
    assert(update.rowCount===1 && txt(update.rows[0].barcode)===txt(orig.barcode),`Régi vonalkód változna: ${id}`);
    const link=allLinkByVariant.get(id);
    const supplier=await c.query(`UPDATE aif_variant_supplier_codes SET supplier_color_code=$2,supplier_color_name=$3,updated_at=now()
       WHERE id=$1 RETURNING id`,[link.id,desiredCode,desiredLabel]);
    assert(supplier.rowCount===1,`Beszállítói kapcsolat nem frissíthető: ${id}`);
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
  // A már eleve különálló 56 importsornál is a valódi Excel-szín lesz a színkód;
  // a variáns-azonosító és minden készletmozgás változatlan marad.
  for(const row of rows.filter(row=>!mapping.has(String(row.id)))){
    const actual=sourceColor(row), code=key(actual);
    const originalId=txt(row.variant_id);
    const updated=await c.query(`UPDATE aif_import_rows SET supplier_color_code=$2,
       normalized=COALESCE(normalized,'{}'::jsonb) || jsonb_build_object(
         'colorName',$3::text,'colorCode',$2::text,'supplierColorCode',$2::text,
         'supplier_color_code',$2::text,'variantId',$4::text,'mayoColorRepairId',$5::text
       ),updated_at=now()
       WHERE id=$1 AND status='committed' AND variant_id=$4::uuid RETURNING id`,[
      row.id,code,actual,originalId,String(auditId)
    ]);
    assert(updated.rowCount===1,`Nem lehetett javítani a különálló importsor színkódját: ${row.row_no}`);
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
  const mappedModels=await c.query(`SELECT ir.row_no,ir.supplier_product_code,ir.variant_id::text AS variant_id,
     v.model_id::text AS model_id,v.size,v.color_name,m.model_code,m.title_ro,m.product_type
     FROM aif_import_rows ir JOIN aif_product_variants v ON v.id=ir.variant_id
     JOIN aif_product_models m ON m.id=v.model_id WHERE ir.batch_id=$1::uuid`,[BATCH]);
  assert(mappedModels.rows.length===118,`Nem 118 eredeti sorhoz tartozik modell.`);
  for(const item of mappedModels.rows){
    const original=rows.find(r=>Number(r.row_no)===Number(item.row_no));
    assert(original && item.model_code===modelCodeFor(original.supplier_product_code),`Hibás cikkszám szerinti modell: ${item.row_no}, ${item.model_code}`);
    assert(same(item.title_ro,sourceTitle(original)),`Hibás modellnév: ${item.row_no} ${item.title_ro}`);
    assert(same(item.product_type,sourceType(original)),`Hibás ruhatípus: ${item.row_no} ${item.product_type}`);
    assert(same(item.color_name,sourceColor(original)),`Hibás raktári szín: ${item.row_no}, ${item.color_name}`);
    assert(same(item.size,original.supplier_size),`Hibás méret: ${item.row_no}`);
  }
  assert(new Set(mappedModels.rows.map(r=>r.model_id)).size===29,'Nem 29 külön modell jött létre.');
  const finalStock=await c.query(`SELECT COALESCE(sum(qty),0)::int AS db FROM aif_stock WHERE variant_id=ANY($1::uuid[])`,[[...new Set([...originalIds,...newIds])]]);
  const finalBook=await c.query(`SELECT COALESCE(sum(book_value),0)::numeric AS total FROM aif_stock_retail_book WHERE variant_id=ANY($1::uuid[])`,[[...new Set([...originalIds,...newIds])]]);
  const beforeBook=retailRes.rows.reduce((s,x)=>s+n2(x.book_value),0);
  assert(finalStock.rows[0].db===99 && n2(finalBook.rows[0].total)===beforeBook,'Összes készlet vagy eladási áras készletérték megváltozott.');
  const finalBarcodes=await c.query(`SELECT id::text AS id,barcode FROM aif_product_variants WHERE id=ANY($1::uuid[])`,[allOriginalIds]);
  assert(finalBarcodes.rows.length===76 && finalBarcodes.rows.every(x=>txt(x.barcode)===txt(allVById.get(x.id)?.barcode)),'A 76 régi vonalkód közül valamelyik megváltozott!');
  // Az eredeti számla 76 variánsa a saját barcode-ját megtartja,
  // a 37 korábbi variáns pedig teljes egészében változatlan marad.
  const outsideAfter=await c.query(`SELECT id::text AS id,model_id::text AS model_id,barcode,color_code,color_name,size,status
      FROM aif_product_variants WHERE id=ANY($1::uuid[])`,[outside.map(v=>v.id)]);
  assert(outsideAfter.rows.length===outside.length,'Eltűnt egy, a számlán kívüli régi Mayo-variáns.');
  for(const value of outsideAfter.rows){
    const original=outsideSnapshot.get(value.id);
    assert(original && ['model_id','barcode','color_code','color_name','size','status'].every(k=>original[k]===value[k]),
      `Egy védett, régi Mayo-variáns módosult volna: ${value.id}`);
  }
  const protectedAfter=await c.query(`SELECT * FROM aif_product_models WHERE id=ANY($1::uuid[])`,[[...protectedModelIds]]);
  assert(protectedAfter.rows.length===protectedModelIds.size,'Eltűnt egy védett, régi Mayo-modell.');
  for(const value of protectedAfter.rows){
    const original=protectedModelsSnapshot.get(txt(value.id));
    assert(original && ['model_code','title_ro','title_hu','product_type','category_id','subcategory_id','brand_id','shopify_title'].every(k=>original[k]===value[k]),
      `Régi Mayo-modell sérülne, számlán kívüli készlettel: ${value.id}`);
  }
  const finalLinks=await c.query(`SELECT variant_id::text AS variant_id,supplier_color_code,supplier_color_name FROM aif_variant_supplier_codes WHERE variant_id=ANY($1::uuid[])`,[allOriginalIds]);
  assert(finalLinks.rows.length===76,'Nem 76 régi beszállítói azonosító maradt.');
  for(const link of finalLinks.rows){
    const originalRows=byVariant.get(link.variant_id);
    const kept=originalRows && groupRows(originalRows).size>1 ? plan.find(p=>p.oldId===link.variant_id && p.keep) : null;
    const color=kept?.label || (originalRows && sourceColor(originalRows[0]));
    assert(color && same(link.supplier_color_code,color) && same(link.supplier_color_name,color),`A beszállítói színkód hibás: ${link.variant_id}`);
  }
  await c.query(`UPDATE aif_mayo_import_repair_audit SET result=$2::jsonb WHERE id=$1`,[auditId,safeJson({createdVariants:newIds,sourceRows:mixedRows.length,sourceQty:99,movedPriceRows,createdModels:newModelIds,movedOriginalVariants,protectedLegacyVariants:outside.length,protectedLegacyModels:protectedModelIds.size,after:final.rows[0],retailBookValueRon:beforeBook/100})]);
  await c.query('COMMIT');
  console.log('\n✅ SIKER: 21 vegyes variáns szétválasztva, 35 új variáns létrehozva.');
  console.log('✅ Modellazonosítás: 29 számlamodell, ebből 20 javított meglévő és 9 új.');
  console.log('✅ A másik 37 Mayo-variáns és a 4 korábban használt modell érintetlen.');
  console.log('✅ 118 importsor / 192 darab / 111 külön variáns, 29 külön modell.');
  console.log('✅ 99 darab készlet, eredeti készletérték és mind a 76 régi vonalkód változatlan.');
  console.log('✅ Árváltozási sorok átkötve:',movedPriceRows);
  console.log('✅ Visszakereshető adatbázis-mentés azonosító:',auditId);
  console.log('⚠️ Az új 35 variáns vonalkódja üres. A terméknevek és a RODESCR terméktípusok javítva; az alkategóriák ellenőrzése és az új vonalkódok kiosztása még hátravan.');
} catch(error){
  try{await c.query('ROLLBACK');}catch{}
  console.error('\n❌ JAVÍTÁS MEGSZAKÍTVA ÉS VISSZAVONVA:',error.message);
  process.exitCode=1;
} finally {c.release();await pool.end();}
