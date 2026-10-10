import express from "express";
const router = express.Router();

import { listVendorRiskFindings } from "../controllers/vendorResearch.ctrl";

import authenticateJWT from "../middleware/auth.middleware";

// GET requests
// Read-only, so authenticateJWT only: every role may see what research found.
router.get("/", authenticateJWT, listVendorRiskFindings);

export default router;
