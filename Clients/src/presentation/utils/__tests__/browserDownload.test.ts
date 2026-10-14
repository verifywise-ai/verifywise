import { describe, it, expect, vi, beforeEach } from "vitest";
import { triggerBrowserDownload, filenameFromContentDisposition } from "../browserDownload.utils";

describe("triggerBrowserDownload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an anchor element, clicks it, and cleans up", () => {
    const mockUrl = "blob:http://localhost/fake-id";
    const createObjectURLSpy = vi.spyOn(window.URL, "createObjectURL").mockReturnValue(mockUrl);
    const revokeObjectURLSpy = vi.spyOn(window.URL, "revokeObjectURL").mockImplementation(() => {});

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

describe("filenameFromContentDisposition", () => {
  it("reads a quoted filename", () => {
    expect(
      filenameFromContentDisposition('attachment; filename="audit-ledger-2026-10-11.csv"', "x"),
    ).toBe("audit-ledger-2026-10-11.csv");
  });

  it("reads an unquoted filename", () => {
    expect(filenameFromContentDisposition("attachment; filename=report.docx", "x")).toBe(
      "report.docx",
    );
  });

  it("prefers an RFC 5987 encoded filename", () => {
    expect(
      filenameFromContentDisposition(
        "attachment; filename=\"r.csv\"; filename*=UTF-8''r%C3%A9sum%C3%A9.csv",
        "x",
      ),
    ).toBe("résumé.csv");
  });

  it("returns the fallback when the header is missing or has no filename", () => {
    expect(filenameFromContentDisposition(undefined, "fallback.csv")).toBe("fallback.csv");
    expect(filenameFromContentDisposition("attachment", "fallback.csv")).toBe("fallback.csv");
  });
});
