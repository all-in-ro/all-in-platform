/**
 * AllInFashion / Shopify new-order SMS notifications.
 * Separate from customer SMS campaigns, POS, Shopify refunds and inventory.
 * An authenticated, verified Shopify orders/create webhook records one alert.
 * A DB-backed sender delivers at most once: ambiguous outcomes are never retried.
 */
import express from 'express';
import { createProvider, providerConfig } from '../routes/aif/sms/provider.js';

const WORKERS = new WeakMap();
let schemaPromise = null;

function smsPhone(value) {
  const valueText = String(value ?? '').trim().replace(/[\s().-]/g, '');
  if (/^07\d{8}$/.test(valueText)) return `40${valueText.slice(1)}`;
  if (/^\+40[1-9]\d{8}$/.test(valueText)) return valueText.slice(1);
  if (/^40[1-9]\d{8}$/.test(valueText)) return valueText;
  if (/^\+[1-9]\d{7,14}$/.test(valueText)) return valueText.slice(1);
  if (/^[1-9]\d{7,14}$/.test(valueText)) return valueText;
  return '';
}

function safeText(value, max = 120) {
  return String(value ?? '').trim().slice(0, max);
}

function money(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) && number >= 0 ? Number(number.toFixed(2)) : null;
}

function safeOrderNumber(value) {
  return safeText(value, 70).replace(/[^a-zA-Z0-9#/_-]+/g, '').slice(0, 70);
}

export function shopifyOrderAlertMessage(orderNumber, amount, currency) {
  const name = safeOrderNumber(orderNumber);
  const sum = money(amount);
  const curr = safeText(currency || 'RON', 3).toUpperCase().replace(/[^A-Z]/g, '');
  if (!name || sum === null || !curr) return null;
  // GSM-7 only: Unicode provider permission must not be required for an admin SMS.
  return `Uj Shopify rendeles: ${name}. Ertek: ${sum.toFixed(2)} ${curr}.`;
}

async function ensureSchema(pool) {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS aif_shopify_order_sms_settings (
        id smallint PRIMARY KEY CHECK(id=1),
        enabled boolean NOT NULL DEFAULT false,
        phone text NOT NULL DEFAULT '',
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by text NULL
      )`);
      await pool.query(`INSERT INTO aif_shopify_order_sms_settings (id,enabled,phone)
        VALUES (1,false,'') ON CONFLICT (id) DO NOTHING`);
      await pool.query(`CREATE TABLE IF NOT EXISTS aif_shopify_order_sms_alerts (
        shopify_order_id text PRIMARY KEY,
        order_number text NOT NULL,
        amount numeric(16,2) NULL,
        currency_code text NOT NULL DEFAULT 'RON',
        phone text NULL,
        message text NULL,
        status text NOT NULL CHECK(status IN ('pending','sending','accepted','failed','unknown','skipped')),
        attempts integer NOT NULL DEFAULT 0,
        provider_id text NULL,
        error text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        started_at timestamptz NULL,
        completed_at timestamptz NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS aif_shopify_order_sms_alerts_status_idx
        ON aif_shopify_order_sms_alerts(status,created_at)`);
    })().catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

function providerStatus() {
  const config = providerConfig();
  return { configured: Boolean(config.id && config.password), liveAllowed: config.enabled === true };
}

/** Called ONLY after orders/create passes the existing Shopify HMAC check. */
export async function queueAifShopifyOrderAlert(pool, payload) {
  await ensureSchema(pool);
  const orderId = safeText(payload?.admin_graphql_api_id || (payload?.id ? `gid://shopify/Order/${payload.id}` : ''), 150);
  if (!/^gid:\/\/shopify\/Order\/\d+$/.test(orderId)) {
    // Incomplete payload: do not create an alert under an unstable key.
    return {queued:false, reason:'missing_order_id'};
  }
  const name = safeOrderNumber(payload?.name || (payload?.order_number ? `#${payload.order_number}` : ''));
  const amount = money(payload?.total_price ?? payload?.current_total_price);
  const currency = safeText(payload?.currency || 'RON', 3).toUpperCase().replace(/[^A-Z]/g, '');
  const configuration = (await pool.query(`SELECT enabled,phone FROM aif_shopify_order_sms_settings WHERE id=1`)).rows[0];
  const phone = configuration?.enabled ? smsPhone(configuration.phone) : '';
  const message = shopifyOrderAlertMessage(name, amount, currency);
  const isTest = payload?.test === true || /AIF-(?:TEST|LIFE)-/i.test(name);
  const skip = !configuration?.enabled || !phone || !message || isTest;
  const result = await pool.query(`INSERT INTO aif_shopify_order_sms_alerts
    (shopify_order_id,order_number,amount,currency_code,phone,message,status)
    VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(shopify_order_id) DO NOTHING
    RETURNING shopify_order_id`, [orderId,name||orderId,amount,currency||'RON',phone||null,message,skip?'skipped':'pending']);
  return {queued:result.rowCount>0 && !skip, duplicate:result.rowCount===0, skipped:skip};
}

async function senderTick(pool, provider) {
  await ensureSchema(pool);
  // A crash after sending (before saving the gateway ID) must never cause a duplicate SMS.
  await pool.query(`UPDATE aif_shopify_order_sms_alerts
    SET status='unknown',error='A folyamat megszakadt az SMS küldése közben; kézi ellenőrzés szükséges.',
    completed_at=now(),updated_at=now()
    WHERE status='sending' AND started_at < now()-interval '2 minutes'`);
  const claimed = await pool.query(`WITH next_alert AS (
      SELECT a.shopify_order_id FROM aif_shopify_order_sms_alerts a
      CROSS JOIN aif_shopify_order_sms_settings s
      WHERE a.status='pending' AND s.id=1 AND s.enabled=true
      ORDER BY a.created_at,a.shopify_order_id LIMIT 1
      FOR UPDATE OF a SKIP LOCKED
    ) UPDATE aif_shopify_order_sms_alerts a
    SET status='sending',attempts=attempts+1,started_at=now(),updated_at=now()
    FROM next_alert n WHERE a.shopify_order_id=n.shopify_order_id
    RETURNING a.*`);
  const row = claimed.rows[0];
  if (!row) return;
  const settings = (await pool.query(`SELECT enabled,phone FROM aif_shopify_order_sms_settings WHERE id=1`)).rows[0];
  const config = providerStatus();
  const changeStatus = (status, error, providerId = null) => pool.query(`
    UPDATE aif_shopify_order_sms_alerts
    SET status=$2,error=$3,provider_id=$4,completed_at=now(),updated_at=now()
    WHERE shopify_order_id=$1 AND status='sending'`, [row.shopify_order_id,status,error,providerId]);
  if (!settings?.enabled || smsPhone(settings.phone) !== row.phone) {
    await changeStatus('skipped','Az SMS-címzett vagy az értesítési beállítás időközben megváltozott.');
    return;
  }
  if (!config.configured || !config.liveAllowed) {
    await changeStatus('failed','Az SMSLink éles küldése nincs engedélyezve vagy nincs konfigurálva.');
    return;
  }
  try {
    const response = await provider.send({phone:row.phone,message:row.message,sender:'numeric',test:false});
    await changeStatus('accepted',null,response.providerId);
  } catch (error) {
    // Definitive errors are failed; uncertain HTTP/provider outcomes are NEVER retried.
    await changeStatus(error?.definitive ? 'failed' : 'unknown',safeText(error?.message || 'Ismeretlen SMSLink-hiba',500));
  }
}

/** Run safely across Render instances; DB row claiming is atomic. */
export function startAifShopifyOrderAlertWorker(pool) {
  if (WORKERS.has(pool)) return WORKERS.get(pool);
  const provider = createProvider();
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await senderTick(pool,provider); }
    catch (e) { console.error('AIF Shopify order SMS worker:',e?.message || e); }
    finally { busy = false; }
  };
  const timer = setInterval(() => void tick(),5000);
  timer.unref?.();
  const worker = {tick,stop:()=>clearInterval(timer)};
  WORKERS.set(pool,worker);
  return worker;
}

export function createAifShopifyOrderAlertsRouter({pool,requireAdminOrSecret,actorFrom}) {
  const router = express.Router();
  router.get('/settings',requireAdminOrSecret,async (_req,res) => {
    try {
      await ensureSchema(pool);
      const settings = (await pool.query(`SELECT enabled,phone,updated_at,updated_by FROM aif_shopify_order_sms_settings WHERE id=1`)).rows[0];
      const history = (await pool.query(`SELECT order_number,amount,currency_code,status,error,created_at,completed_at
        FROM aif_shopify_order_sms_alerts ORDER BY created_at DESC LIMIT 20`)).rows;
      res.json({ok:true,settings,provider:providerStatus(),history});
    } catch (e) {
      res.status(500).json({error:'A Shopify SMS beállítások nem elérhetők.',code:e?.code || null});
    }
  });
  router.put('/settings',requireAdminOrSecret,async (req,res) => {
    const enabled = req.body?.enabled === true;
    const phoneInput = safeText(req.body?.phone,40);
    const phone = phoneInput ? smsPhone(phoneInput) : '';
    if (phoneInput && !phone) return res.status(400).json({error:'Érvényes telefonszámot adj meg (például +407xxxxxxxx).'});
    if (enabled && !phone) return res.status(400).json({error:'Az SMS-értesítéshez telefonszám szükséges.'});
    const provider = providerStatus();
    if (enabled && (!provider.configured || !provider.liveAllowed)) {
      return res.status(409).json({error:'Az SMSLink éles küldését a Renderben előbb engedélyezni és konfigurálni kell.'});
    }
    try {
      await ensureSchema(pool);
      const result = await pool.query(`UPDATE aif_shopify_order_sms_settings
        SET enabled=$1,phone=$2,updated_at=now(),updated_by=$3 WHERE id=1
        RETURNING enabled,phone,updated_at,updated_by`,[enabled,phone,safeText(actorFrom?.(req)||'admin',80)]);
      res.json({ok:true,settings:result.rows[0],provider});
    } catch (e) {
      res.status(500).json({error:'Az SMS beállítás mentése nem sikerült.',code:e?.code || null});
    }
  });
  return router;
}
