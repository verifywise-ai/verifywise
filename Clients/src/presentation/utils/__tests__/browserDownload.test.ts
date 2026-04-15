import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  triggerBrowserDownload,
  extractFilenameFromHeaders,
} from "../browserDownload.utils";

describe("triggerBrowserDownload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an anchor element, clicks it, and cleans up", () => {
    const mockUrl = "blob:http://localhost/fake-id";
    const createObjectURLSpy = vi
      .spyOn(window.URL, "createObjectURL")
      .mockReturnValue(mockUrl);
    const revokeObjectURLSpy = vi
      .spyOn(window.URL, "revokeObjectURL")
      .mockImplementation(() => {});

    const clickSpy = vi.fn();
    const removeSpy = vi.fn();
    const appendChildSpy = vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      // Attach spies to the created anchor
      (node as HTMLAnchorElement).click = clickSpy;
      (node as HTMLAnchorElement).remove = removeSpy;
      return node;
    });

    const blob = new Blob(["test"], { type: "text/plain" });
    triggerBrowserDownload(blob, "test.txt");

    expect(createObjectURLSpy).toHaveBeenCalledWith(blob);
    expect(appendChildSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith(mockUrl);
  });

  it("sets href and download on the anchor", () => {
    const mockUrl = "blob:http://localhost/test";
    vi.spyOn(window.URL, "createObjectURL").mockReturnValue(mockUrl);
    vi.spyOn(window.URL, "revokeObjectURL").mockImplementation(() => {});

    let capturedAnchor: HTMLAnchorElement | null = null;
    vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      capturedAnchor = node as HTMLAnchorElement;
      capturedAnchor.click = vi.fn();
      capturedAnchor.remove = vi.fn();
      return node;
    });

    const blob = new Blob(["data"], { type: "application/pdf" });
    triggerBrowserDownload(blob, "report.pdf");

    expect(capturedAnchor!.href).toBe(mockUrl);
    expect(capturedAnchor!.download).toBe("report.pdf");
  });
});

describe("extractFilenameFromHeaders", () => {
  it("extracts filename from Content-Disposition header", () => {
    const headers = new Headers({
      "Content-Disposition": 'attachment; filename="report.pdf"',
    });
    expect(extractFilenameFromHeaders(headers)).toBe("report.pdf");
  });

  it("returns fallback when Content-Disposition header is missing", () => {
    const headers = new Headers();
    expect(extractFilenameFromHeaders(headers, "default.txt")).toBe("default.txt");
  });

  it("returns 'download' as default fallback", () => {
    const headers = new Headers();
    expect(extractFilenameFromHeaders(headers)).toBe("download");
  });

  it("returns fallback when header has no quoted filename", () => {
    const headers = new Headers({
      "Content-Disposition": "attachment; filename=noQuotes",
    });
    expect(extractFilenameFromHeaders(headers, "fallback.txt")).toBe("fallback.txt");
  });
});
