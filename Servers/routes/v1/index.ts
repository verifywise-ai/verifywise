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
import shadowAiSyslogRoutes from "./shadowAiSyslog.route";
import evidenceHubChangeHistoryRoutes from "./evidenceHubChangeHistory.route";
import modelLifecycleChangeHistoryRoutes from "./modelLifecycleChangeHistory.route";
import controlEUChangeHistoryRoutes from "./controlEUChangeHistory.route";
import subcontrolEUChangeHistoryRoutes from "./subcontrolEUChangeHistory.route";
import annexCategoryChangeHistoryRoutes from "./annexCategoryChangeHistory.route";
import intakeFormReviewTimeRoutes from "./intakeFormReviewTime.route";
import intakeTierSuggestionRoutes from "./intakeTierSuggestion.route";
import useCaseOrgSettingsRoutes from "./useCaseOrgSettings.route";
import useCaseLifecycleRoutes from "./useCaseLifecycle.route";
import lifecycleSettingsRoutes from "./lifecycleSettings.route";
import aiAppsRoutes from "./aiApps.route";
import aiAppLifecycleRoutes from "./aiAppLifecycle.route";
import projectsRoutes from "./projects.route";
import dashboardPreferencesRoutes from "./dashboardPreferences.route";
import trainingRoutes from "./training.route";
import groupsRoutes from "./groups.route";
import policyTemplatesRoutes from "./policyTemplates.route";
import frameworkImportRoutes from "./frameworkImport.route";
import importedFrameworkAssessmentRoutes from "./importedFrameworkAssessment.route";
import intakeSubmissionsRoutes from "./intakeSubmissions.route";
import aiDetectionSuggestedRisksRoutes from "./aiDetectionSuggestedRisks.route";

const router = express.Router();

// Machine-ingestion surface: X-API-Key auth handled inside the controller,
// not JWT. See controllers/shadowAiIngestion.ctrl.ts.
router.use("/shadow-ai", shadowAiIngestionRoutes);

// Shadow AI syslog listener status and source key regeneration (JWT, Admin).
router.use("/shadow-ai-syslog", shadowAiSyslogRoutes);

// Change history read paths added with #4977. Older entity types keep their
// legacy /api/<entity>-change-history mounts.
router.use("/evidence-hub-change-history", evidenceHubChangeHistoryRoutes);
router.use("/model-lifecycle-change-history", modelLifecycleChangeHistoryRoutes);
router.use("/control-eu-change-history", controlEUChangeHistoryRoutes);
router.use("/subcontrol-eu-change-history", subcontrolEUChangeHistoryRoutes);
router.use("/annex-category-change-history", annexCategoryChangeHistoryRoutes);

// An intake form's agreed review time (#5189); the legacy /api/intake form
// contracts are frozen, so it is its own resource.
router.use("/intake-form-review-time", intakeFormReviewTimeRoutes);

// Risk tier suggested to an intake applicant, and their response (#5190).
router.use("/intake-tier-suggestion", intakeTierSuggestionRoutes);

// Defaults a new use case starts with (#5192).
router.use("/use-case-org-settings", useCaseOrgSettingsRoutes);

// Use case lifecycle and the org-wide "still live?" interval (#5187).
router.use("/use-case-lifecycle", useCaseLifecycleRoutes);
router.use("/lifecycle-settings", lifecycleSettingsRoutes);

// AI apps with their lifecycle (#5193).
router.use("/ai-apps", aiAppsRoutes);
router.use("/ai-app-lifecycle", aiAppLifecycleRoutes);

// Use case create and update with external owners (#5256).
router.use("/projects", projectsRoutes);

// Per-user dashboard layout (#5257).
router.use("/dashboard", dashboardPreferencesRoutes);

// Training assignments (#5260); the legacy /api/training contracts are frozen.
router.use("/training", trainingRoutes);
// Groups / teams with RBAC and group-level use-case access (#5253).
router.use("/groups", groupsRoutes);

// Organisation-owned policy templates (#5261).
router.use("/policy-templates", policyTemplatesRoutes);

// Framework import extension (#5254): spreadsheet imports of org-owned
// frameworks. Gated per org with requireExtensionEnabled inside the router.
router.use("/framework-import", frameworkImportRoutes);
// Imported frameworks attached to use cases and assessed there (#5254).
router.use("/imported-framework-assessments", importedFrameworkAssessmentRoutes);
// Intake submission preview and approval with custom field values (#5262).
router.use("/intake-submissions", intakeSubmissionsRoutes);

// What was done with an AI Detection scan's suggested risks; the legacy
// /api/ai-detection router is frozen.
router.use("/ai-detection", aiDetectionSuggestedRisksRoutes);

export default router;
