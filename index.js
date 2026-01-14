import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import pg from "pg";

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

// --- in-memory sessions (ok for MVP) ---
const sessions = new Map();

app.use(express.json());

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
