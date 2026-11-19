import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import { requireExtensionEnabled } from "../../middleware/requireExtensionEnabled.middleware";
import { bulkImportRisksStrict } from "../../extensions/risk-import/riskImport.ctrl";

/**
 * Risk import extension, served at /api/v1/risk-import. The strict rules
 * (required lifecycle phase, likelihood and severity, duplicate names
 * rejected, unknown categories rejected, the sheet's row numbers) are a
 * contract change, so they live here; the legacy
 * POST /api/extensions/risk-import/import keeps its old accept rules and the
 * template stays on /api/extensions/risk-import/template. Same gate chain as
 * the legacy router: token, extension enabled for the organization, edit
 * permission. The 10mb JSON body limit is applied globally in app.ts.
 */
const router = express.Router();

router.use(authenticateJWT);
router.use(requireExtensionEnabled("risk-import"));

// POST /import — validate (strict) + bulk-insert risks
router.post("/import", authorize("ext.riskImport.edit"), bulkImportRisksStrict);

export default router;
