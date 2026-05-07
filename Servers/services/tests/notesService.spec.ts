/**
 * @fileoverview Notes Service Tests
 *
 * Tests for NotesService business logic: validation, permission checks,
 * and CRUD orchestration.
 *
 * @module tests/notesService
 */

// Mock database BEFORE other imports
jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("../../utils/notes.utils");
jest.mock("../../domain.layer/models/notes/notes.model");
jest.mock("../../utils/logger/logHelper", () => ({
  logFailure: jest.fn(),
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
}));

import { NotesService } from "../notesService";
import { NotesModel, NotesAttachedToEnum } from "../../domain.layer/models/notes/notes.model";
import {
  createNewNoteQuery,
  getNotesByEntityQuery,
  getNoteByIdQuery,
  updateNoteContentQuery,
  deleteNoteByIdQuery,
  getNoteCountByEntityQuery,
  getNotesByAuthorQuery,
} from "../../utils/notes.utils";
import {
  ValidationException,
  BusinessLogicException,
} from "../../domain.layer/exceptions/custom.exception";

// Cast mocks
const mockCreateNewNoteQuery = createNewNoteQuery as jest.MockedFunction<typeof createNewNoteQuery>;
const mockGetNotesByEntityQuery = getNotesByEntityQuery as jest.MockedFunction<
  typeof getNotesByEntityQuery
>;
const mockGetNoteByIdQuery = getNoteByIdQuery as jest.MockedFunction<typeof getNoteByIdQuery>;
const mockUpdateNoteContentQuery = updateNoteContentQuery as jest.MockedFunction<
  typeof updateNoteContentQuery
>;
const mockDeleteNoteByIdQuery = deleteNoteByIdQuery as jest.MockedFunction<
  typeof deleteNoteByIdQuery
>;
const mockGetNoteCountByEntityQuery = getNoteCountByEntityQuery as jest.MockedFunction<
  typeof getNoteCountByEntityQuery
>;
const mockGetNotesByAuthorQuery = getNotesByAuthorQuery as jest.MockedFunction<
  typeof getNotesByAuthorQuery
>;
const mockCreateNote = NotesModel.createNote as jest.MockedFunction<typeof NotesModel.createNote>;

