import express from 'express';

// Felületi kártyák: a listán kívüli, új modulok alapból nem engedélyezettek.
// Ezt a konfigurációt a webshop külön készlet-/pénzügyi folyamata NEM módosítja.
export const AIF_SHOP_MODULE_KEYS = Object.freeze([
  'search', 'stock', 'reserved', 'transfers', 'returns',
  'receipts', 'summary', 'vacations', 'clients',
]);
const validKeys = new Set(AIF_SHOP_MODULE_KEYS);
const txt = value => String(value ?? '').trim();
const normalized = value => txt(value).toLocaleLowerCase('hu-HU');
const locationDefault = shopId => AIF_SHOP_MODULE_KEYS.filter(
  key => !(key === 'vacations' && /^(shopify|raktar)$/i.test(shopId))
);
function cleanModules(value) {
  if (!Array.isArray(value) || value.length > AIF_SHOP_MODULE_KEYS.length + 2) {
    const e = new Error('A modulok listája érvénytelen.');
    e.statusCode = 400;
    throw e;
  }
  const selected = new Set(value.map(txt));
  if ([...selected].some(key => !validKeys.has(key))) {
    const e = new Error('Ismeretlen felületi modul.');
    e.statusCode = 400;
    throw e;
  }
  return AIF_SHOP_MODULE_KEYS.filter(key => selected.has(key));
}
function adminOnly(req,res,next) {
  if (normalized(req.session?.role) !== 'admin') {
    return res.status(403).json({error:'A modulokat csak az ADMIN módosíthatja.'});
  }
  next();
}
let schemaPromise = null;
async function ensure(pool) {
  if (!schemaPromise) {
    schemaPromise = ensureOnce(pool).catch(error => { schemaPromise = null; throw error; });
  }
  return schemaPromise;
}
async function ensureOnce(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS aif_shop_module_defaults (
    shop_id text PRIMARY KEY,
    enabled_modules text[] NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text NULL
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS aif_shop_user_modules (
    code_id text PRIMARY KEY,
    shop_id text NOT NULL,
    enabled_modules text[] NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text NULL
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS aif_shop_user_modules_shop_idx ON aif_shop_user_modules(shop_id)`);
}
async function defaultModules(pool,shopId) {
  const result=await pool.query('SELECT enabled_modules FROM aif_shop_module_defaults WHERE shop_id=$1',[shopId]);
  return result.rowCount ? cleanModules(result.rows[0].enabled_modules) : locationDefault(shopId);
}
const sendError = (res,e) => res.status(e?.statusCode || 500).json({error:e?.message || 'A modulbeállítás nem érhető el.'});
function requireShopId(value) {
  const id=txt(value);
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id)) {
    const e=new Error('Érvénytelen helyszín-azonosító.');
    e.statusCode=400;
    throw e;
  }
  return id;
}

export default function createAifShopModulesRouter({pool,requireAuthed}) {
  const router=express.Router();

  router.get('/defaults', requireAuthed, adminOnly, async (req,res) => {
    try {
      await ensure(pool);
      const shopId=requireShopId(req.query.shopId);
      res.setHeader('Cache-Control','no-store');
      res.json({ok:true,shopId,modules:await defaultModules(pool,shopId),keys:AIF_SHOP_MODULE_KEYS});
    } catch(e) { sendError(res,e); }
  });

  router.put('/defaults', requireAuthed, adminOnly, async (req,res) => {
    try {
      const shopId=requireShopId(req.body?.shopId);
      const modules=cleanModules(req.body?.modules);
      await ensure(pool);
      // Admin may create a new shop just before this call. Check its existence;
      // do not manufacture configuration rows for non-existent shops.
      const shop=await pool.query('SELECT id FROM shops WHERE id=$1',[shopId]);
      if (!shop.rowCount) return res.status(404).json({error:'A helyszín nem létezik.'});
      await pool.query(`INSERT INTO aif_shop_module_defaults(shop_id,enabled_modules,updated_by)
        VALUES($1,$2::text[],$3) ON CONFLICT(shop_id) DO UPDATE
        SET enabled_modules=EXCLUDED.enabled_modules,updated_at=now(),updated_by=EXCLUDED.updated_by`,
      [shopId,modules,txt(req.session?.actor) || 'ADMIN']);
      res.json({ok:true,shopId,modules});
    } catch(e) { sendError(res,e); }
  });

  router.get('/user/:codeId',requireAuthed,adminOnly,async(req,res)=>{
    try {
      await ensure(pool);
      const codeId=txt(req.params.codeId);
      const found=await pool.query('SELECT id::text AS id,shop_id,name FROM login_codes WHERE id::text=$1',[codeId]);
      if (!found.rowCount) return res.status(404).json({error:'A belépőkód nem található.'});
      const item=found.rows[0];
      const saved=await pool.query('SELECT enabled_modules FROM aif_shop_user_modules WHERE code_id=$1',[codeId]);
      res.setHeader('Cache-Control','no-store');
      res.json({ok:true,codeId,shopId:item.shop_id,actor:item.name,
        modules:saved.rowCount?cleanModules(saved.rows[0].enabled_modules):await defaultModules(pool,item.shop_id),
        source:saved.rowCount?'user':'shop-default'});
    } catch(e) { sendError(res,e); }
  });

  router.put('/user/:codeId',requireAuthed,adminOnly,async(req,res)=>{
    try {
      const codeId=txt(req.params.codeId);
      const modules=cleanModules(req.body?.modules);
      await ensure(pool);
      const found=await pool.query('SELECT id::text AS id,shop_id FROM login_codes WHERE id::text=$1',[codeId]);
      if (!found.rowCount) return res.status(404).json({error:'A belépőkód nem található.'});
      const shopId=found.rows[0].shop_id;
      await pool.query(`INSERT INTO aif_shop_user_modules(code_id,shop_id,enabled_modules,updated_by)
        VALUES($1,$2,$3::text[],$4) ON CONFLICT(code_id) DO UPDATE
        SET shop_id=EXCLUDED.shop_id,enabled_modules=EXCLUDED.enabled_modules,
            updated_at=now(),updated_by=EXCLUDED.updated_by`,
        [codeId,shopId,modules,txt(req.session?.actor) || 'ADMIN']);
      res.json({ok:true,codeId,shopId,modules});
    } catch(e) { sendError(res,e); }
  });

  router.get('/me', requireAuthed, async(req,res)=>{
    try {
      await ensure(pool);
      const role=normalized(req.session?.role);
      const currentShop=txt(req.session?.shopId || req.session?.shop_id);
      const shopId=requireShopId(role==='shop' ? currentShop : req.query.shopId);
      if (role!=='admin' && role!=='shop') return res.status(403).json({error:'Nem jogosult.'});
      // The shop user can ONLY request the own shop's permissions.
      if (role==='shop' && req.query.shopId && txt(req.query.shopId)!==shopId) {
        return res.status(403).json({error:'Másik helyszín beállításai nem érhetők el.'});
      }
      let codeId=null,ambiguous=false;
      if(role==='shop') {
        const sessionId=txt(req.session?.codeId || req.session?.loginCodeId || req.session?.login_code_id);
        if(sessionId) {
          const match=await pool.query(`SELECT id::text AS id FROM login_codes
            WHERE id::text=$1 AND shop_id=$2 AND revoked_at IS NULL`,[sessionId,shopId]);
          if(match.rowCount) codeId=match.rows[0].id;
        }
        if(!codeId) {
          const actor=txt(req.session?.actor);
          const matched=await pool.query(`SELECT id::text AS id FROM login_codes
            WHERE shop_id=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())
              AND lower(regexp_replace(btrim(coalesce(name,'')),'[[:space:]]+',' ','g'))=
                  lower(regexp_replace(btrim($2),'[[:space:]]+',' ','g'))
            LIMIT 2`,[shopId,actor]);
          if (matched.rowCount===1) codeId=matched.rows[0].id;
          else if(matched.rowCount>1) ambiguous=true;
        }
      }
      let modules=await defaultModules(pool,shopId),source='shop-default';
      if(codeId) {
        const saved=await pool.query('SELECT enabled_modules FROM aif_shop_user_modules WHERE code_id=$1 AND shop_id=$2',[codeId,shopId]);
        if(saved.rowCount) {modules=cleanModules(saved.rows[0].enabled_modules);source='user';}
      }
      res.setHeader('Cache-Control','no-store');
      res.json({ok:true,shopId,codeId,ambiguous,source,modules,keys:AIF_SHOP_MODULE_KEYS});
    }catch(e){sendError(res,e);}
  });

  return router;
}
