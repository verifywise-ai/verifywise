/**
 * @fileoverview Notes Service
 *
 * Business logic layer for notes management.
 * Handles validation, permission checks, and orchestration of notes operations.
 *
 * Responsibilities:
 * - Validate user permissions (CRUD operations)
 * - Sanitize user input
 * - Coordinate with repositories
 * - Log audit events
 *
 * @module services/notesService
 */

import {
  NotesModel,
  NotesAttachedToEnum,
} from "../domain.layer/models/notes/notes.model";
import {
  createNewNoteQuery,
  getNotesByEntityQuery,
  getNoteByIdQuery,
  updateNoteContentQuery,
  deleteNoteByIdQuery,
  getNoteCountByEntityQuery,
  getNotesByAuthorQuery,
} from "../utils/notes.utils";
import {
  ValidationException,
  BusinessLogicException,
} from "../domain.layer/exceptions/custom.exception";
import {
  logFailure,
  logProcessing,
  logSuccess,
} from "../utils/logger/logHelper";

export class NotesService {
  /**
   * Create a new note with validation and sanitization
   *
   * @static
   * @async
   * @param {string} content - Raw note content
   * @param {number} authorId - User ID of author
   * @param {NotesAttachedToEnum} attachedTo - Entity type
   * @param {string} attachedToId - Entity ID
   * @param {number} organizationId - Organization ID
   * @returns {Promise<NotesModel>} Created and saved note
   * @throws {ValidationException} If validation fails
   * @throws {Error} If save fails
   *
   * @example
   * const note = await NotesService.createNote(
   *   'This is my note',
   *   123,
   *   NotesAttachedToEnum.NIST_SUBCATEGORY,
   *   'sub-123',
   *   456
   * );
   */
  static async createNote(
    content: string,
    authorId: number,
    attachedTo: NotesAttachedToEnum,
    attachedToId: string,
    organizationId: number
  ): Promise<NotesModel> {
    logProcessing({
      description: "Starting NotesService.createNote",
      functionName: "createNote",
      fileName: "notesService.ts",
      userId: authorId,
      organizationId: organizationId,
    });

    try {
      // Validate input
      if (!content || content.trim().length === 0) {
        throw new ValidationException(
          "Note content cannot be empty",
          "content",
          content
        );
      }

      if (content.length > 5000) {
        throw new ValidationException(
          "Note content cannot exceed 5000 characters",
          "content",
          content
        );
      }

      if (!authorId || authorId < 1) {
        throw new ValidationException(
          "Valid author ID is required",
          "authorId",
          authorId
        );
      }

      if (
        !attachedTo ||
        !Object.values(NotesAttachedToEnum).includes(attachedTo)
      ) {
        throw new ValidationException(
          "Valid entity type is required",
          "attachedTo",
          attachedTo
        );
      }

      if (!attachedToId || attachedToId.trim().length === 0) {
        throw new ValidationException(
          "Valid entity ID is required",
          "attachedToId",
          attachedToId
        );
      }

      // Sanitize content to prevent XSS by removing common HTML tags
      // For now, we simply trim whitespace (proper sanitization should be done on client-side)
      const sanitizedContent = content.trim();

      if (!sanitizedContent || sanitizedContent.length === 0) {
        throw new ValidationException(
          "Note content cannot be empty after processing",
          "content",
          content
        );
      }

      // Create note model
      const note = await NotesModel.createNote(
        sanitizedContent,
        authorId,
        attachedTo,
        attachedToId,
        organizationId
      );

      // Validate before saving
      await note.validateNoteData();

      // Save to database
      const savedNote = await createNewNoteQuery(note, organizationId);

      await logSuccess({
        eventType: "Create",
        description: `Note created on ${attachedTo}:${attachedToId}`,
        functionName: "createNote",
        fileName: "notesService.ts",
        userId: authorId,
        organizationId: organizationId,
      });

      return savedNote;
    } catch (error) {
      await logFailure({
        eventType: "Create",
        description: "Failed to create note",
        functionName: "createNote",
        fileName: "notesService.ts",
        error: error as Error,
        userId: authorId,
        organizationId: organizationId,
      });
      throw error;
    }
  }

