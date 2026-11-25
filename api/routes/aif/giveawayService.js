import { createHash, randomInt, randomUUID } from "node:crypto";

const TIMEZONE = "Europe/Bucharest";
const MAX_PARTICIPANTS = 20000;
const MAX_IMPORT = 2000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EDITABLE = ["title", "description", "prize_title", "prize_image_url", "winners_count", "reserves_count", "closes_at", "closes_at_local", "facebook_post_url"];

export class GiveawayError extends Error {
  constructor(statusCode, message, code, details = {}) {
    super(message);
    this.name = "GiveawayError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function fail(status, message, code, details) {
  throw new GiveawayError(status, message, code, details);
}
function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(400, "Érvénytelen kérés.", "invalid_request");
  return value;
}
function idValue(value, label = "Azonosító") {
  if (typeof value !== "string" || !UUID.test(value)) fail(400, `${label}: érvénytelen azonosító.`, "invalid_id");
  return value.toLowerCase();
}
function text(value, label, max, { required = false, multiline = false } = {}) {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") fail(400, `${label}: szöveges érték szükséges.`, "invalid_field");
  const cleaned = value.normalize("NFC").trim();
  if (cleaned.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(cleaned) || (!multiline && /[\r\n\t]/u.test(cleaned))) {
    fail(400, `${label}: legfeljebb ${max} karakter adható meg, vezérlőkarakterek nélkül.`, "invalid_field");
  }
  if (required && !cleaned) fail(400, `${label} megadása kötelező.`, "invalid_field");
  return cleaned;
}
function integer(value, label, min, max) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    fail(400, `${label}: ${min} és ${max} közötti egész szám szükséges.`, "invalid_field");
  }
  return value;
}
function urlValue(value, label, facebook = false) {
  const cleaned = text(value, label, 2048);
  if (!cleaned) return null;
  let url;
  try { url = new URL(cleaned); } catch { fail(400, `${label}: érvényes HTTPS-hivatkozás szükséges.`, "invalid_url"); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    fail(400, `${label}: érvényes HTTPS-hivatkozás szükséges.`, "invalid_url");
  }
  if (facebook && !["facebook.com", "fb.com", "fb.watch"].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    fail(400, "Facebook-bejegyzésként Facebook HTTPS-hivatkozás adható meg.", "invalid_url");
  }
  return url.href;
}
function iso(value) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}
function actorValue(actor) {
  // Only the authenticated router supplies this argument; request bodies never do.
  return String(actor || "admin").normalize("NFC").slice(0, 200);
}
function normalizedName(value) {
  return value.replace(/\s+/gu, " ").toLocaleLowerCase("hu-HU");
}
function validCalendarParts(year, month, day, hour, minute, second = 0) {
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return year >= 1900 && check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day
    && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59;
}
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function snapshotDigest(snapshot) {
  // jsonb can reorder object keys; canonical serialization keeps the digest verifiable after reading it back.
  return createHash("sha256").update(canonicalJson(snapshot)).digest("hex");
}
function assertRevision(game, body) {
  const expected = integer(body.expected_revision, "Verzió", 1, 2147483647);
  if (Number(game.revision) !== expected) fail(409, "A játék közben megváltozott. Frissítsd az adatokat, majd próbáld újra.", "stale_revision");
}
function assertEditable(game) {
  if (!["draft", "open"].includes(game.status)) fail(409, "A lezárt vagy kisorsolt játék résztvevői és beállításai már nem módosíthatók.", "game_locked");
}
function participant(row) {
  return {
    id: row.id, display_name: row.display_name, external_id: row.external_id,
    note: row.note, eligible: row.eligible, exclusion_reason: row.exclusion_reason,
    created_at: iso(row.created_at),
  };
}
function gameItem(row) {
  return {
    id: row.id, title: row.title, description: row.description,
    prize_title: row.prize_title, prize_image_url: row.prize_image_url,
    winners_count: Number(row.winners_count), reserves_count: Number(row.reserves_count),
    closes_at: iso(row.closes_at), closes_at_local: row.closes_at_local || null,
    facebook_post_url: row.facebook_post_url, status: row.status, revision: Number(row.revision),
    created_at: iso(row.created_at), updated_at: iso(row.updated_at), locked_at: iso(row.locked_at),
    drawn_at: iso(row.drawn_at), archived_at: iso(row.archived_at),
    participant_count: Number(row.participant_count || 0), eligible_count: Number(row.eligible_count || 0),
    excluded_count: Number(row.excluded_count || 0), snapshot_hash: row.snapshot_hash || null,
  };
}
function drawItem(row) {
  if (!row) return null;
  return {
    id: row.id, game_id: row.game_id, drawn_at: iso(row.drawn_at), actor: row.actor,
    eligible_count: Number(row.eligible_count), snapshot_hash: row.snapshot_hash,
    winners: row.winners, reserves: row.reserves,
  };
}

