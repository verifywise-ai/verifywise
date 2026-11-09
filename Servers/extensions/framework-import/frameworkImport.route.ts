import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import { requireExtensionEnabled } from "../../middleware/requireExtensionEnabled.middleware";
import {
  bulkImportFrameworks,
  deleteImportedFramework,
  downloadExcelTemplate,
  listImportedFrameworks,
  updateImportedFramework,
} from "./frameworkImport.ctrl";

const router = express.Router();

router.use(authenticateJWT);
router.use(requireExtensionEnabled("framework-import"));

// GET /template — Excel template describing framework + topics + subtopics
router.get("/template", authorize("ext.frameworkImport.edit"), downloadExcelTemplate);

// POST /import — validate + upsert an imported framework's structure
router.post("/import", authorize("ext.frameworkImport.edit"), bulkImportFrameworks);

// Imported framework management. Reads are open to any authenticated user;
// writes require the extension edit permission.
router.get("/imported", listImportedFrameworks);
router.patch("/imported/:id", authorize("ext.frameworkImport.edit"), updateImportedFramework);
router.delete("/imported/:id", authorize("ext.frameworkImport.edit"), deleteImportedFramework);

export default router;
