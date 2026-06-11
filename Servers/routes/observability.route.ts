import { Router } from "express";
import authenticateJWT from "../middleware/auth.middleware";
import {
  getTraces,
  getTraceDetail,
  getCosts,
  getPerformance,
} from "../controllers/observability.ctrl";

const router = Router();

router.get("/traces", authenticateJWT, getTraces);
router.get("/traces/:id", authenticateJWT, getTraceDetail);
router.get("/costs", authenticateJWT, getCosts);
router.get("/performance", authenticateJWT, getPerformance);

export default router;
