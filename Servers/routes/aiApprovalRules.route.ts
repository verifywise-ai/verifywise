import { Router } from "express";
import authenticateJWT from "../middleware/auth.middleware";
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
router.post("/", authenticateJWT, createRuleCtrl);
router.put("/:id", authenticateJWT, updateRuleCtrl);
router.delete("/:id", authenticateJWT, deleteRuleCtrl);

export default router;
