import { contentDispositionAttachment } from "../contentDisposition.utils";

describe("contentDispositionAttachment", () => {
  it("sends an ASCII filename and an encoded UTF-8 filename*", () => {
    const value = contentDispositionAttachment("Richtlinie_für_KI_2026-03-15.pdf");
    expect(value).toBe(
      `attachment; filename="Richtlinie_fur_KI_2026-03-15.pdf"; filename*=UTF-8''Richtlinie_f%C3%BCr_KI_2026-03-15.pdf`,
    );
    expect(value).toMatch(/^[\x20-\x7e]+$/);
  });

  it("keeps a plain ASCII name unchanged", () => {
    expect(contentDispositionAttachment("Data_Policy_2026-03-15.docx")).toContain(
      'filename="Data_Policy_2026-03-15.docx"',
    );
  });

  it("falls back to a non-empty ASCII name when nothing ASCII is left", () => {
    const value = contentDispositionAttachment("政策.pdf");
    expect(value).toContain('filename="policy.pdf"');
    expect(value).toContain("filename*=UTF-8''%E6%94%BF%E7%AD%96.pdf");
  });

  it("never leaks quotes or header-breaking characters", () => {
    const value = contentDispositionAttachment('a"b\r\nc.pdf');
    expect(value).not.toMatch(/[\r\n]/);
    expect(value.match(/"/g)).toHaveLength(2);
  });

  it("does not throw on a lone surrogate", () => {
    const value = contentDispositionAttachment("a\uD840b.pdf");
    expect(value).toContain("%EF%BF%BD");
    expect(() => contentDispositionAttachment("\uDC00.pdf")).not.toThrow();
  });
});
