import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import multer from "multer";
import pg from "pg";

import createCarsRouter from "./api/routes/cars.js";
import createCarExpensesRouter from "./api/routes/car-expenses.js";
import createVacationsRouter from "./api/routes/vacations.js";
import createAifRouter from "./api/routes/aif.js";

const { Pool } = pg;

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- config ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "allinboss-123"; // ideiglenes default
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is missing");
  process.exit(1);
}

// --- postgres pool ---
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
});

// --- R2 (Cloudflare API / Bearer token) ---
// Uploads go through Cloudflare's REST API (api.cloudflare.com). This matches the working CUPE flow.
// Required env:
// - R2_ACCOUNT_ID: Cloudflare account id (from the R2 Overview page)
// - R2_BUCKET: bucket name
// - R2_API_TOKEN: Cloudflare Account API token (needs R2 write access)
// Optional env:
// - R2_PUBLIC_BASE_URL: public base URL (e.g. https://pub-....r2.dev) used to return a usable URL
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_BUCKET = process.env.R2_BUCKET || "";
const R2_API_TOKEN = process.env.R2_API_TOKEN || "";
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL || "";

const r2HttpEnabled = Boolean(R2_ACCOUNT_ID && R2_BUCKET && R2_API_TOKEN);
const r2PublicBase = R2_PUBLIC_BASE_URL ? R2_PUBLIC_BASE_URL.replace(/\/+$/, "") : "";
// --- in-memory sessions (ok for MVP) ---
const sessions = new Map();

const captureShopifyWebhookRawBody = (req, _res, buffer) => {
  const url = String(req.originalUrl || req.url || "");

  if (url.startsWith("/api/aif/shopify/webhooks/")) {
    req.rawBody = Buffer.from(buffer);
  }
};

const defaultJsonParser = express.json({
  limit: "10mb",
  verify: captureShopifyWebhookRawBody,
});

const aifJsonParser = express.json({
  limit: "80mb",
  verify: captureShopifyWebhookRawBody,
});

app.use((req, res, next) => {
  const url = String(req.originalUrl || req.url || "");
  const parser = url.startsWith("/api/aif/") ? aifJsonParser : defaultJsonParser;
  return parser(req, res, next);
});

// --- file uploads (multipart) ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

function requireAdminOrSecret(req, res, next) {
  // allow either admin session cookie OR x-admin-secret header (for server-to-server / curl)
  const sid = getSid(req);
  const s = sid ? sessions.get(sid) : null;
  if (s && s.role === "admin") {
    req.session = s;
    return next();
  }
  const secret = String(req.headers["x-admin-secret"] || "").trim();
  if (secret && secret === ADMIN_PASSWORD) return next();
  return res.status(401).send("Not authorized");
}

// --- helpers ---
function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}
function setCookie(res, sid) {
  res.setHeader("Set-Cookie", `sid=${sid}; Path=/; HttpOnly; SameSite=Lax`);
}
function getSid(req) {
  const c = req.headers.cookie || "";
  const m = c.match(/(?:^|;\s*)sid=([^;]+)/);
  return m ? m[1] : null;
}
function requireAdmin(req, res, next) {
  const sid = getSid(req);
  const s = sid ? sessions.get(sid) : null;
  if (!s || s.role !== "admin") return res.status(401).send("Not authorized");
  req.session = s;
  next();
}

function requireAuthed(req, res, next) {
  // Allow x-admin-secret to bypass login (useful for curl / server-to-server).
  // UI stays the same; this is mainly for admin diagnostics and automation.
  const secret = String(req.headers["x-admin-secret"] || "").trim();
  if (secret && secret === ADMIN_PASSWORD) return next();

  const sid = getSid(req);
  const s = sid ? sessions.get(sid) : null;
  if (!s) return res.status(401).send("Not authorized");
  req.session = s;
  next();
}

// --- Cars (ALL IN) ---
app.use("/api/cars", createCarsRouter({ pool, requireAuthed, requireAdminOrSecret }));

// --- Car expenses (ALL IN) ---
app.use("/api/car-expenses", createCarExpensesRouter({ pool, requireAuthed, requireAdminOrSecret }));

// --- Vacations / time-off (ALL IN) ---
app.use("/api/admin/vacations", createVacationsRouter({ pool, requireAdminOrSecret }));

// --- AllInFashion clean product system (AIF) ---
app.use("/api/aif", createAifRouter({ pool, requireAuthed, requireAdminOrSecret }));

