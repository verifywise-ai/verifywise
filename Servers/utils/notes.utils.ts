/**
 * @fileoverview Notes Utility Functions
 *
 * Data access layer for notes operations.
 * Uses raw SQL queries with shared-schema multi-tenancy (organization_id column).
 *
 * Functions:
 * - createNewNoteQuery: Create and persist a new note
 * - getNotesByEntityQuery: Fetch notes for a specific entity
 * - getNoteByIdQuery: Fetch a single note by ID
 * - updateNoteContentQuery: Update note content
 * - deleteNoteByIdQuery: Delete a note
 *
 * @module utils/notes
 */

import { NotesModel } from "../domain.layer/models/notes/notes.model";
import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";

/**
 * Create and persist a new note to the database
 *
 * @async
 * @param {NotesModel} note - NotesModel instance to save
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<NotesModel>} Saved note instance from database
 * @throws {Error} If database operation fails
 */
export async function createNewNoteQuery(
  note: NotesModel,
  organizationId: number
): Promise<NotesModel> {
  try {
    const result = await sequelize.query(
      `INSERT INTO notes
        (content, author_id, attached_to, attached_to_id, organization_id, is_edited, created_at, updated_at)
       VALUES (:content, :author_id, :attached_to, :attached_to_id, :organization_id, :is_edited, :created_at, :updated_at)
       RETURNING id`,
      {
        replacements: {
          content: note.content,
          author_id: note.author_id,
          attached_to: note.attached_to,
          attached_to_id: note.attached_to_id,
          organization_id: organizationId,
          is_edited: note.is_edited || false,
          created_at: new Date(),
          updated_at: new Date(),
        },
        type: QueryTypes.INSERT,
      }
    );

    // Extract the generated ID from the result
    let noteId: number | undefined;
    if (
      result &&
      Array.isArray(result) &&
      result[0] &&
      Array.isArray(result[0]) &&
      result[0][0] &&
      result[0][0].id
    ) {
      noteId = result[0][0].id;
      note.id = noteId;
    }

    // If we have the ID, fetch the complete note with author information
    if (noteId) {
      return getNoteByIdQuery(noteId, organizationId).then((fetchedNote) => {
        if (fetchedNote) {
          return fetchedNote;
        }
        // Fallback to the note instance if fetch fails
        return note;
      });
    }

    return note;
  } catch (error) {
    throw new Error(`Failed to create note: ${(error as Error).message}`);
  }
}

/**
 * Fetch notes for a specific entity (filtered by type and ID)
 *
 * Returns notes in reverse chronological order (newest first).
 *
 * @async
 * @param {string} attachedTo - Entity type (e.g., NIST_SUBCATEGORY)
 * @param {string} attachedToId - Entity ID
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<NotesModel[]>} Array of notes
 * @throws {Error} If database operation fails
 */
export async function getNotesByEntityQuery(
  attachedTo: string,
  attachedToId: string,
  organizationId: number
): Promise<NotesModel[]> {
  try {
    const notes = await sequelize.query(
      `SELECT n.*, u.id as "author.id", u.name as "author.name", u.surname as "author.surname", u.email as "author.email"
       FROM notes n
       LEFT JOIN users u ON n.author_id = u.id
       WHERE n.attached_to = :attached_to
         AND n.attached_to_id = :attached_to_id
         AND n.organization_id = :organization_id
       ORDER BY n.created_at DESC`,
      {
        replacements: {
          attached_to: attachedTo,
          attached_to_id: attachedToId,
          organization_id: organizationId,
        },
        type: QueryTypes.SELECT,
      }
    );

    // Convert raw results to NotesModel instances with author info
    return (notes as any[]).map((row) => {
      const noteData = {
        id: row.id,
        content: row.content,
        author_id: row.author_id,
        attached_to: row.attached_to,
        attached_to_id: row.attached_to_id,
        organization_id: row.organization_id,
        is_edited: row.is_edited,
        created_at: row.created_at,
        updated_at: row.updated_at,
        author: row["author.id"]
          ? {
              id: row["author.id"],
              name: row["author.name"],
              surname: row["author.surname"],
              email: row["author.email"],
            }
          : undefined,
      };
      const note = NotesModel.build(noteData as any, { isNewRecord: false });
      return note;
    });
  } catch (error) {
    throw new Error(`Failed to fetch notes: ${(error as Error).message}`);
  }
}

