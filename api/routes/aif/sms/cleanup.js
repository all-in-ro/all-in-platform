/**
 * Only delete genuinely unlaunched SMS preparations.
 * All actual send attempts (including a manager's real test against a prepared
 * campaign) remain in the immutable audit trail and block the deletion.
 */
import { fail } from './domain.js';
import { audit } from './schema.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DISCARDABLE_CAMPAIGN_STATUSES = Object.freeze(['draft', 'awaiting_approval', 'approved', 'cancelled']);
export const SAFE_PREPARATION_AUDIT_EVENTS = Object.freeze([
  'campaign_prepared', 'approval_requested', 'campaign_approve', 'campaign_cancel'
]);
const allowedStatuses = new Set(DISCARDABLE_CAMPAIGN_STATUSES);
const allowedEvents = new Set(SAFE_PREPARATION_AUDIT_EVENTS);

const noValue = value => value === null || value === undefined || value === '';

/** A second, executable safety check is run with DB row locks before deletion. */
export function canDiscardSmsPreparation(campaign, recipients = [], coupons = [], events = []) {
  if (!campaign || !allowedStatuses.has(campaign.status)) return { allowed: false, reason: 'A kampány már nem törölhető előkészítés.' };
  if (!noValue(campaign.launched_at) || !noValue(campaign.launched_by) || !noValue(campaign.finished_at))
    return { allowed: false, reason: 'A kampányt már elindították.' };
  if (recipients.some(row => !['pending', 'cancelled'].includes(row.status)
      || !noValue(row.provider_id) || !noValue(row.provider_response)
      || !noValue(row.send_started_at) || !noValue(row.accepted_at) || !noValue(row.delivered_at)))
    return { allowed: false, reason: 'A kampány címzettjei között már feldolgozott vagy elküldött üzenet van.' };
  if (coupons.some(row => !['inactive', 'revoked'].includes(row.status)
      || !noValue(row.used_at) || !noValue(row.used_by) || !noValue(row.used_sale_id)))
    return { allowed: false, reason: 'A kampányhoz aktivált vagy beváltott kupon tartozik.' };
  if (events.some(row => !allowedEvents.has(typeof row === 'string' ? row : row.event)))
    return { allowed: false, reason: 'Ehhez a kampányhoz már SMS-küldési vagy más megőrzendő naplóesemény kapcsolódik.' };
  return { allowed: true, reason: '' };
}

/** Same rule for the read-only list badge; authoritative check is still locked. */
export function discardableSmsPreparationSql(alias = 'c') {
  // Alias comes only from trusted server code, never request parameters.
  if (alias !== 'c') throw new Error('Unsupported SMS SQL alias');
  const statusList = DISCARDABLE_CAMPAIGN_STATUSES.map(s => `'${s}'`).join(',');
  const auditList = SAFE_PREPARATION_AUDIT_EVENTS.map(s => `'${s}'`).join(',');
  return `(
    c.status IN (${statusList})
    AND c.launched_at IS NULL AND c.launched_by IS NULL AND c.finished_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM aif_sms_recipients er
      WHERE er.campaign_id=c.id AND (
        er.status NOT IN ('pending','cancelled') OR er.provider_id IS NOT NULL
        OR er.provider_response IS NOT NULL OR er.send_started_at IS NOT NULL
        OR er.accepted_at IS NOT NULL OR er.delivered_at IS NOT NULL
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM aif_sms_coupons ec
      WHERE ec.campaign_id=c.id AND (
        ec.status NOT IN ('inactive','revoked') OR ec.used_at IS NOT NULL
        OR ec.used_by IS NOT NULL OR ec.used_sale_id IS NOT NULL
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM aif_sms_audit ea
      WHERE ea.campaign_id=c.id AND ea.event NOT IN (${auditList})
    )
  )`;
}

export async function discardPreparedSmsCampaigns(pool, providedIds, actor, confirmCount) {
  const ids = Array.from(new Set((Array.isArray(providedIds) ? providedIds : []).map(String)));
  if (ids.length < 1 || ids.length > 100 || ids.some(id => !UUID.test(id)))
    throw fail('1–100 érvényes kampányazonosítót adj meg.', 'sms_discard_ids', 400);
  if (!Number.isInteger(confirmCount) || confirmCount !== ids.length)
    throw fail('A törlés előtti darabszám-megerősítés eltér.', 'sms_discard_confirmation', 409);

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL lock_timeout='6s'");
    // Serialise with the real manager test SMS for campaigns as well as other deletes.
    await db.query("SELECT pg_advisory_xact_lock(hashtext('aif_sms_real_test_sends_v1')::bigint)");
    await db.query("SELECT pg_advisory_xact_lock(hashtext('aif_sms_discard_preparations_v1')::bigint)");
    const campaigns = (await db.query(
      `SELECT * FROM aif_sms_campaigns WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [ids]
    )).rows;
    if (campaigns.length !== ids.length)
      throw fail('Egy vagy több előkészítés időközben eltűnt. Frissítsd a listát.', 'sms_discard_stale', 409);

    // Explicit serial order on the SAME transaction connection. Every write is
    // preceded by these immutable, locked safety checks.
    const recipients = await db.query(`SELECT * FROM aif_sms_recipients WHERE campaign_id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [ids]);
    const coupons = await db.query(`SELECT * FROM aif_sms_coupons WHERE campaign_id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [ids]);
    const events = await db.query(`SELECT campaign_id,event FROM aif_sms_audit WHERE campaign_id=ANY($1::uuid[])`, [ids]);
    for (const c of campaigns) {
      const owned = array => array.filter(item => String(item.campaign_id) === String(c.id));
      const result = canDiscardSmsPreparation(c, owned(recipients.rows), owned(coupons.rows), owned(events.rows));
      if (!result.allowed) throw fail(`${c.title}: ${result.reason} Semmi nem lett törölve.`, 'sms_discard_unsafe', 409);
    }

    const removedCoupons = await db.query(`DELETE FROM aif_sms_coupons WHERE campaign_id=ANY($1::uuid[]) RETURNING id`, [ids]);
    const removedRecipients = await db.query(`DELETE FROM aif_sms_recipients WHERE campaign_id=ANY($1::uuid[]) RETURNING id`, [ids]);
    const removedCampaigns = await db.query(`DELETE FROM aif_sms_campaigns WHERE id=ANY($1::uuid[]) RETURNING id`, [ids]);
    if (removedCampaigns.rowCount !== ids.length)
      throw fail('A kampányok törlésének darabszáma nem egyezik; visszagörgetés.', 'sms_discard_stale', 409);

    for (const c of campaigns) {
      // Preserve accountability without retaining draft recipient lists or coupons.
      await audit(db, {
        campaignId: c.id, locationId: c.location_id, actor: actor || 'admin',
        event: 'campaign_discarded',
        payload: {title: c.title, priorStatus: c.status, mode: c.mode,
          recipientCount: Number(c.recipient_count), estimatedSmsParts: Number(c.segment_count),
          preparedAt: c.created_at, noMessagesSent: true}
      });
    }
    await db.query('COMMIT');
    return {deleted: ids.length, removedRecipients: removedRecipients.rowCount, removedCoupons: removedCoupons.rowCount, ids};
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { db.release(); }
}
