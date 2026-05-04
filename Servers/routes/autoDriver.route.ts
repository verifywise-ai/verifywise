import express from "express";
const router = express.Router();

import { deleteAutoDriver, postAutoDriver } from "../controllers/autoDriver.ctrl";

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";

router.post("/", authenticateJWT, authorize(["Admin"]), postAutoDriver);
router.delete("/", authenticateJWT, authorize(["Admin"]), deleteAutoDriver);

export default router;
