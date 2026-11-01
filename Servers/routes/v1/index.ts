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
import evidenceHubChangeHistoryRoutes from "./evidenceHubChangeHistory.route";
import modelLifecycleChangeHistoryRoutes from "./modelLifecycleChangeHistory.route";
import controlEUChangeHistoryRoutes from "./controlEUChangeHistory.route";
import subcontrolEUChangeHistoryRoutes from "./subcontrolEUChangeHistory.route";
import annexCategoryChangeHistoryRoutes from "./annexCategoryChangeHistory.route";
import intakeTierSuggestionRoutes from "./intakeTierSuggestion.route";
import useCaseLifecycleRoutes from "./useCaseLifecycle.route";
import lifecycleSettingsRoutes from "./lifecycleSettings.route";
import aiAppsRoutes from "./aiApps.route";
import aiAppLifecycleRoutes from "./aiAppLifecycle.route";

const router = express.Router();

// Machine-ingestion surface: X-API-Key auth handled inside the controller,
// not JWT. See controllers/shadowAiIngestion.ctrl.ts.
router.use("/shadow-ai", shadowAiIngestionRoutes);

// Change history read paths added with #4977. Older entity types keep their
// legacy /api/<entity>-change-history mounts.
router.use("/evidence-hub-change-history", evidenceHubChangeHistoryRoutes);
router.use("/model-lifecycle-change-history", modelLifecycleChangeHistoryRoutes);
router.use("/control-eu-change-history", controlEUChangeHistoryRoutes);
router.use("/subcontrol-eu-change-history", subcontrolEUChangeHistoryRoutes);
router.use("/annex-category-change-history", annexCategoryChangeHistoryRoutes);

// Risk tier suggested to an intake applicant, and their response (#5190).
router.use("/intake-tier-suggestion", intakeTierSuggestionRoutes);

// Use case lifecycle and the org-wide "still live?" interval (#5187).
router.use("/use-case-lifecycle", useCaseLifecycleRoutes);
router.use("/lifecycle-settings", lifecycleSettingsRoutes);

// AI apps with their lifecycle (#5193).
router.use("/ai-apps", aiAppsRoutes);
router.use("/ai-app-lifecycle", aiAppLifecycleRoutes);

export default router;
