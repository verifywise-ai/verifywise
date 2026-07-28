import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import { listRuns, getRun, downloadRun, getRunAnalyses, archiveRun, restoreRun, deleteRun } from "../controllers/reportRun.ctrl";

const router = express.Router();

router.get("/", authenticateJWT, listRuns);
router.get("/:id", authenticateJWT, getRun);
router.get("/:id/download", authenticateJWT, downloadRun);
router.get("/:id/analyses", authenticateJWT, getRunAnalyses);
router.patch("/:id/archive", authenticateJWT, authorize(["Admin", "Editor"]), archiveRun);
router.patch("/:id/restore", authenticateJWT, authorize(["Admin", "Editor"]), restoreRun);
router.delete("/:id", authenticateJWT, authorize(["Admin", "Editor"]), deleteRun);

export default router;
