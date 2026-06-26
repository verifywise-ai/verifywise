import { describe, expect, it } from "@jest/globals";
import { sanitizeUserHtml } from "../sanitizeUserHtml";

describe("sanitizeUserHtml", () => {
  describe("null / undefined / non-string handling", () => {
    it("returns null unchanged", () => {
      expect(sanitizeUserHtml(null)).toBeNull();
    });

    it("returns undefined unchanged", () => {
      expect(sanitizeUserHtml(undefined)).toBeUndefined();
    });

    it("returns empty string unchanged", () => {
      expect(sanitizeUserHtml("")).toBe("");
    });

    it("coerces numbers to a sanitized string", () => {
      expect(sanitizeUserHtml(42)).toBe("42");
    });
  });

  describe("XSS vector stripping", () => {
    it("strips <script> tags and their contents", () => {
      const dirty = `<p>Hello</p><script>alert('xss')</script>`;
      expect(sanitizeUserHtml(dirty)).toBe(`<p>Hello</p>`);
    });

    it("strips inline event handlers like onerror", () => {
      const dirty = `<img src="x" onerror="alert(1)" alt="bad">`;
      const result = sanitizeUserHtml(dirty)!;
      expect(result).not.toContain("onerror");
      expect(result).not.toContain("alert");
    });

    it("strips onclick handlers on anchors", () => {
      const dirty = `<a href="https://example.com" onclick="alert('x')">click</a>`;
      const result = sanitizeUserHtml(dirty)!;
      expect(result).not.toContain("onclick");
      expect(result).toContain(`href="https://example.com"`);
    });

    it("blocks javascript: URIs on anchors", () => {
      const dirty = `<a href="javascript:alert('x')">click</a>`;
      const result = sanitizeUserHtml(dirty)!;
      expect(result).not.toContain("javascript:");
    });

    it("blocks data: URIs on images (which can carry executable SVG payloads)", () => {
      const dirty = `<img src="data:image/svg+xml,<svg onload='alert(1)'/>" alt="x">`;
      const result = sanitizeUserHtml(dirty)!;
      expect(result).not.toContain("data:");
      expect(result).not.toContain("alert");
    });

    it("strips <iframe> entirely", () => {
      const dirty = `<p>before</p><iframe src="https://evil.example/"></iframe><p>after</p>`;
      const result = sanitizeUserHtml(dirty)!;
      expect(result).not.toContain("<iframe");
      expect(result).toContain("<p>before</p>");
      expect(result).toContain("<p>after</p>");
    });

    it("strips <object> and <embed> tags", () => {
      const dirty = `<object data="evil.swf"></object><embed src="evil.swf">`;
      const result = sanitizeUserHtml(dirty)!;
      expect(result).not.toContain("<object");
      expect(result).not.toContain("<embed");
    });

    it("strips <style> tags (CSS expressions are an old IE XSS vector)", () => {
      const dirty = `<style>body{background:url(javascript:alert(1))}</style><p>ok</p>`;
      const result = sanitizeUserHtml(dirty)!;
      expect(result).not.toContain("<style");
      expect(result).not.toContain("javascript:");
    });
  });

  describe("safe content preservation", () => {
    it("preserves allowlisted formatting tags", () => {
      const clean = `<p><strong>bold</strong> <em>italic</em> <u>under</u> <s>strike</s></p>`;
      expect(sanitizeUserHtml(clean)).toBe(clean);
    });

    it("preserves headings h1-h3 (per the allowlist)", () => {
      const clean = `<h1>A</h1><h2>B</h2><h3>C</h3>`;
      expect(sanitizeUserHtml(clean)).toBe(clean);
    });

    it("preserves anchors with safe http(s) URLs", () => {
      const clean = `<a href="https://verifywise.ai">link</a>`;
      expect(sanitizeUserHtml(clean)).toBe(clean);
    });

    it("preserves images with safe http(s) URLs and allowlisted attrs", () => {
      const clean = `<img src="https://cdn.example/x.png" alt="logo" width="100" height="50" />`;
      const result = sanitizeUserHtml(clean)!;
      expect(result).toContain(`src="https://cdn.example/x.png"`);
      expect(result).toContain(`alt="logo"`);
      expect(result).toContain(`width="100"`);
      expect(result).toContain(`height="50"`);
    });

    it("preserves images with blob: URLs (used for previews)", () => {
      const clean = `<img src="blob:https://app.example/abc123" alt="preview">`;
      const result = sanitizeUserHtml(clean)!;
      expect(result).toContain("blob:");
    });

    it("preserves plain text without tags untouched", () => {
      expect(sanitizeUserHtml("just a sentence")).toBe("just a sentence");
    });
  });

  describe("idempotency", () => {
    it("running the sanitizer twice produces the same output", () => {
      const dirty = `<p>hi <script>alert(1)</script></p><a href="javascript:1">x</a>`;
      const once = sanitizeUserHtml(dirty);
      const twice = sanitizeUserHtml(once);
      expect(twice).toBe(once);
    });
  });
});
