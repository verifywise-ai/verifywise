import express from "express";
const router = express.Router();

import { getDeadlinesSummary } from "../controllers/deadline.ctrl";

import authenticateJWT from "../middleware/auth.middleware";

// GET requests
router.get("/summary", authenticateJWT, getDeadlinesSummary);

export default router;
