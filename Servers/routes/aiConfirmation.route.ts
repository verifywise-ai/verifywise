import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import {
  approveConfirmation,
  rejectConfirmation,
  getPendingConfirmations,
} from "../controllers/aiConfirmation.ctrl";

const router = express.Router();

router.post("/approve/:id", authenticateJWT, approveConfirmation);
router.post("/reject/:id", authenticateJWT, rejectConfirmation);
router.get("/pending", authenticateJWT, getPendingConfirmations);

export default router;
