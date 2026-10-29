/**
 * API v1 route registry.
 *
 * All new endpoints and changed API contracts live under /api/v1 (see
 * docs/technical/adr/0001-api-versioning.md). This router is mounted once at
 * /api/v1 in app.ts; the version prefix is never repeated inside route files.
 *
 * Registration convention (parsed by scripts/generateSwagger.ts — keep the
 * exact two-arg form so the OpenAPI spec stays in sync):
 *
 *   router.use("/<resource>", <router>);
 *
 * Resource prefixes are kebab-case. Route files live next to this file as
 * routes/v1/<resource>.route.ts and use relative paths only.
 */
import express from "express";
import shadowAiIngestionRoutes from "./shadowAiIngestion.route";

const router = express.Router();

// Machine-ingestion surface: X-API-Key auth handled inside the controller,
// not JWT. See controllers/shadowAiIngestion.ctrl.ts.
router.use("/shadow-ai", shadowAiIngestionRoutes);

export default router;
