import { describe, expect, it } from "@jest/globals";
import { sanitizeUserHtml } from "../sanitization.utils";

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

    it("strips onmouseover handlers", () => {
      const dirty = `<p onmouseover="alert(1)">hover me</p>`;
      const result = sanitizeUserHtml(dirty)!;
      expect(result).not.toContain("onmouseover");
      expect(result).toContain("hover me");
    });

    it("blocks javascript: URIs on anchors", () => {
      const dirty = `<a href="javascript:alert('x')">click</a>`;
      const result = sanitizeUserHtml(dirty)!;
      expect(result).not.toContain("javascript:");
    });

    it("blocks vbscript: URIs on anchors", () => {
      const dirty = `<a href="vbscript:msgbox(1)">click</a>`;
      const result = sanitizeUserHtml(dirty)!;
      expect(result).not.toContain("vbscript:");
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

    it("strips iframe srcdoc payloads", () => {
      const dirty = `<iframe srcdoc="<script>alert(1)</script>"></iframe>`;
      const result = sanitizeUserHtml(dirty)!;
      expect(result).not.toContain("<iframe");
      expect(result).not.toContain("srcdoc");
      expect(result).not.toContain("alert");
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

    it("strips SVG tags with onload handlers", () => {
      const dirty = `<svg onload="alert(1)"><rect width="100" height="100"/></svg>`;
      const result = sanitizeUserHtml(dirty)!;
      expect(result).not.toContain("<svg");
      expect(result).not.toContain("onload");
      expect(result).not.toContain("alert");
    });

    it("strips form and input elements", () => {
      const dirty = `<form action="/evil"><input type="text" name="x"><button>go</button></form>`;
      const result = sanitizeUserHtml(dirty)!;
      expect(result).not.toContain("<form");
      expect(result).not.toContain("<input");
      expect(result).not.toContain("<button");
    });

    it("strips <base> and <meta> tags", () => {
      const dirty = `<base href="https://evil.example/"><meta http-equiv="refresh" content="0;url=javascript:alert(1)"><p>ok</p>`;
      const result = sanitizeUserHtml(dirty)!;
      expect(result).not.toContain("<base");
      expect(result).not.toContain("<meta");
      expect(result).not.toContain("javascript:");
      expect(result).toContain("<p>ok</p>");
    });

    it("strips arbitrary style properties that could be used for XSS", () => {
      const dirty = `<p style="behavior:url(javascript:alert(1)); position:absolute;">x</p>`;
      const result = sanitizeUserHtml(dirty)!;
      expect(result).not.toContain("behavior");
      expect(result).not.toContain("javascript:");
      expect(result).toBe("<p>x</p>");
    });
  });

  describe("safe content preservation", () => {
    it("preserves allowlisted formatting tags", () => {
      const clean = `<p><strong>bold</strong> <em>italic</em> <u>under</u> <s>strike</s></p>`;
      expect(sanitizeUserHtml(clean)).toBe(clean);
    });

    it("preserves headings h1-h6", () => {
      const clean = `<h1>A</h1><h2>B</h2><h3>C</h3><h4>D</h4><h5>E</h5><h6>F</h6>`;
      expect(sanitizeUserHtml(clean)).toBe(clean);
    });

    it("preserves anchors with safe http(s) URLs", () => {
      const clean = `<a href="https://verifywise.ai">link</a>`;
      expect(sanitizeUserHtml(clean)).toBe(clean);
    });

    it("preserves anchors with mailto and tel URLs", () => {
      const clean = `<a href="mailto:test@example.com">email</a><a href="tel:+1234567890">call</a>`;
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

    it("preserves tables with colspan and rowspan", () => {
      const clean =
        `<table><thead><tr><th colspan="2">Header</th></tr></thead>` +
        `<tbody><tr><td rowspan="2">A</td><td>B</td></tr></tbody></table>`;
      expect(sanitizeUserHtml(clean)).toBe(clean);
    });

    it("preserves TipTap task-list markup", () => {
      const clean = `<ul data-type="taskList"><li data-checked="true">Done task</li></ul>`;
      expect(sanitizeUserHtml(clean)).toBe(clean);
    });

    it("preserves text-align style", () => {
      const clean = `<p style="text-align:center;">centered</p>`;
      expect(sanitizeUserHtml(clean)).toBe(`<p style="text-align:center">centered</p>`);
    });

    it("preserves color and background-color styles", () => {
      const clean =
        `<p style="color:#ff0000;">red</p>` + `<p style="background-color:rgb(0,128,0);">green</p>`;
      const expected =
        `<p style="color:#ff0000">red</p>` + `<p style="background-color:rgb(0,128,0)">green</p>`;
      expect(sanitizeUserHtml(clean)).toBe(expected);
    });

    it("preserves code blocks and blockquotes", () => {
      const clean = `<pre><code>const x = 1;</code></pre><blockquote><p>quote</p></blockquote>`;
      expect(sanitizeUserHtml(clean)).toBe(clean);
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

  describe("stripping detection", () => {
    it("returns different output when dangerous content is stripped", () => {
      const dirty = `<p>safe</p><script>alert(1)</script>`;
      const sanitized = sanitizeUserHtml(dirty);
      expect(sanitized).not.toBe(dirty);
      expect(sanitized).toBe("<p>safe</p>");
    });

    it("returns identical output for already-clean content", () => {
      const clean = `<p><strong>bold</strong> <a href="https://example.com">link</a></p>`;
      expect(sanitizeUserHtml(clean)).toBe(clean);
    });
  });
});
