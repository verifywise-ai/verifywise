import express from "express";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import axios from "axios";
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
router.get("/:key/ui/dist/:filename", async (req, res) => {
  const { key, filename } = req.params;
  const bundlePath = path.join(__dirname, "../../temp/plugins", key, "ui", "dist", filename);
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
      const bundleUrl = `${PLUGIN_MARKETPLACE_BASE_URL}/plugins/${key}/ui/dist/${filename}`;

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

  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(bundlePath);
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
