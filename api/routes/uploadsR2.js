import express from "express";
import multer from "multer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const router = express.Router();
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

function requireAdmin(req, res) {
  const got = req.headers["x-admin-secret"];
  const want = process.env.ADMIN_SECRET || "allinboss-123";
  if (!got || String(got) !== String(want)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

router.post("/uploads/r2", upload.single("file"), async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const file = req.file;
    const folder = String(req.body?.folder || "").replace(/^\/+|\/+$/g, "");
    const name = String(req.body?.name || "").replace(/^\/+|\/+$/g, "");

    if (!file) return res.status(400).json({ error: "Missing file" });
    if (!folder || !name) return res.status(400).json({ error: "Missing folder/name" });

    const key = `${folder}/${name}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || "application/octet-stream",
      })
    );

    const base = String(process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/g, "");
    const url = `${base}/${key}`;

    res.json({ url, key });
  } catch (e) {
    console.error("R2 upload failed:", e);
    res.status(500).json({ error: "Upload failed" });
  }
});

export default router;
