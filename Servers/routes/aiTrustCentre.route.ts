import express from "express";
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
import { validateVisibility } from "../middleware/validateAITrustCentreVisibility.middleware";

import {
  createAITrustResource,
  createAITrustSubprocessor,
  deleteAITrustResource,
  deleteAITrustSubprocessor,
  deleteCompanyLogo,
  getAITrustCentreOverview,
  getAITrustCentrePublicPage,
  getAITrustCentrePublicResource,
  getAITrustCentreResources,
  getAITrustCentreSubprocessors,
  getCompanyLogo,
  updateAITrustOverview,
  updateAITrustResource,
  updateAITrustSubprocessor,
  uploadCompanyLogo,
} from "../controllers/aiTrustCentre.ctrl";

import authenticateJWT from "../middleware/auth.middleware";
import { validateId } from "../domain.layer/validations/id.valid";
import {
  validateAITrustHashParam,
  validateAITrustHashWithIdParam,
  validateCreateAITrustResource,
  validateCreateAITrustSubprocessor,
  validateUpdateAITrustOverview,
  validateUpdateAITrustResource,
  validateUpdateAITrustSubprocessor,
} from "../middleware/validators/aiTrustCentre.validator";

router.get("/overview", authenticateJWT, getAITrustCentreOverview);
router.get("/resources", authenticateJWT, getAITrustCentreResources);
router.get("/subprocessors", authenticateJWT, getAITrustCentreSubprocessors);
router.get("/:hash", validateAITrustHashParam, validateVisibility, getAITrustCentrePublicPage);
router.get("/:hash/logo", validateAITrustHashParam, validateVisibility, getCompanyLogo);
router.get(
  "/:hash/resources/:id",
  validateAITrustHashWithIdParam,
  validateVisibility,
  getAITrustCentrePublicResource,
);

router.post(
  "/resources",
  authenticateJWT,
  upload.single("file"),
  validateCreateAITrustResource,
  createAITrustResource,
);
router.post(
  "/subprocessors",
  authenticateJWT,
  validateCreateAITrustSubprocessor,
  createAITrustSubprocessor,
);
router.post("/logo", authenticateJWT, upload.single("logo"), uploadCompanyLogo);

router.put("/overview", authenticateJWT, validateUpdateAITrustOverview, updateAITrustOverview);
router.put(
  "/resources/:id",
  authenticateJWT,
  upload.single("file"),
  validateUpdateAITrustResource,
  updateAITrustResource,
);
router.put(
  "/subprocessors/:id",
  authenticateJWT,
  validateUpdateAITrustSubprocessor,
  updateAITrustSubprocessor,
);

router.delete("/logo", authenticateJWT, deleteCompanyLogo);
router.delete("/resources/:id", authenticateJWT, validateId("id"), deleteAITrustResource);
router.delete("/subprocessors/:id", authenticateJWT, validateId("id"), deleteAITrustSubprocessor);

export default router;
