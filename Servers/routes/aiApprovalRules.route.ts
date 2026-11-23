import { Router } from "express";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  listRulesCtrl,
  createRuleCtrl,
  updateRuleCtrl,
  deleteRuleCtrl,
  testRuleCtrl,
} from "../controllers/aiApprovalRules.ctrl";

const router = Router();

// Test endpoint must come before :id routes
router.post("/test", authenticateJWT, testRuleCtrl);
router.get("/", authenticateJWT, listRulesCtrl);
// Changing the rules decides which advisor writes run unapproved or are
// refused, so only rule managers (Admins by default) may change them.
router.post("/", authenticateJWT, authorize("aiConfirmation.admin"), createRuleCtrl);
router.put("/:id", authenticateJWT, authorize("aiConfirmation.admin"), updateRuleCtrl);
router.delete("/:id", authenticateJWT, authorize("aiConfirmation.admin"), deleteRuleCtrl);

export default router;
