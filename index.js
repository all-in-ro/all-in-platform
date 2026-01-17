import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import multer from "multer";
import pg from "pg";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import createCarsRouter from "./server/api/routes/cars.js";
import createCarExpensesRouter from "./server/api/routes/car-expenses.js";

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

// --- R2 (S3-compatible) ---
// Required env:
// - R2_ACCOUNT_ID: Cloudflare Account ID (e.g. eaa5...)
// - R2_BUCKET: bucket name (e.g. all-in-assets)
// - R2_ACCESS_KEY_ID: S3 compatible Access Key ID
// - R2_SECRET_ACCESS_KEY: S3 compatible Secret Access Key
// Optional:
// - R2_PUBLIC_BASE_URL: public base URL (e.g. https://pub-....r2.dev)
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_BUCKET = process.env.R2_BUCKET || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL || ""; // e.g. https://pub-....r2.dev

const r2Enabled = Boolean(R2_ACCOUNT_ID && R2_BUCKET && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);

const r2 = r2Enabled
  ? new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

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
  await pool.query(
    "INSERT INTO shops (id, name) VALUES ('raktar','Raktár') ON CONFLICT (id) DO NOTHING"
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

// --- shops (places): list for any logged in user (admin or shop) ---
app.get("/api/shops", requireAuthed, async (req, res) => {
  await ensureShops();
  const r = await pool.query("SELECT id, name FROM shops ORDER BY name ASC");
  res.json({ items: r.rows });
});

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



// =========================
// Incoming v1 (draft -> DB)
// =========================

// NOTE: these endpoints assume the DB tables exist.
// We'll create them with Render Shell SQL when needed.

function normalizeStr(v) {
  return String(v ?? "").trim();
}

function toInt(v) {
  const n = Number.parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : null;
}

app.post("/api/incoming/batches", requireAuthed, async (req, res) => {
  const s = req.session;
  const body = req.body || {};

  const supplier = normalizeStr(body.supplier);
  const sourceType = normalizeStr(body.sourceType || body.source_type || "manual"); // csv | manual
  const locationId = normalizeStr(body.locationId || body.location_id || (s.role === "shop" ? s.shopId : "raktar"));
  const note = normalizeStr(body.note);

  if (!supplier) return res.status(400).json({ error: "supplier required" });
  if (!locationId) return res.status(400).json({ error: "locationId required" });
  if (!["csv", "manual"].includes(sourceType)) return res.status(400).json({ error: "sourceType must be csv|manual" });

  const id = newId("incb");
  const createdBy = s.role === "admin" ? "ADMIN" : "SHOP";
  const actor = s.actor || createdBy;

  await pool.query(
    `INSERT INTO incoming_batches (id, supplier, source_type, location_id, status, note, created_by, actor)
     VALUES ($1,$2,$3,$4,'draft',$5,$6,$7)`,
    [id, supplier, sourceType, locationId, note || null, createdBy, actor]
  );

  res.json({ id });
});

app.get("/api/incoming/batches", requireAuthed, async (req, res) => {
  const from = normalizeStr(req.query.from);
  const to = normalizeStr(req.query.to);
  const locationId = normalizeStr(req.query.locationId || req.query.location_id);

  const where = [];
  const args = [];
  let i = 1;

  if (from) { where.push(`created_at >= $${i++}`); args.push(from); }
  if (to) { where.push(`created_at <= $${i++}`); args.push(to); }
  if (locationId) { where.push(`location_id = $${i++}`); args.push(locationId); }

  // shop users only see their own location by default unless explicitly admin
  if (req.session.role === "shop" && !locationId) {
    where.push(`location_id = $${i++}`);
    args.push(req.session.shopId);
  }

  const q = `
    SELECT b.id, b.created_at, b.supplier, b.source_type, b.location_id, b.status, b.note,
           (SELECT COUNT(*) FROM incoming_items it WHERE it.batch_id = b.id) AS items_count
    FROM incoming_batches b
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY b.created_at DESC
    LIMIT 200
  `;

  const r = await pool.query(q, args);
  res.json({ items: r.rows });
});

app.get("/api/incoming/batches/:id", requireAuthed, async (req, res) => {
  const id = normalizeStr(req.params.id);
  if (!id) return res.status(400).json({ error: "id required" });

  const b = await pool.query(
    `SELECT id, created_at, supplier, source_type, location_id, status, note, created_by, actor
     FROM incoming_batches WHERE id=$1`,
    [id]
  );
  if (!b.rows.length) return res.status(404).json({ error: "not found" });

  // shop users can only read their own location
  if (req.session.role === "shop" && b.rows[0].location_id !== req.session.shopId) {
    return res.status(403).json({ error: "forbidden" });
  }

  const items = await pool.query(
    `SELECT id, batch_id, product_code, product_name, color_code, color_name, size, category, qty, matched_product_id, buy_price, raw
     FROM incoming_items WHERE batch_id=$1 ORDER BY id ASC`,
    [id]
  );

  res.json({ batch: b.rows[0], items: items.rows });
});

// --- incoming: delete batch permanently (history cleanup) ---
// Deletes both header + items.
// Permissions:
// - admin can delete any
// - shop can delete only its own location
app.delete("/api/incoming/batches/:id", requireAuthed, async (req, res) => {
  const id = normalizeStr(req.params.id);
  if (!id) return res.status(400).json({ error: "id required" });

  // read batch + permission check
  const b = await pool.query(`SELECT id, location_id FROM incoming_batches WHERE id=$1`, [id]);
  if (!b.rowCount) return res.status(404).json({ error: "not found" });

  if (req.session.role === "shop" && b.rows[0].location_id !== req.session.shopId) {
    return res.status(403).json({ error: "forbidden" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM incoming_items WHERE batch_id=$1", [id]);
    await client.query("DELETE FROM incoming_batches WHERE id=$1", [id]);
    await client.query("COMMIT");
    return res.json({ ok: true });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("delete incoming batch failed", e);
    return res.status(500).json({ error: "db error" });
  } finally {
    client.release();
  }
});

app.post("/api/incoming/batches/:id/items", requireAuthed, async (req, res) => {
  const batchId = normalizeStr(req.params.id);
  if (!batchId) return res.status(400).json({ error: "batch id required" });

  // verify batch + permissions
  const b = await pool.query(`SELECT id, location_id, status FROM incoming_batches WHERE id=$1`, [batchId]);
  if (!b.rows.length) return res.status(404).json({ error: "batch not found" });
  if (req.session.role === "shop" && b.rows[0].location_id !== req.session.shopId) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (b.rows[0].status !== "draft") {
    return res.status(400).json({ error: "batch is not draft" });
  }

  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return res.status(400).json({ error: "items required" });

  // transactional replace: delete existing, insert new
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM incoming_items WHERE batch_id=$1", [batchId]);

    for (const it of items) {
      const product_code = normalizeStr(it.code || it.product_code);
      const product_name = normalizeStr(it.name || it.product_name);
      const color_code = normalizeStr(it.colorCode || it.color_code);
      const color_name = normalizeStr(it.colorName || it.color_name);
      const size = normalizeStr(it.size);
      const category = normalizeStr(it.category);
      const qty = toInt(it.qty);
      // Optional: item-level buy price (preferred over raw-only)
      const buy_price_raw = it?.buy_price ?? it?.buyPrice ?? null;
      const buy_price = buy_price_raw === null || buy_price_raw === undefined || String(buy_price_raw).trim() === ""
        ? null
        : String(buy_price_raw).trim();

      if (!product_code && !product_name) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "each item needs code or name" });
      }
      if (qty === null || qty <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "each item needs qty > 0" });
      }

      const matched_product_id = it.matchedProductId ? normalizeStr(it.matchedProductId) : null;
      const raw = it && typeof it === "object" ? it : null;

      await client.query(
        `INSERT INTO incoming_items
         (batch_id, product_code, product_name, color_code, color_name, size, category, qty, matched_product_id, buy_price, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [batchId, product_code || null, product_name || null, color_code || null, color_name || null, size || null, category || null, qty, matched_product_id, buy_price, raw]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}

      // Postgres error codes:
      // 23514 = check_violation
      if (e && e.code === "23514") {
        if (e.constraint === "incoming_items_buy_price_non_negative") {
          return res.status(400).json({ error: "buy_price must be >= 0" });
        }
        if (e.constraint === "incoming_items_qty_check") {
          return res.status(400).json({ error: "qty must be > 0" });
        }
        return res.status(400).json({ error: "invalid input" });
      }

      console.error("db error", e);
      return res.status(500).json({ error: "db error" });
    } finally {
    client.release();
  }
});

app.post("/api/incoming/batches/:id/commit", requireAuthed, async (req, res) => {
  const id = normalizeStr(req.params.id);
  if (!id) return res.status(400).json({ error: "id required" });

  const b = await pool.query(`SELECT id, location_id, status FROM incoming_batches WHERE id=$1`, [id]);
  if (!b.rows.length) return res.status(404).json({ error: "not found" });

  if (req.session.role === "shop" && b.rows[0].location_id !== req.session.shopId) {
    return res.status(403).json({ error: "forbidden" });
  }

  // v2: commit = post stock into location_stock + ensure product exists in allin_products
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // lock batch row
    const b2 = await client.query(
      `SELECT id, location_id, status
       FROM incoming_batches
       WHERE id=$1
       FOR UPDATE`,
      [id]
    );
    if (!b2.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "not found" });
    }

    const batch = b2.rows[0];
    if (batch.status !== "draft") {
      await client.query("COMMIT");
      return res.json({ ok: true, already: true });
    }

    const itemsRes = await client.query(
      `SELECT product_code, product_name, color_code, color_name, size, category, qty, buy_price
       FROM incoming_items
       WHERE batch_id=$1`,
      [id]
    );

    // 1) ensure products exist (upsert by product_key)
    for (const it of itemsRes.rows) {
      const code = String(it.product_code || "").trim();
      const name = String(it.product_name || "").trim();
      const size = String(it.size || "").trim();
      const color_code = String(it.color_code || "").trim();
      const color_name = String(it.color_name || "").trim();
      const category = String(it.category || "").trim();

      if (!code || !name || !size) continue;

      const product_key = makeProductKey({ code, colorCode: color_code, size });

      // Keep existing sell_price if already set; update descriptive fields and (optionally) buy_price.
      await client.query(
        `INSERT INTO allin_products (
            product_key, brand, code, name, size,
            color_name, color_code, color_hex,
            gender, category,
            image_url, sell_price, buy_price, incoming_qty,
            is_deleted
         )
         VALUES ($1,'',$2,$3,$4,$5,$6,NULL,NULL,$7,'',NULL,$8,0,false)
         ON CONFLICT (product_key) DO UPDATE
           SET code=EXCLUDED.code,
               name=EXCLUDED.name,
               size=EXCLUDED.size,
               color_name=EXCLUDED.color_name,
               color_code=EXCLUDED.color_code,
               category=EXCLUDED.category,
               buy_price=COALESCE(EXCLUDED.buy_price, allin_products.buy_price),
               is_deleted=false`,
        [product_key, code, name, size, color_name, color_code, category, it.buy_price ?? null]
      );
    }

    // 2) post stock to location_stock (additive)
    for (const it of itemsRes.rows) {
      const code = String(it.product_code || "").trim();
      const size = String(it.size || "").trim();
      const color_code = String(it.color_code || "").trim();
      const qty = Number(it.qty || 0);

      if (!code || !size || !Number.isFinite(qty) || qty <= 0) continue;

      const product_key = makeProductKey({ code, colorCode: color_code, size });

      await client.query(
        `INSERT INTO location_stock (location_id, product_key, qty)
         VALUES ($1,$2,$3)
         ON CONFLICT (location_id, product_key)
         DO UPDATE SET qty = location_stock.qty + EXCLUDED.qty`,
        [batch.location_id, product_key, Math.floor(qty)]
      );
    }

    // 3) mark batch committed
    await client.query(`UPDATE incoming_batches SET status='committed' WHERE id=$1 AND status='draft'`, [id]);

    await client.query("COMMIT");
    return res.json({ ok: true });
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    console.error("commit posting failed", e);
    return res.status(500).json({ error: "commit posting failed" });
  } finally {
    client.release();
  }
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
    if (!r2Enabled || !r2) return res.status(400).json({ error: "R2 nincs beállítva" });

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
    // Upload to Cloudflare R2 via S3-compatible API (AWS4-HMAC-SHA256 signing handled by SDK)
    const cmd = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype || "application/octet-stream",
    });

    await r2.send(cmd);

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


// --- Transfers API (draft + items + commit/cancel) ---
app.post("/api/transfers", requireAuthed, async (req, res) => {
  const s = req.session;
  const body = req.body || {};
  const fromLocationId = String(body.fromLocationId || "").trim();
  const toLocationId = String(body.toLocationId || "").trim();
  const note = body.note != null ? String(body.note) : null;

  if (!fromLocationId || !toLocationId) return res.status(400).json({ error: "Missing from/to location" });
  if (fromLocationId === toLocationId) return res.status(400).json({ error: "From and To cannot be the same" });

  const id = crypto.randomUUID();
  const createdBy = s?.isAdmin ? "ADMIN" : "SHOP";
  const actor = s?.user || s?.shopId || "unknown";

  await pool.query(
    `INSERT INTO transfers (id, created_at, from_location_id, to_location_id, status, note, created_by, actor)
     VALUES ($1, now(), $2, $3, 'draft', $4, $5, $6)`,
    [id, fromLocationId, toLocationId, note, createdBy, actor]
  );

  res.json({ id });
});

app.get("/api/transfers", requireAuthed, async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
  const offset = Math.max(0, Number(req.query.offset || 0));

  const r = await pool.query(
    `SELECT id,
            created_at,
            status,
            from_location_id AS "fromLocationId",
            to_location_id   AS "toLocationId",
            note,
            created_by AS "createdBy",
            actor
     FROM transfers
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  res.json({
    items: r.rows.map((x) => ({ ...x, createdAtISO: x.created_at })),
  });
});