// --- encrypt/decrypt codes for admin resend (AES-256-GCM) ---
function codeKey() {
  return crypto.createHash("sha256").update(String(SESSION_SECRET)).digest(); // 32 bytes
}
function encryptCode(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", codeKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${enc.toString("base64")}.${tag.toString("base64")}`;
}
function decryptCode(packed) {
  if (!packed) return null;
  const parts = String(packed).split(".");
  if (parts.length !== 3) return null;
  const [ivB64, encB64, tagB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const enc = Buffer.from(encB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", codeKey(), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
  return plain.toString("utf8");
}

// --- app settings (for branding, etc.) ---
let settingsReady = false;
async function ensureSettings() {
  if (settingsReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key text PRIMARY KEY,
      value text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  settingsReady = true;
}
async function setSetting(key, value) {
  await ensureSettings();
  await pool.query(
    "INSERT INTO app_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
    [key, value]
  );
}
async function getSetting(key) {
  await ensureSettings();
  const r = await pool.query("SELECT value FROM app_settings WHERE key = $1 LIMIT 1", [key]);
  return r.rowCount ? r.rows[0].value : null;
}

// --- ensure shops table exists + defaults ---
let shopsReady = false;
async function ensureShops() {
  if (shopsReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shops (
      id text PRIMARY KEY,
      name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`ALTER TABLE shops ADD COLUMN IF NOT EXISTS login_enabled boolean NOT NULL DEFAULT true`);
  await pool.query(`ALTER TABLE shops ADD COLUMN IF NOT EXISTS aif_location_code text NULL`);

  await pool.query(
    `INSERT INTO shops (id, name, login_enabled, aif_location_code)
     VALUES ('csikszereda','Csíkszereda',true,'main_warehouse')
     ON CONFLICT (id) DO UPDATE SET
       name=EXCLUDED.name, login_enabled=true, aif_location_code='main_warehouse'`
  );
  await pool.query(
    `INSERT INTO shops (id, name, login_enabled, aif_location_code)
     VALUES ('kezdivasarhely','Kézdivásárhely',true,'magazin_targu_secuiesc')
     ON CONFLICT (id) DO UPDATE SET
       name=EXCLUDED.name, login_enabled=true, aif_location_code='magazin_targu_secuiesc'`
  );
  // A Raktár technikai helység marad, nem jelenik meg üzleti belépésként.
  await pool.query(
    `INSERT INTO shops (id, name, login_enabled, aif_location_code)
     VALUES ('raktar','Raktár',false,NULL)
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, login_enabled=false`
  );
  await pool.query(`UPDATE shops SET aif_location_code=id WHERE aif_location_code IS NULL AND id <> 'raktar'`);
  shopsReady = true;
}

function normalizeShopId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '')
    .slice(0, 64);
}

async function shopRow(id, client = pool) {
  await ensureShops();
  const r = await client.query(
    `SELECT id, name, COALESCE(login_enabled,true) AS login_enabled,
            COALESCE(NULLIF(aif_location_code,''), id) AS aif_location_code
     FROM shops WHERE id=$1 LIMIT 1`,
    [id]
  );
  return r.rows[0] || null;
}

async function shopExists(id) {
  return Boolean(await shopRow(id));
}

async function preferredShopLocationType(client) {
  try {
    const known = await client.query(
      `SELECT location_type
       FROM aif_locations
       WHERE code IN ('magazin_targu_secuiesc','main_warehouse')
         AND NULLIF(btrim(COALESCE(location_type,'')),'') IS NOT NULL
       ORDER BY CASE WHEN code='magazin_targu_secuiesc' THEN 0 ELSE 1 END
       LIMIT 1`
    );
    if (known.rowCount) return String(known.rows[0].location_type);

    const active = await client.query(
      `SELECT code
       FROM aif_location_types
       WHERE COALESCE(is_active,true)=true
       ORDER BY CASE lower(code)
         WHEN 'shop' THEN 0
         WHEN 'store' THEN 1
         WHEN 'magazin' THEN 2
         WHEN 'warehouse' THEN 3
         ELSE 10 END, sort_order ASC NULLS LAST, code ASC
       LIMIT 1`
    );
    if (active.rowCount) return String(active.rows[0].code);
  } catch (error) {
    console.error('AIF shop location type lookup failed', error);
    throw error;
  }
  return 'warehouse';
}

async function ensureAifLocationForShop(client, { shopId, name, locationCode }) {
  const code = String(locationCode || shopId || '').trim();
  if (!code) throw new Error('A helységhez nem állapítható meg AllIn készlethely-kód.');
  const locationType = await preferredShopLocationType(client);
  const existing = await client.query(`SELECT id FROM aif_locations WHERE code=$1 LIMIT 1`, [code]);
  if (existing.rowCount) {
    await client.query(
      `UPDATE aif_locations
       SET name=$2, is_active=true, updated_at=now()
       WHERE code=$1`,
      [code, name]
    );
    return code;
  }
  await client.query(
    `INSERT INTO aif_locations (code, name, location_type, is_active)
     VALUES ($1,$2,$3,true)`,
    [code, name, locationType]
  );
  return code;
}

// --- auth ---
app.post("/api/auth/login", async (req, res) => {
  const body = req.body || {};

  if (body.kind === "admin") {
    if (body.password !== ADMIN_PASSWORD) return res.status(401).send("Hibás admin jelszó");
    const sid = newId("s");
    const session = { role: "admin", actor: "ADMIN" };
    sessions.set(sid, session);
    setCookie(res, sid);
    return res.json({ session });
  }

  if (body.kind === "shop") {
    await ensureShops();
    const shopId = body.shopId ? String(body.shopId).trim() : '';
    const code = String(body.code || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!code) return res.status(400).send("Belépőkód szükséges");

    let r;
    if (shopId) {
      const shop = await shopRow(shopId);
      if (!shop || shop.login_enabled === false) return res.status(401).send("Ismeretlen vagy nem beléphető helység");
      r = await pool.query(
        `SELECT lc.id, lc.shop_id, lc.name,
                s.name AS shop_name,
                COALESCE(NULLIF(s.aif_location_code,''), s.id) AS aif_location_code,
                l.name AS location_name
         FROM login_codes lc
         JOIN shops s ON s.id=lc.shop_id
         LEFT JOIN aif_locations l ON l.code=COALESCE(NULLIF(s.aif_location_code,''), s.id)
         WHERE lc.shop_id=$1
           AND COALESCE(s.login_enabled,true)=true
           AND lc.revoked_at IS NULL
           AND (lc.expires_at IS NULL OR lc.expires_at > now())
           AND crypt($2, lc.code_hash)=lc.code_hash
         LIMIT 1`,
        [shopId, code]
      );
    } else {
      // Kártyaolvasásnál nem kérjük a dolgozótól, hogy előbb üzletet válasszon.
      // A code_hint leszűkíti a bcrypt ellenőrzést, a teljes kód pedig eldönti a pontos tulajdonost.
      const hint = code.slice(-4);
      r = await pool.query(
        `SELECT lc.id, lc.shop_id, lc.name,
                s.name AS shop_name,
                COALESCE(NULLIF(s.aif_location_code,''), s.id) AS aif_location_code,
                l.name AS location_name
         FROM login_codes lc
         JOIN shops s ON s.id=lc.shop_id
         LEFT JOIN aif_locations l ON l.code=COALESCE(NULLIF(s.aif_location_code,''), s.id)
         WHERE COALESCE(s.login_enabled,true)=true
           AND lc.revoked_at IS NULL
           AND (lc.expires_at IS NULL OR lc.expires_at > now())
           AND (lc.code_hint=$2 OR lc.code_hint IS NULL)
           AND crypt($1, lc.code_hash)=lc.code_hash
         ORDER BY lc.created_at DESC
         LIMIT 2`,
        [code, hint]
      );
      if (r.rowCount > 1) return res.status(409).send("A belépőkód több helységhez is egyezik. Válaszd ki kézzel a helységet.");
    }

    if (r.rowCount === 0) return res.status(401).send("Hibás vagy inaktív belépőkód");
    const row = r.rows[0];

    await pool.query("UPDATE login_codes SET used_at = now(), used_by = $1 WHERE id = $2", ["SHOP", row.id]);
    await pool.query("INSERT INTO login_events (code_id, event_type, actor) VALUES ($1,'used',$2)", [row.id, "SHOP"]);

    const sid = newId("s");
    const actor = row.name ? row.name : "SHOP USER";
    const session = {
      role: "shop",
      shopId: row.shop_id,
      shopName: row.shop_name || row.shop_id,
      locationCode: row.aif_location_code || row.shop_id,
      locationName: row.location_name || row.shop_name || row.shop_id,
      actor,
    };
    sessions.set(sid, session);
    setCookie(res, sid);
    return res.json({ session });
  }

  return res.status(400).send("Bad request");
});

app.get("/api/auth/me", (req, res) => {
  const sid = getSid(req);
  const s = sid ? sessions.get(sid) : null;
  res.json({ session: s || null });
});

app.post("/api/auth/logout", (req, res) => {
  const sid = getSid(req);
  if (sid) sessions.delete(sid);
  res.setHeader("Set-Cookie", "sid=; Path=/; Max-Age=0");
  res.json({ ok: true });
});

// A belépőképernyőnek hitelesítés előtt is tudnia kell, milyen üzletek léteznek.
app.get("/api/auth/shops", async (_req, res) => {
  try {
    await ensureShops();
    const r = await pool.query(
      `SELECT s.id, s.name,
              COALESCE(NULLIF(s.aif_location_code,''), s.id) AS aif_location_code,
              l.name AS location_name
       FROM shops s
       LEFT JOIN aif_locations l ON l.code=COALESCE(NULLIF(s.aif_location_code,''), s.id)
       WHERE COALESCE(s.login_enabled,true)=true
       ORDER BY CASE s.id WHEN 'csikszereda' THEN 0 WHEN 'kezdivasarhely' THEN 1 ELSE 10 END, s.name ASC`
    );
    return res.json({
      items: r.rows.map((row) => ({
        id: row.id,
        name: row.name,
        locationCode: row.aif_location_code || row.id,
        locationName: row.location_name || row.name,
      })),
    });
  } catch (error) {
    console.error('Login shop list failed', error);
    return res.status(500).json({ error: 'A belépési helységek nem tölthetők be.' });
  }
});

// --- admin: shops ---

// --- shops (places): list for any logged in user (admin or shop) ---
app.get("/api/shops", requireAuthed, async (_req, res) => {
  await ensureShops();
  const r = await pool.query(
    `SELECT id, name, COALESCE(login_enabled,true) AS login_enabled,
            COALESCE(NULLIF(aif_location_code,''), id) AS aif_location_code
     FROM shops ORDER BY name ASC`
  );
  res.json({ items: r.rows });
});

app.get("/api/admin/shops", requireAdmin, async (_req, res) => {
  await ensureShops();
  const r = await pool.query(
    `SELECT id, name, COALESCE(login_enabled,true) AS login_enabled,
            COALESCE(NULLIF(aif_location_code,''), id) AS aif_location_code
     FROM shops ORDER BY name ASC`
  );
  res.json({ items: r.rows });
});

app.post("/api/admin/shops", requireAdmin, async (req, res) => {
  await ensureShops();
  const body = req.body || {};
  const requestedId = String(body.id || "").trim();
  const id = normalizeShopId(requestedId);
  const name = String(body.name || "").trim();
  if (!id) return res.status(400).json({ error: "Érvényes technikai azonosító szükséges." });
  if (id !== requestedId.toLowerCase()) {
    return res.status(400).json({ error: "A technikai azonosító csak kisbetűt, számot, kötőjelet és aláhúzást tartalmazhat." });
  }
  if (!name) return res.status(400).json({ error: "Helységnév szükséges." });

  const defaultLocationCode = id === 'csikszereda'
    ? 'main_warehouse'
    : id === 'kezdivasarhely'
      ? 'magazin_targu_secuiesc'
      : id;
  const loginEnabled = id !== 'raktar';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let locationCode = defaultLocationCode;
    if (loginEnabled) {
      locationCode = await ensureAifLocationForShop(client, { shopId: id, name, locationCode: defaultLocationCode });
    }
    await client.query(
      `INSERT INTO shops (id, name, login_enabled, aif_location_code)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET
         name=EXCLUDED.name,
         login_enabled=EXCLUDED.login_enabled,
         aif_location_code=EXCLUDED.aif_location_code`,
      [id, name, loginEnabled, loginEnabled ? locationCode : null]
    );
    await client.query('COMMIT');
    return res.json({ ok: true, item: { id, name, loginEnabled, locationCode: loginEnabled ? locationCode : null } });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Create shop failed', error);
    return res.status(500).json({ error: error?.message || 'A helység létrehozása nem sikerült.' });
  } finally {
    client.release();
  }
});


// --- admin: delete shop (place) ---
app.delete("/api/admin/shops/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "");
  if (!id) return res.status(400).json({ error: "id required" });

  // prevent deleting default shops if you want (optional)
  // await pool.query("DELETE FROM shops WHERE id = $1", [id]);

  await pool.query("DELETE FROM shops WHERE id = $1", [id]);
  res.json({ ok: true });
});



