import express from "express";
const router = express.Router();

import {
  getAllBenchmarks,
  getBenchmarkById,
  getBenchmarkFilters,
} from "../controllers/riskBenchmark.ctrl";

import authenticateJWT from "../middleware/auth.middleware";

router.get("/", authenticateJWT, getAllBenchmarks);
router.get("/filters", authenticateJWT, getBenchmarkFilters);
router.get("/:id", authenticateJWT, getBenchmarkById);

export default router;
