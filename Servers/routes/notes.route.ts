/**
 * @fileoverview Notes Routes
 *
 * Defines all API endpoints for the notes system.
 * All routes require JWT authentication.
 *
 * Routes:
 * - POST /api/notes - Create new note
 * - GET /api/notes - Fetch notes (filtered by entity)
 * - PUT /api/notes/:id - Update note content
 * - DELETE /api/notes/:id - Delete note
 *
 * @module routes/notes
 */

import express from "express";
const router = express.Router();

import { createNote, getNotes, updateNote, deleteNote } from "../controllers/notes.ctrl";

import authenticateJWT from "../middleware/auth.middleware";

// POST: Create new note
router.post("/", authenticateJWT, createNote);

// GET: Fetch notes for an entity
router.get("/", authenticateJWT, getNotes);

// PUT: Update note content
router.put("/:id", authenticateJWT, updateNote);

// DELETE: Delete note
router.delete("/:id", authenticateJWT, deleteNote);

export default router;
