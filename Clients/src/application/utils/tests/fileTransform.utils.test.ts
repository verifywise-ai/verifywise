import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// IMPORTANT: the mock path must be EXACTLY the same string used in the tested file.
vi.mock("../../../domain/models/Common/file/file.model", () => {
  return {
    FileModel: {
      fromApiData: vi.fn((data: any) => data), // returns the payload itself to facilitate asserts
    },
  };
});

import { FileModel } from "../../../domain/models/Common/file/file.model";
import { transformFileData, transformFilesData } from "../fileTransform.utils";

describe("fileTransform.utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("transformFileData", () => {
    it("maps fields correctly using upload_date and full uploader name", () => {
      const input = {
        id: "123",
        filename: "doc.pdf",
        upload_date: "2026-01-22T12:00:00.000Z",
        uploaded_by: "u1",
        uploader_name: "Walber",
        uploader_surname: "Araujo",
        source: "API",
        project_title: "P1",
        project_id: 99,
        parent_id: "parent",
        sub_id: "sub",
        meta_id: "meta",
        is_evidence: true,
        mimetype: "application/pdf",
        size: 1000,
      };

      const result = transformFileData(input);

      // ensures the model was called with the correct payload
      expect(FileModel.fromApiData).toHaveBeenCalledTimes(1);
      const [payload] = (FileModel.fromApiData as any).mock.calls[0];

      expect(payload).toMatchObject({
        id: "123",
        fileName: "doc.pdf",
        uploader: "u1",
        uploaderName: "Walber Araujo",
        source: "API",
        projectTitle: "P1",
        projectId: "99",
        parentId: "parent",
        subId: "sub",
        metaId: "meta",
        isEvidence: true,
        type: "application/pdf",
        size: 1000,
      });

      // uploadDate needs to be a valid Date and match the ISO
      expect(payload.uploadDate).toBeInstanceOf(Date);
      expect(payload.uploadDate.toISOString()).toBe("2026-01-22T12:00:00.000Z");

      // how the mock returns the payload, we ensure the return is the payload
      expect(result).toEqual(payload);
    });

    it("falls back to uploaded_time when upload_date is missing", () => {
      const input = {
        id: "1",
        filename: "a.txt",
        uploaded_time: "2026-01-20T10:00:00.000Z",
        uploader_name: "OnlyName",
        mimetype: "text/plain",
        size: 10,
      };

      transformFileData(input);

      const [payload] = (FileModel.fromApiData as any).mock.calls[0];
      expect(payload.uploadDate.toISOString()).toBe("2026-01-20T10:00:00.000Z");
      expect(payload.uploaderName).toBe("OnlyName");
    });

    it('sets uploaderName to "Unknown" when both name and surname are missing', () => {
      const input = {
        id: "1",
        filename: "x",
        mimetype: "x",
        size: 1,
      };

      transformFileData(input);

      const [payload] = (FileModel.fromApiData as any).mock.calls[0];
      expect(payload.uploaderName).toBe("Unknown");
    });

    it("uses surname when only uploader_surname exists", () => {
      const input = {
        id: "1",
        filename: "x",
        uploader_surname: "SurnameOnly",
        mimetype: "x",
        size: 1,
      };

      transformFileData(input);

      const [payload] = (FileModel.fromApiData as any).mock.calls[0];
      expect(payload.uploaderName).toBe("SurnameOnly");
    });

    it("applies defaults for missing fields and uses Date() fallback when no upload date", () => {
      // fixes the clock so new Date() is deterministic
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

      const input = {
        // id missing
        // filename missing
        // upload_date missing
        // uploaded_by empty -> becomes "unknown" (because it uses ||)
        uploaded_by: "",
        // source missing -> default "File Manager"
        // project_title missing -> "N/A"
        project_id: null, // -> "0"
        // is_evidence missing -> false
        type: "image/png", // mimetype absent -> uses type
        size: 50,
      };

      transformFileData(input);

      const [payload] = (FileModel.fromApiData as any).mock.calls[0];

      expect(payload.id).toBe("");
      expect(payload.fileName).toBe("Unknown");
      expect(payload.uploader).toBe("unknown");
      expect(payload.source).toBe("File Manager");
      expect(payload.projectTitle).toBe("N/A");
      expect(payload.projectId).toBe("0");
      expect(payload.isEvidence).toBe(false);
      expect(payload.type).toBe("image/png");
      expect(payload.uploadDate.toISOString()).toBe("2026-01-01T00:00:00.000Z");

      vi.useRealTimers();
    });

    it("stringifies project_id when it is 0 (number) and keeps null parent/sub/meta ids", () => {
      const input = {
        id: "1",
        filename: "x",
        project_id: 0, // must become "0"
        parent_id: null,
        sub_id: null,
        meta_id: null,
        mimetype: "x",
        size: 1,
      };

      transformFileData(input);

      const [payload] = (FileModel.fromApiData as any).mock.calls[0];
      expect(payload.projectId).toBe("0");
      expect(payload.parentId).toBeNull();
      expect(payload.subId).toBeNull();
      expect(payload.metaId).toBeNull();
    });
  });

  describe("transformFilesData", () => {
    it("returns [] when input is not an array", () => {
      expect(transformFilesData(undefined as any)).toEqual([]);
      expect(transformFilesData(null as any)).toEqual([]);
      expect(transformFilesData({} as any)).toEqual([]);
      expect(transformFilesData("x" as any)).toEqual([]);
    });

    it("maps each item using transformFileData", () => {
      const files = [
        { id: "1", filename: "a", mimetype: "x", size: 1 },
        { id: "2", filename: "b", mimetype: "y", size: 2 },
      ];

      const result = transformFilesData(files);

      expect(FileModel.fromApiData).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);

      // how the mock returns the payload, we ensure each return corresponds to the called payload
      const firstPayload = (FileModel.fromApiData as any).mock.calls[0][0];
      const secondPayload = (FileModel.fromApiData as any).mock.calls[1][0];

      expect(result[0]).toEqual(firstPayload);
      expect(result[1]).toEqual(secondPayload);
    });
  });
});
