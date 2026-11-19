import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import { requireUseCaseAccessVia } from "../../middleware/projectAccess.middleware";
import { useCaseOfEuSubcontrol } from "../../utils/useCaseOfChild.utils";
import { getSubcontrolEUChangeHistoryById } from "../../controllers/frameworkControlChangeHistory.ctrl";

// GET change history for an EU AI Act subcontrol
// The history of an EU AI Act subcontrol is readable by whoever can read its use case. It
// outlives the row, so once the row is gone only a role that sees every use
// case may read it.
router.get(
  "/:id",
  authenticateJWT,
  requireUseCaseAccessVia(useCaseOfEuSubcontrol, { missing: "seesAll" }),
  getSubcontrolEUChangeHistoryById,
);

export default router;
