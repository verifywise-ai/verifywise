import express from "express";
import { readFileSync } from "fs";
import { join } from "path";

// Read version from the shared root version.json.
// Try multiple paths: repo root (local dev) and app root (Docker container).
const candidates = [
  join(__dirname, "..", "..", "..", "version.json"), // local dev: dist/routes/ → repo root
  join(__dirname, "..", "..", "version.json"),       // Docker: dist/routes/ → /app/version.json
];
let version = "unknown";
for (const p of candidates) {
  try {
    version = JSON.parse(readFileSync(p, "utf-8")).version;
    break;
  } catch { /* try next */ }
}

const router = express.Router();

router.get("/", (_req, res) => {
  res.json({ version });
});

export default router;
