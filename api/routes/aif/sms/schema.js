import { DEFAULT_SETTINGS } from './domain.js';
const cache=new WeakMap();
export function ensureSmsSchema(pool) {
  if(!cache.has(pool)) cache.set(pool,(async()=>{
    const db=await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("SELECT pg_advisory_xact_lock(hashtext('aif_sms_schema_v1')::bigint)");
      await db.query(`CREATE TABLE IF NOT EXISTS aif_sms_settings (
        id smallint PRIMARY KEY CHECK(id=1), settings jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text
      )`);
      await db.query(`INSERT INTO aif_sms_settings(id,settings) VALUES(1,$1::jsonb) ON CONFLICT(id) DO NOTHING`,[JSON.stringify(DEFAULT_SETTINGS)]);
      await db.query(`CREATE TABLE IF NOT EXISTS aif_sms_preferences (
        customer_id uuid PRIMARY KEY REFERENCES aif_shop_customers(id) ON DELETE CASCADE,
        consent boolean NOT NULL DEFAULT false, arrivals boolean NOT NULL DEFAULT false, promotions boolean NOT NULL DEFAULT false,
        phone text, language text NOT NULL DEFAULT 'hu' CHECK(language IN('hu','ro')),
        brands jsonb NOT NULL DEFAULT '[]', genders jsonb NOT NULL DEFAULT '[]', categories jsonb NOT NULL DEFAULT '[]',
        all_brands boolean NOT NULL DEFAULT false, consent_at timestamptz, consent_source text, consent_version text,
        unsubscribe_token text NOT NULL UNIQUE, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text,
        version integer NOT NULL DEFAULT 1
      )`);
      await db.query(`CREATE TABLE IF NOT EXISTS aif_sms_suppressions (
        phone text PRIMARY KEY, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), actor text
      )`);
      await db.query(`CREATE TABLE IF NOT EXISTS aif_sms_templates (
        id uuid PRIMARY KEY, name text NOT NULL, kind text NOT NULL CHECK(kind IN('arrival','promotion')),
        language text NOT NULL CHECK(language IN('hu','ro')), blocks jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(), updated_by text
      )`);
      await db.query(`CREATE TABLE IF NOT EXISTS aif_sms_campaigns (
        id uuid PRIMARY KEY, request_key text NOT NULL UNIQUE, request_hash text NOT NULL,
        title text NOT NULL, kind text NOT NULL CHECK(kind IN('arrival','promotion')),
        location_id uuid NOT NULL REFERENCES aif_locations(id), location_code text NOT NULL,
        mode text NOT NULL CHECK(mode IN('test','live')), status text NOT NULL DEFAULT 'draft',
        definition jsonb NOT NULL, source_snapshot jsonb NOT NULL DEFAULT '[]',
        recipient_count integer NOT NULL DEFAULT 0, segment_count integer NOT NULL DEFAULT 0,
        created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
        approved_by text, approved_at timestamptz, launched_by text, launched_at timestamptz,
        finished_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), note text,
        CHECK(status IN('draft','awaiting_approval','approved','queued','sending','paused','finished','cancelled'))
      )`);
      await db.query(`CREATE TABLE IF NOT EXISTS aif_sms_recipients (
        id uuid PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES aif_sms_campaigns(id), customer_id uuid,
        customer_name text NOT NULL, phone text NOT NULL, message text NOT NULL, segments integer NOT NULL,
        status text NOT NULL DEFAULT 'pending', reason text, matched jsonb NOT NULL DEFAULT '[]',
        preference_version integer, provider_id text, provider_response text,
        send_started_at timestamptz, accepted_at timestamptz, delivered_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK(status IN('pending','sending','accepted','delivered','undelivered','failed','unknown','skipped','simulated','cancelled')),
        UNIQUE(campaign_id,phone)
      )`);
      await db.query(`CREATE INDEX IF NOT EXISTS aif_sms_recipients_campaign_idx ON aif_sms_recipients(campaign_id,status)`);
      await db.query(`CREATE INDEX IF NOT EXISTS aif_sms_recipients_phone_idx ON aif_sms_recipients(phone,send_started_at DESC)`);
      await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS aif_sms_recipients_provider_uq ON aif_sms_recipients(provider_id) WHERE provider_id IS NOT NULL`);
      await db.query(`CREATE TABLE IF NOT EXISTS aif_sms_coupons (
        id uuid PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES aif_sms_campaigns(id), recipient_id uuid NOT NULL UNIQUE REFERENCES aif_sms_recipients(id),
        customer_id uuid NOT NULL, phone text NOT NULL, location_id uuid NOT NULL, code text NOT NULL UNIQUE,
        rules jsonb NOT NULL, mode text NOT NULL, status text NOT NULL DEFAULT 'inactive',
        used_sale_id text UNIQUE, used_at timestamptz, used_by text, discount_amount numeric(14,2),
        created_at timestamptz NOT NULL DEFAULT now(), CHECK(status IN('inactive','active','used','revoked'))
      )`);
      await db.query(`CREATE TABLE IF NOT EXISTS aif_sms_audit (
        id bigserial PRIMARY KEY, campaign_id uuid, customer_id uuid, location_id uuid, actor text NOT NULL,
        event text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
      )`);
      await db.query(`CREATE INDEX IF NOT EXISTS aif_sms_audit_created_idx ON aif_sms_audit(created_at DESC)`);
      await db.query(`CREATE TABLE IF NOT EXISTS aif_sms_dlr (
        provider_id text PRIMARY KEY, status integer NOT NULL CHECK(status IN(0,1)), reported_at timestamptz NOT NULL,
        message_count integer, received_at timestamptz NOT NULL DEFAULT now(), payload jsonb NOT NULL DEFAULT '{}'
      )`);
      await db.query('COMMIT');
    }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
  })().catch(e=>{cache.delete(pool);throw e;}));
  return cache.get(pool);
}
export async function settingsFrom(db) {
  const {rows}=await db.query('SELECT settings FROM aif_sms_settings WHERE id=1');
  const saved=rows[0]?.settings||{};
  return {...DEFAULT_SETTINGS,...saved,shopNames:{...DEFAULT_SETTINGS.shopNames,...saved.shopNames}};
}
export function audit(db,{campaignId=null,customerId=null,locationId=null,actor,event,payload={}}) {
  return db.query(`INSERT INTO aif_sms_audit(campaign_id,customer_id,location_id,actor,event,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[campaignId,customerId,locationId,actor||'system',event,JSON.stringify(payload)]);
}
