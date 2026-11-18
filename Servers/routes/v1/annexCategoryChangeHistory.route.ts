import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import { requireUseCaseAccessVia } from "../../middleware/projectAccess.middleware";
import { useCaseOfIso42001AnnexCategory } from "../../utils/useCaseOfChild.utils";
import { getAnnexCategoryChangeHistoryById } from "../../controllers/frameworkControlChangeHistory.ctrl";

// GET change history for an ISO 42001 annex category
// The history of a ISO 42001 annex category is readable by whoever can read its use case. It
// outlives the row, so once the row is gone only a role that sees every use
// case may read it.
router.get(
  "/:id",
  authenticateJWT,
  requireUseCaseAccessVia(useCaseOfIso42001AnnexCategory, { missing: "seesAll" }),
  getAnnexCategoryChangeHistoryById,
);

export default router;