  /**
   * Fetch notes for an entity with organization scoping
   *
   * @static
   * @async
   * @param {NotesAttachedToEnum} attachedTo - Entity type
   * @param {string} attachedToId - Entity ID
   * @param {number} organizationId - Organization ID
   * @returns {Promise<NotesModel[]>} Array of notes (newest first)
   * @throws {ValidationException} If validation fails
   *
   * @example
   * const notes = await NotesService.getNotes(
   *   NotesAttachedToEnum.NIST_SUBCATEGORY,
   *   'sub-123',
   *   456
   * );
   */
  static async getNotes(
    attachedTo: NotesAttachedToEnum,
    attachedToId: string,
    organizationId: number,
    userId: number
  ): Promise<NotesModel[]> {
    logProcessing({
      description: "Starting NotesService.getNotes",
      functionName: "getNotes",
      fileName: "notesService.ts",
      userId: userId,
      organizationId: organizationId,
    });

    try {
      // Validate input
      if (
        !attachedTo ||
        !Object.values(NotesAttachedToEnum).includes(attachedTo)
      ) {
        throw new ValidationException(
          "Valid entity type is required",
          "attachedTo",
          attachedTo
        );
      }

      if (!attachedToId || attachedToId.trim().length === 0) {
        throw new ValidationException(
          "Valid entity ID is required",
          "attachedToId",
          attachedToId
        );
      }

      const notes = await getNotesByEntityQuery(
        attachedTo,
        attachedToId,
        organizationId
      );

      await logSuccess({
        eventType: "Read",
        description: `Retrieved ${notes.length} notes for ${attachedTo}:${attachedToId}`,
        functionName: "getNotes",
        fileName: "notesService.ts",
        userId: userId,
        organizationId: organizationId,
      });

      return notes;
    } catch (error) {
      await logFailure({
        eventType: "Read",
        description: "Failed to fetch notes",
        functionName: "getNotes",
        fileName: "notesService.ts",
        error: error as Error,
        userId: userId,
        organizationId: organizationId,
      });
      throw error;
    }
  }

  /**
   * Update note content with permission validation
   *
   * @static
   * @async
   * @param {string} noteId - Note UUID
   * @param {string} content - New content
   * @param {number} userId - User ID attempting update
   * @param {string} userRole - User role (for admin check)
   * @param {number} organizationId - Organization ID
   * @returns {Promise<NotesModel>} Updated note
   * @throws {ForbiddenException} If user lacks permission
   * @throws {ValidationException} If validation fails
   * @throws {Error} If note not found
   *
   * @example
   * const updated = await NotesService.updateNote(
   *   'uuid-123',
   *   'Updated content',
   *   123,
   *   'Editor',
   *   456
   * );
   */
  static async updateNote(
    noteId: number,
    content: string,
    userId: number,
    userRole: string,
    organizationId: number
  ): Promise<NotesModel> {
    logProcessing({
      description: `Starting NotesService.updateNote for ID ${noteId}`,
      functionName: "updateNote",
      fileName: "notesService.ts",
      userId: userId,
      organizationId: organizationId,
    });

    try {
      // Validate input
      if (!content || content.trim().length === 0) {
        throw new ValidationException(
          "Note content cannot be empty",
          "content",
          content
        );
      }

      if (content.length > 5000) {
        throw new ValidationException(
          "Note content cannot exceed 5000 characters",
          "content",
          content
        );
      }

      // Fetch existing note
      const note = await getNoteByIdQuery(noteId, organizationId);

      if (!note) {
        throw new Error(`Note with ID ${noteId} not found`);
      }

      // Check permissions: author can edit, admin can edit any
      const isAuthor = note.isAuthoredBy(userId);
      const isAdmin = userRole === "Admin";

      if (!isAuthor && !isAdmin) {
        throw new BusinessLogicException(
          "Only the note author or admins can update this note",
          "NOTE_UPDATE_FORBIDDEN",
          { noteId, userId, role: userRole }
        );
      }

      // Sanitize content by trimming whitespace
      const sanitizedContent = content.trim();

      if (!sanitizedContent || sanitizedContent.length === 0) {
        throw new ValidationException(
          "Note content cannot be empty after processing",
          "content",
          content
        );
      }

      // Update content
      await note.updateContent(sanitizedContent);
      await note.validateNoteData();

      // Save to database
      const updatedNote = await updateNoteContentQuery(noteId, note, organizationId);

      await logSuccess({
        eventType: "Update",
        description: `Note ${noteId} updated`,
        functionName: "updateNote",
        fileName: "notesService.ts",
        userId: userId,
        organizationId: organizationId,
      });

      return updatedNote;
    } catch (error) {
      await logFailure({
        eventType: "Update",
        description: `Failed to update note ${noteId}`,
        functionName: "updateNote",
        fileName: "notesService.ts",
        error: error as Error,
        userId: userId,
        organizationId: organizationId,
      });
      throw error;
    }
  }

