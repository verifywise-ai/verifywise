import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import { deleteCalculation } from "../../controllers/readiness.ctrl";

// Delete one readiness calculation. The person who ran it may delete it; a
// role holding readiness.admin may also delete other people's public ones.
// The rule depends on the row, so the controller checks it.
router.delete("/scores/:id", authenticateJWT, deleteCalculation);

export default router;
