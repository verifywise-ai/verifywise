import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import { listRuns, getRun, downloadRun } from "../controllers/reportRun.ctrl";

const router = express.Router();

router.get("/", authenticateJWT, listRuns);
router.get("/:id", authenticateJWT, getRun);
router.get("/:id/download", authenticateJWT, downloadRun);

export default router;
