import { describe, it, expect, vi } from "vitest";

// Mock the MAX_FILE_SIZE_MB used in the tested file.
// Note: the path here is relative to /utils/tests.
// It needs to point to the same real file that the tested module imports.
vi.mock("../../constants/fileManager", () => ({
  MAX_FILE_SIZE_MB: 25,
}));

import { getFileErrorMessage } from "../fileErrorHandler.utils";

describe("fileErrorHandler.utils", () => {
  describe("getFileErrorMessage", () => {
    it("returns 413 (file too large) message with MAX_FILE_SIZE_MB", () => {
      const msg = getFileErrorMessage({ statusCode: 413 }, "upload");
      expect(msg).toBe("File too large (max 25MB)");
    });

    it("returns 415 (unsupported file type)", () => {
      const msg = getFileErrorMessage({ statusCode: 415 }, "upload");
      expect(msg).toBe("Unsupported file type");
    });

    it("returns 403 message for upload context", () => {
      const msg = getFileErrorMessage({ statusCode: 403 }, "upload");
      expect(msg).toBe("Permission denied. You don't have permission to upload files.");
    });

    it("returns 403 message for download context", () => {
      const msg = getFileErrorMessage({ statusCode: 403 }, "download");
      expect(msg).toBe("Access denied. You don't have permission to download this file.");
    });

    it("returns 403 message for delete context", () => {
      const msg = getFileErrorMessage({ statusCode: 403 }, "delete");
      expect(msg).toBe("Access denied. You don't have permission to delete this file.");
    });

    it("returns 403 fallback message for general context", () => {
      const msg = getFileErrorMessage({ statusCode: 403 }, "general");
      expect(msg).toBe("Permission denied");
    });

    it("returns 404 message for download context (long message)", () => {
      const msg = getFileErrorMessage({ statusCode: 404 }, "download");
      expect(msg).toBe(
        "File not found on the server. It may have been deleted.\n\nPlease refresh the page to update the file list.",
      );
    });

    it("returns 404 message for delete context (long message)", () => {
      const msg = getFileErrorMessage({ statusCode: 404 }, "delete");
      expect(msg).toBe(
        "File not found on the server. It may have already been deleted.\n\nPlease refresh the page to update the file list.",
      );
    });

    it("returns 404 fallback message for general context", () => {
      const msg = getFileErrorMessage({ statusCode: 404 }, "general");
      expect(msg).toBe("File not found");
    });

    it("returns 500 server error message", () => {
      const msg = getFileErrorMessage({ statusCode: 500 }, "general");
      expect(msg).toBe("Server error. Please try again.");
    });

    it('handles error.message including "not found" for download context', () => {
      const msg = getFileErrorMessage({ message: "resource not found" }, "download");
      expect(msg).toBe(
        "File not found on the server. It may have been deleted.\n\nPlease refresh the page to update the file list.",
      );
    });

    it('handles error.message including "not found" for general context', () => {
      const msg = getFileErrorMessage({ message: "not found" }, "general");
      expect(msg).toBe("File not found");
    });

    it('handles error.message including "permission" (fallback sentence)', () => {
      const msg = getFileErrorMessage({ message: "permission issue" }, "delete");
      expect(msg).toBe("You don't have permission to delete this file.");
    });

    it('handles error.message including "denied" (fallback sentence)', () => {
      const msg = getFileErrorMessage({ message: "access denied by policy" }, "download");
      expect(msg).toBe("You don't have permission to download this file.");
    });

    it("returns original error.message when descriptive and no special match", () => {
      const msg = getFileErrorMessage(
        { message: "Something went wrong but is descriptive" },
        "general",
      );
      expect(msg).toBe("Something went wrong but is descriptive");
    });

    it("returns default context message when no statusCode and no message (upload)", () => {
      const msg = getFileErrorMessage({}, "upload");
      expect(msg).toBe("Upload failed");
    });

    it("returns default context message when no statusCode and no message (download)", () => {
      const msg = getFileErrorMessage({}, "download");
      expect(msg).toBe(
        "Failed to download file. The file may have been deleted or you don't have permission.",
      );
    });

    it("returns default context message when no statusCode and no message (delete)", () => {
      const msg = getFileErrorMessage({}, "delete");
      expect(msg).toBe("Failed to delete file. You may not have permission to delete this file.");
    });

    it("returns default context message when context omitted (defaults to general)", () => {
      const msg = getFileErrorMessage({});
      expect(msg).toBe("Operation failed");
    });
  });
});