// --- Legacy product/incoming endpoints removed. New product system lives in api/routes/aif.js. ---

// --- admin: R2 presign + set login logo ---
app.get("/api/admin/r2/presign", requireAdminOrSecret, async (req, res) => {
  // This deployment uses Cloudflare API-token uploads (no S3 access keys), so presign is disabled.
  return res.status(400).json({ error: "Presign disabled. Use POST /api/uploads/r2 (multipart)" });
});

app.post("/api/admin/branding/logo", requireAdminOrSecret, async (req, res) => {
  if (!R2_PUBLIC_BASE_URL) return res.status(400).json({ error: "R2_PUBLIC_BASE_URL hiányzik" });
  const body = req.body || {};
  const key = String(body.key || "").trim();
  if (!key) return res.status(400).json({ error: "key required" });
  if (!key.startsWith("branding/")) return res.status(400).json({ error: "Csak branding/ alá engedélyezett" });

  await setSetting("login_logo_key", key);
  return res.json({ ok: true, url: `${R2_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${key}` });
});

// --- admin: create shop codes (DB-backed) ---
app.post("/api/admin/codes", requireAdmin, async (req, res) => {
  await ensureShops();
  const { shopId, name } = req.body || {};
  if (!shopId) return res.status(400).send("shopId required");
  const codeShop = await shopRow(String(shopId));
  if (!codeShop) return res.status(400).send("Ismeretlen helység");
  if (codeShop.login_enabled === false) return res.status(400).send("Ehhez a technikai helységhez nem készíthető üzleti belépőkód");

  const rawCode = crypto.randomBytes(4).toString("hex").toUpperCase();
  const hint = rawCode.slice(-4);
  const enc = encryptCode(rawCode);

  const q = `
    INSERT INTO login_codes
      (shop_id, name, created_by, code_hash, code_hint, code_enc)
    VALUES
      ($1, $2, $3, crypt($4, gen_salt('bf')), $5, $6)
    RETURNING id
  `;
  const r = await pool.query(q, [shopId, name || null, req.session.actor || "ADMIN", rawCode, hint, enc]);

  await pool.query("INSERT INTO login_events (code_id, event_type, actor) VALUES ($1,'created',$2)", [
    r.rows[0].id,
    req.session.actor || "ADMIN"
  ]);

  res.send(`Kód: ${rawCode}\nÜzlet: ${shopId}\nNév: ${name || "-"}\n`);
});