/**
 * Fetch a single note by ID
 *
 * @async
 * @param {number} noteId - Note ID
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<NotesModel | null>} Note instance or null if not found
 * @throws {Error} If database operation fails
 */
export async function getNoteByIdQuery(
  noteId: number,
  organizationId: number
): Promise<NotesModel | null> {
  try {
    const result = await sequelize.query(
      `SELECT n.*, u.id as "author.id", u.name as "author.name", u.surname as "author.surname", u.email as "author.email"
       FROM notes n
       LEFT JOIN users u ON n.author_id = u.id
       WHERE n.id = :id AND n.organization_id = :organization_id
       LIMIT 1`,
      {
        replacements: { id: noteId, organization_id: organizationId },
        type: QueryTypes.SELECT,
      }
    );

    if (result && (result as any[]).length > 0) {
      const row = (result as any[])[0];
      const noteData = {
        id: row.id,
        content: row.content,
        author_id: row.author_id,
        attached_to: row.attached_to,
        attached_to_id: row.attached_to_id,
        organization_id: row.organization_id,
        is_edited: row.is_edited,
        created_at: row.created_at,
        updated_at: row.updated_at,
        author: row["author.id"]
          ? {
              id: row["author.id"],
              name: row["author.name"],
              surname: row["author.surname"],
              email: row["author.email"],
            }
          : undefined,
      };
      return NotesModel.build(noteData as any, { isNewRecord: false });
    }

    return null;
  } catch (error) {
    throw new Error(`Failed to fetch note: ${(error as Error).message}`);
  }
}

/**
 * Update note content in the database
 *
 * @async
 * @param {number} noteId - Note ID
 * @param {NotesModel} note - Updated NotesModel instance
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<NotesModel>} Updated note instance from database
 * @throws {Error} If database operation fails
 */
export async function updateNoteContentQuery(
  noteId: number,
  note: NotesModel,
  organizationId: number
): Promise<NotesModel> {
  try {
    const updatedAt = new Date();

    await sequelize.query(
      `UPDATE notes
       SET content = :content, is_edited = :is_edited, updated_at = :updated_at
       WHERE id = :id AND organization_id = :organization_id`,
      {
        replacements: {
          id: noteId,
          content: note.content,
          is_edited: true,
          updated_at: updatedAt,
          organization_id: organizationId,
        },
        type: QueryTypes.UPDATE,
      }
    );

    // Fetch the complete updated note with author information
    const updatedNote = await getNoteByIdQuery(noteId, organizationId);
    if (updatedNote) {
      return updatedNote;
    }

    // Fallback: return note with updated fields if fetch fails
    note.is_edited = true;
    note.updated_at = updatedAt;
    return note;
  } catch (error) {
    throw new Error(`Failed to update note: ${(error as Error).message}`);
  }
}

/**
 * Delete a note from the database
 *
 * @async
 * @param {number} noteId - Note ID
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<number>} Number of rows affected (0 or 1)
 * @throws {Error} If database operation fails
 */
export async function deleteNoteByIdQuery(
  noteId: number,
  organizationId: number
): Promise<number> {
  try {
    // Use RETURNING to get the deleted row and check if deletion was successful
    const result = await sequelize.query(
      `DELETE FROM notes
       WHERE id = :id AND organization_id = :organization_id
       RETURNING id`,
      {
        replacements: { id: noteId, organization_id: organizationId },
        type: QueryTypes.SELECT,
      }
    );

    // Return 1 if a row was deleted, 0 otherwise
    return Array.isArray(result) && result.length > 0 ? 1 : 0;
  } catch (error) {
    throw new Error(`Failed to delete note: ${(error as Error).message}`);
  }
}

