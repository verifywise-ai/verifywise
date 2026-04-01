/**
 * @fileoverview Notes Controller
 *
 * Handles all HTTP requests related to notes management.
 * Provides endpoints for creating, retrieving, updating, and deleting notes.
 *
 * Endpoints:
 * - POST /api/notes - Create new note
 * - GET /api/notes - Fetch notes (filtered by entity type and ID)
 * - PUT /api/notes/:id - Update note content
 * - DELETE /api/notes/:id - Delete note
 *
 * All endpoints require JWT authentication.
 *
 * @module controllers/notes
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { NotesAttachedToEnum } from "../domain.layer/models/notes/notes.model";
import { NotesService } from "../services/notesService";
import {
  ValidationException,
  BusinessLogicException,
} from "../domain.layer/exceptions/custom.exception";
import { logFailure, logProcessing } from "../utils/logger/logHelper";

/**
 * Create a new note
 *
 * POST /api/notes
 *
 * Request body:
 * {
 *   content: string (required, max 5000 chars)
 *   attached_to: NotesAttachedToEnum (required)
 *   attached_to_id: string (required)
 * }
 *
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<any>} JSON response with created note or error
 */
export async function createNote(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "Starting createNote",
    functionName: "createNote",
    fileName: "notes.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const { content, attached_to, attached_to_id } = req.body;
    const author_id = req.userId!;
    const organization_id = req.organizationId!;

    // Validate required fields
    if (!content || content.trim().length === 0) {
      throw new ValidationException(
        "Note content is required",
        "content",
        content
      );
    }

    if (!attached_to) {
      throw new ValidationException(
        "attached_to is required",
        "attached_to",
        attached_to
      );
    }

    if (!attached_to_id) {
      throw new ValidationException(
        "attached_to_id is required",
        "attached_to_id",
        attached_to_id
      );
    }

    // Use service for business logic (includes sanitization)
    const savedNote = await NotesService.createNote(
      content,
      author_id,
      attached_to as NotesAttachedToEnum,
      attached_to_id,
      organization_id
    );

    return res.status(201).json(STATUS_CODE[201](savedNote.toJSON()));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "Failed to create note",
      functionName: "createNote",
      fileName: "notes.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    let statusCode = 500;
    if (error instanceof ValidationException) {
      statusCode = 400;
    }

    if (statusCode === 400) {
      return res.status(400).json(STATUS_CODE[400]((error as Error).message));
    }
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get notes for a specific entity
 *
 * GET /api/notes?attachedTo={type}&attachedToId={id}
 *
 * Query parameters:
 * - attachedTo: NotesAttachedToEnum (required)
 * - attachedToId: string (required)
 *
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<any>} JSON response with notes array or error
 */
export async function getNotes(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "Starting getNotes",
    functionName: "getNotes",
    fileName: "notes.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const attachedTo = Array.isArray(req.query.attachedTo) ? req.query.attachedTo[0] : req.query.attachedTo;
    const attachedToId = Array.isArray(req.query.attachedToId) ? req.query.attachedToId[0] : req.query.attachedToId;
    const organization_id = req.organizationId!;

    // Validate required query parameters
    if (!attachedTo) {
      throw new ValidationException(
        "attachedTo query parameter is required",
        "attachedTo",
        attachedTo
      );
    }

    if (!attachedToId) {
      throw new ValidationException(
        "attachedToId query parameter is required",
        "attachedToId",
        attachedToId
      );
    }

    // Use service to fetch notes
    const notes = await NotesService.getNotes(
      attachedTo as NotesAttachedToEnum,
      attachedToId as string,
      organization_id,
      req.userId!
    );

    const responseData = notes.map((note) => note.toJSON());
    // Always return 200 with array (even if empty) for consistent frontend handling
    return res.status(200).json(STATUS_CODE[200](responseData));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve notes",
      functionName: "getNotes",
      fileName: "notes.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400]((error as Error).message));
    }
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Update note content
 *
 * PUT /api/notes/:id
 *
 * Request body:
 * {
 *   content: string (required, max 5000 chars)
 * }
 *
 * Note: Only the author or admins can update a note
 *
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<any>} JSON response with updated note or error
 */
export async function updateNote(req: Request, res: Response): Promise<any> {
  const noteId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { content } = req.body;
  const userId = req.userId!;
  const userRole = req.role!;
  const organization_id = req.organizationId!;

  logProcessing({
    description: `Starting updateNote for ID ${noteId}`,
    functionName: "updateNote",
    fileName: "notes.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    // Validate note ID
    if (isNaN(noteId) || noteId < 1) {
      throw new ValidationException(
        "Valid note ID is required",
        "id",
        req.params.id
      );
    }

    // Validate required fields
    if (!content || content.trim().length === 0) {
      throw new ValidationException(
        "Note content is required",
        "content",
        content
      );
    }

    // Use service for business logic (includes permission checks and sanitization)
    const updatedNote = await NotesService.updateNote(
      noteId,
      content,
      userId,
      userRole,
      organization_id
    );

    return res.status(200).json(STATUS_CODE[200](updatedNote.toJSON()));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: `Failed to update note ${noteId}`,
      functionName: "updateNote",
      fileName: "notes.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400]((error as Error).message));
    } else if (error instanceof BusinessLogicException) {
      return res.status(400).json(STATUS_CODE[400]((error as Error).message));
    }
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Delete a note
 *
 * DELETE /api/notes/:id
 *
 * Note: Only the author or admins can delete a note
 *
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<any>} JSON response with success message or error
 */
export async function deleteNote(req: Request, res: Response): Promise<any> {
  const noteId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const userId = req.userId!;
  const userRole = req.role!;
  const organization_id = req.organizationId!;

  logProcessing({
    description: `Starting deleteNote for ID ${noteId}`,
    functionName: "deleteNote",
    fileName: "notes.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    // Validate note ID
    if (isNaN(noteId) || noteId < 1) {
      throw new ValidationException(
        "Valid note ID is required",
        "id",
        req.params.id
      );
    }

    // Use service for business logic (includes permission checks)
    await NotesService.deleteNote(noteId, userId, userRole, organization_id);

    return res.status(200).json(STATUS_CODE[200]("Note deleted successfully"));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete note ${noteId}`,
      functionName: "deleteNote",
      fileName: "notes.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    if (error instanceof BusinessLogicException) {
      return res.status(400).json(STATUS_CODE[400]((error as Error).message));
    }
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
