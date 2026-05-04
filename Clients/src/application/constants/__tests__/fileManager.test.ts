import { describe, it, expect } from "vitest";
import {
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  ALLOWED_MIME_TYPES,
  ALLOWED_FILE_TYPES,
  getSupportedFileTypesString,
  SUPPORTED_FILE_TYPES_STRING,
  validateFile,
} from "../fileManager";

describe("fileManager constants", () => {
  describe("MAX_FILE_SIZE_BYTES", () => {
    it("should be 30MB in bytes", () => {
      expect(MAX_FILE_SIZE_BYTES).toBe(30 * 1024 * 1024);
    });
  });

  describe("MAX_FILE_SIZE_MB", () => {
    it("should be 30", () => {
      expect(MAX_FILE_SIZE_MB).toBe(30);
    });
  });

  describe("ALLOWED_MIME_TYPES", () => {
    it("should include document MIME types", () => {
      expect(ALLOWED_MIME_TYPES.has("application/pdf")).toBe(true);
      expect(ALLOWED_MIME_TYPES.has("application/msword")).toBe(true);
      expect(ALLOWED_MIME_TYPES.has("text/csv")).toBe(true);
    });

    it("should include image MIME types", () => {
      expect(ALLOWED_MIME_TYPES.has("image/jpeg")).toBe(true);
      expect(ALLOWED_MIME_TYPES.has("image/png")).toBe(true);
      expect(ALLOWED_MIME_TYPES.has("image/gif")).toBe(true);
    });

    it("should include video MIME types", () => {
      expect(ALLOWED_MIME_TYPES.has("video/mp4")).toBe(true);
      expect(ALLOWED_MIME_TYPES.has("video/webm")).toBe(true);
    });

    it("should not include unsupported types", () => {
      expect(ALLOWED_MIME_TYPES.has("application/json")).toBe(false);
      expect(ALLOWED_MIME_TYPES.has("text/html")).toBe(false);
    });
  });

  describe("ALLOWED_FILE_TYPES", () => {
    it("should have documents, images, and videos categories", () => {
      expect(ALLOWED_FILE_TYPES.documents).toBeDefined();
      expect(ALLOWED_FILE_TYPES.images).toBeDefined();
      expect(ALLOWED_FILE_TYPES.videos).toBeDefined();
    });

    it("should have correct labels", () => {
      expect(ALLOWED_FILE_TYPES.documents.label).toBe("Documents");
      expect(ALLOWED_FILE_TYPES.images.label).toBe("Images");
      expect(ALLOWED_FILE_TYPES.videos.label).toBe("Videos");
    });

    it("should include expected extensions", () => {
      expect(ALLOWED_FILE_TYPES.documents.extensions).toContain("PDF");
      expect(ALLOWED_FILE_TYPES.images.extensions).toContain("PNG");
      expect(ALLOWED_FILE_TYPES.videos.extensions).toContain("MP4");
    });
  });

  describe("getSupportedFileTypesString", () => {
    it("should return a formatted string with all categories", () => {
      const result = getSupportedFileTypesString();
      expect(result).toContain("Documents (");
      expect(result).toContain("Images (");
      expect(result).toContain("Videos (");
      expect(result).toContain("PDF");
      expect(result).toContain("PNG");
      expect(result).toContain("MP4");
    });
  });

  describe("SUPPORTED_FILE_TYPES_STRING", () => {
    it("should be pre-generated and match getSupportedFileTypesString()", () => {
      expect(SUPPORTED_FILE_TYPES_STRING).toBe(getSupportedFileTypesString());
    });
  });

  describe("validateFile", () => {
    function createMockFile(name: string, size: number, type: string): File {
      const file = new File(["x".repeat(Math.min(size, 1))], name, { type });
      Object.defineProperty(file, "size", { value: size });
      return file;
    }

    it("should return invalid when file is null/undefined", () => {
      const result = validateFile(null as unknown as File);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("No file provided");
    });

    it("should return invalid when file name is missing", () => {
      const file = createMockFile("test.pdf", 100, "application/pdf");
      Object.defineProperty(file, "name", { value: "" });
      const result = validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("File name is missing");
    });

    it("should return invalid when file is empty (zero bytes)", () => {
      const file = createMockFile("test.pdf", 0, "application/pdf");
      const result = validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("File is empty");
    });

    it("should return invalid when file exceeds max size", () => {
      const file = createMockFile("large.pdf", MAX_FILE_SIZE_BYTES + 1, "application/pdf");
      const result = validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("File too large");
      expect(result.error).toContain(`${MAX_FILE_SIZE_MB}MB`);
    });

    it("should return invalid when file type is not allowed", () => {
      const file = createMockFile("test.exe", 100, "application/x-msdownload");
      const result = validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Unsupported file type");
    });

    it("should return invalid when file type is empty", () => {
      const file = createMockFile("test.bin", 100, "");
      Object.defineProperty(file, "type", { value: "" });
      const result = validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("File type could not be determined");
    });

    it("should return valid for a proper PDF file", () => {
      const file = createMockFile("doc.pdf", 1024, "application/pdf");
      const result = validateFile(file);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should return valid for an image file", () => {
      const file = createMockFile("photo.png", 2048, "image/png");
      const result = validateFile(file);
      expect(result.valid).toBe(true);
    });

    it("should return valid for a video file", () => {
      const file = createMockFile("clip.mp4", 5000, "video/mp4");
      const result = validateFile(file);
      expect(result.valid).toBe(true);
    });

    it("should accept file at exactly max size", () => {
      const file = createMockFile("exact.pdf", MAX_FILE_SIZE_BYTES, "application/pdf");
      const result = validateFile(file);
      expect(result.valid).toBe(true);
    });
  });
});
