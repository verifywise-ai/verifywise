import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import { APIError } from "../../tools/error";
import {
  createNote,
  deleteNote,
  getNoteById,
  getNotes,
  updateNote,
} from "../notes.repository";

vi.mock("../../../infrastructure/api/networkServices", () => {
  return {
    apiServices: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const mockNote = {
  id: 1,
  content: "This is a test note",
  author_id: 10,
  author: { id: 10, name: "John", surname: "Doe", email: "john@example.com" },
  created_at: "2026-03-01T00:00:00Z",
  updated_at: "2026-03-01T00:00:00Z",
  is_edited: false,
};

// ─── getNotes ─────────────────────────────────────────────────────────────────

describe("Test Notes Repository", () => {
  describe("getNotes", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a GET request to the correct URL with attachedTo and attachedToId", async () => {
      const mockResponse = {
        data: { data: [mockNote], message: "OK" },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getNotes("NIST_SUBCATEGORY", "42");

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/notes?attachedTo=NIST_SUBCATEGORY&attachedToId=42",
      );
    });

    it("should return the notes array extracted from response.data.data", async () => {
      const mockResponse = {
        data: { data: [mockNote], message: "OK" },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getNotes("NIST_SUBCATEGORY", "42");

      expect(result).toEqual([mockNote]);
    });

    it("should return an empty array when the response data is empty", async () => {
      const mockResponse = {
        data: { data: [], message: "OK" },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getNotes("NIST_SUBCATEGORY", "42");

      expect(result).toEqual([]);
    });

    it("should return an empty array on a 204 No Content response", async () => {
      const error204 = { response: { status: 204 } };
      vi.mocked(apiServices.get).mockRejectedValue(error204);

      const result = await getNotes("NIST_SUBCATEGORY", "42");

      expect(result).toEqual([]);
    });

    it("should throw an APIError when the API call fails", async () => {
      const mockError = {
        response: { status: 500, data: { message: "Internal Server Error" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getNotes("NIST_SUBCATEGORY", "42")).rejects.toThrow(
        APIError,
      );
    });

    it("should include the correct status in the thrown APIError", async () => {
      const mockError = {
        response: { status: 403, data: { message: "Forbidden" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      try {
        await getNotes("NIST_SUBCATEGORY", "42");
      } catch (error) {
        expect(error).toBeInstanceOf(APIError);
        expect((error as APIError).status).toBe(403);
        expect((error as APIError).message).toBe("Failed to fetch notes");
      }
    });

    it("should return response.data directly when data.data is absent and data has no message (extractData fallback branch 1)", async () => {
      // Simulates an edge-case response where the server returns the array
      // directly in response.data without a wrapping { data, message } envelope
      const mockResponse = {
        data: [mockNote],
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getNotes("NIST_SUBCATEGORY", "42");

      expect(result).toEqual([mockNote]);
    });

    it("should return an empty array when data.data is absent and data only has a message (extractData fallback branch 2)", async () => {
      // Simulates a response where data.data is absent and data.message is set,
      // causing extractData to fall through to the `return [] as T` safety net
      const mockResponse = {
        data: { message: "No notes found" },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getNotes("NIST_SUBCATEGORY", "42");

      expect(result).toEqual([]);
    });

    it("should return an empty array when extractData returns a non-array value", async () => {
      // Simulates a response where data.data is set to a plain object (not an array),
      // triggering the `Array.isArray(notes) ? notes : []` guard on line 81
      const mockResponse = {
        data: { data: { id: 1, content: "orphan" } },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getNotes("NIST_SUBCATEGORY", "42");

      expect(result).toEqual([]);
    });
  });

  // ─── getNoteById ───────────────────────────────────────────────────────────

  describe("getNoteById", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a GET request to the correct URL with the note ID", async () => {
      const mockResponse = {
        data: { data: mockNote, message: "OK" },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getNoteById(1);

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/notes/1");
    });

    it("should return the note extracted from response.data.data", async () => {
      const mockResponse = {
        data: { data: mockNote, message: "OK" },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getNoteById(1);

      expect(result).toEqual(mockNote);
    });

    it("should throw an APIError when the API call fails", async () => {
      const mockError = {
        response: { status: 404, data: { message: "Not Found" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getNoteById(99)).rejects.toThrow(APIError);
    });

    it("should include the correct status and message in the thrown APIError", async () => {
      const mockError = { response: { status: 404 } };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      try {
        await getNoteById(99);
      } catch (error) {
        expect(error).toBeInstanceOf(APIError);
        expect((error as APIError).status).toBe(404);
        expect((error as APIError).message).toBe(
          "Failed to fetch note with ID 99",
        );
      }
    });
  });

  // ─── createNote ────────────────────────────────────────────────────────────

  describe("createNote", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    const createInput = {
      content: "New note content",
      attached_to: "NIST_SUBCATEGORY",
      attached_to_id: "42",
    };

    it("should make a POST request to the correct URL with the provided data", async () => {
      const mockResponse = {
        data: { data: mockNote, message: "Created" },
        status: 201,
        statusText: "Created",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await createNote(createInput);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith("/notes", createInput);
    });

    it("should return the created note extracted from response.data.data", async () => {
      const mockResponse = {
        data: { data: mockNote, message: "Created" },
        status: 201,
        statusText: "Created",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await createNote(createInput);

      expect(result).toEqual(mockNote);
    });

    it("should throw an APIError when the API call fails", async () => {
      const mockError = {
        response: { status: 422, data: { message: "Validation error" } },
      };
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(createNote(createInput)).rejects.toThrow(APIError);
    });

    it("should include the correct status and message in the thrown APIError", async () => {
      const mockError = { response: { status: 422 } };
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      try {
        await createNote(createInput);
      } catch (error) {
        expect(error).toBeInstanceOf(APIError);
        expect((error as APIError).status).toBe(422);
        expect((error as APIError).message).toBe("Failed to create note");
      }
    });
  });

  // ─── updateNote ────────────────────────────────────────────────────────────

  describe("updateNote", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    const updateInput = { content: "Updated note content" };

    it("should make a PUT request to the correct URL with the provided data", async () => {
      const mockResponse = {
        data: {
          data: { ...mockNote, content: "Updated note content" },
          message: "OK",
        },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.put).mockResolvedValue(mockResponse);

      await updateNote(1, updateInput);

      expect(apiServices.put).toHaveBeenCalledTimes(1);
      expect(apiServices.put).toHaveBeenCalledWith("/notes/1", updateInput);
    });

    it("should return the updated note extracted from response.data.data", async () => {
      const updatedNote = {
        ...mockNote,
        content: "Updated note content",
        is_edited: true,
      };
      const mockResponse = {
        data: { data: updatedNote, message: "OK" },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.put).mockResolvedValue(mockResponse);

      const result = await updateNote(1, updateInput);

      expect(result).toEqual(updatedNote);
    });

    it("should throw an APIError when the API call fails", async () => {
      const mockError = {
        response: { status: 404, data: { message: "Not Found" } },
      };
      vi.mocked(apiServices.put).mockRejectedValue(mockError);

      await expect(updateNote(99, updateInput)).rejects.toThrow(APIError);
    });

    it("should include the correct status and message in the thrown APIError", async () => {
      const mockError = { response: { status: 404 } };
      vi.mocked(apiServices.put).mockRejectedValue(mockError);

      try {
        await updateNote(99, updateInput);
      } catch (error) {
        expect(error).toBeInstanceOf(APIError);
        expect((error as APIError).status).toBe(404);
        expect((error as APIError).message).toBe(
          "Failed to update note with ID 99",
        );
      }
    });
  });

  // ─── deleteNote ────────────────────────────────────────────────────────────

  describe("deleteNote", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a DELETE request to the correct URL with the note ID", async () => {
      vi.mocked(apiServices.delete).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: {}
      });

      await deleteNote(1);

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith("/notes/1");
    });

    it("should resolve without returning a value on successful deletion", async () => {
      vi.mocked(apiServices.delete).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: {}
      });

      const result = await deleteNote(1);

      expect(result).toBeUndefined();
    });

    it("should throw an APIError when the API call fails", async () => {
      const mockError = {
        response: { status: 404, data: { message: "Not Found" } },
      };
      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(deleteNote(99)).rejects.toThrow(APIError);
    });

    it("should include the correct status and message in the thrown APIError", async () => {
      const mockError = { response: { status: 404 } };
      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      try {
        await deleteNote(99);
      } catch (error) {
        expect(error).toBeInstanceOf(APIError);
        expect((error as APIError).status).toBe(404);
        expect((error as APIError).message).toBe(
          "Failed to delete note with ID 99",
        );
      }
    });
  });
});
