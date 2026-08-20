import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import { requireExtensionEnabled } from "../../middleware/requireExtensionEnabled.middleware";
import { bulkImportRisks, downloadExcelTemplate } from "./riskImport.ctrl";

const router = express.Router();

router.use(authenticateJWT);
router.use(requireExtensionEnabled("risk-import"));

// GET /template — Excel template with dropdown-validated enum columns
router.get("/template", authorize(["Admin", "Editor"]), downloadExcelTemplate);

// POST /import — validate + bulk-insert risks
router.post("/import", authorize(["Admin", "Editor"]), bulkImportRisks);

export default router;
