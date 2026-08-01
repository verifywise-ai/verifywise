import { Router } from "express";
import authenticateJWT from "../middleware/auth.middleware";
import {
  getTraces,
  getTraceDetail,
  getCosts,
  getPerformance,
  getMetrics,
} from "../controllers/observability.ctrl";

const router = Router();

// Declared before "/traces/:id" so the literal path is never captured as an id.
router.get("/metrics", authenticateJWT, getMetrics);
router.get("/traces", authenticateJWT, getTraces);
router.get("/traces/:id", authenticateJWT, getTraceDetail);
router.get("/costs", authenticateJWT, getCosts);
router.get("/performance", authenticateJWT, getPerformance);

export default router;
