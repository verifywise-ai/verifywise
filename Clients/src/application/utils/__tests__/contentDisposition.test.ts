import { describe, expect, it } from "vitest";
import { filenameFromContentDisposition } from "../contentDisposition";

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