/**
 * Get notes count for an entity
 *
 * Useful for pagination and metadata.
 *
 * @async
 * @param {string} attachedTo - Entity type
 * @param {string} attachedToId - Entity ID
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<number>} Count of notes
 * @throws {Error} If database operation fails
 */
export async function getNoteCountByEntityQuery(
  attachedTo: string,
  attachedToId: string,
  organizationId: number
): Promise<number> {
  try {
    const result = await sequelize.query(
      `SELECT COUNT(*) as count
       FROM notes
       WHERE attached_to = :attached_to
         AND attached_to_id = :attached_to_id
         AND organization_id = :organization_id`,
      {
        replacements: {
          attached_to: attachedTo,
          attached_to_id: attachedToId,
          organization_id: organizationId,
        },
        type: QueryTypes.SELECT,
      }
    );

    return parseInt((result as any[])[0].count, 10) || 0;
  } catch (error) {
    throw new Error(`Failed to count notes: ${(error as Error).message}`);
  }
}

/**
 * Get notes by author ID
 *
 * Useful for user profile pages or activity feeds.
 *
 * @async
 * @param {number} authorId - User ID of note author
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<NotesModel[]>} Array of notes
 * @throws {Error} If database operation fails
 */
export async function getNotesByAuthorQuery(
  authorId: number,
  organizationId: number
): Promise<NotesModel[]> {
  try {
    const notes = await sequelize.query(
      `SELECT n.*, u.id as "author.id", u.name as "author.name", u.surname as "author.surname", u.email as "author.email"
       FROM notes n
       LEFT JOIN users u ON n.author_id = u.id
       WHERE n.author_id = :author_id
         AND n.organization_id = :organization_id
       ORDER BY n.created_at DESC`,
      {
        replacements: {
          author_id: authorId,
          organization_id: organizationId,
        },
        type: QueryTypes.SELECT,
      }
    );

    // Convert raw results to NotesModel instances with author info
    return (notes as any[]).map((row) => {
      const noteData = {
        id: row.id,
        content: row.content,
        author_id: row.author_id,
        attached_to: row.attached_to,
        attached_to_id: row.attached_to_id,
        organization_id: row.organization_id,
        is_edited: row.is_edited,
        created_at: row.created_at,
        updated_at: row.updated_at,
        author: row["author.id"]
          ? {
              id: row["author.id"],
              name: row["author.name"],
              surname: row["author.surname"],
              email: row["author.email"],
            }
          : undefined,
      };
      const note = NotesModel.build(noteData as any, { isNewRecord: false });
      return note;
    });
  } catch (error) {
    throw new Error(
      `Failed to fetch author notes: ${(error as Error).message}`
    );
  }
}

/**
 * Delete all notes for an entity
 *
 * Used for cleanup when an entity is deleted.
 *
 * @async
 * @param {string} attachedTo - Entity type
 * @param {string} attachedToId - Entity ID
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<number>} Number of notes deleted
 * @throws {Error} If database operation fails
 */
export async function deleteNotesByEntityQuery(
  attachedTo: string,
  attachedToId: string,
  organizationId: number
): Promise<number> {
  try {
    const result = (await sequelize.query(
      `DELETE FROM notes
       WHERE attached_to = :attached_to
         AND attached_to_id = :attached_to_id
         AND organization_id = :organization_id`,
      {
        replacements: {
          attached_to: attachedTo,
          attached_to_id: attachedToId,
          organization_id: organizationId,
        },
        type: QueryTypes.DELETE,
      }
    )) as any;

    return result && typeof result === "number" ? result : 0;
  } catch (error) {
    throw new Error(
      `Failed to delete entity notes: ${(error as Error).message}`
    );
  }
}
