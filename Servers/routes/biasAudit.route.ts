/**
 * Bias audit (NYC Local Law 144) routes.
 *
 * Read: every built-in role. Draft answers, record runs, generate stances
 * (from a run, or a scope determination from the attested profile), and
 * start, resume or preview corpus generation: Admin and Editor. Attest a profile and confirm the derived data basis:
 * Admin only, since both record the customer's own legal position. The
 * platform's Auditor role is unrelated to the § 5-300 independent auditor and
 * confers nothing about independence.
 */
import express from "express";
import multer from "multer";
import path from "path";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  attestProfile,
  compareCriteria,
  confirmDerivedBasis,
  createCorpus,
  createRun,
  DATASET_MAX_BYTES,
  downloadCorpus,
  downloadStance,
  generateProfileStance,
  generateStance,
  getCorpus,
  getJobDescriptions,
  getProfile,
  getQuestions,
  getRun,
  getRunTrend,
  handleDatasetUploadError,
  listCorpora,
  listRuns,
  resumeCorpus,
  saveProfileAnswers,
} from "../controllers/biasAudit.ctrl";

const router = express.Router();

/**
 * The types browsers and tools actually send for a .csv file. Windows with
 * Excel installed reports application/vnd.ms-excel; some clients send
 * text/plain or a generic binary type. The bytes are only parsed in memory,
 * never stored or served, so the extension plus this list is the whole check.
 */
const CSV_MIME_TYPES = new Set([
  "text/csv",
  "application/csv",
  "text/x-csv",
  "application/x-csv",
  "text/comma-separated-values",
  "application/excel",
  "application/vnd.ms-excel",
  "text/plain",
  "application/octet-stream",
]);

// One CSV per run, held in memory only long enough to hash and read it.
const datasetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DATASET_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const isCsv =
      path.extname(file.originalname).toLowerCase() === ".csv" && CSV_MIME_TYPES.has(file.mimetype);
    if (isCsv) cb(null, true);
    else cb(new Error("UNSUPPORTED_FILE_TYPE"));
  },
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
// A scope determination (out of scope, so no run) is a stance: same permission
// as generating one from a run.
router.post(
  "/profiles/:projectId/:frameworkId/stance",
  authorize("biasAudit.edit"),
  generateProfileStance,
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

// Corpus generation. Every corpus route checks project membership in the
// service, so another organization and a non-member both get 404.
router.get("/job-descriptions", authorize("biasAudit.read"), getJobDescriptions);
// A preview that stores nothing; edit, since it is a step of starting a corpus.
router.post("/criteria-comparison", authorize("biasAudit.edit"), compareCriteria);
router.post("/corpora", authorize("biasAudit.edit"), createCorpus);
// Declared before /corpora/:id.
router.get("/corpora", authorize("biasAudit.read"), listCorpora);
router.get("/corpora/:id", authorize("biasAudit.read"), getCorpus);
router.get("/corpora/:id/download", authorize("biasAudit.read"), downloadCorpus);
router.post("/corpora/:id/resume", authorize("biasAudit.edit"), resumeCorpus);

export default router;
