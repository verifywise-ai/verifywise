import express from "express";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import axios from "axios";
import sanitize from "sanitize-filename";
import { PLUGIN_MARKETPLACE_BASE_URL } from "../services/plugin/pluginService";
const router = express.Router();

import authenticateJWT from "../middleware/auth.middleware";
import {
  getAllPlugins,
  getPluginByKey,
  searchPlugins,
  installPlugin,
  uninstallPlugin,
  getInstalledPlugins,
  getCategories,
  updatePluginConfiguration,
  testPluginConnection,
  forwardToPlugin,
} from "../controllers/plugin.ctrl";

// Rate limiter for plugin installation (prevent abuse)
const installPluginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 20, // limit each IP to 20 install requests per hour
  message: {
    error: "Too many plugin installation requests from this IP, please try again after an hour.",
  },
});

// Marketplace routes (public plugin listing)
router.get("/marketplace", authenticateJWT, getAllPlugins);
router.get("/marketplace/:key", authenticateJWT, getPluginByKey);
router.get("/marketplace/search", authenticateJWT, searchPlugins);
router.get("/categories", authenticateJWT, getCategories);

// Installation management routes
router.post("/install", authenticateJWT, installPluginLimiter, installPlugin);
router.delete("/installations/:id", authenticateJWT, uninstallPlugin);
router.get("/installations", authenticateJWT, getInstalledPlugins);
router.put("/installations/:id/configuration", authenticateJWT, updatePluginConfiguration);
router.post("/:key/test-connection", authenticateJWT, testPluginConnection);

// Serve plugin UI bundles from temp/plugins/{key}/ui/dist/
// If bundle doesn't exist locally, download it from the marketplace
// Sanitize and validate user-supplied path components. Returning null signals
// an unsafe value; the caller must reject the request before any filesystem
// path is built.
const sanitizePluginKey = (value: string): string | null =>
  /^[a-z0-9_-]+$/.test(value) ? value : null;

const sanitizeBundleFilename = (value: string): string | null => {
  if (
    !/^[A-Za-z0-9._-]+$/.test(value) ||
    value.includes("..") ||
    value.includes("/") ||
    value.includes("\\")
  ) {
    return null;
  }
  const sanitized = sanitize(value);
  return sanitized === value ? value : null;
};

router.get("/:key/ui/dist/:filename", async (req, res) => {
  const { key, filename } = req.params;

  const safeKey = sanitizePluginKey(key);
  const safeFilename = sanitizeBundleFilename(filename);
  if (!safeKey || !safeFilename) {
    res.status(400).json({ error: "Invalid plugin key or bundle filename" });
    return;
  }

  const baseDir = path.resolve(__dirname, "../../temp/plugins");
  const bundlePath = path.resolve(baseDir, safeKey, "ui", "dist", safeFilename);
  const realBaseDir = fs.realpathSync(baseDir);
  if (!bundlePath.startsWith(realBaseDir + path.sep)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  console.log(
    "[Plugin UI] Requested:",
    key,
    filename,
    "Path:",
    bundlePath,
    "Exists:",
    fs.existsSync(bundlePath),
  );

  // If bundle doesn't exist, try to download it
  if (!fs.existsSync(bundlePath)) {
    try {
      console.log(`[Plugin UI] Bundle not found locally, downloading from marketplace...`);
      const bundleUrl = new URL(
        `/plugins/${encodeURIComponent(key)}/ui/dist/${encodeURIComponent(filename)}`,
        PLUGIN_MARKETPLACE_BASE_URL,
      ).toString();

      const response = await axios.get(bundleUrl, {
        timeout: 30000,
        responseType: "arraybuffer",
      });

      // Create directory and save bundle
      const dirPath = path.dirname(bundlePath);
      fs.mkdirSync(dirPath, { recursive: true });
      fs.writeFileSync(bundlePath, Buffer.from(response.data));
      console.log(`[Plugin UI] Bundle downloaded and saved to: ${bundlePath}`);
    } catch (downloadError: any) {
      console.error(`[Plugin UI] Failed to download bundle:`, downloadError.message);
      res.status(404).json({ error: "Plugin UI bundle not found" });
      return;
    }
  }

  // Resolve the final path after optional download and confirm it is still
  // inside the allowed plugin bundle root.
  const realBundlePath = fs.realpathSync(bundlePath);
  if (!realBundlePath.startsWith(realBaseDir + path.sep)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(realBundlePath); // nosemgrep: javascript.express.security.audit.express-res-sendfile.express-res-sendfile — key/filename allowlisted and path canonicalized
});

// ============================================================================
// GENERIC PLUGIN ROUTER - Forward all requests to plugin-defined routes
// ============================================================================
// This catch-all route forwards requests to plugin-defined route handlers.
// Plugins export a `router` object that maps route patterns to handler functions.
//
// Route pattern: /:key/*
// Examples:
//   GET    /api/plugins/mlflow/models              -> plugin's "GET /models" handler
//   POST   /api/plugins/mlflow/sync                -> plugin's "POST /sync" handler
//   GET    /api/plugins/slack/oauth/workspaces     -> plugin's "GET /oauth/workspaces" handler
//   DELETE /api/plugins/slack/oauth/workspaces/123 -> plugin's "DELETE /oauth/workspaces/:id" handler
//   GET    /api/plugins/risk-import/template       -> plugin's "GET /template" handler
//   POST   /api/plugins/risk-import/import         -> plugin's "POST /import" handler
//
// NOTE: This catch-all MUST be last to allow specific routes above to match first.
// Plugins define their own routes - no hardcoded plugin-specific routes needed here!
// ============================================================================
// Use router.use() with a parameter to match everything after :key
router.use("/:key", authenticateJWT, forwardToPlugin);

export default router;
