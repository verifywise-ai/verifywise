import express from "express";
import { getUseCaseHistory } from "../controllers/useCaseChangeHistory.ctrl";
import authenticateJWT from "../middleware/auth.middleware";
import { requireProjectAccess } from "../middleware/projectAccess.middleware";

const router = express.Router();

// A use case's history: whoever can see the use case. The rows outlive a
// deleted use case, so then only a role that sees every use case may read them.
router.get(
  "/:useCaseId",
  authenticateJWT,
  requireProjectAccess("useCaseId", "params", "method", "seesAll"),
  getUseCaseHistory,
);

export default router;
