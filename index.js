import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import multer from "multer";
import pg from "pg";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

// --- R2 (HTTP / Bearer token) ---
// Cloudflare R2 in this account uses Account API tokens (Workers R2 Storage) instead of AWS-style key pairs.
// Required env:
// - R2_ENDPOINT: https://<accountid>.r2.cloudflarestorage.com
// - R2_BUCKET: bucket name
// - R2_API_TOKEN: Cloudflare Account API token value (with Account.Workers R2 Storage:Edit)
// Optional:
// - R2_PUBLIC_BASE_URL: public base URL (custom domain / public dev URL). If missing, API returns key only.
const R2_ENDPOINT = process.env.R2_ENDPOINT || "";
const R2_BUCKET = process.env.R2_BUCKET || "";
const R2_API_TOKEN = process.env.R2_API_TOKEN || "";
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL || ""; // e.g. https://r2.cdn.yourdomain.com

const r2HttpEnabled = Boolean(R2_ENDPOINT && R2_BUCKET && R2_API_TOKEN);
const r2Base = R2_ENDPOINT.replace(/\/+$/, "");
// --- in-memory sessions (ok for MVP) ---
const sessions = new Map();

app.use(express.json());

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
  await pool.query(
    "INSERT INTO shops (id, name) VALUES ('csikszereda','Csíkszereda') ON CONFLICT (id) DO NOTHING"
  );
  await pool.query(
    "INSERT INTO shops (id, name) VALUES ('kezdivasarhely','Kézdivásárhely') ON CONFLICT (id) DO NOTHING"
  );
  shopsReady = true;
}

async function shopExists(id) {
  await ensureShops();
  const r = await pool.query("SELECT 1 FROM shops WHERE id = $1 LIMIT 1", [id]);
  return r.rowCount > 0;
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
    const { shopId, code } = body;
    if (!shopId || !code) return res.status(400).send("Bad request");

    // invalid shopId -> deny
    if (!(await shopExists(shopId))) return res.status(401).send("Ismeretlen helység");

    const q = `
      SELECT id, shop_id, name
      FROM login_codes
      WHERE shop_id = $1
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())
        AND crypt($2, code_hash) = code_hash
      LIMIT 1
    `;
    const r = await pool.query(q, [shopId, code]);
    if (r.rowCount === 0) return res.status(401).send("Hibás vagy inaktív belépőkód");

    const row = r.rows[0];

    await pool.query("UPDATE login_codes SET used_at = now(), used_by = $1 WHERE id = $2", ["SHOP", row.id]);
    await pool.query("INSERT INTO login_events (code_id, event_type, actor) VALUES ($1,'used',$2)", [row.id, "SHOP"]);

    const sid = newId("s");
    const actor = row.name ? row.name : "SHOP USER";
    const session = { role: "shop", shopId, actor };
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

// --- admin: shops ---
app.get("/api/admin/shops", requireAdmin, async (req, res) => {
  await ensureShops();
  const r = await pool.query("SELECT id, name FROM shops ORDER BY name ASC");
  res.json({ items: r.rows });
});

app.post("/api/admin/shops", requireAdmin, async (req, res) => {
  await ensureShops();
  const body = req.body || {};
  const id = String(body.id || "").trim();
  const name = String(body.name || "").trim();
  if (!id) return res.status(400).json({ error: "id required" });
  if (!name) return res.status(400).json({ error: "name required" });

  await pool.query("INSERT INTO shops (id, name) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name", [
    id,
    name
  ]);
  res.json({ ok: true });
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

// --- admin: R2 presign + set login logo ---
app.get("/api/admin/r2/presign", requireAdmin, async (req, res) => {
  if (!r2Enabled || !r2) return res.status(400).json({ error: "R2 nincs beállítva" });
  if (!R2_PUBLIC_BASE_URL) return res.status(400).json({ error: "R2_PUBLIC_BASE_URL hiányzik" });

  const key = String(req.query.key || "").trim();
  const contentType = String(req.query.contentType || "application/octet-stream").trim();

  if (!key) return res.status(400).json({ error: "key required" });
  if (!key.startsWith("branding/")) return res.status(400).json({ error: "Csak branding/ alá engedélyezett" });

  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType
  });

  const uploadUrl = await getSignedUrl(r2, cmd, { expiresIn: 60 * 5 });
  const publicUrl = `${R2_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${key}`;
  return res.json({ uploadUrl, publicUrl, key });
});

app.post("/api/admin/branding/logo", requireAdmin, async (req, res) => {
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
  if (!(await shopExists(String(shopId)))) return res.status(400).send("Ismeretlen helység");

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
    const token = process.env.R2_API_TOKEN || "";
    const endpoint = (process.env.R2_ENDPOINT || "").replace(/\/+$/, "");
    const bucket = process.env.R2_BUCKET || "";
    const accountId =
      process.env.R2_ACCOUNT_ID ||
      (() => {
        try {
          // endpoint: https://<accountid>.r2.cloudflarestorage.com
          return new URL(endpoint).hostname.split(".")[0];
        } catch {
          return "";
        }
      })();

    if (!token || !bucket || !accountId) {
      return res.status(400).json({ error: "R2 nincs beállítva" });
    }
    if (!req.file) return res.status(400).json({ error: "file required" });

    const folder = String(req.body?.folder || "uploads").replace(/^\/+/, "").replace(/\/+$/, "");
    const nameRaw = String(req.body?.name || req.file?.originalname || "file.bin");
    const safeName = nameRaw.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const key = `${folder}/${crypto.randomUUID()}_${safeName}`;

    // Cloudflare R2 REST API (uses API token, no SigV4):
    // PUT https://api.cloudflare.com/client/v4/accounts/:accountId/r2/buckets/:bucket/objects/:object
    const obj = encodeURIComponent(key);
    const putUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects/${obj}`;

    const r = await fetch(putUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": req.file.mimetype || "application/octet-stream",
      },
      body: req.file.buffer,
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error("R2 API PUT failed:", r.status, t);
      return res.status(500).json({ error: "Upload failed" });
    }

    const basePub = (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
    const url = basePub ? `${basePub}/${key}` : key;

    return res.json({ key, url });
  } catch (err) {
    console.error("R2 upload error:", err);
    return res.status(500).json({ error: "Upload failed" });
  }
});

// --- health ---
app.get("/api/health", async (req, res) => {
  const r = await pool.query("select 1");
  res.json({ ok: true, db: r.rowCount === 1 });
});

// --- static frontend ---
app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).send("Not found");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