// --- admin: list codes (for resend) ---
app.get("/api/admin/codes", requireAdmin, async (req, res) => {
  await ensureShops();
  const shopId = req.query.shopId ? String(req.query.shopId) : null;
  const status = req.query.status ? String(req.query.status) : "active"; // active | inactive | all

  const where = [];
  const params = [];
  let i = 1;

  if (shopId) {
    where.push(`shop_id = $${i++}`);
    params.push(shopId);
  }

  if (status === "active") {
    where.push("revoked_at IS NULL");
    where.push("(expires_at IS NULL OR expires_at > now())");
  } else if (status === "inactive") {
    where.push("revoked_at IS NOT NULL");
  }

  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const q = `
    SELECT id, shop_id, name, created_at, revoked_at, code_hint, code_enc
    FROM login_codes
    ${w}
    ORDER BY created_at DESC
    LIMIT 200
  `;

  const r = await pool.query(q, params);

  const rows = r.rows.map((x) => ({
    id: x.id,
    shopId: x.shop_id,
    name: x.name,
    createdAt: x.created_at,
    revokedAt: x.revoked_at,
    codeHint: x.code_hint,
    code: decryptCode(x.code_enc)
  }));

  res.json({ items: rows });
});

// --- admin: activate / inactivate code (toggle revoked_at) ---
app.patch("/api/admin/codes/:id/status", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "");
  const body = req.body || {};
  const active = Boolean(body.active);

  if (!id) return res.status(400).json({ error: "id required" });

  if (active) {
    const r = await pool.query("UPDATE login_codes SET revoked_at = NULL, revoked_by = NULL WHERE id = $1", [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Not found" });
    return res.json({ ok: true, active: true });
  }

  const r = await pool.query("UPDATE login_codes SET revoked_at = now(), revoked_by = $2 WHERE id = $1", [
    id,
    req.session.actor || "ADMIN"
  ]);
  if (r.rowCount === 0) return res.status(404).json({ error: "Not found" });

  await pool.query("INSERT INTO login_events (code_id, event_type, actor) VALUES ($1,'revoked',$2)", [
    id,
    req.session.actor || "ADMIN"
  ]);

  return res.json({ ok: true, active: false });
});

