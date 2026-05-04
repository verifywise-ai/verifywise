/**
 * @fileoverview Entity Graph Routes
 *
 * Defines all API endpoints for the Entity Graph system.
 * Includes routes for annotations, saved views, and gap rules.
 * All routes require JWT authentication.
 *
 * Routes:
 *
 * Annotations:
 * - POST /api/entity-graph/annotations - Create/update annotation
 * - GET /api/entity-graph/annotations - Fetch all user annotations
 * - GET /api/entity-graph/annotations/:entityType/:entityId - Fetch annotation for entity
 * - DELETE /api/entity-graph/annotations/:id - Delete annotation by ID
 * - DELETE /api/entity-graph/annotations/entity/:entityType/:entityId - Delete by entity
 *
 * Views:
 * - POST /api/entity-graph/views - Create new view
 * - GET /api/entity-graph/views - Fetch all user views
 * - GET /api/entity-graph/views/:id - Fetch view by ID
 * - PUT /api/entity-graph/views/:id - Update view
 * - DELETE /api/entity-graph/views/:id - Delete view
 *
 * Gap Rules:
 * - POST /api/entity-graph/gap-rules - Save gap rules
 * - GET /api/entity-graph/gap-rules - Fetch user's gap rules
 * - DELETE /api/entity-graph/gap-rules - Reset to defaults
 * - GET /api/entity-graph/gap-rules/defaults - Get default rules
 *
 * @module routes/entityGraph
 */

import express from "express";
const router = express.Router();

import {
  saveAnnotation,
  getAnnotations,
  getAnnotationByEntity,
  deleteAnnotation,
  deleteAnnotationByEntity,
} from "../controllers/entityGraphAnnotations.ctrl";

import {
  createView,
  getViews,
  getViewById,
  updateView,
  deleteView,
} from "../controllers/entityGraphViews.ctrl";

import {
  saveGapRules,
  getGapRules,
  resetGapRules,
  getDefaultGapRules,
} from "../controllers/entityGraphGapRules.ctrl";

import authenticateJWT from "../middleware/auth.middleware";

// ============================================
// Annotations Routes
// ============================================

// POST: Create/update annotation
router.post("/annotations", authenticateJWT, saveAnnotation);

// GET: Fetch all user annotations
router.get("/annotations", authenticateJWT, getAnnotations);

// GET: Fetch annotation for specific entity
router.get("/annotations/:entityType/:entityId", authenticateJWT, getAnnotationByEntity);

// DELETE: Delete annotation by ID
router.delete("/annotations/:id", authenticateJWT, deleteAnnotation);

// DELETE: Delete annotation by entity
router.delete(
  "/annotations/entity/:entityType/:entityId",
  authenticateJWT,
  deleteAnnotationByEntity,
);

// ============================================
// Views Routes
// ============================================

// POST: Create new view
router.post("/views", authenticateJWT, createView);

// GET: Fetch all user views
router.get("/views", authenticateJWT, getViews);

// GET: Fetch view by ID
router.get("/views/:id", authenticateJWT, getViewById);

// PUT: Update view
router.put("/views/:id", authenticateJWT, updateView);

// DELETE: Delete view
router.delete("/views/:id", authenticateJWT, deleteView);

// ============================================
// Gap Rules Routes
// ============================================

// GET: Get default gap rules (before authenticated routes)
router.get("/gap-rules/defaults", getDefaultGapRules);

// POST: Save gap rules
router.post("/gap-rules", authenticateJWT, saveGapRules);

// GET: Fetch user's gap rules
router.get("/gap-rules", authenticateJWT, getGapRules);

// DELETE: Reset to defaults
router.delete("/gap-rules", authenticateJWT, resetGapRules);

export default router;
