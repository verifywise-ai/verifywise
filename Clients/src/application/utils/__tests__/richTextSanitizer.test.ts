import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  sanitizeRichText,
  useRichTextSanitizer,
  RICH_TEXT_ALLOWED_TAGS,
  RICH_TEXT_ALLOWED_ATTR,
} from "../richTextSanitizer";

describe("richTextSanitizer", () => {
  describe("sanitizeRichText", () => {
    it("returns empty string for empty input", () => {
      expect(sanitizeRichText("")).toBe("");
    });

    it("strips script tags and their contents", () => {
      const dirty = `<p>Hello</p><script>alert('xss')</script>`;
      expect(sanitizeRichText(dirty)).toBe("<p>Hello</p>");
    });

    it("strips inline event handlers", () => {
      const dirty = `<img src="x" onerror="alert(1)" alt="bad">`;
      const result = sanitizeRichText(dirty);
      expect(result).not.toContain("onerror");
      expect(result).not.toContain("alert");
    });

    it("blocks javascript: URIs", () => {
      const dirty = `<a href="javascript:alert(1)">click</a>`;
      const result = sanitizeRichText(dirty);
      expect(result).not.toContain("javascript:");
    });

    it("blocks data: URIs", () => {
      const dirty = `<img src="data:image/svg+xml,<svg onload='alert(1)'/>" alt="x">`;
      const result = sanitizeRichText(dirty);
      expect(result).not.toContain("data:");
      expect(result).not.toContain("alert");
    });

    it("strips forbidden tags (iframe, object, embed, form, input, button)", () => {
      const dirty =
        `<iframe src="https://evil.example/"></iframe>` +
        `<object data="evil.swf"></object>` +
        `<embed src="evil.swf">` +
        `<form><input type="text"><button>go</button></form>`;
      const result = sanitizeRichText(dirty);
      expect(result).not.toContain("<iframe");
      expect(result).not.toContain("<object");
      expect(result).not.toContain("<embed");
      expect(result).not.toContain("<form");
      expect(result).not.toContain("<input");
      expect(result).not.toContain("<button");
    });

    it("strips style tags", () => {
      const dirty = `<style>body{background:url(javascript:alert(1))}</style><p>ok</p>`;
      const result = sanitizeRichText(dirty);
      expect(result).not.toContain("<style");
      expect(result).toContain("<p>ok</p>");
    });

    it("strips SVG tags", () => {
      const dirty = `<svg onload="alert(1)"><rect width="100" height="100"/></svg>`;
      const result = sanitizeRichText(dirty);
      expect(result).not.toContain("<svg");
      expect(result).not.toContain("onload");
    });

    it("strips arbitrary style properties", () => {
      const dirty = `<p style="position:absolute; color:#ff0000;">x</p>`;
      const result = sanitizeRichText(dirty);
      expect(result).not.toContain("position");
      expect(result).toMatch(/style="[^"]*color:/);
    });

    it("preserves safe formatting tags", () => {
      const clean = `<p><strong>bold</strong> <em>italic</em> <u>under</u> <s>strike</s></p>`;
      expect(sanitizeRichText(clean)).toBe(clean);
    });

    it("preserves headings and links", () => {
      const clean = `<h1>A</h1><h2>B</h2><a href="https://example.com" target="_blank" rel="noopener">link</a>`;
      expect(sanitizeRichText(clean)).toBe(clean);
    });

    it("preserves allowlisted inline styles", () => {
      const clean = `<p style="text-align:center; color:#ff0000; background-color:#00ff00;">x</p>`;
      const result = sanitizeRichText(clean);
      expect(result).toContain("text-align:center");
      expect(result).toMatch(/color:\s*(?:#ff0000|rgb\(255,\s*0,\s*0\))/);
      expect(result).toMatch(/background-color:\s*(?:#00ff00|rgb\(0,\s*255,\s*0\))/);
    });

    it("preserves tables with colspan and rowspan", () => {
      const clean =
        `<table><thead><tr><th colspan="2">Header</th></tr></thead>` +
        `<tbody><tr><td rowspan="2">A</td><td>B</td></tr></tbody></table>`;
      expect(sanitizeRichText(clean)).toBe(clean);
    });

    it("preserves TipTap task-list markup", () => {
      const clean = `<ul data-type="taskList"><li data-checked="true">Done task</li></ul>`;
      expect(sanitizeRichText(clean)).toBe(clean);
    });
  });

  describe("allowlist constants", () => {
    it("includes expected tags", () => {
      expect(RICH_TEXT_ALLOWED_TAGS).toContain("p");
      expect(RICH_TEXT_ALLOWED_TAGS).toContain("a");
      expect(RICH_TEXT_ALLOWED_TAGS).toContain("img");
      expect(RICH_TEXT_ALLOWED_TAGS).toContain("table");
      expect(RICH_TEXT_ALLOWED_TAGS).not.toContain("script");
      expect(RICH_TEXT_ALLOWED_TAGS).not.toContain("iframe");
    });

    it("includes expected attributes", () => {
      expect(RICH_TEXT_ALLOWED_ATTR).toContain("href");
      expect(RICH_TEXT_ALLOWED_ATTR).toContain("src");
      expect(RICH_TEXT_ALLOWED_ATTR).toContain("data-checked");
      expect(RICH_TEXT_ALLOWED_ATTR).not.toContain("onerror");
    });
  });

  describe("useRichTextSanitizer", () => {
    it("reports wasStripped=true when dangerous content is removed", () => {
      const dirty = `<p>safe</p><script>alert(1)</script>`;
      const { result } = renderHook(() => useRichTextSanitizer(dirty));
      expect(result.current.sanitizedHtml).toBe("<p>safe</p>");
      expect(result.current.wasStripped).toBe(true);
    });

    it("reports wasStripped=false for clean content", () => {
      const clean = `<p><strong>bold</strong> <a href="https://example.com">link</a></p>`;
      const { result } = renderHook(() => useRichTextSanitizer(clean));
      expect(result.current.sanitizedHtml).toBe(clean);
      expect(result.current.wasStripped).toBe(false);
    });
  });
});