app.get("/api/transfers/:id", requireAuthed, async (req, res) => {
  const id = String(req.params.id || "");
  const h = await pool.query(
    `SELECT id,
            created_at,
            status,
            from_location_id AS "fromLocationId",
            to_location_id   AS "toLocationId",
            note,
            created_by AS "createdBy",
            actor
     FROM transfers
     WHERE id = $1`,
    [id]
  );
  if (!h.rowCount) return res.status(404).json({ error: "Not found" });

  const items = await pool.query(
    `SELECT product_code AS sku,
            product_name AS name,
            color_code   AS "colorCode",
            color_name   AS "colorName",
            size,
            category,
            qty,
            matched_product_id AS "matchedProductId",
            raw
     FROM transfer_items
     WHERE transfer_id = $1
     ORDER BY id ASC`,
    [id]
  );

  const row = h.rows[0];
  res.json({
    id: row.id,
    createdAtISO: row.created_at,
    status: row.status,
    fromLocationId: row.fromLocationId,
    toLocationId: row.toLocationId,
    note: row.note,
    createdBy: row.createdBy,
    actor: row.actor,
    items: items.rows,
  });
});

app.post("/api/transfers/:id/items", requireAuthed, async (req, res) => {
  const id = String(req.params.id || "");
  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];

  const h = await pool.query(`SELECT status FROM transfers WHERE id = $1`, [id]);
  if (!h.rowCount) return res.status(404).json({ error: "Not found" });
  if (h.rows[0].status !== "draft") return res.status(400).json({ error: "Only draft transfers can be edited" });

  await pool.query("DELETE FROM transfer_items WHERE transfer_id = $1", [id]);

  let count = 0;
  for (const it of items) {
    const sku = it.sku != null ? String(it.sku) : null;
    const name = it.name != null ? String(it.name) : null;
    const colorCode = it.colorCode != null ? String(it.colorCode) : null;
    const colorName = it.colorName != null ? String(it.colorName) : null;
    const size = it.size != null ? String(it.size) : null;
    const category = it.category != null ? String(it.category) : null;
    const qty = Number(it.qty || 0);
    if (!qty || qty <= 0) continue;

    await pool.query(
      `INSERT INTO transfer_items
        (transfer_id, product_code, product_name, color_code, color_name, size, category, qty, matched_product_id, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, sku, name, colorCode, colorName, size, category, qty, it.matchedProductId || null, it.raw || null]
    );
    count++;
  }

  res.json({ ok: true, count });
});

app.post("/api/transfers/:id/commit", requireAuthed, async (req, res) => {
  const id = String(req.params.id || "");
  const h = await pool.query(`SELECT status FROM transfers WHERE id = $1`, [id]);
  if (!h.rowCount) return res.status(404).json({ error: "Not found" });
  if (h.rows[0].status !== "draft") return res.status(400).json({ error: "Only draft transfers can be committed" });

  await pool.query(`UPDATE transfers SET status = 'committed' WHERE id = $1`, [id]);
  res.json({ ok: true });
});

app.post("/api/transfers/:id/cancel", requireAuthed, async (req, res) => {
  const id = String(req.params.id || "");
  const h = await pool.query(`SELECT status FROM transfers WHERE id = $1`, [id]);
  if (!h.rowCount) return res.status(404).json({ error: "Not found" });
  if (h.rows[0].status !== "draft") return res.status(400).json({ error: "Only draft transfers can be cancelled" });

  await pool.query(`UPDATE transfers SET status = 'cancelled' WHERE id = $1`, [id]);
  res.json({ ok: true });
});

// --- static frontend ---

// ======================
// ALL IN – Warehouse v1
// Products master + location stock (server as truth)
// ======================

function makeProductKey({ code, colorCode, size }) {
  const c = String(code || "").trim();
  const cc = String(colorCode || "").trim();
  const s = String(size || "").trim();
  return `${c}|${cc}|${s}`;
}

async function ensureAllInTables() {
  // Do NOT auto-create tables here. User runs migrations manually in Render Shell.
  // This function exists only for future; kept intentionally unused.
  return true;
}

app.get("/api/allin/warehouse", requireAuthed, async (req, res) => {
  try {
    const shops = await pool.query("SELECT id, name FROM shops ORDER BY name ASC");
    const products = await pool.query(
      `SELECT product_key, brand, code, name, size,
              color_name, color_code, color_hex,
              gender, category,
              image_url, sell_price, buy_price, incoming_qty
       FROM allin_products
       WHERE is_deleted = false
       ORDER BY name ASC, brand ASC, code ASC, color_code ASC, size ASC`
    );
    const stock = await pool.query(
      `SELECT location_id, product_key, qty
       FROM location_stock`
    );

    const stockMap = new Map(); // key: location_id|product_key -> qty
    for (const r of stock.rows) {
      stockMap.set(`${r.location_id}|${r.product_key}`, Number(r.qty || 0));
    }

    const items = products.rows.map((p) => {
      const byLocation = {};
      for (const sh of shops.rows) {
        byLocation[sh.id] = stockMap.get(`${sh.id}|${p.product_key}`) ?? 0;
      }
      return { ...p, byLocation };
    });

    res.json({ stores: shops.rows, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load warehouse" });
  }
});

app.post("/api/allin/products", requireAuthed, express.json(), async (req, res) => {
  try {
    const body = req.body || {};
    const brand = String(body.brand || "").trim();
    const code = String(body.code || "").trim();
    const name = String(body.name || "").trim();
    const size = String(body.size || "").trim();
    const color_name = String(body.color_name || body.colorName || "").trim();
    const color_code = String(body.color_code || body.colorCode || "").trim();
    const category = String(body.category || "").trim();
    const image_url = String(body.image_url || body.imageUrl || "").trim();
    const gender = String(body.gender || "").trim() || null;
    const color_hex = String(body.color_hex || body.colorHex || "").trim() || null;
    const sell_price = body.sell_price ?? body.sellPrice;
    const buy_price = body.buy_price ?? body.buyPrice;
    const incoming_qty = body.incoming_qty ?? body.incomingQty;

    if (!code || !name || !size) {
      return res.status(400).json({ error: "Missing required fields: code, name, size" });
    }

    const product_key = makeProductKey({ code, colorCode: color_code, size });

    await pool.query(
      `INSERT INTO allin_products (
          product_key, brand, code, name, size,
          color_name, color_code, color_hex,
          gender, category, image_url,
          sell_price, buy_price, incoming_qty
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (product_key) DO UPDATE
         SET brand=EXCLUDED.brand,
             name=EXCLUDED.name,
             color_name=EXCLUDED.color_name,
             color_hex=EXCLUDED.color_hex,
             gender=EXCLUDED.gender,
             category=EXCLUDED.category,
             image_url=EXCLUDED.image_url,
             sell_price=EXCLUDED.sell_price,
             buy_price=EXCLUDED.buy_price,
             incoming_qty=EXCLUDED.incoming_qty,
             is_deleted=false`,
      [product_key, brand, code, name, size, color_name, color_code, color_hex, gender, category, image_url, sell_price, buy_price, incoming_qty]
    );

    res.json({ ok: true, product_key });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create product" });
  }
});

app.patch("/api/allin/products/:product_key", requireAuthed, express.json(), async (req, res) => {
  try {
    const product_key = req.params.product_key;
    const body = req.body || {};

    const fields = {
      brand: body.brand,
      name: body.name,
      category: body.category,
      image_url: body.image_url ?? body.imageUrl,
      color_name: body.color_name ?? body.colorName,
      color_code: body.color_code ?? body.colorCode,
      color_hex: body.color_hex ?? body.colorHex,
      gender: body.gender,
      sell_price: body.sell_price ?? body.sellPrice,
      buy_price: body.buy_price ?? body.buyPrice,
      incoming_qty: body.incoming_qty ?? body.incomingQty
    };

    const sets = [];
    const vals = [];
    let i = 1;
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      sets.push(`${k}=$${i++}`);
      vals.push(String(v).trim());
    }
    if (!sets.length) return res.json({ ok: true });

    vals.push(product_key);
    await pool.query(`UPDATE allin_products SET ${sets.join(", ")} WHERE product_key=$${i}`, vals);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update product" });
  }
});

app.delete("/api/allin/products/:product_key", requireAuthed, async (req, res) => {
  try {
    const product_key = req.params.product_key;
    await pool.query("DELETE FROM allin_products WHERE product_key=$1", [product_key]);
    await pool.query("DELETE FROM location_stock WHERE product_key=$1", [product_key]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

app.post("/api/allin/stock/set", requireAuthed, express.json(), async (req, res) => {
  try {
    const { location_id, product_key, qty, reason } = req.body || {};
    const loc = String(location_id || "").trim();
    const key = String(product_key || "").trim();
    const q = Number(qty);

    if (!loc || !key || !Number.isFinite(q) || q < 0) {
      return res.status(400).json({ error: "Invalid payload (location_id, product_key, qty>=0 required)" });
    }

    await pool.query(
      `INSERT INTO location_stock (location_id, product_key, qty, updated_at)
       VALUES ($1,$2,$3, now())
       ON CONFLICT (location_id, product_key) DO UPDATE
         SET qty=EXCLUDED.qty,
             updated_at=now()`,
      [loc, key, Math.floor(q)]
    );

    // audit move as delta vs previous (optional) – keep simple v1: write absolute set as move delta computed server-side
    const prev = await pool.query(`SELECT qty FROM location_stock WHERE location_id=$1 AND product_key=$2`, [loc, key]);
    // prev already updated; can't compute. Keep minimal: write a move with qty_delta=0 and note in actor string? skip.
    // We'll write a move with qty_delta=0 but include source_id as reason for trace.
    const actor = (req.session?.admin?.email || req.session?.shop?.email || "unknown").toString();
    await pool.query(
      `INSERT INTO stock_moves (source_type, source_id, location_id, product_key, qty_delta, actor)
       VALUES ('manual', $1, $2, $3, 0, $4)`,
      [String(reason || "manual_set"), loc, key, actor]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to set stock" });
  }
});

app.get("/api/allin/stock", requireAuthed, async (req, res) => {
  try {
    const location_id = String(req.query.location_id || "").trim();
    if (!location_id) return res.status(400).json({ error: "location_id required" });
    const r = await pool.query(
      `SELECT product_key, qty FROM location_stock WHERE location_id=$1 ORDER BY product_key ASC`,
      [location_id]
    );
    res.json({ items: r.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load stock" });
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).send("Not found");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
