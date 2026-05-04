import express from "express";
const router = express.Router();

import {
  createVendor,
  deleteVendorById,
  getAllVendors,
  getVendorById,
  getVendorByProjectId,
  updateVendorById,
} from "../controllers/vendor.ctrl";

import authenticateJWT from "../middleware/auth.middleware";

// GET requests
router.get("/", authenticateJWT, getAllVendors);
router.get("/project-id/:id", authenticateJWT, getVendorByProjectId);
router.get("/:id", authenticateJWT, getVendorById);

// POST, PUT, DELETE requests
router.post("/", authenticateJWT, createVendor);
router.patch("/:id", authenticateJWT, updateVendorById);
router.delete("/:id", authenticateJWT, deleteVendorById);

export default router;
