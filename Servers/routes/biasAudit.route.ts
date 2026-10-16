/**
 * Bias audit (NYC Local Law 144) routes.
 *
 * Read: every built-in role. Draft answers, record runs and generate stances:
 * Admin and Editor. Attest a profile and confirm the derived data basis:
 * Admin only, since both record the customer's own legal position. The
 * platform's Auditor role is unrelated to the § 5-300 independent auditor and
 * confers nothing about independence.
 */
import express from "express";
import path from "path";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import { createMemoryUpload } from "../utils/upload.utils";
import {
  attestProfile,
  confirmDerivedBasis,
  createRun,
  DATASET_MAX_BYTES,
  downloadStance,
  generateStance,
  getProfile,
  getQuestions,
  getRun,
  getRunTrend,
  handleDatasetUploadError,
  listRuns,
  saveProfileAnswers,
} from "../controllers/biasAudit.ctrl";

const router = express.Router();

// One CSV per run, held in memory only long enough to hash and read it.
const datasetUpload = createMemoryUpload({
  fileSize: DATASET_MAX_BYTES,
  files: 1,
  accept: (file) => path.extname(file.originalname).toLowerCase() === ".csv",
});

router.use(authenticateJWT);

router.get("/questions/:frameworkId", authorize("biasAudit.read"), getQuestions);

router.get("/profiles/:projectId/:frameworkId", authorize("biasAudit.read"), getProfile);
router.put("/profiles/:projectId/:frameworkId", authorize("biasAudit.edit"), saveProfileAnswers);
router.post(
  "/profiles/:projectId/:frameworkId/attest",
  authorize("biasAudit.attest"),
  attestProfile,
);

router.post(
  "/runs",
  authorize("biasAudit.edit"),
  datasetUpload.single("file"),
  handleDatasetUploadError,
  createRun,
);
router.get("/runs", authorize("biasAudit.read"), listRuns);
// Declared before /runs/:id so "trend" is not read as an id.
router.get("/runs/trend", authorize("biasAudit.read"), getRunTrend);
router.get("/runs/:id", authorize("biasAudit.read"), getRun);
router.post("/runs/:id/derived-basis/confirm", authorize("biasAudit.attest"), confirmDerivedBasis);
router.post("/runs/:id/stance", authorize("biasAudit.edit"), generateStance);

router.get("/stances/:id/download", authorize("biasAudit.read"), downloadStance);

export default router;