// --- admin: delete code permanently ---
app.delete("/api/admin/codes/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "");
  if (!id) return res.status(400).send("id required");

  const r = await pool.query("DELETE FROM login_codes WHERE id = $1", [id]);
  if (r.rowCount === 0) return res.status(404).send("Not found");

  res.json({ ok: true });
});

// --- public: branding (login logo) ---
app.get("/api/branding/logo", async (req, res) => {
  try {
    await ensureSettings();
    const key = await getSetting("login_logo_key");
    if (!key) return res.json({ url: null });
    if (!R2_PUBLIC_BASE_URL) return res.json({ url: null });
    return res.json({ url: `${R2_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${key}` });
  } catch {
    return res.json({ url: null });
  }
});



// --- uploads: R2 direct upload (admin only) ---
// Expects multipart/form-data with:
// - file: the binary
// - folder (optional): e.g. products/123
// - name (optional): e.g. main.jpg
// --- uploads: R2 direct upload (admin only) ---
// Expects multipart/form-data with:
// - file: the binary
// - folder (optional): e.g. products/123
// - name (optional): e.g. main.jpg
app.post("/api/uploads/r2", requireAdminOrSecret, upload.single("file"), async (req, res) => {
  try {
    if (!r2HttpEnabled) return res.status(400).json({ error: "R2 nincs beállítva" });

    // URL-based upload: allow providing a remote image URL instead of a multipart file.
    // Expects multipart/form-data field: url=https://...
    if (!req.file && req.body?.url) {
      const url = String(req.body.url);

      const resp = await fetch(url);
      if (!resp.ok) {
        return res.status(400).json({ error: "failed to fetch url", status: resp.status });
      }

      const contentLength = resp.headers.get("content-length");
      if (contentLength && Number(contentLength) > 10 * 1024 * 1024) {
        return res.status(413).json({ error: "file too large" });
      }

      const contentType = resp.headers.get("content-type") || "application/octet-stream";
      const ab = await resp.arrayBuffer();
      const buffer = Buffer.from(ab);

      // Derive a filename from the URL path (fallback to 'file.bin')
      let originalname = "file.bin";
      try {
        const u = new URL(url);
        const last = u.pathname.split("/").filter(Boolean).pop();
        if (last) originalname = last;
      } catch {}

      req.file = {
        buffer,
        mimetype: contentType,
        originalname,
      };
    }

    if (!req.file) return res.status(400).json({ error: "file required" });

    const folder = String(req.body?.folder || "uploads").replace(/^\/+/, "").replace(/\/+$/, "");
    const nameRaw = String(req.body?.name || req.file?.originalname || "file.bin");
    const safeName = nameRaw.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const key = `${folder}/${crypto.randomUUID()}_${safeName}`;
    // Upload via Cloudflare REST API
    const encodedKey = encodeURIComponent(key).replace(/%2F/g, "/");
    const putUrl = "https://api.cloudflare.com/client/v4/accounts/" + R2_ACCOUNT_ID + "/r2/buckets/" + R2_BUCKET + "/objects/" + encodedKey;
    const r = await fetch(putUrl, {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + R2_API_TOKEN,
        "Content-Type": req.file.mimetype || "application/octet-stream",
      },
      body: req.file.buffer,
    });

    if (!r.ok) {
      const msg = await r.text().catch(() => "");
      console.error("R2 upload failed:", r.status, msg);
      return res.status(500).json({ error: "Upload failed" });
    }

    const basePub = R2_PUBLIC_BASE_URL ? R2_PUBLIC_BASE_URL.replace(/\/+$/, "") : "";
    const url = basePub ? `${basePub}/${key}` : key;

    return res.json({ key, url });
  } catch (e) {
    console.error("R2 upload failed:", e);
    return res.status(500).json({ error: "Upload failed" });
  }
});

// --- health ---
app.get("/api/health", async (req, res) => {
  const r = await pool.query("select 1");
  res.json({ ok: true, db: r.rowCount === 1 });
});


// --- Legacy transfer endpoints removed. New inventory movement logic lives in api/routes/aif.js. ---

// --- static frontend ---// --- static frontend ---

// --- Legacy warehouse/product endpoints removed. New AIF inventory API lives in api/routes/aif.js. ---

app.use(express.static(path.join(__dirname, "public")));app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).send("Not found");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
