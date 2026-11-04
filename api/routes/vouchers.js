import express from 'express';
import { randomUUID } from 'node:crypto';

// AllInFashion / Ajandekutalvanyok, 1. fazis: FIZIKAI UTALVANYOK.
// Kulon nyilvantartas. NINCS penztar-, eladas-, TVA- vagy ruhakeszlet-modositas.
// Az aktivacio es a bevaltas a kesobbi, kozos penztari tranzakcioban lesz bekotve.

const CENTRAL = 'admin_storage';
const STORES = new Set(['main_warehouse', 'magazin_targu_secuiesc']);
const LOCATIONS = new Set([CENTRAL, ...STORES]);
const codeValue = (v) => String(v ?? '').trim().toUpperCase();
const isCode = (v) => /^[A-Z0-9][A-Z0-9._-]{7,63}$/.test(v);
const isUuid = (v) => /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(String(v ?? ''));

// Penzugyi szakasz: a szerverbol is zarolhato, ameddig a penztari
// kimutatasok / fiskalis eljaras teljes ellenorzese nem kesz.
export const voucherFinanceEnabled = () => process.env.AIF_VOUCHER_FINANCE_ENABLED === 'YES';
const financeSchemaReady = new WeakMap();
export function ensureAifVoucherFinanceSchema(pool) {
  if (!financeSchemaReady.has(pool)) {
    const task = (async () => {
      // A penztari kimutatas onalloan, az elso utalvanymodul-megnyitas elott is futhat.
      // A penzugyi tablakat az eredeti fizikai nyilvantartassal kompatibilisen letrehozzuk.
      await pool.query(`CREATE TABLE IF NOT EXISTS aif_gift_vouchers (
        id uuid PRIMARY KEY, code text NOT NULL UNIQUE,
        language varchar(2) NOT NULL CHECK(language IN ('HU','RO')),
        location_code text NOT NULL CHECK(location_code IN ('admin_storage','main_warehouse','magazin_targu_secuiesc')),
        status text NOT NULL DEFAULT 'blank' CHECK(status IN ('blank','in_transfer','active','partial','redeemed','blocked','void')),
        issued_value numeric(13,2) NOT NULL DEFAULT 0 CHECK(issued_value>=0),
        balance numeric(13,2) NOT NULL DEFAULT 0 CHECK(balance>=0),
        buyer_name text,recipient_name text,payment_method text,payment_ref text,
        issued_at timestamptz,redeemed_at timestamptz,expires_on date,
        created_by text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK(balance<=issued_value),CHECK(status<>'blank' OR (issued_value=0 AND balance=0))
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS aif_gift_voucher_transfers (
        id uuid PRIMARY KEY,
        from_location text NOT NULL CHECK(from_location IN ('admin_storage','main_warehouse','magazin_targu_secuiesc')),
        to_location text NOT NULL CHECK(to_location IN ('admin_storage','main_warehouse','magazin_targu_secuiesc')),
        status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','receiving','completed','cancelled')),
        note text,created_by text,created_at timestamptz NOT NULL DEFAULT now(),closed_by text,closed_at timestamptz,
        CHECK(from_location<>to_location)
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS aif_gift_voucher_transfer_items (
        transfer_id uuid NOT NULL REFERENCES aif_gift_voucher_transfers(id),
        voucher_id uuid NOT NULL REFERENCES aif_gift_vouchers(id),
        accepted_at timestamptz,accepted_by text,PRIMARY KEY(transfer_id,voucher_id)
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS aif_gift_voucher_events (
        id uuid PRIMARY KEY,
        voucher_id uuid NOT NULL REFERENCES aif_gift_vouchers(id),
        transfer_id uuid REFERENCES aif_gift_voucher_transfers(id),
        kind text NOT NULL,actor text,from_location text,to_location text,
        details jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now()
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS aif_gift_voucher_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        voucher_id uuid NOT NULL REFERENCES aif_gift_vouchers(id) ON DELETE RESTRICT,
        kind text NOT NULL CHECK (kind IN ('issue','redeem')),
        location_code text NOT NULL CHECK (location_code IN ('main_warehouse','magazin_targu_secuiesc')),
        amount numeric(13,2) NOT NULL CHECK (amount > 0),
        method text,
        sale_id uuid,
        sale_number text,
        reference text,
        idempotency_key text NOT NULL UNIQUE,
        actor text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT voucher_tx_sale_id_ck CHECK (
          (kind='redeem' AND sale_id IS NOT NULL) OR
          (kind='issue' AND sale_id IS NULL)
        )
      )`);
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS aif_voucher_single_issue_idx
        ON aif_gift_voucher_transactions(voucher_id) WHERE kind='issue'`);
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS aif_voucher_single_sale_redemption_idx
        ON aif_gift_voucher_transactions(sale_id) WHERE kind='redeem'`);
      await pool.query(`CREATE INDEX IF NOT EXISTS aif_voucher_transactions_reporting_idx
        ON aif_gift_voucher_transactions(location_code,kind,created_at DESC)`);
    })().catch(error => { financeSchemaReady.delete(pool); throw error; });
    financeSchemaReady.set(pool, task);
  }
  return financeSchemaReady.get(pool);
}