describe("NotesService", () => {
  const orgId = 1;
  const userId = 10;
  const attachedTo = NotesAttachedToEnum.RISK;
  const attachedToId = "risk-123";

  const mockNote = {
    id: 1,
    content: "Test note",
    author_id: userId,
    attached_to: attachedTo,
    attached_to_id: attachedToId,
    organization_id: orgId,
    validateNoteData: jest.fn().mockResolvedValue(undefined),
    isAuthoredBy: jest.fn().mockReturnValue(true),
    updateContent: jest.fn().mockResolvedValue(undefined),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateNote.mockResolvedValue(mockNote);
    mockCreateNewNoteQuery.mockResolvedValue(mockNote);
  });

  // ==========================================================================
  // createNote
  // ==========================================================================

  describe("createNote", () => {
    it("should create a note successfully", async () => {
      const result = await NotesService.createNote(
        "Valid content",
        userId,
        attachedTo,
        attachedToId,
        orgId,
      );

      expect(result).toBe(mockNote);
      expect(mockCreateNote).toHaveBeenCalledWith(
        "Valid content",
        userId,
        attachedTo,
        attachedToId,
        orgId,
      );
      expect(mockCreateNewNoteQuery).toHaveBeenCalledWith(mockNote, orgId);
    });

    it("should throw ValidationException for empty content", async () => {
      await expect(
        NotesService.createNote("", userId, attachedTo, attachedToId, orgId),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for whitespace-only content", async () => {
      await expect(
        NotesService.createNote("   ", userId, attachedTo, attachedToId, orgId),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for content exceeding 5000 chars", async () => {
      const longContent = "a".repeat(5001);
      await expect(
        NotesService.createNote(longContent, userId, attachedTo, attachedToId, orgId),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid authorId (0)", async () => {
      await expect(
        NotesService.createNote("Valid", 0, attachedTo, attachedToId, orgId),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for negative authorId", async () => {
      await expect(
        NotesService.createNote("Valid", -1, attachedTo, attachedToId, orgId),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid enum attachedTo", async () => {
      await expect(
        NotesService.createNote("Valid", userId, "INVALID_TYPE" as any, attachedToId, orgId),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for empty attachedToId", async () => {
      await expect(NotesService.createNote("Valid", userId, attachedTo, "", orgId)).rejects.toThrow(
        ValidationException,
      );
    });

    it("should trim content before saving", async () => {
      await NotesService.createNote("  trimmed  ", userId, attachedTo, attachedToId, orgId);
      expect(mockCreateNote).toHaveBeenCalledWith(
        "trimmed",
        userId,
        attachedTo,
        attachedToId,
        orgId,
      );
    });
  });

  // ==========================================================================
  // getNotes
  // ==========================================================================

  describe("getNotes", () => {
    it("should return notes for entity", async () => {
      mockGetNotesByEntityQuery.mockResolvedValue([mockNote]);

      const result = await NotesService.getNotes(attachedTo, attachedToId, orgId, userId);
      expect(result).toEqual([mockNote]);
      expect(mockGetNotesByEntityQuery).toHaveBeenCalledWith(attachedTo, attachedToId, orgId);
    });

    it("should return empty array when no notes exist", async () => {
      mockGetNotesByEntityQuery.mockResolvedValue([]);

      const result = await NotesService.getNotes(attachedTo, attachedToId, orgId, userId);
      expect(result).toEqual([]);
    });

    it("should throw ValidationException for invalid attachedTo", async () => {
      await expect(
        NotesService.getNotes("INVALID" as any, attachedToId, orgId, userId),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for empty attachedToId", async () => {
      await expect(NotesService.getNotes(attachedTo, "", orgId, userId)).rejects.toThrow(
        ValidationException,
      );
    });
  });

  // ==========================================================================
  // updateNote
  // ==========================================================================

  describe("updateNote", () => {
    beforeEach(() => {
      mockGetNoteByIdQuery.mockResolvedValue(mockNote);
      mockUpdateNoteContentQuery.mockResolvedValue(mockNote);
      mockNote.isAuthoredBy.mockReturnValue(true);
    });

    it("should allow author to update their note", async () => {
      const result = await NotesService.updateNote(1, "Updated", userId, "Editor", orgId);

      expect(result).toBe(mockNote);
      expect(mockNote.updateContent).toHaveBeenCalledWith("Updated");
      expect(mockUpdateNoteContentQuery).toHaveBeenCalledWith(1, mockNote, orgId);
    });

    it("should allow admin to update any note", async () => {
      mockNote.isAuthoredBy.mockReturnValue(false);

      const result = await NotesService.updateNote(1, "Admin edit", 999, "Admin", orgId);
      expect(result).toBe(mockNote);
    });

    it("should throw BusinessLogicException for non-author non-admin", async () => {
      mockNote.isAuthoredBy.mockReturnValue(false);

      await expect(
        NotesService.updateNote(1, "Unauthorized", 999, "Editor", orgId),
      ).rejects.toThrow(BusinessLogicException);
    });

    it("should throw error when note not found", async () => {
      mockGetNoteByIdQuery.mockResolvedValue(null);

      await expect(
        NotesService.updateNote(999, "Content", userId, "Editor", orgId),
      ).rejects.toThrow("Note with ID 999 not found");
    });

    it("should throw ValidationException for empty content", async () => {
      await expect(NotesService.updateNote(1, "", userId, "Editor", orgId)).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw ValidationException for content exceeding 5000 chars", async () => {
      await expect(
        NotesService.updateNote(1, "a".repeat(5001), userId, "Editor", orgId),
      ).rejects.toThrow(ValidationException);
    });
  });

  // ==========================================================================
  // deleteNote
  // ==========================================================================

  describe("deleteNote", () => {
    beforeEach(() => {
      mockGetNoteByIdQuery.mockResolvedValue(mockNote);
      mockDeleteNoteByIdQuery.mockResolvedValue(1);
      mockNote.isAuthoredBy.mockReturnValue(true);
    });

    it("should allow author to delete their note", async () => {
      const result = await NotesService.deleteNote(1, userId, "Editor", orgId);

      expect(result).toBe(true);
      expect(mockDeleteNoteByIdQuery).toHaveBeenCalledWith(1, orgId);
    });

    it("should allow admin to delete any note", async () => {
      mockNote.isAuthoredBy.mockReturnValue(false);

      const result = await NotesService.deleteNote(1, 999, "Admin", orgId);
      expect(result).toBe(true);
    });

    it("should throw BusinessLogicException for non-author non-admin", async () => {
      mockNote.isAuthoredBy.mockReturnValue(false);

      await expect(NotesService.deleteNote(1, 999, "Editor", orgId)).rejects.toThrow(
        BusinessLogicException,
      );
    });

    it("should throw error when note not found", async () => {
      mockGetNoteByIdQuery.mockResolvedValue(null);

      await expect(NotesService.deleteNote(999, userId, "Editor", orgId)).rejects.toThrow(
        "Note with ID 999 not found",
      );
    });

    it("should throw error when delete returns 0 rows", async () => {
      mockDeleteNoteByIdQuery.mockResolvedValue(0);

      await expect(NotesService.deleteNote(1, userId, "Editor", orgId)).rejects.toThrow(
        "Failed to delete note with ID 1",
      );
    });
  });

  // ==========================================================================
  // getNoteCount
  // ==========================================================================

  describe("getNoteCount", () => {
    it("should return the count", async () => {
      mockGetNoteCountByEntityQuery.mockResolvedValue(5);

      const result = await NotesService.getNoteCount(attachedTo, attachedToId, orgId);
      expect(result).toBe(5);
    });

    it("should throw on error", async () => {
      mockGetNoteCountByEntityQuery.mockRejectedValue(new Error("DB error"));

      await expect(NotesService.getNoteCount(attachedTo, attachedToId, orgId)).rejects.toThrow(
        "Failed to get note count: DB error",
      );
    });
  });

  // ==========================================================================
  // getNotesByAuthor
  // ==========================================================================

  describe("getNotesByAuthor", () => {
    it("should return notes by author", async () => {
      mockGetNotesByAuthorQuery.mockResolvedValue([mockNote]);

      const result = await NotesService.getNotesByAuthor(userId, orgId);
      expect(result).toEqual([mockNote]);
      expect(mockGetNotesByAuthorQuery).toHaveBeenCalledWith(userId, orgId);
    });

    it("should throw on error", async () => {
      mockGetNotesByAuthorQuery.mockRejectedValue(new Error("DB error"));

      await expect(NotesService.getNotesByAuthor(userId, orgId)).rejects.toThrow(
        "Failed to get author notes: DB error",
      );
    });
  });
});
