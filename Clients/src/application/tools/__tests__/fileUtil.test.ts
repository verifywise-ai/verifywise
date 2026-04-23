import { describe, it, expect } from "vitest";
import { formatBytes, uploadFile } from "../fileUtil";

describe("fileUtil", () => {
  describe("formatBytes", () => {
    it("returns '0 Bytes' for 0", () => {
      expect(formatBytes(0)).toBe("0 Bytes");
    });

    it("formats bytes correctly", () => {
      expect(formatBytes(500)).toBe("500 Bytes");
    });

    it("formats kilobytes correctly", () => {
      expect(formatBytes(1024)).toBe("1 KB");
    });

    it("formats megabytes correctly", () => {
      expect(formatBytes(1048576)).toBe("1 MB");
    });

    it("formats gigabytes correctly", () => {
      expect(formatBytes(1073741824)).toBe("1 GB");
    });

    it("respects decimal parameter", () => {
      expect(formatBytes(1536, 1)).toBe("1.5 KB");
    });

    it("handles negative decimals as 0", () => {
      expect(formatBytes(1536, -1)).toBe("2 KB");
    });
  });

  describe("uploadFile", () => {
    const createMockFile = (name: string, size: number, type: string): File => {
      const content = new ArrayBuffer(size);
      return new File([content], name, { type });
    };

    it("returns file when type and size are valid", () => {
      const file = createMockFile("test.pdf", 1000, "application/pdf");
      const result = uploadFile(file, ["application/pdf"], 5 * 1024 * 1024);
      expect(result.file).toBe(file);
      expect(result.error).toBeUndefined();
    });

    it("returns error for invalid file type", () => {
      const file = createMockFile("test.exe", 1000, "application/x-msdownload");
      const result = uploadFile(file, ["application/pdf"], 5 * 1024 * 1024);
      expect(result.error).toBe("Invalid file type. Please upload a supported file format.");
      expect(result.file).toBeUndefined();
    });

    it("returns error when file exceeds max size", () => {
      const file = createMockFile("big.pdf", 10 * 1024 * 1024, "application/pdf");
      const result = uploadFile(file, ["application/pdf"], 5 * 1024 * 1024);
      expect(result.error).toBe("File is too large. Maximum size allowed is 5MB.");
      expect(result.file).toBeUndefined();
    });
  });
});