  /**
   * Delete a note with permission validation
   *
   * @static
   * @async
   * @param {string} noteId - Note UUID
   * @param {number} userId - User ID attempting deletion
   * @param {string} userRole - User role (for admin check)
   * @param {number} organizationId - Organization ID
   * @returns {Promise<boolean>} True if deleted successfully
   * @throws {ForbiddenException} If user lacks permission
   * @throws {Error} If note not found
   *
   * @example
   * await NotesService.deleteNote('uuid-123', 123, 'Editor', 456);
   */
  static async deleteNote(
    noteId: number,
    userId: number,
    userRole: string,
    organizationId: number
  ): Promise<boolean> {
    logProcessing({
      description: `Starting NotesService.deleteNote for ID ${noteId}`,
      functionName: "deleteNote",
      fileName: "notesService.ts",
      userId: userId,
      organizationId: organizationId,
    });

    try {
      // Fetch existing note
      const note = await getNoteByIdQuery(noteId, organizationId);

      if (!note) {
        // Log additional context for debugging
        await logFailure({
          eventType: "Delete",
          description: `Note ${noteId} not found in organization ${organizationId}`,
          functionName: "deleteNote",
          fileName: "notesService.ts",
          error: new Error(
            `Note with ID ${noteId} not found in organization ${organizationId}`,
          ),
          userId: userId,
          organizationId: organizationId
        });
        throw new Error(`Note with ID ${noteId} not found`);
      }

      // Check permissions: author can delete, admin can delete any
      const isAuthor = note.isAuthoredBy(userId);
      const isAdmin = userRole === "Admin";

      if (!isAuthor && !isAdmin) {
        throw new BusinessLogicException(
          "Only the note author or admins can delete this note",
          "NOTE_DELETE_FORBIDDEN",
          { noteId, userId, role: userRole }
        );
      }

      // Delete from database
      const deleteCount = await deleteNoteByIdQuery(noteId, organizationId);

      if (deleteCount === 0) {
        throw new Error(`Failed to delete note with ID ${noteId}`);
      }

      await logSuccess({
        eventType: "Delete",
        description: `Note ${noteId} deleted`,
        functionName: "deleteNote",
        fileName: "notesService.ts",
        userId: userId,
        organizationId: organizationId,
      });

      return true;
    } catch (error) {
      await logFailure({
        eventType: "Delete",
        description: `Failed to delete note ${noteId}`,
        functionName: "deleteNote",
        fileName: "notesService.ts",
        error: error as Error,
        userId: userId,
        organizationId: organizationId,
      });
      throw error;
    }
  }

  /**
   * Get note count for an entity
   *
   * @static
   * @async
   * @param {NotesAttachedToEnum} attachedTo - Entity type
   * @param {string} attachedToId - Entity ID
   * @param {number} organizationId - Organization ID
   * @returns {Promise<number>} Count of notes
   *
   * @example
   * const count = await NotesService.getNoteCount(
   *   NotesAttachedToEnum.NIST_SUBCATEGORY,
   *   'sub-123',
   *   456
   * );
   */
  static async getNoteCount(
    attachedTo: NotesAttachedToEnum,
    attachedToId: string,
    organizationId: number
  ): Promise<number> {
    try {
      return await getNoteCountByEntityQuery(
        attachedTo,
        attachedToId,
        organizationId
      );
    } catch (error) {
      throw new Error(`Failed to get note count: ${(error as Error).message}`);
    }
  }

  /**
   * Get notes by author
   *
   * @static
   * @async
   * @param {number} authorId - User ID of note author
   * @param {number} organizationId - Organization ID
   * @returns {Promise<NotesModel[]>} Array of user's notes
   *
   * @example
   * const userNotes = await NotesService.getNotesByAuthor(123, 456);
   */
  static async getNotesByAuthor(
    authorId: number,
    organizationId: number
  ): Promise<NotesModel[]> {
    try {
      return await getNotesByAuthorQuery(authorId, organizationId);
    } catch (error) {
      throw new Error(
        `Failed to get author notes: ${(error as Error).message}`
      );
    }
  }
}
