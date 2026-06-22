import { describe, it, expect, vi, beforeEach } from "vitest";
import { isOfficeFile, getOfficeFileLabel, getOfficeThumbnail } from "../officePreview.utils";

describe("isOfficeFile", () => {
  it("returns true for DOCX mimetype", () => {
    expect(
      isOfficeFile("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ).toBe(true);
  });

  it("returns true for XLSX mimetype", () => {
    expect(isOfficeFile("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(
      true,
    );
  });

  it("returns true for PPTX mimetype", () => {
    expect(
      isOfficeFile("application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    ).toBe(true);
  });

  it("returns false for non-office mimetype", () => {
    expect(isOfficeFile("image/png")).toBe(false);
  });

  it("returns false for undefined mimetype", () => {
    expect(isOfficeFile(undefined)).toBe(false);
  });

  it("returns false for empty mimetype", () => {
    expect(isOfficeFile("")).toBe(false);
  });
});

describe("getOfficeFileLabel", () => {
  it('returns "Word document" for wordprocessingml mimetype', () => {
    expect(
      getOfficeFileLabel("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ).toBe("Word document");
  });

  it('returns "Excel spreadsheet" for spreadsheetml mimetype', () => {
    expect(
      getOfficeFileLabel("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ).toBe("Excel spreadsheet");
  });

  it('returns "PowerPoint presentation" for presentationml mimetype', () => {
    expect(
      getOfficeFileLabel(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ),
    ).toBe("PowerPoint presentation");
  });

  it('returns "Office document" for unknown office mimetype', () => {
    expect(getOfficeFileLabel("application/unknown")).toBe("Office document");
  });

  it('returns "Office document" for undefined mimetype', () => {
    expect(getOfficeFileLabel(undefined)).toBe("Office document");
  });
});

describe("getOfficeThumbnail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns error when blob is not a valid zip", async () => {
    const blob = new Blob(["not-a-zip"], { type: "application/octet-stream" });
    const result = await getOfficeThumbnail(blob);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Could not extract preview");
  });

  it("returns error when no thumbnail found in zip", async () => {
    const JSZip = await import("jszip");
    const zip = new JSZip.default();
    zip.file("word/document.xml", "<xml>content</xml>");
    const blob = await zip.generateAsync({ type: "blob" });

    const result = await getOfficeThumbnail(blob);
    expect(result.success).toBe(false);
    expect(result.error).toBe("No preview available");
  });

  it("extracts JPEG thumbnail from docProps/thumbnail.jpeg", async () => {
    const JSZip = await import("jszip");
    const zip = new JSZip.default();
    zip.file("docProps/thumbnail.jpeg", "fake-jpeg-data");
    zip.file("word/document.xml", "<xml>content</xml>");
    const blob = await zip.generateAsync({ type: "blob" });

    const result = await getOfficeThumbnail(blob);
    expect(result.success).toBe(true);
    expect(result.thumbnailUrl).toBeDefined();
    expect(result.thumbnailUrl).toMatch(/^blob:/);
  });

  it("extracts PNG thumbnail from docProps/thumbnail.png", async () => {
    const JSZip = await import("jszip");
    const zip = new JSZip.default();
    zip.file("docProps/thumbnail.png", "fake-png-data");
    const blob = await zip.generateAsync({ type: "blob" });

    const result = await getOfficeThumbnail(blob);
    expect(result.success).toBe(true);
    expect(result.thumbnailUrl).toBeDefined();
  });

  it("skips WMF/EMF thumbnails and tries next path", async () => {
    const JSZip = await import("jszip");
    const zip = new JSZip.default();
    zip.file("docProps/thumbnail.wmf", "fake-wmf-data");
    zip.file("docProps/thumbnail.jpeg", "fake-jpeg-data");
    const blob = await zip.generateAsync({ type: "blob" });

    const result = await getOfficeThumbnail(blob);
    expect(result.success).toBe(true);
    expect(result.thumbnailUrl).toMatch(/^blob:/);
  });

  it("tries jpg extension as well", async () => {
    const JSZip = await import("jszip");
    const zip = new JSZip.default();
    zip.file("docProps/thumbnail.jpg", "fake-jpeg-data");
    const blob = await zip.generateAsync({ type: "blob" });

    const result = await getOfficeThumbnail(blob);
    expect(result.success).toBe(true);
  });
});
