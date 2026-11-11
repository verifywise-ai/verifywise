import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import { getAiAppIdsV1, getAllAiAppsV1 } from "../../controllers/aiApp.ctrl";
import {
  linkAiAppUseCase,
  listAiAppUseCases,
  unlinkAiAppUseCase,
} from "../../controllers/aiAppProject.ctrl";
import {
  answerAiAppAssessment,
  bulkAssessAiApps,
  cancelAiAppAssessments,
  createAiAppQuestionnaire,
  deleteAiAppQuestionnaire,
  downloadAiAppAssessmentWorksheet,
  downloadAiAppImportTemplate,
  importAiApps,
  listAiAppAssessments,
  listAiAppAssessmentsForApp,
  listAiAppQuestionnaires,
  submitAiAppAssessmentAnswers,
  updateAiAppQuestionnaire,
} from "../../controllers/aiAppBulk.ctrl";

// GET /api/v1/ai-apps (#5193): the legacy list plus lifecycle columns and an
// optional ?lifecycle_stage= filter. The legacy /api/ai-apps is unchanged.
router.get("/", authenticateJWT, getAllAiAppsV1);

// Bulk import and bulk assessment (#5258). Static paths come before /:id routes.
router.get("/ids", authenticateJWT, getAiAppIdsV1);
router.get(
  "/import/template",
  authenticateJWT,
  authorize("aiApp.edit"),
  downloadAiAppImportTemplate,
);
router.post("/import", authenticateJWT, authorize("aiApp.edit"), importAiApps);

router.get("/questionnaires", authenticateJWT, listAiAppQuestionnaires);
router.post("/questionnaires", authenticateJWT, authorize("aiApp.edit"), createAiAppQuestionnaire);
router.patch(
  "/questionnaires/:id",
  authenticateJWT,
  authorize("aiApp.edit"),
  updateAiAppQuestionnaire,
);
router.delete(
  "/questionnaires/:id",
  authenticateJWT,
  authorize("aiApp.admin"),
  deleteAiAppQuestionnaire,
);

router.post("/bulk-assess", authenticateJWT, authorize("aiApp.edit"), bulkAssessAiApps);
router.get("/assessments", authenticateJWT, listAiAppAssessments);
// Answering is open to the app's owner as well as editors, so the check is in
// the service, per app, rather than on the route.
router.get("/assessments/worksheet", authenticateJWT, downloadAiAppAssessmentWorksheet);
router.post("/assessments/answers", authenticateJWT, submitAiAppAssessmentAnswers);
router.post(
  "/assessments/cancel",
  authenticateJWT,
  authorize("aiApp.edit"),
  cancelAiAppAssessments,
);
router.put("/assessments/:assessmentId/answers", authenticateJWT, answerAiAppAssessment);

router.get("/:id/assessments", authenticateJWT, listAiAppAssessmentsForApp);

// The use cases an AI app serves (#5259).
router.get("/:id/use-cases", authenticateJWT, listAiAppUseCases);
router.post("/:id/use-cases", authenticateJWT, authorize("aiApp.edit"), linkAiAppUseCase);
router.delete(
  "/:id/use-cases/:projectId",
  authenticateJWT,
  authorize("aiApp.edit"),
  unlinkAiAppUseCase,
);

export default router;