function voucherFail(message, code = 'voucher_invalid', statusCode = 409) {
  return Object.assign(new Error(message), { code, statusCode });
}
function currencyAmount(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const src = String(value).trim().replace(',', '.');
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(src)) return null;
  const number = Number(src);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

// Hivasa a rendes eladason BELUL, ugyanazon PG tranzakcioban, FOR UPDATE zarral.
// A nulla es a negativ maradek, valamint a mar kimerult kod szerveroldalon tiltott.
export async function lockAifVoucherForSale(client, { code, amount, total }) {
  const normalized = codeValue(code);
  const wanted = currencyAmount(amount);
  const maximum = currencyAmount(total);
  if (!isCode(normalized) || wanted == null || wanted <= 0 || maximum == null || wanted > maximum) {
    throw voucherFail('Ervenytelen utalvanykod vagy bevaltasi osszeg.','voucher_bad_redemption',400);
  }
  const result = await client.query(`SELECT id,code,status,balance,issued_value,expires_on,
      (expires_on IS NOT NULL AND expires_on < (now() AT TIME ZONE 'Europe/Bucharest')::date) AS expired
    FROM aif_gift_vouchers WHERE code=$1 FOR UPDATE`, [normalized]);
  if (!result.rowCount) throw voucherFail('Ismeretlen ajandekutalvany.','voucher_not_found',404);
  const item = result.rows[0];
  if (!['active','partial'].includes(item.status)) {
    throw voucherFail('Ez az utalvany meg nem aktiv, blokkolt vagy mar felhasznalt.','voucher_not_active');
  }
  if (item.expired === true) {
    throw voucherFail('Az ajandekutalvany lejarati ideje ellenorzest igenyel.','voucher_expired');
  }
  if (wanted > Number(item.balance) + 0.0001) {
    throw voucherFail(`Az utalvanyon csak ${Number(item.balance).toFixed(2)} RON talalhato.`, 'voucher_insufficient_balance');
  }
  return { id:item.id, code:normalized, amount:wanted, before:Number(item.balance) };
}

export async function commitAifVoucherRedemption(client, { voucher, saleId, saleNumber, locationCode, actor, idempotencyKey }) {
  const remaining = Math.round((voucher.before - voucher.amount) * 100) / 100;
  if (remaining < 0) throw voucherFail('Az utalvany egyenlege mar elfogyott.','voucher_insufficient_balance');
  const changed = await client.query(`UPDATE aif_gift_vouchers
    SET balance=$2,status=$3,redeemed_at=CASE WHEN $2::numeric=0 THEN now() ELSE redeemed_at END,
        updated_at=now() WHERE id=$1 AND status IN ('active','partial') AND balance>=$4`,
    [voucher.id,remaining,remaining===0?'redeemed':'partial',voucher.amount]);
  if (changed.rowCount!==1) throw voucherFail('Az utalvany egyenlege idokozben megvaltozott.','voucher_concurrent_use');
  await client.query(`INSERT INTO aif_gift_voucher_transactions
    (voucher_id,kind,location_code,amount,method,sale_id,sale_number,idempotency_key,actor)
    VALUES($1,'redeem',$2,$3,'voucher',$4,$5,$6,$7)`,
    [voucher.id,locationCode,voucher.amount,saleId,saleNumber,`redeem:${idempotencyKey}`,actor]);
  await client.query(`INSERT INTO aif_gift_voucher_events
    (id,voucher_id,kind,actor,to_location,details)
    VALUES($1,$2,'redeemed',$3,$4,$5::jsonb)`,
    [randomUUID(),voucher.id,actor,locationCode,JSON.stringify({saleId:String(saleId),saleNumber,amount:voucher.amount,balanceBefore:voucher.before,balanceAfter:remaining})]);
  return remaining;
}


