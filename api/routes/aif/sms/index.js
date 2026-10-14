import express from 'express';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { txt, fail, cleanSettings, validateBlocks, unique, TOKENS, cleanCouponCopy, upgradeLegacyTemplateBlocks, normalizeSavedSmsTemplateUpdate } from './domain.js';
import { ensureSmsSchema, settingsFrom, audit } from './schema.js';
import { metadata, getCustomer, getPreference, savePreference, sourcesFor, sourceDetailsFor, sourceProducts } from './data.js';
import { providerConfig, publicBase, createProvider } from './provider.js';
import { createCampaignService } from './campaigns.js';
import { createCouponService } from './coupons.js';
import { createSmsTestSender } from './testSend.js';
import { startSmsWorker } from './worker.js';
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export default function createAifSmsModule({pool,requireAuthed,ensureAifShopSalesSchema,aifResolveShopLocation,actorFrom}) {
  const router=express.Router(),provider=createProvider(),campaigns=createCampaignService(pool,provider),coupons=createCouponService(pool),testSender=createSmsTestSender(pool,provider);
  let ready=null;
  const ensure=()=>ready||(ready=ensureAifShopSalesSchema().then(()=>ensureSmsSchema(pool)).catch(e=>{ready=null;throw e;}));
  const safe=fn=>async(req,res)=>{try{await ensure();await fn(req,res);}catch(e){const status=Number(e.statusCode||500);if(status>=500)console.error('AIF SMS route:',e.code||'error',e.message);res.status(status>=400&&status<600?status:500).json({error:status>=500&&!e.code?.startsWith('sms_')?'Az SMS-modul művelete nem sikerült. Ellenőrizd a szervernaplót.':e.message,code:e.code||'sms_error',...(e.code==='sms_empty_audience'?{excludedReasons:e.excludedReasons||[],checkedClients:e.checkedClients||0}:{})});}};
  const admin=req=>req.session?.role==='admin';
  const adminOnly=(req,res,next)=>admin(req)?next():res.status(403).json({error:'Ez a művelet csak adminisztrátornak engedélyezett.',code:'sms_forbidden'});
  const scope=async req=>admin(req)?null:(await aifResolveShopLocation(req,pool,req.query.location||req.body?.location)).id;
  const location=req=>aifResolveShopLocation(req,pool,req.body?.location||req.query.location);
  const limits=new Map();
  const throttle=(req,res,next)=>{
    const key=String(req.sessionID||actorFrom(req))+':'+req.path,now=Date.now(),old=limits.get(key);
    if(!old||now-old.at>60000)limits.set(key,{at:now,n:1});else if(++old.n>90)return res.status(429).json({error:'Túl sok SMS-művelet. Várj egy percet.',code:'sms_rate_limit'});
    if(limits.size>5000)for(const[k,v]of limits)if(now-v.at>60000)limits.delete(k);
    next();
  };
  const publicPage=(res,title,body)=>{
    res.set({'Content-Type':'text/html; charset=utf-8','Referrer-Policy':'no-referrer','Cache-Control':'no-store',
      'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});
    res.send(`<!doctype html><html lang="hu"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>AllInFashion SMS</title><style>body{font:17px system-ui;background:#eef3f6;color:#233548;margin:0;padding:24px}main{max-width:520px;margin:10vh auto;background:white;padding:32px;border-radius:24px;box-shadow:0 16px 50px #26354820}h1{font-size:24px}button{border:0;border-radius:12px;padding:16px 24px;background:#238d89;color:white;font:inherit;cursor:pointer}p{line-height:1.6}</style><main><p>ALLINFASHION · SMS</p><h1>${escapeHtml(title)}</h1>${body}</main></html>`);
  };
  router.get('/u/:token',safe(async(req,res)=>{
    const token=txt(req.params.token);if(!/^[a-f0-9]{40}$/.test(token))return res.status(404).send('Érvénytelen hivatkozás.');
    const row=(await pool.query('SELECT language FROM aif_sms_preferences WHERE unsubscribe_token=$1',[token])).rows[0];
    if(!row)return res.status(404).send('Érvénytelen hivatkozás.');
    publicPage(res,row.language==='ro'?'Dezabonare de la SMS':'Leiratkozás az SMS-ekről',`<p>${row.language==='ro'?'Confirma dezabonarea. Nu vei mai primi SMS-uri promotionale AllInFashion.':'A megerősítéssel leállítod az AllInFashion marketing-SMS-eket. A vásárlási adataid nem változnak.'}</p><form method="post"><button type="submit">${row.language==='ro'?'Confirm dezabonarea':'Leiratkozás megerősítése'}</button></form>`);
  }));
  router.post('/u/:token',safe(async(req,res)=>{
    const token=txt(req.params.token);if(!/^[a-f0-9]{40}$/.test(token))return res.status(404).send('Érvénytelen hivatkozás.');
    const db=await pool.connect();let language='hu';
    try{
      await db.query('BEGIN');
      const row=(await db.query('SELECT * FROM aif_sms_preferences WHERE unsubscribe_token=$1 FOR UPDATE',[token])).rows[0];
      if(!row)throw fail('Érvénytelen hivatkozás.','sms_unsubscribe',404);language=row.language;
      if(row.phone)await db.query(`INSERT INTO aif_sms_suppressions(phone,reason,actor) VALUES($1,'SMS-ből leiratkozott','self-service') ON CONFLICT(phone) DO NOTHING`,[row.phone]);
      const changed=await db.query(`UPDATE aif_sms_preferences SET consent=false,arrivals=false,promotions=false,version=version+1,updated_at=now(),updated_by='self-service' WHERE (phone=$1 OR customer_id=$2) AND consent=true RETURNING customer_id`,[row.phone,row.customer_id]);
      for(const r of changed.rows)await audit(db,{customerId:r.customer_id,actor:'self-service',event:'consent_revoked',payload:{source:'sms_unsubscribe_link'}});
      await db.query('COMMIT');
    }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
    publicPage(res,language==='ro'?'Dezabonare inregistrata':'Sikeresen leiratkoztál',`<p>${language==='ro'?'Nu vei mai primi SMS-uri promotionale noi de la AllInFashion. Un mesaj deja transmis operatorului poate sosi ulterior.':'Új marketing-SMS-t már nem küldünk. Egy, a szolgáltatónak már átadott üzenet még megérkezhet.'}</p>`);
  }));
  const dlr=safe(async(req,res)=>{
    const conf=providerConfig(),supplied=txt(req.query.key||req.get('X-AIF-SMS-Key'));
    const digest=s=>createHash('sha256').update(s).digest();
    if(conf.secret.length<32||!timingSafeEqual(digest(supplied),digest(conf.secret)))return res.status(403).send('Forbidden');
    const input={...req.query,...req.body},id=txt(input.message_id),status=txt(input.status),timestamp=Number(input.timestamp);
    if(!/^\d{1,30}$/.test(id)||!['0','1'].includes(status)||!Number.isFinite(timestamp)||timestamp<946684800||timestamp>Date.now()/1000+86400)throw fail('Érvénytelen SMSLink-visszajelzés.');
    if(input.connection_id&&txt(input.connection_id)!==conf.id)throw fail('Eltérő SMSLink kapcsolat.','sms_dlr_connection',403);
    const count=Number(input.message_count),safeCount=Number.isInteger(count)&&count>0&&count<100?count:null;
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      const updated=await db.query(`INSERT INTO aif_sms_dlr(provider_id,status,reported_at,message_count,payload) VALUES($1,$2,to_timestamp($3),$4,$5::jsonb)
        ON CONFLICT(provider_id) DO UPDATE SET status=GREATEST(aif_sms_dlr.status,EXCLUDED.status),reported_at=CASE WHEN EXCLUDED.status>=aif_sms_dlr.status THEN EXCLUDED.reported_at ELSE aif_sms_dlr.reported_at END,
        message_count=COALESCE(EXCLUDED.message_count,aif_sms_dlr.message_count),received_at=now()
        WHERE aif_sms_dlr.status<>EXCLUDED.status OR aif_sms_dlr.message_count IS DISTINCT FROM EXCLUDED.message_count RETURNING provider_id`,
        [id,Number(status),timestamp,safeCount,JSON.stringify({deliveryReport:txt(input.delivery_report).slice(0,200),networkId:txt(input.network_id).slice(0,20)})]);
      const changed=await db.query(`UPDATE aif_sms_recipients r SET status=CASE WHEN d.status=1 THEN 'delivered' ELSE 'undelivered' END,
        delivered_at=CASE WHEN d.status=1 THEN d.reported_at ELSE NULL END,updated_at=now() FROM aif_sms_dlr d
        WHERE r.provider_id=d.provider_id AND d.provider_id=$1 AND r.status IN('accepted','unknown','undelivered') RETURNING r.id,r.campaign_id,r.customer_id`,[id]);
      if(updated.rowCount)for(const r of changed.rows)await audit(db,{campaignId:r.campaign_id,customerId:r.customer_id,actor:'smslink-dlr',event:status==='1'?'delivery_confirmed':'delivery_failed',payload:{recipientId:r.id,providerId:id,messageCount:safeCount}});
      await db.query('COMMIT');
    }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
    res.type('text').send('OK');
  });
  router.get('/delivery',dlr);router.post('/delivery',dlr);
  router.use(requireAuthed);
  router.use((req,res,next)=>{
    if(!['admin','shop'].includes(req.session?.role))return res.status(403).json({error:'Nincs SMS-jogosultság.',code:'sms_forbidden'});
    if(!['GET','HEAD','OPTIONS'].includes(req.method)){
      const origin=txt(req.get('Origin')),site=txt(req.get('Sec-Fetch-Site'));
      const own=new Set([`https://${req.get('Host')}`,providerConfig().base]);
      if(site==='cross-site'||(origin&&!own.has(origin)))return res.status(403).json({error:'Idegen eredetű SMS-kérés elutasítva.',code:'sms_origin'});
    }
    next();
  });
  router.use(throttle);
  router.get('/status',safe(async(req,res)=>{
    const locationId=await scope(req),s=await settingsFrom(pool),config=providerConfig();
    let publicUrlReady=false;try{publicBase();publicUrlReady=true;}catch{}
    let balance=null,balanceError='';
    if(config.id&&config.password)try{balance=await provider.credit(req.query.refresh==='1');}catch(e){balanceError=e.message;}
    const stats=(await pool.query(`SELECT count(*)::int AS campaigns,
      count(*) FILTER(WHERE status IN('queued','sending'))::int AS running FROM aif_sms_campaigns WHERE ($1::uuid IS NULL OR location_id=$1)`,[locationId])).rows[0];
    const totals=(await pool.query(`SELECT count(*) FILTER(WHERE r.status='delivered')::int AS delivered,
      count(*) FILTER(WHERE r.status='accepted')::int AS accepted,count(*) FILTER(WHERE r.status IN('failed','undelivered','unknown'))::int AS attention,
      count(*) FILTER(WHERE r.status='simulated')::int AS simulated
      FROM aif_sms_recipients r JOIN aif_sms_campaigns c ON c.id=r.campaign_id WHERE ($1::uuid IS NULL OR c.location_id=$1)`,[locationId])).rows[0];
    const subscribers=(await pool.query(`SELECT count(*)::int AS n FROM aif_sms_preferences p JOIN aif_shop_customers c ON c.id=p.customer_id WHERE p.consent=true AND c.is_active=true AND ($1::uuid IS NULL OR c.location_id=$1)`,[locationId])).rows[0].n;
    res.json({ok:true,role:admin(req)?'admin':'shop',settings:s,balance,balanceError,configured:!!(config.id&&config.password),serverLiveEnabled:config.enabled,webhookReady:config.secret.length>=32,publicUrlReady,stats:{...stats,...totals,subscribers}});
  }));
  router.get('/meta',safe(async(req,res)=>{const meta=await metadata(pool);if(!admin(req)){const id=String(await scope(req));meta.locations=meta.locations.filter(l=>l.id===id);}res.json({...meta,tokens:TOKENS});}));
  router.patch('/settings',adminOnly,safe(async(req,res)=>{
    const db=await pool.connect();try{await db.query('BEGIN');await db.query('SELECT id FROM aif_sms_settings WHERE id=1 FOR UPDATE');const before=await settingsFrom(db),s=cleanSettings(req.body,before);
      await db.query('UPDATE aif_sms_settings SET settings=$1::jsonb,updated_by=$2,updated_at=now() WHERE id=1',[JSON.stringify(s),actorFrom(req)]);
      await audit(db,{actor:actorFrom(req),event:'settings_saved',payload:{before,after:s}});await db.query('COMMIT');res.json({ok:true,settings:s});
    }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }));
  router.post('/preferences/status',safe(async(req,res)=>{
    const ids=unique(req.body.ids);if(ids.length>1000)throw fail('Legfeljebb 1000 kliens kérdezhető le egyszerre.');
    const loc=await scope(req),{rows}=await pool.query(`SELECT c.id::text,p.consent,p.arrivals,p.promotions,p.brands,p.genders,p.phone,c.phone AS current_phone,
      EXISTS(SELECT 1 FROM aif_sms_suppressions s WHERE s.phone=p.phone) AS suppressed FROM aif_shop_customers c LEFT JOIN aif_sms_preferences p ON p.customer_id=c.id
      WHERE c.id::text=ANY($1::text[]) AND ($2::uuid IS NULL OR c.location_id=$2)`,[ids,loc]);
    const {phoneNumber}=await import('./domain.js');
    res.json({items:rows.map(r=>({id:r.id,enabled:r.consent===true&&!r.suppressed&&!!r.phone&&r.phone===phoneNumber(r.current_phone),arrivals:r.arrivals===true,promotions:r.promotions===true,brands:r.brands||[],genders:r.genders||[],suppressed:r.suppressed}))});
  }));
  router.get('/customers/:id',safe(async(req,res)=>{const customer=await getCustomer(pool,req.params.id,await scope(req));res.json({customer:{id:String(customer.id),name:customer.full_name,phone:customer.phone},preference:await getPreference(pool,customer)});}));
  router.patch('/customers/:id',safe(async(req,res)=>{
    const loc=await scope(req),db=await pool.connect();try{await db.query('BEGIN');await db.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`,['sms-pref:'+req.params.id]);
      const customer=await getCustomer(db,req.params.id,loc);const preference=await savePreference(db,customer,req.body,actorFrom(req),admin(req));await db.query('COMMIT');res.json({ok:true,preference});
    }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }));
  router.get('/sources',safe(async(req,res)=>{const l=await location(req);res.json({items:await sourcesFor(pool,l.id)});}));
  router.post('/source-products',safe(async(req,res)=>{const l=await location(req);res.json(await sourceProducts(pool,l.id,req.body.sources));}));
  router.get('/sources/:type/:id/details',safe(async(req,res)=>{const l=await location(req);res.json(await sourceDetailsFor(pool,l.id,req.params.type,req.params.id));}));
  router.get('/templates',safe(async(_req,res)=>{const rows=(await pool.query('SELECT * FROM aif_sms_templates ORDER BY name')).rows;res.json({items:rows.map(t=>({...t,blocks:upgradeLegacyTemplateBlocks(t.blocks,t.language)}))});}));
  router.post('/templates',adminOnly,safe(async(req,res)=>{
    const b=req.body||{},name=txt(b.name);if(name.length<3||name.length>100)throw fail('A sablonnév 3–100 karakterből álljon.');if(!['arrival','promotion'].includes(b.kind))throw fail('Érvénytelen sablontípus.');
    const blocks=validateBlocks(b.blocks,b.kind),id=randomUUID(),language=b.language==='ro'?'ro':'hu';
    const copy=b.kind==='promotion'?cleanCouponCopy(b.couponCopy,language,Boolean(b.stackable)):null;
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query(`INSERT INTO aif_sms_templates(id,name,kind,language,blocks,coupon_copy,coupon_stackable,updated_by) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)`,[id,name,b.kind,language,JSON.stringify(blocks),copy?JSON.stringify(copy):null,b.kind==='promotion'?Boolean(b.stackable):null,actorFrom(req)]);
      await audit(db,{actor:actorFrom(req),event:'template_created',payload:{id,name,kind:b.kind}});
      await db.query('COMMIT');res.json({ok:true,id});
    }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
  }));
  // Change the SAME saved template record, not create a new one. Prior prepared
  // campaigns / recipient messages remain immutable and do not reference these blocks.
  router.patch('/templates/:id',adminOnly,safe(async(req,res)=>{
    const id=txt(req.params.id);
    if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))throw fail('Érvénytelen sablonazonosító.');
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      const previous=(await db.query('SELECT * FROM aif_sms_templates WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!previous)throw fail('A sablon már nem található.','sms_template_missing',404);
      const next=normalizeSavedSmsTemplateUpdate(previous,req.body||{});
      const changedNames=previous.name!==next.name;
      const updated=(await db.query(`UPDATE aif_sms_templates
        SET name=$2,blocks=$3::jsonb,coupon_copy=$4::jsonb,coupon_stackable=$5,
            updated_by=$6,updated_at=now() WHERE id=$1 RETURNING *`,[
        id,next.name,JSON.stringify(next.blocks),next.couponCopy==null?null:JSON.stringify(next.couponCopy),
        next.stackable,actorFrom(req)
      ])).rows[0];
      await audit(db,{actor:actorFrom(req),event:next.bodyChanged?'template_updated':'template_renamed',
        payload:{id,previousName:previous.name,name:next.name,kind:previous.kind,
          fields:[...(changedNames?['name']:[]),...(next.bodyChanged?['message']:[])]}});
      await db.query('COMMIT');
      res.json({ok:true,id,item:{...updated,blocks:upgradeLegacyTemplateBlocks(updated.blocks,updated.language)}});
    }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
  }));
  router.delete('/templates/:id',adminOnly,safe(async(req,res)=>{
    const id=txt(req.params.id);
    if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))throw fail('Érvénytelen sablonazonosító.');
    // Require explicit UI confirmation; the server also requires a confirmation body.
    if(req.body?.confirm!==true)throw fail('A sablon törlését külön meg kell erősíteni.');
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      const deleted=(await db.query('DELETE FROM aif_sms_templates WHERE id=$1 RETURNING name,kind,language',[id])).rows[0];
      if(!deleted)throw fail('A sablon már nem található.','sms_template_missing',404);
      await audit(db,{actor:actorFrom(req),event:'template_deleted',payload:{id,...deleted}});
      await db.query('COMMIT');res.json({ok:true,id});
    }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
  }));
  router.get('/campaigns',safe(async(req,res)=>{
    const loc=await scope(req);res.json({items:(await pool.query(`SELECT c.*, (SELECT count(*)::int FROM aif_sms_recipients r WHERE r.campaign_id=c.id AND r.status='delivered') AS delivered,
      (SELECT count(*)::int FROM aif_sms_recipients r WHERE r.campaign_id=c.id AND r.status IN('failed','unknown','undelivered')) AS attention
      FROM aif_sms_campaigns c WHERE ($1::uuid IS NULL OR location_id=$1) ORDER BY created_at DESC LIMIT 100`,[loc])).rows});
  }));
  router.post('/campaigns',safe(async(req,res)=>{res.json(await campaigns.create(req.body,await location(req),actorFrom(req)));}));
  router.get('/campaigns/:id',safe(async(req,res)=>res.json(await campaigns.detail(pool,req.params.id,await scope(req)))));
  router.post('/campaigns/:id/test-sms',adminOnly,safe(async(req,res)=>{res.json(await testSender.send({campaignId:req.params.id,recipientId:req.body?.recipientId,actor:actorFrom(req)}));}));
  // Fonoeki, kampanytol es ugyfelcimzettol fuggetlen SMSLink kapcsolatproba.
  // A telefonszamot csak a DB-ben mentett admin beallitas adhatja.
  router.post('/manager-connection-test/preview',adminOnly,safe(async(req,res)=>{res.json(await testSender.previewConnectionTest({templateId:req.body?.templateId,locationCode:req.body?.locationCode,sampleBrandId:req.body?.sampleBrandId,sampleCategoryId:req.body?.sampleCategoryId,encodingMode:req.body?.encodingMode}));}));
  router.post('/manager-connection-test',adminOnly,safe(async(req,res)=>{if(!req.body?.templateId||!req.body?.previewFingerprint)throw fail('Előbb válassz sablont és nézd meg az SMS előnézetét.','sms_test_preview_required',400);res.json(await testSender.sendConnectionTest({actor:actorFrom(req),templateId:req.body?.templateId,locationCode:req.body?.locationCode,sampleBrandId:req.body?.sampleBrandId,sampleCategoryId:req.body?.sampleCategoryId,encodingMode:req.body?.encodingMode,previewFingerprint:req.body?.previewFingerprint}));}));
  router.post('/campaigns/:id/:action',safe(async(req,res)=>{res.json(await campaigns.action(req.params.id,req.params.action,req.body,await scope(req),actorFrom(req),admin(req)));}));
  router.get('/audit',adminOnly,safe(async(req,res)=>{
    const id=txt(req.query.campaignId),offset=Math.max(0,Math.floor(Number(req.query.offset)||0));
    res.json({items:(await pool.query(`SELECT * FROM aif_sms_audit WHERE ($1='' OR campaign_id::text=$1) ORDER BY id DESC LIMIT 200 OFFSET $2`,[id,offset])).rows,offset});
  }));
  router.post('/coupon/quote',safe(async(req,res)=>{
    const l=await location(req);await getCustomer(pool,req.body.customerId,l.id);
    res.json({ok:true,...await coupons.quote({...req.body,locationId:l.id})});
  }));
  router.post('/recipients/:id/reconcile',adminOnly,safe(async(req,res)=>{
    const b=req.body,note=txt(b.note);if(note.length<12||!['accepted','delivered','failed'].includes(b.result))throw fail('Add meg az SMSLinkben ellenőrzött eredményt és az ellenőrzés részleteit.');
    const providerId=txt(b.providerId);if(b.result!=='failed'&&!/^\d+$/.test(providerId))throw fail('Add meg az SMSLink üzenetazonosítóját.');
    const db=await pool.connect();try{await db.query('BEGIN');const r=(await db.query('SELECT * FROM aif_sms_recipients WHERE id::text=$1 FOR UPDATE',[req.params.id])).rows[0];
      if(!r||r.status!=='unknown')throw fail('Csak ismeretlen kimenetelű küldés egyeztethető.','sms_state',409);
      await db.query(`UPDATE aif_sms_recipients SET status=$2,provider_id=$3,reason=$4,accepted_at=CASE WHEN $2<>'failed' THEN now() ELSE NULL END,delivered_at=CASE WHEN $2='delivered' THEN now() ELSE NULL END,updated_at=now() WHERE id=$1`,[r.id,b.result,providerId||null,'Admin által SMSLinkben ellenőrizve: '+note]);
      if(b.result!=='failed')await db.query(`UPDATE aif_sms_coupons SET status='active' WHERE recipient_id=$1 AND status='inactive' AND mode='live'`,[r.id]);
      await audit(db,{campaignId:r.campaign_id,customerId:r.customer_id,actor:actorFrom(req),event:'provider_manually_reconciled',payload:{recipientId:r.id,result:b.result,providerId,note}});await db.query('COMMIT');res.json({ok:true});
    }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }));
  const worker=startSmsWorker(pool,{ensure,provider});
  return {router,ensure,coupons,worker};
}
