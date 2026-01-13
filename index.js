import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- config (Render env-ben állítsd be!) ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "allinboss-123"; // ideiglenes default
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";

// --- in-memory "DB" (MVP) ---
const shopCodes = new Map(); // code -> { shopId, name, createdAt }
const sessions = new Map();  // sid -> session

app.use(express.json());

// --- helpers ---
function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}
function setCookie(res, sid) {
  // egyszerű, nem paranoid cookie (MVP)
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

// --- auth ---
app.post("/api/auth/login", (req, res) => {
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
    const meta = shopCodes.get(code);
    if (!meta) return res.status(401).send("Hibás belépőkód");
    if (meta.shopId !== shopId) return res.status(401).send("A kód nem ehhez az üzlethez tartozik");
    const sid = newId("s");
    const actor = meta.name ? `${meta.name} (${code})` : `USER (${code})`;
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

// --- admin: create shop codes ---
app.post("/api/admin/codes", requireAdmin, (req, res) => {
  const { shopId, name } = req.body || {};
  if (!shopId) return res.status(400).send("shopId required");
  const code = crypto.randomBytes(4).toString("hex"); // 8 hex char
  shopCodes.set(code, { shopId, name: name || "", createdAt: Date.now() });
  res.send(`Kód: ${code}\nÜzlet: ${shopId}\nNév: ${name || "-"}\n`);
});

// --- health ---
app.get("/api/health", (req, res) => res.json({ ok: true }));

// --- static frontend (Vite build output in /public) ---
app.use(express.static(path.join(__dirname, "public")));

// SPA fallback (ne ütközzön /api-val)
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).send("Not found");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