export default function createAifVoucherRouter({ pool, requireAuthed, requireAdminOrSecret }) {
  const router = express.Router();
  let schemaPromise = null;
  function schema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        // Safe idempotent DDL. Only this module's tables are created.
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_gift_vouchers (
          id uuid PRIMARY KEY,
          code text NOT NULL UNIQUE,
          language varchar(2) NOT NULL CHECK (language IN ('HU','RO')),
          location_code text NOT NULL CHECK (location_code IN ('admin_storage','main_warehouse','magazin_targu_secuiesc')),
          status text NOT NULL DEFAULT 'blank' CHECK(status IN ('blank','in_transfer','active','partial','redeemed','blocked','void')),
          issued_value numeric(13,2) NOT NULL DEFAULT 0 CHECK(issued_value>=0),
          balance numeric(13,2) NOT NULL DEFAULT 0 CHECK(balance>=0),
          buyer_name text, recipient_name text, payment_method text, payment_ref text,
          issued_at timestamptz, redeemed_at timestamptz, expires_on date,
          created_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
          CHECK (balance <= issued_value),
          CHECK (status <> 'blank' OR (issued_value=0 AND balance=0))
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_gift_vouchers_location_status_idx
          ON aif_gift_vouchers(location_code,status,language)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_gift_voucher_transfers (
          id uuid PRIMARY KEY,
          from_location text NOT NULL CHECK(from_location IN ('admin_storage','main_warehouse','magazin_targu_secuiesc')),
          to_location text NOT NULL CHECK(to_location IN ('admin_storage','main_warehouse','magazin_targu_secuiesc')),
          status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','receiving','completed','cancelled')),
          note text, created_by text, created_at timestamptz NOT NULL DEFAULT now(),
          closed_by text, closed_at timestamptz,
          CHECK(from_location<>to_location)
        )`);
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_gift_voucher_transfer_items (
          transfer_id uuid NOT NULL REFERENCES aif_gift_voucher_transfers(id),
          voucher_id uuid NOT NULL REFERENCES aif_gift_vouchers(id),
          accepted_at timestamptz, accepted_by text,
          PRIMARY KEY(transfer_id,voucher_id)
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_gift_voucher_transfer_items_voucher_idx
          ON aif_gift_voucher_transfer_items(voucher_id)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_gift_voucher_events (
          id uuid PRIMARY KEY,
          voucher_id uuid NOT NULL REFERENCES aif_gift_vouchers(id),
          transfer_id uuid REFERENCES aif_gift_voucher_transfers(id),
          kind text NOT NULL, actor text,
          from_location text, to_location text,
          details jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_gift_voucher_events_voucher_idx
          ON aif_gift_voucher_events(voucher_id,created_at DESC)`);
        await ensureAifVoucherFinanceSchema(pool);
      })().catch(err => { schemaPromise = null; throw err; });
    }
    return schemaPromise;
  }

  const isAdmin = req => String(req.session?.role || '').toLowerCase() === 'admin';
  const actor = req => String(req.session?.actor || 'Ismeretlen');
  function shopLocation(req) {
    const shopId = String(req.session?.shopId || '').toLowerCase();
    if (shopId === 'csikszereda') return 'main_warehouse';
    if (shopId === 'kezdivasarhely') return 'magazin_targu_secuiesc';
    const loc = String(req.session?.locationCode || '');
    return STORES.has(loc) ? loc : null;
  }
  const reject = (message, status = 400, code = 'voucher_invalid') => Object.assign(new Error(message), { status, code });
  const asyncRoute = fn => async (req, res) => {
    try { await schema(); await fn(req,res); }
    catch (error) {
      const status = Number(error.status || 500);
      if (status >= 500) console.error('AIF voucher error', error);
      if (!res.headersSent) res.status(status).json({ ok: false, error: error.message || 'Ajandekutalvany hiba', code: error.code || null });
    }
  };
  function viewLocation(req, candidate) {
    if (isAdmin(req)) {
      const loc = String(candidate || '').trim();
      if (loc && !LOCATIONS.has(loc)) throw reject('Érvénytelen készlethely.');
      return loc;
    }
    const loc = shopLocation(req);
    if (!loc) throw reject('A bolt nem azonosítható.', 403, 'voucher_no_shop');
    return loc;
  }
  const adminOnly = (req) => {
    if (!isAdmin(req)) throw reject('Csak az adminisztrátor kezelheti az üres utalványok készletét.',403,'voucher_admin_only');
  };

  router.get('/summary', requireAuthed, asyncRoute(async (req,res) => {
    const location = viewLocation(req, req.query.location);
    const params = location ? [location] : [];
    const where = location ? 'WHERE location_code=$1' : '';
    const r = await pool.query(`SELECT location_code, language, status,
         COUNT(*)::int AS quantity, COALESCE(SUM(issued_value),0)::numeric AS issued_value,
         COALESCE(SUM(balance),0)::numeric AS outstanding
         FROM aif_gift_vouchers ${where}
         GROUP BY location_code, language, status
         ORDER BY location_code, language, status`, params);
    const totals = {
      physical: 0, blank: 0, in_transfer: 0, active: 0, partial: 0, redeemed: 0, blocked: 0, void: 0,
      issued_value: 0, outstanding: 0,
    };
    for (const row of r.rows) {
      totals.physical += row.quantity;
      if (Object.prototype.hasOwnProperty.call(totals,row.status)) totals[row.status] += row.quantity;
      totals.issued_value += Number(row.issued_value);
      totals.outstanding += Number(row.outstanding);
    }
    const pending = await pool.query(
      `SELECT COUNT(DISTINCT t.id)::int AS transfers, COUNT(i.voucher_id)::int AS awaiting
       FROM aif_gift_voucher_transfers t
       JOIN aif_gift_voucher_transfer_items i ON i.transfer_id=t.id AND i.accepted_at IS NULL
       WHERE t.status IN ('pending','receiving') ${location ? 'AND t.to_location=$1' : ''}`,
      params
    );
    res.json({ ok:true, location:location || 'all', totals, rows:r.rows, incoming:pending.rows[0] });
  }));

  router.get('/items', requireAuthed, asyncRoute(async (req,res) => {
    const location = viewLocation(req, req.query.location);
    const language = String(req.query.language || '').toUpperCase();
    const status = String(req.query.status || '').trim();
    const search = codeValue(req.query.search || '');
    const limit = Math.min(200,Math.max(1,Number(req.query.limit || 80) || 80));
    const args = [];
    const where = [];
    if (location) { args.push(location); where.push(`location_code=$${args.length}`); }
    if (language) { if (!['HU','RO'].includes(language)) throw reject('Érvénytelen nyelv.'); args.push(language); where.push(`language=$${args.length}`); }
    if (status) { args.push(status); where.push(`status=$${args.length}`); }
    if (search) { args.push(`%${search}%`); where.push(`(code ILIKE $${args.length} OR COALESCE(buyer_name,'') ILIKE $${args.length} OR COALESCE(recipient_name,'') ILIKE $${args.length})`); }
    args.push(limit);
    const q = await pool.query(`SELECT id::text,code,language,location_code,status,
      issued_value::numeric,balance::numeric,created_by,created_at,updated_at,issued_at,
      buyer_name,recipient_name,expires_on
      FROM aif_gift_vouchers ${where.length ? 'WHERE '+where.join(' AND ') : ''}
      ORDER BY created_at DESC,code LIMIT $${args.length}`,args);
    res.json({ok:true,items:q.rows,count:q.rows.length});
  }));

  // Az adminnak a teljes archivum exportalhato; a keresolista limiten tul is.
  router.get('/export.csv', requireAdminOrSecret, asyncRoute(async (req,res) => {
    adminOnly(req);
    const rows = await pool.query(`SELECT code,language,location_code,status,issued_value,balance,
       buyer_name,recipient_name,created_by,created_at,issued_at,expires_on
       FROM aif_gift_vouchers ORDER BY created_at DESC,code`);
    const csv = value => `"${String(value ?? '').replaceAll('"','""')}"`;
    const keys = ['code','language','location_code','status','issued_value','balance',
      'buyer_name','recipient_name','created_by','created_at','issued_at','expires_on'];
    const text = '\ufeff' + keys.join(';') + '\r\n' +
      rows.rows.map(row => keys.map(key => csv(row[key])).join(';')).join('\r\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="allinfashion-utalvanyok.csv"');
    res.send(text);
  }));

  router.post('/register', requireAdminOrSecret, asyncRoute(async (req,res) => {
    adminOnly(req);
    const code = codeValue(req.body?.code);
    const language = String(req.body?.language || '').toUpperCase();
    if (!isCode(code)) throw reject('A sorszám 8–64 karakteres lehet (betű, szám, pont, kötőjel).',400,'voucher_bad_code');
    if (!['HU','RO'].includes(language)) throw reject('HU vagy RO nyelvet válassz.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Az eladok egy kozos leolvasot hasznalnak: utalvanykod ne utkozzon a
      // ruhak barcode/SKU ertekeivel. A sorszam igy nem kerul tevesen a kosarba.
      const productCollision = await client.query(`SELECT 1 FROM aif_product_variants
        WHERE lower(btrim(COALESCE(barcode,'')))=lower($1)
           OR lower(btrim(COALESCE(internal_sku,'')))=lower($1)
        LIMIT 1`,[code]);
      if (productCollision.rowCount) throw reject('Ez a vonalkod mar egy ruha termekhez tartozik. Adj masik, egyedi utalvanyszamot.',409,'voucher_code_matches_product');
      const id = randomUUID();
      const inserted = await client.query(`INSERT INTO aif_gift_vouchers
        (id,code,language,location_code,status,issued_value,balance,created_by)
        VALUES($1,$2,$3,$4,'blank',0,0,$5) ON CONFLICT(code) DO NOTHING RETURNING id::text,code,language,location_code,status`,
        [id,code,language,CENTRAL,actor(req)]);
      if (!inserted.rowCount) {
        const existing = await client.query(`SELECT code,language,location_code,status FROM aif_gift_vouchers WHERE code=$1`,[code]);
        throw reject('Ez a sorszám már szerepel a rendszerben. Nem vehető fel még egyszer.',409,'voucher_duplicate');
      }
      await client.query(`INSERT INTO aif_gift_voucher_events
        (id,voucher_id,kind,actor,to_location,details) VALUES($1,$2,'registered',$3,$4,$5::jsonb)`,
        [randomUUID(),id,actor(req),CENTRAL,JSON.stringify({language})]);
      await client.query('COMMIT');
      res.status(201).json({ok:true,item:inserted.rows[0]});
    } catch(error) {await client.query('ROLLBACK');throw error;}
    finally {client.release();}
  }));

  router.get('/transfers', requireAuthed, asyncRoute(async (req,res) => {
    const loc = viewLocation(req, req.query.location);
    const args = loc ? [loc] : [];
    const r = await pool.query(`SELECT t.id::text,t.from_location,t.to_location,t.status,t.note,t.created_by,t.created_at,t.closed_at,
      COUNT(i.voucher_id)::int AS total,COUNT(i.accepted_at)::int AS received
      FROM aif_gift_voucher_transfers t JOIN aif_gift_voucher_transfer_items i ON i.transfer_id=t.id
      ${loc ? 'WHERE t.to_location=$1' : ''}
      GROUP BY t.id ORDER BY t.created_at DESC LIMIT 80`,args);
    res.json({ok:true,items:r.rows});
  }));

  router.post('/transfers', requireAdminOrSecret, asyncRoute(async (req,res) => {
    adminOnly(req);
    const from = CENTRAL;
    const to = String(req.body?.toLocation || '');
    if (!STORES.has(to)) throw reject('Válassz célüzletet.');
    const codes = (Array.isArray(req.body?.codes) ? req.body.codes : []).map(codeValue);
    if (!codes.length || codes.length > 250 || new Set(codes).size !== codes.length || codes.some(x=>!isCode(x))) {
      throw reject('Az átadásban 1–250 különböző, érvényes vonalkód szerepelhet.');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(`SELECT id,code,status,location_code FROM aif_gift_vouchers
        WHERE code=ANY($1::text[]) ORDER BY code FOR UPDATE`,[codes]);
      const mismatch = found.rows.find(row=>row.status!=='blank' || row.location_code!==from);
      if (found.rowCount!==codes.length || mismatch) {
        throw reject(`Csak a központi raktárban nyilvántartott, üres utalványok adhatók át. ${mismatch?.code || 'Hiányzó sorszám'}`,409,'voucher_transfer_invalid');
      }
      const id = randomUUID();
      await client.query(`INSERT INTO aif_gift_voucher_transfers(id,from_location,to_location,status,note,created_by)
        VALUES($1,$2,$3,'pending',$4,$5)`,[id,from,to,String(req.body?.note||'').slice(0,500),actor(req)]);
      for(const row of found.rows) {
        await client.query(`INSERT INTO aif_gift_voucher_transfer_items(transfer_id,voucher_id) VALUES($1,$2)`,[id,row.id]);
        await client.query(`UPDATE aif_gift_vouchers SET status='in_transfer',updated_at=now() WHERE id=$1`,[row.id]);
        await client.query(`INSERT INTO aif_gift_voucher_events(id,voucher_id,transfer_id,kind,actor,from_location,to_location)
          VALUES($1,$2,$3,'dispatched',$4,$5,$6)`,[randomUUID(),row.id,id,actor(req),from,to]);
      }
      await client.query('COMMIT');
      res.status(201).json({ok:true,id,total:found.rowCount,to_location:to});
    }catch(error){await client.query('ROLLBACK');throw error;}
    finally {client.release();}
  }));

  router.get('/transfers/:id/items', requireAuthed, asyncRoute(async (req,res) => {
    const id = String(req.params.id || '');
    if (!isUuid(id)) throw reject('Érvénytelen átadási azonosító.');
    const transfer = await pool.query(`SELECT * FROM aif_gift_voucher_transfers WHERE id=$1`,[id]);
    if(!transfer.rowCount) throw reject('Az átadás nem található.',404,'voucher_transfer_missing');
    const loc = viewLocation(req,req.query.location);
    if(loc && transfer.rows[0].to_location!==loc) throw reject('Ez az átadás másik üzlethez tartozik.',403);
    const rows = await pool.query(`SELECT v.code,v.language,i.accepted_at,i.accepted_by
      FROM aif_gift_voucher_transfer_items i JOIN aif_gift_vouchers v ON v.id=i.voucher_id
      WHERE i.transfer_id=$1 ORDER BY v.code`,[id]);
    res.json({ok:true,transfer:transfer.rows[0],items:rows.rows});
  }));

  router.post('/transfers/:id/receive', requireAuthed, asyncRoute(async(req,res)=>{
    const id = String(req.params.id||'');
    const code = codeValue(req.body?.code);
    if(!isUuid(id)||!isCode(code)) throw reject('Érvénytelen átadás vagy vonalkód.');
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const tr=await client.query(`SELECT * FROM aif_gift_voucher_transfers WHERE id=$1 FOR UPDATE`,[id]);
      const t=tr.rows[0];
      if(!t) throw reject('Az átadás nem található.',404);
      const loc=viewLocation(req,req.body?.location);
      if(loc && t.to_location!==loc) throw reject('Másik üzlet átadása nem vehető át.',403);
      if(!['pending','receiving','completed'].includes(t.status)) throw reject('Ez az átadás már lezárt vagy törölt.',409);
      const row=await client.query(`SELECT i.accepted_at,v.id AS voucher_id,v.status,v.location_code
        FROM aif_gift_voucher_transfer_items i JOIN aif_gift_vouchers v ON v.id=i.voucher_id
        WHERE i.transfer_id=$1 AND v.code=$2 FOR UPDATE OF i,v`,[id,code]);
      if(!row.rowCount) throw reject('Ez a sorszám nem szerepel ezen az átadáson.',409,'voucher_not_in_transfer');
      if(row.rows[0].accepted_at){
        await client.query('COMMIT');
        return res.json({ok:true,duplicate:true,code,message:'Ez az utalvány már át lett véve.'});
      }
      if(t.status==='completed'||row.rows[0].status!=='in_transfer'||row.rows[0].location_code!==t.from_location) {
        throw reject('Az utalvány állapota nem egyezik a függő átadással.',409,'voucher_transfer_state');
      }
      const vid=row.rows[0].voucher_id;
      await client.query(`UPDATE aif_gift_voucher_transfer_items SET accepted_at=now(),accepted_by=$3
        WHERE transfer_id=$1 AND voucher_id=$2`,[id,vid,actor(req)]);
      await client.query(`UPDATE aif_gift_vouchers SET status='blank',location_code=$2,updated_at=now() WHERE id=$1`,[vid,t.to_location]);
      await client.query(`INSERT INTO aif_gift_voucher_events(id,voucher_id,transfer_id,kind,actor,from_location,to_location)
        VALUES($1,$2,$3,'received',$4,$5,$6)`,[randomUUID(),vid,id,actor(req),t.from_location,t.to_location]);
      const progress=await client.query(`SELECT COUNT(*)::int AS total,COUNT(accepted_at)::int AS received
        FROM aif_gift_voucher_transfer_items WHERE transfer_id=$1`,[id]);
      const {total,received}=progress.rows[0];
      await client.query(`UPDATE aif_gift_voucher_transfers
        SET status=$2,closed_at=CASE WHEN $2='completed' THEN now() ELSE NULL END,
            closed_by=CASE WHEN $2='completed' THEN $3 ELSE NULL END WHERE id=$1`,
            [id,received===total?'completed':'receiving',actor(req)]);
      await client.query('COMMIT');
      res.json({ok:true,code,total,received,completed:received===total});
    } catch(error) {await client.query('ROLLBACK');throw error;}
    finally {client.release();}
  }));

  router.post('/transfers/:id/cancel', requireAdminOrSecret, asyncRoute(async(req,res)=>{
    adminOnly(req);
    const id=String(req.params.id||'');
    if(!isUuid(id)) throw reject('Érvénytelen átadás.');
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const found=await client.query(`SELECT * FROM aif_gift_voucher_transfers WHERE id=$1 FOR UPDATE`,[id]);
      const t=found.rows[0];
      if(!t || !['pending','receiving'].includes(t.status)) throw reject('Csak nyitott átadás vonható vissza.',409);
      const items=await client.query(`SELECT i.voucher_id,v.location_code,v.status
        FROM aif_gift_voucher_transfer_items i JOIN aif_gift_vouchers v ON v.id=i.voucher_id
        WHERE i.transfer_id=$1 AND i.accepted_at IS NULL ORDER BY i.voucher_id FOR UPDATE OF v,i`,[id]);
      for(const row of items.rows){
        if(row.status!=='in_transfer'||row.location_code!==t.from_location) throw reject('Készletütközés. Nem töröljük részlegesen.',409);
        await client.query(`UPDATE aif_gift_vouchers SET status='blank',updated_at=now() WHERE id=$1`,[row.voucher_id]);
        await client.query(`INSERT INTO aif_gift_voucher_events(id,voucher_id,transfer_id,kind,actor,from_location,to_location)
          VALUES($1,$2,$3,'dispatch_cancelled',$4,$5,$6)`,[randomUUID(),row.voucher_id,id,actor(req),t.to_location,t.from_location]);
      }
      await client.query(`UPDATE aif_gift_voucher_transfers SET status='cancelled',closed_at=now(),closed_by=$2 WHERE id=$1`,[id,actor(req)]);
      await client.query('COMMIT');
      res.json({ok:true,reverted:items.rowCount,message:'Az át nem vett utalványok visszakerültek a központi készletbe.'});
    }catch(error){await client.query('ROLLBACK');throw error;}
    finally{client.release();}
  }));

  router.get('/items/:code/events', requireAuthed, asyncRoute(async(req,res)=>{
    const code=codeValue(req.params.code);
    const item=await pool.query(`SELECT id,code,location_code FROM aif_gift_vouchers WHERE code=$1`,[code]);
    if(!item.rowCount) throw reject('Ez a sorszám nincs nyilvántartva.',404);
    const loc=viewLocation(req,req.query.location);
    if(loc && item.rows[0].location_code!==loc) throw reject('Ez az utalvány nem a saját üzlet készlete.',403);
    const rows=await pool.query(`SELECT kind,actor,from_location,to_location,details,created_at
      FROM aif_gift_voucher_events WHERE voucher_id=$1 ORDER BY created_at DESC`,[item.rows[0].id]);
    res.json({ok:true,code,events:rows.rows});
  }));

  router.get('/finance-status', requireAuthed, asyncRoute(async (_req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.json({ok:true,enabled:voucherFinanceEnabled()});
  }));

  // A bon digitalis egyenlegenek ellenorzese. Bolti dolgozonak nem adunk ki vevoi
  // szemelyes adatokat; minden helyszin el tud fogadni aktiv utalvanyt.
  router.get('/balance/:code', requireAuthed, asyncRoute(async (req,res) => {
    const code = codeValue(req.params.code);
    if (!isCode(code)) throw reject('Ervenytelen utalvanykod.');
    if (!isAdmin(req) && !shopLocation(req)) throw reject('Ismeretlen uzlet.',403);
    const r = await pool.query(`SELECT code,language,status,issued_value,balance,expires_on,issued_at
       FROM aif_gift_vouchers WHERE code=$1 LIMIT 1`,[code]);
    if (!r.rowCount) throw reject('Nem szerepel ilyen ajandekutalvany a rendszerben.',404,'voucher_not_found');
    res.setHeader('Cache-Control','no-store');
    res.json({ok:true,item:r.rows[0]});
  }));

  // Ertekesites: nem ruhaeladas! Saj at penznaplo, egyetlen mar bevezetett, boltban
  // levo, URES papir aktivaciojaval. Masodszori eladas serveroldalon lehetetlen.
  router.post('/issue', requireAuthed, asyncRoute(async (req,res) => {
    if (!voucherFinanceEnabled()) throw reject('Az utalvany penztari funkcioja meg nincs elesitve.',503,'voucher_finance_disabled');
    const code=codeValue(req.body?.code);
    const value=currencyAmount(req.body?.amount);
    const method=String(req.body?.paymentMethod||'').toLowerCase();
    const key=String(req.get('Idempotency-Key')||req.body?.idempotencyKey||'').trim().slice(0,200);
    const location=isAdmin(req) ? String(req.body?.location||'') : shopLocation(req);
    if (!isCode(code)) throw reject('Hibas vagy hianyzo vonalkod.');
    if (!STORES.has(location)) throw reject('Valassz uzletet.',400,'voucher_location_invalid');
    if (value===null||value<=0||value>100000) throw reject('Az utalvany erteke 0,01 es 100 000 RON kozott lehet.');
    if (!['cash','card','bank_transfer'].includes(method)) throw reject('Valassz valodi fizetesi modot.');
    if (!req.body?.paymentConfirmed) throw reject('Csak a tenylegesen atvett penz utan lehet aktivalni.');
    if (!key) throw reject('Hianyzik a tranzakcio biztonsagi azonositja.');
    const buyer=String(req.body?.buyerName||'').trim().slice(0,200)||null;
    const recipient=String(req.body?.recipientName||'').trim().slice(0,200)||null;
    const reference=String(req.body?.reference||'').trim().slice(0,160)||null;
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`aif_voucher_issue:${key}`]);
      const prior=await client.query(`SELECT t.*,v.code FROM aif_gift_voucher_transactions t
          JOIN aif_gift_vouchers v ON v.id=t.voucher_id
          WHERE t.idempotency_key=$1`,[`issue:${key}`]);
      if (prior.rowCount) {
        const t=prior.rows[0];
        if (t.code!==code||t.location_code!==location||Number(t.amount)!==value||t.method!==method) throw reject('Ez a tranzakcioazonosito masik utalvanyhoz tartozik.',409,'voucher_key_collision');
        await client.query('COMMIT');
        return res.json({ok:true,duplicate:true,item:{code,amount:value,location,status:'active'}});
      }
      const l=await client.query(`SELECT id FROM aif_locations WHERE code=$1`,[location]);
      if (!l.rowCount) throw reject('A valasztott uzlet nem letezik.');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`,[`aif_shop_shift:${l.rows[0].id}`]);
      const pending=await client.query(`SELECT 1 FROM aif_shop_shift_handovers
        WHERE location_id=$1 AND status='pending' LIMIT 1`,[l.rows[0].id]);
      const closed=await client.query(`SELECT 1 FROM aif_shop_day_closures WHERE location_id=$1
        AND work_date=(now() AT TIME ZONE 'Europe/Bucharest')::date LIMIT 1`,[l.rows[0].id]);
      if (pending.rowCount||closed.rowCount) throw reject('Nyitott muszakatadas vagy lezart nap mellett nem aktivalhato utalvany.',409,'voucher_shift_locked');
      const selected=await client.query(`SELECT * FROM aif_gift_vouchers WHERE code=$1 FOR UPDATE`,[code]);
      const v=selected.rows[0];
      if (!v||v.status!=='blank'||v.location_code!==location||Number(v.balance)!==0||Number(v.issued_value)!==0)
        throw reject('Csak az adott boltban levo, meg nem eladott, ures utalvany aktivalhato.',409,'voucher_not_blank');
      await client.query(`UPDATE aif_gift_vouchers SET issued_value=$2,balance=$2,status='active',
        buyer_name=$3,recipient_name=$4,payment_method=$5,payment_ref=$6,issued_at=now(),updated_at=now()
        WHERE id=$1`,[v.id,value,buyer,recipient,method,reference]);
      await client.query(`INSERT INTO aif_gift_voucher_transactions
        (voucher_id,kind,location_code,amount,method,reference,idempotency_key,actor)
        VALUES($1,'issue',$2,$3,$4,$5,$6,$7)`,[v.id,location,value,method,reference,`issue:${key}`,actor(req)]);
      await client.query(`INSERT INTO aif_gift_voucher_events(id,voucher_id,kind,actor,to_location,details)
        VALUES($1,$2,'issued',$3,$4,$5::jsonb)`,
        [randomUUID(),v.id,actor(req),location,JSON.stringify({amount:value,method,reference,buyer,recipient})]);
      await client.query('COMMIT');
      return res.json({ok:true,duplicate:false,item:{code,amount:value,balance:value,status:'active',location}});
    } catch(error){try{await client.query('ROLLBACK');}catch{};throw error;}
    finally{client.release();}
  }));

  // Teljes archivum: nincsen 300 soros kereso-limit. Csak ADMIN exportalhat.
  router.get('/transactions/export.csv', requireAdminOrSecret, asyncRoute(async (req,res) => {
    adminOnly(req);
    const rows=await pool.query(`SELECT t.created_at,v.code,v.language,t.kind,t.location_code,t.method,
      t.amount,t.sale_number,t.reference,t.actor
      FROM aif_gift_voucher_transactions t
      JOIN aif_gift_vouchers v ON v.id=t.voucher_id
      ORDER BY t.created_at DESC,t.id DESC`);
    const columns=['created_at','code','language','kind','location_code','method',
      'amount','sale_number','reference','actor'];
    const safe=(v)=>'"'+String(v??'').replaceAll('"','""')+'"';
    const csv='\ufeff'+columns.join(';')+'\r\n'+rows.rows.map(row=>columns.map(key=>safe(row[key])).join(';')).join('\r\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="allinfashion-utalvany-penznaplo.csv"');
    res.send(csv);
  }));

  // Pen zmozgasi naplo. A ruhaeladas es utalvanyertekesites nem keveredik.
  router.get('/transactions', requireAuthed, asyncRoute(async (req,res) => {
    const loc=viewLocation(req,req.query.location);
    const from=String(req.query.from||'');const to=String(req.query.to||'');
    if ((from&&!/^\d{4}-\d{2}-\d{2}$/.test(from))||(to&&!/^\d{4}-\d{2}-\d{2}$/.test(to))) throw reject('Hibas datum.');
    const params=[];const filters=[];
    if (loc){params.push(loc);filters.push(`t.location_code=$${params.length}`);}
    if (from){params.push(from);filters.push(`(t.created_at AT TIME ZONE 'Europe/Bucharest')::date >= $${params.length}::date`);}
    if (to){params.push(to);filters.push(`(t.created_at AT TIME ZONE 'Europe/Bucharest')::date <= $${params.length}::date`);}
    const r=await pool.query(`SELECT t.id::text,v.code,v.language,t.kind,t.location_code,t.method,t.amount,
      t.sale_number,t.reference,t.actor,t.created_at
      FROM aif_gift_voucher_transactions t JOIN aif_gift_vouchers v ON v.id=t.voucher_id
      ${filters.length?'WHERE '+filters.join(' AND '):''}
      ORDER BY t.created_at DESC,t.id DESC LIMIT 300`,params);
    const daily=await pool.query(`SELECT t.kind,t.method,COUNT(*)::int AS count,
      SUM(t.amount)::numeric AS total FROM aif_gift_voucher_transactions t
      ${filters.length?'WHERE '+filters.join(' AND '):''} GROUP BY t.kind,t.method ORDER BY t.kind,t.method`,params);
    res.json({ok:true,items:r.rows,summary:daily.rows});
  }));

  // Penzugyi funkciok csak szerveroldali engedellyel. A visszaru-visszateritest
  // tovabbra is kulon, minden fizetesi forrast koveto tranzakcioban oldjuk meg.

  return router;
}