const ITEM_SELECT = `SELECT g.*,
  to_char(g.closes_at AT TIME ZONE 'Europe/Bucharest', 'YYYY-MM-DD"T"HH24:MI') AS closes_at_local,
  c.participant_count, c.eligible_count, c.excluded_count
  FROM aif_giveaway_games g
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS participant_count,
      count(*) FILTER (WHERE eligible)::int AS eligible_count,
      count(*) FILTER (WHERE NOT eligible)::int AS excluded_count
    FROM aif_giveaway_participants p WHERE p.game_id=g.id
  ) c ON true`;

export default function createGiveawayService({ pool }) {
  if (!pool || typeof pool.connect !== "function") throw new Error("Giveaway service requires a PostgreSQL pool.");
  let schemaPromise = null;

  async function transaction(work, initialize = true) {
    if (initialize) await ensureSchema();
    const client = await pool.connect();
    let begun = false;
    try {
      await client.query("BEGIN");
      begun = true;
      const result = await work(client);
      await client.query("COMMIT");
      begun = false;
      return result;
    } catch (error) {
      if (begun) {
        try { await client.query("ROLLBACK"); } catch (rollbackError) { console.error("[AIF giveaways] Rollback failed", rollbackError?.message); }
      }
      throw error;
    } finally { client.release(); }
  }

  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = transaction(async (db) => {
        // Serializes first use across application workers as well as within this process.
        await db.query("SELECT pg_advisory_xact_lock(740629, 11001)");
        await db.query(`CREATE TABLE IF NOT EXISTS aif_giveaway_games (
          id uuid PRIMARY KEY,
          title varchar(160) NOT NULL,
          description text NOT NULL DEFAULT '',
          prize_title varchar(200) NOT NULL,
          prize_image_url text,
          winners_count integer NOT NULL CHECK (winners_count BETWEEN 1 AND 20),
          reserves_count integer NOT NULL CHECK (reserves_count BETWEEN 0 AND 20),
          closes_at timestamptz,
          facebook_post_url text,
          status varchar(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','locked','drawn','archived')),
          revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          locked_at timestamptz,
          drawn_at timestamptz,
          archived_at timestamptz,
          snapshot_hash varchar(64)
        )`);
        await db.query(`CREATE TABLE IF NOT EXISTS aif_giveaway_participants (
          id uuid PRIMARY KEY,
          game_id uuid NOT NULL REFERENCES aif_giveaway_games(id),
          display_name varchar(160) NOT NULL,
          name_key text NOT NULL,
          external_id varchar(300),
          note varchar(500) NOT NULL DEFAULT '',
          eligible boolean NOT NULL DEFAULT true,
          exclusion_reason varchar(1000),
          created_at timestamptz NOT NULL DEFAULT now()
        )`);
        await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS aif_giveaway_participants_external_unique
          ON aif_giveaway_participants(game_id, external_id) WHERE external_id IS NOT NULL`);
        await db.query(`CREATE INDEX IF NOT EXISTS aif_giveaway_participants_game_idx ON aif_giveaway_participants(game_id, created_at, id)`);
        await db.query(`CREATE TABLE IF NOT EXISTS aif_giveaway_snapshots (
          game_id uuid PRIMARY KEY REFERENCES aif_giveaway_games(id),
          snapshot_hash varchar(64) NOT NULL,
          snapshot jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )`);
        await db.query(`CREATE TABLE IF NOT EXISTS aif_giveaway_draws (
          id uuid PRIMARY KEY,
          game_id uuid NOT NULL UNIQUE REFERENCES aif_giveaway_games(id),
          request_id uuid NOT NULL,
          drawn_at timestamptz NOT NULL DEFAULT now(),
          actor varchar(200) NOT NULL,
          eligible_count integer NOT NULL CHECK (eligible_count > 0),
          snapshot_hash varchar(64) NOT NULL,
          winners jsonb NOT NULL,
          reserves jsonb NOT NULL
        )`);
        await db.query(`CREATE TABLE IF NOT EXISTS aif_giveaway_events (
          id uuid PRIMARY KEY,
          game_id uuid NOT NULL REFERENCES aif_giveaway_games(id),
          created_at timestamptz NOT NULL DEFAULT now(),
          actor varchar(200) NOT NULL,
          event_type varchar(64) NOT NULL,
          details jsonb NOT NULL DEFAULT '{}'::jsonb
        )`);
        await db.query(`CREATE INDEX IF NOT EXISTS aif_giveaway_events_game_idx ON aif_giveaway_events(game_id, created_at DESC, id)`);
      }, false).catch((error) => { schemaPromise = null; throw error; });
    }
    return schemaPromise;
  }

  async function audit(db, gameId, actor, eventType, details = {}) {
    await db.query("INSERT INTO aif_giveaway_events(id,game_id,actor,event_type,details) VALUES($1,$2,$3,$4,$5::jsonb)",
      [randomUUID(), gameId, actorValue(actor), eventType, JSON.stringify(details)]);
  }
  async function lockedGame(db, id) {
    const result = await db.query("SELECT * FROM aif_giveaway_games WHERE id=$1 FOR UPDATE", [id]);
    if (!result.rows.length) fail(404, "A nyereményjáték nem található.", "not_found");
    return result.rows[0];
  }
  async function readItem(db, id) {
    const result = await db.query(`${ITEM_SELECT} WHERE g.id=$1`, [id]);
    if (!result.rows.length) fail(404, "A nyereményjáték nem található.", "not_found");
    return gameItem(result.rows[0]);
  }
  async function readDetail(db, id) {
    const item = await readItem(db, id);
    const people = await db.query("SELECT * FROM aif_giveaway_participants WHERE game_id=$1 ORDER BY created_at,id", [id]);
    const drawing = await db.query("SELECT * FROM aif_giveaway_draws WHERE game_id=$1", [id]);
    const history = await db.query("SELECT id,created_at,actor,event_type,details FROM aif_giveaway_events WHERE game_id=$1 ORDER BY created_at DESC,id DESC LIMIT 500", [id]);
    return {
      ok: true, item, participants: people.rows.map(participant), draw: drawItem(drawing.rows[0]),
      events: history.rows.map((row) => ({ ...row, created_at: iso(row.created_at) })),
    };
  }
  async function changed(db, id) {
    await db.query("UPDATE aif_giveaway_games SET revision=revision+1,updated_at=now() WHERE id=$1", [id]);
  }
  async function deadline(db, input, existing) {
    if (Object.prototype.hasOwnProperty.call(input, "closes_at_local")) {
      const local = text(input.closes_at_local, "Határidő", 16);
      if (!local) return null;
      const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
      if (!match) fail(400, "A határidő formátuma ÉÉÉÉ-HH-NNTóó:pp legyen.", "invalid_date");
      const [, ys, ms, ds, hs, mins] = match;
      const [year, month, day, hour, minute] = [ys, ms, ds, hs, mins].map(Number);
      if (!validCalendarParts(year, month, day, hour, minute)) {
        fail(400, "Érvénytelen határidő.", "invalid_date");
      }
      const result = await db.query(`SELECT $1::timestamp AT TIME ZONE 'Europe/Bucharest' AS value,
        to_char(($1::timestamp AT TIME ZONE 'Europe/Bucharest') AT TIME ZONE 'Europe/Bucharest', 'YYYY-MM-DD"T"HH24:MI') AS local`, [local]);
      if (result.rows[0].local !== local) fail(400, "Ez a helyi időpont az óraátállítás miatt nem létezik. Válassz másik időpontot.", "invalid_date");
      return iso(result.rows[0].value);
    }
    if (Object.prototype.hasOwnProperty.call(input, "closes_at")) {
      const value = text(input.closes_at, "Határidő", 40);
      if (!value) return null;
      const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
      if (!parts || !validCalendarParts(Number(parts[1]), Number(parts[2]), Number(parts[3]), Number(parts[4]), Number(parts[5]), Number(parts[6] || 0)) || !Number.isFinite(new Date(value).getTime())) {
        fail(400, "A határidőhöz teljes, időzónát is tartalmazó dátum szükséges.", "invalid_date");
      }
      return iso(value);
    }
    return existing ? iso(existing.closes_at) : null;
  }
  async function fields(db, input, existing = {}) {
    const get = (key, fallback) => Object.prototype.hasOwnProperty.call(input, key) ? input[key] : (existing[key] ?? fallback);
    return {
      title: text(get("title", ""), "Játék neve", 160, { required: true }),
      description: text(get("description", ""), "Leírás", 10000, { multiline: true }),
      prize_title: text(get("prize_title", ""), "Nyeremény", 200, { required: true }),
      prize_image_url: urlValue(get("prize_image_url", null), "Nyeremény képe"),
      winners_count: integer(get("winners_count", 1), "Nyertesek száma", 1, 20),
      reserves_count: integer(get("reserves_count", 0), "Tartaléknyertesek száma", 0, 20),
      closes_at: await deadline(db, input, existing),
      facebook_post_url: urlValue(get("facebook_post_url", null), "Facebook-bejegyzés", true),
    };
  }

  return {
    ensureSchema,
    async meta() { return { ok: true, facebook: { connected: false, available: false }, timezone: TIMEZONE }; },
    async list() {
      await ensureSchema();
      const result = await pool.query(`${ITEM_SELECT} ORDER BY g.created_at DESC,g.id DESC LIMIT 1000`);
      return { ok: true, items: result.rows.map(gameItem) };
    },
    async detail(rawId) {
      const id = idValue(rawId);
      // A repeatable-read transaction keeps counts, rows and draw from different revisions out of one response.
      return transaction(async (db) => {
        await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
        return readDetail(db, id);
      });
    },
    async create(rawBody, actor) {
      const body = object(rawBody);
      return transaction(async (db) => {
        const value = await fields(db, body);
        const id = randomUUID();
        await db.query(`INSERT INTO aif_giveaway_games
          (id,title,description,prize_title,prize_image_url,winners_count,reserves_count,closes_at,facebook_post_url)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, value.title, value.description, value.prize_title, value.prize_image_url, value.winners_count, value.reserves_count, value.closes_at, value.facebook_post_url]);
        await audit(db, id, actor, "game_created", { title: value.title, prize_title: value.prize_title });
        return { ok: true, item: await readItem(db, id) };
      });
    },
    async update(rawId, rawBody, actor) {
      const id = idValue(rawId), body = object(rawBody);
      return transaction(async (db) => {
        const game = await lockedGame(db, id);
        assertEditable(game); assertRevision(game, body);
        const value = await fields(db, body, game);
        await db.query(`UPDATE aif_giveaway_games SET title=$2,description=$3,prize_title=$4,prize_image_url=$5,
          winners_count=$6,reserves_count=$7,closes_at=$8,facebook_post_url=$9,revision=revision+1,updated_at=now() WHERE id=$1`,
        [id, value.title, value.description, value.prize_title, value.prize_image_url, value.winners_count, value.reserves_count, value.closes_at, value.facebook_post_url]);
        await audit(db, id, actor, "game_updated", { fields: EDITABLE.filter((key) => Object.prototype.hasOwnProperty.call(body, key)) });
        return { ok: true, item: await readItem(db, id) };
      });
    },
    async open(rawId, rawBody, actor) {
      const id = idValue(rawId), body = object(rawBody);
      return transaction(async (db) => {
        const game = await lockedGame(db, id);
        assertRevision(game, body);
        if (game.status !== "draft") fail(409, "Csak egy még el nem indított játék nyitható meg.", "invalid_state");
        await db.query("UPDATE aif_giveaway_games SET status='open',revision=revision+1,updated_at=now() WHERE id=$1", [id]);
        await audit(db, id, actor, "game_opened");
        return { ok: true, item: await readItem(db, id) };
      });
    },
    async importParticipants(rawId, rawBody, actor) {
      const id = idValue(rawId), body = object(rawBody);
      if (!Array.isArray(body.participants) || body.participants.length < 1 || body.participants.length > MAX_IMPORT) {
        fail(400, `Egyszerre 1–${MAX_IMPORT} résztvevő importálható.`, "import_limit");
      }
      if (body.allow_name_duplicates !== undefined && typeof body.allow_name_duplicates !== "boolean") fail(400, "Érvénytelen névazonossági megerősítés.", "invalid_field");
      const submitted = body.participants.map((raw) => {
        const row = object(raw);
        const display_name = text(row.display_name, "Résztvevő neve", 160, { required: true }).replace(/\s+/gu, " ");
        return { id: randomUUID(), display_name, name_key: normalizedName(display_name), external_id: text(row.external_id, "Résztvevő azonosítója", 300) || null,
          note: text(row.note, "Megjegyzés", 500, { multiline: true }) };
      });
      return transaction(async (db) => {
        const game = await lockedGame(db, id); assertEditable(game);
        const existing = (await db.query("SELECT display_name,name_key,external_id FROM aif_giveaway_participants WHERE game_id=$1", [id])).rows;
        const stableIds = new Set(existing.map((p) => p.external_id).filter(Boolean));
        const names = new Map();
        for (const row of existing) {
          const group = names.get(row.name_key) || []; group.push(row); names.set(row.name_key, group);
        }
        const accepted = [], nameCollisions = new Set();
        let duplicates = 0;
        for (const row of submitted) {
          if (row.external_id && stableIds.has(row.external_id)) { duplicates++; continue; }
          const group = names.get(row.name_key) || [];
          if (group.length && (!row.external_id || group.some((p) => !p.external_id))) nameCollisions.add(row.display_name);
          accepted.push(row); group.push(row); names.set(row.name_key, group);
          if (row.external_id) stableIds.add(row.external_id);
        }
        if (nameCollisions.size && body.allow_name_duplicates !== true) {
          fail(409, "Azonos nevű résztvevők szerepelnek az azonosítatlan sorok között. Ellenőrizd, hogy külön személyek-e, majd erősítsd meg az importot.", "duplicate_names", { names: [...nameCollisions] });
        }
        if (existing.length + accepted.length > MAX_PARTICIPANTS) fail(400, `Egy játékban legfeljebb ${MAX_PARTICIPANTS} résztvevő szerepelhet.`, "participant_limit");
        if (accepted.length) {
          await db.query(`INSERT INTO aif_giveaway_participants(id,game_id,display_name,name_key,external_id,note)
            SELECT x.id,$1::uuid,x.display_name,x.name_key,x.external_id,x.note
            FROM jsonb_to_recordset($2::jsonb) AS x(id uuid,display_name text,name_key text,external_id text,note text)`, [id, JSON.stringify(accepted)]);
        }
        await changed(db, id);
        await audit(db, id, actor, "participants_imported", {
          source: "manual_curated", submitted: submitted.length, added: accepted.length, duplicates,
          name_duplicates_confirmed: body.allow_name_duplicates === true && nameCollisions.size > 0,
          confirmed_names: [...nameCollisions],
        });
        return { ok: true, added: accepted.length, duplicates, details: await readDetail(db, id) };
      });
    },
    async setEligibility(rawId, rawParticipantId, rawBody, actor) {
      const id = idValue(rawId), personId = idValue(rawParticipantId, "Résztvevő"), body = object(rawBody);
      if (typeof body.eligible !== "boolean") fail(400, "Az érvényesség igaz/hamis érték lehet.", "invalid_field");
      const reason = text(body.reason, "Indoklás", 1000, { required: !body.eligible, multiline: true });
      return transaction(async (db) => {
        const game = await lockedGame(db, id); assertEditable(game);
        const previous = (await db.query("SELECT * FROM aif_giveaway_participants WHERE id=$1 AND game_id=$2", [personId, id])).rows[0];
        if (!previous) fail(404, "A résztvevő nem található ebben a játékban.", "not_found");
        await db.query("UPDATE aif_giveaway_participants SET eligible=$3,exclusion_reason=$4 WHERE id=$1 AND game_id=$2",
          [personId, id, body.eligible, body.eligible ? null : reason]);
        await changed(db, id);
        await audit(db, id, actor, body.eligible ? "participant_reincluded" : "participant_excluded", {
          participant_id: personId, display_name: previous.display_name, previous_eligible: previous.eligible, reason,
        });
        return { ok: true, details: await readDetail(db, id) };
      });
    },
    async lock(rawId, rawBody, actor) {
      const id = idValue(rawId), body = object(rawBody);
      if (body.confirm_eligibility !== true) fail(400, "A sorsolás előtt meg kell erősíteni a résztvevők jogosultságának ellenőrzését.", "eligibility_confirmation_required");
      const reason = text(body.reason, "Lezárás indoklása", 1000, { multiline: true });
      return transaction(async (db) => {
        const game = await lockedGame(db, id); assertEditable(game); assertRevision(game, body);
        const now = (await db.query("SELECT now() AS value")).rows[0].value;
        const early = game.closes_at && new Date(game.closes_at).getTime() > new Date(now).getTime();
        if (early && !reason) fail(400, "A határidő előtti lezáráshoz indoklás szükséges.", "early_close_reason_required");
        const people = (await db.query("SELECT * FROM aif_giveaway_participants WHERE game_id=$1 AND eligible ORDER BY id", [id])).rows.map(participant);
        if (people.length < game.winners_count + game.reserves_count) fail(409, "Nincs elegendő érvényes résztvevő a nyertesek és a tartalékok kisorsolásához.", "insufficient_participants");
        const snapshot = {
          format: "allinfashion-giveaway-v1", game_id: id, revision: Number(game.revision) + 1,
          settings: { title: game.title, description: game.description, prize_title: game.prize_title,
            prize_image_url: game.prize_image_url, winners_count: game.winners_count, reserves_count: game.reserves_count,
            closes_at: iso(game.closes_at), facebook_post_url: game.facebook_post_url },
          participants: people,
        };
        const snapshotHash = snapshotDigest(snapshot);
        await db.query("INSERT INTO aif_giveaway_snapshots(game_id,snapshot_hash,snapshot) VALUES($1,$2,$3::jsonb)", [id, snapshotHash, JSON.stringify(snapshot)]);
        await db.query("UPDATE aif_giveaway_games SET status='locked',snapshot_hash=$2,locked_at=now(),revision=revision+1,updated_at=now() WHERE id=$1", [id, snapshotHash]);
        await audit(db, id, actor, "participants_locked", { eligible_count: people.length, snapshot_hash: snapshotHash, eligibility_confirmed: true, early_close: Boolean(early), reason });
        return { ok: true, details: await readDetail(db, id) };
      });
    },
    async draw(rawId, rawBody, actor) {
      const id = idValue(rawId), body = object(rawBody), requestId = idValue(body.request_id, "Sorsolási kérés");
      return transaction(async (db) => {
        const game = await lockedGame(db, id);
        const existing = (await db.query("SELECT * FROM aif_giveaway_draws WHERE game_id=$1", [id])).rows[0];
        if (existing) return { ok: true, draw: drawItem(existing), details: await readDetail(db, id) };
        if (game.status !== "locked") fail(409, "Sorsolni csak ellenőrzött, lezárt résztvevőlistából lehet.", "invalid_state");
        const frozen = (await db.query("SELECT * FROM aif_giveaway_snapshots WHERE game_id=$1", [id])).rows[0];
        if (!frozen || frozen.snapshot_hash !== game.snapshot_hash) throw new Error("Giveaway snapshot is missing or inconsistent.");
        const snapshot = frozen.snapshot;
        if (snapshotDigest(snapshot) !== frozen.snapshot_hash) throw new Error("Giveaway snapshot integrity check failed.");
        const poolOfPeople = [...snapshot.participants];
        const count = snapshot.settings.winners_count + snapshot.settings.reserves_count;
        if (!Number.isSafeInteger(count) || poolOfPeople.length < count) throw new Error("Giveaway snapshot count is inconsistent.");
        // Partial Fisher–Yates: every eligible person has the same chance; selections cannot repeat.
        const selections = [];
        for (let i = 0; i < count; i++) {
          const next = randomInt(i, poolOfPeople.length);
          [poolOfPeople[i], poolOfPeople[next]] = [poolOfPeople[next], poolOfPeople[i]];
          const p = poolOfPeople[i];
          selections.push({ participant_id: p.id, display_name: p.display_name, external_id: p.external_id, rank: 0 });
        }
        const winners = selections.slice(0, snapshot.settings.winners_count).map((p, index) => ({ ...p, rank: index + 1 }));
        const reserves = selections.slice(snapshot.settings.winners_count).map((p, index) => ({ ...p, rank: index + 1 }));
        const result = await db.query(`INSERT INTO aif_giveaway_draws(id,game_id,request_id,actor,eligible_count,snapshot_hash,winners,reserves)
          VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb) RETURNING *`,
        [randomUUID(), id, requestId, actorValue(actor), poolOfPeople.length, frozen.snapshot_hash, JSON.stringify(winners), JSON.stringify(reserves)]);
        await db.query("UPDATE aif_giveaway_games SET status='drawn',drawn_at=now(),revision=revision+1,updated_at=now() WHERE id=$1", [id]);
        await audit(db, id, actor, "draw_completed", { draw_id: result.rows[0].id, request_id: requestId, eligible_count: poolOfPeople.length,
          snapshot_hash: frozen.snapshot_hash, winner_ids: winners.map((p) => p.participant_id), reserve_ids: reserves.map((p) => p.participant_id) });
        return { ok: true, draw: drawItem(result.rows[0]), details: await readDetail(db, id) };
      });
    },
    async archive(rawId, rawBody, actor) {
      const id = idValue(rawId), body = object(rawBody);
      const reason = text(body.reason, "Archiválás indoklása", 1000, { multiline: true });
      return transaction(async (db) => {
        const game = await lockedGame(db, id);
        if (game.status === "archived") return { ok: true, details: await readDetail(db, id) };
        if (game.status !== "drawn" && !reason) fail(400, "A még ki nem sorsolt játék archiválásához indoklás szükséges.", "archive_reason_required");
        await db.query("UPDATE aif_giveaway_games SET status='archived',archived_at=now(),revision=revision+1,updated_at=now() WHERE id=$1", [id]);
        await audit(db, id, actor, "game_archived", { previous_status: game.status, reason });
        return { ok: true, details: await readDetail(db, id) };
      });
    },
  };
}
