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

router.get("/overview", authenticateJWT, getAITrustCentreOverview);
router.get("/resources", authenticateJWT, getAITrustCentreResources);
router.get("/subprocessors", authenticateJWT, getAITrustCentreSubprocessors);
router.get("/:hash", validateVisibility, getAITrustCentrePublicPage);
router.get("/:hash/logo", validateVisibility, getCompanyLogo);
router.get("/:hash/resources/:id", validateVisibility, getAITrustCentrePublicResource);

router.post("/resources", authenticateJWT, upload.single("file"), createAITrustResource);
router.post("/subprocessors", authenticateJWT, createAITrustSubprocessor);
router.post("/logo", authenticateJWT, upload.single("logo"), uploadCompanyLogo);

router.put("/overview", authenticateJWT, updateAITrustOverview);
router.put(
  "/resources/:id",
  authenticateJWT,
  validateId("id"),
  upload.single("file"),
  updateAITrustResource,
);
router.put("/subprocessors/:id", authenticateJWT, validateId("id"), updateAITrustSubprocessor);

router.delete("/logo", authenticateJWT, deleteCompanyLogo);
router.delete("/resources/:id", authenticateJWT, validateId("id"), deleteAITrustResource);
router.delete("/subprocessors/:id", authenticateJWT, validateId("id"), deleteAITrustSubprocessor);

export default router;
