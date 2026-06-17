import { describe, it, expect } from "@jest/globals";
import {
  sanitizeUserHtml,
  SANITIZE_DEFAULT_ALLOWED_TAGS,
  SANITIZE_DEFAULT_ALLOWED_SCHEMES,
} from "../sanitizeUserHtml.utils";

describe("sanitizeUserHtml", () => {
  describe("pass-through cases", () => {
    it("returns null when input is null", () => {
      expect(sanitizeUserHtml(null)).toBeNull();
    });

    it("returns undefined when input is undefined", () => {
      expect(sanitizeUserHtml(undefined)).toBeUndefined();
    });

    it("returns the input unchanged when there is no HTML", () => {
      expect(sanitizeUserHtml("plain text")).toBe("plain text");
    });

    it("returns the empty string for non-string inputs", () => {
      // @ts-expect-error — exercising the runtime defence
      expect(sanitizeUserHtml(42)).toBe("");
      // @ts-expect-error
      expect(sanitizeUserHtml({})).toBe("");
    });
  });

  describe("script / event-handler stripping", () => {
    it("strips <script> tags entirely", () => {
      const result = sanitizeUserHtml(
        "<p>hello</p><script>alert('xss')</script><p>world</p>",
      );
      expect(result).toBe("<p>hello</p><p>world</p>");
    });

    it("strips inline event handlers like onclick / onerror", () => {
      const result = sanitizeUserHtml(`<p onclick="alert('xss')">click me</p>`);
      expect(result).toBe("<p>click me</p>");
    });

    it("strips <img onerror> entirely when images are not allowed", () => {
      const result = sanitizeUserHtml(`<img src="x" onerror="alert('xss')" />`);
      expect(result).toBe("");
    });

    it("strips onerror from images even when images are allowed", () => {
      const result = sanitizeUserHtml(
        `<img src="https://example.com/a.png" onerror="alert('xss')" />`,
        { allowImages: true },
      );
      expect(result).toContain(`src="https://example.com/a.png"`);
      expect(result).not.toContain("onerror");
    });

    it("strips <style> tags entirely", () => {
      const result = sanitizeUserHtml(`<p>x</p><style>body{display:none}</style>`);
      expect(result).toBe("<p>x</p>");
    });

    it("drops <iframe> tags", () => {
      const result = sanitizeUserHtml(
        `<p>safe</p><iframe src="https://evil.example"></iframe>`,
      );
      expect(result).toBe("<p>safe</p>");
    });
  });

  describe("URI scheme filtering", () => {
    it("strips javascript: hrefs", () => {
      const result = sanitizeUserHtml(`<a href="javascript:alert(1)">click</a>`);
      expect(result).not.toContain("javascript:");
      // Anchor remains but with the href removed.
      expect(result).toContain("click");
    });

    it("strips data: URIs from links by default", () => {
      const result = sanitizeUserHtml(
        `<a href="data:text/html,<script>alert(1)</script>">x</a>`,
      );
      expect(result).not.toContain("data:");
    });

    it("strips data: src attributes from images when images are allowed", () => {
      const result = sanitizeUserHtml(
        `<img src="data:image/png;base64,iVBORw0KGgo=" />`,
        { allowImages: true },
      );
      expect(result).not.toContain("data:image");
    });

    it("preserves http(s) and mailto links", () => {
      expect(sanitizeUserHtml(`<a href="https://x.com">x</a>`)).toContain(
        `href="https://x.com"`,
      );
      expect(sanitizeUserHtml(`<a href="mailto:a@b.co">m</a>`)).toContain(
        `href="mailto:a@b.co"`,
      );
    });

    it("respects a caller-supplied allowedSchemes override", () => {
      const result = sanitizeUserHtml(`<a href="ftp://x.com">x</a>`, {
        allowedSchemes: ["http", "https", "ftp"],
      });
      expect(result).toContain(`href="ftp://x.com"`);
    });
  });

  describe("formatting preservation", () => {
    it("preserves bold / italic / strikethrough", () => {
      const html = "<p><strong>bold</strong> <em>em</em> <s>s</s></p>";
      expect(sanitizeUserHtml(html)).toBe(html);
    });

    it("preserves headings up to h6", () => {
      const html = "<h1>a</h1><h2>b</h2><h3>c</h3><h4>d</h4><h5>e</h5><h6>f</h6>";
      expect(sanitizeUserHtml(html)).toBe(html);
    });

    it("preserves ordered / unordered lists", () => {
      const html = "<ul><li>a</li></ul><ol><li>b</li></ol>";
      expect(sanitizeUserHtml(html)).toBe(html);
    });

    it("preserves <code> and <pre>", () => {
      const html = "<pre><code>const x = 1;</code></pre>";
      expect(sanitizeUserHtml(html)).toBe(html);
    });

    it("preserves table markup", () => {
      const html =
        "<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>c</td></tr></tbody></table>";
      expect(sanitizeUserHtml(html)).toBe(html);
    });

    it("preserves blockquote and hr", () => {
      const html = "<blockquote>q</blockquote><hr />";
      expect(sanitizeUserHtml(html)).toBe(html);
    });
  });

  describe("link hardening", () => {
    it('always adds rel="noopener noreferrer" to anchors', () => {
      const result = sanitizeUserHtml(
        `<a href="https://x.com" target="_blank">x</a>`,
      );
      expect(result).toContain(`rel="noopener noreferrer"`);
    });

    it('overrides existing rel="opener" to noopener noreferrer', () => {
      const result = sanitizeUserHtml(
        `<a href="https://x.com" rel="opener">x</a>`,
      );
      expect(result).toContain(`rel="noopener noreferrer"`);
    });
  });

  describe("image handling", () => {
    it("strips <img> tags by default", () => {
      expect(sanitizeUserHtml(`<img src="https://x.com/a.png" />`)).toBe("");
    });

    it("preserves <img src/alt/width/height> when allowImages is true", () => {
      const result = sanitizeUserHtml(
        `<img src="https://x.com/a.png" alt="cap" width="100" height="50" />`,
        { allowImages: true },
      );
      expect(result).toContain(`src="https://x.com/a.png"`);
      expect(result).toContain(`alt="cap"`);
      expect(result).toContain(`width="100"`);
      expect(result).toContain(`height="50"`);
    });
  });

  describe("misc", () => {
    it("strips unknown / disallowed tags but keeps their text content", () => {
      const result = sanitizeUserHtml(
        "<custom-tag>hello</custom-tag><marquee>world</marquee>",
      );
      expect(result).toBe("helloworld");
    });

    it("supports adding extra allowed tags via extraAllowedTags", () => {
      const result = sanitizeUserHtml("<custom>hi</custom>", {
        extraAllowedTags: ["custom"],
      });
      expect(result).toBe("<custom>hi</custom>");
    });

    it("returns empty string for empty input", () => {
      expect(sanitizeUserHtml("")).toBe("");
    });
  });

  describe("introspection exports", () => {
    it("exports the default allowed-tags list", () => {
      expect(SANITIZE_DEFAULT_ALLOWED_TAGS).toContain("p");
      expect(SANITIZE_DEFAULT_ALLOWED_TAGS).toContain("a");
      expect(SANITIZE_DEFAULT_ALLOWED_TAGS).not.toContain("script");
      expect(SANITIZE_DEFAULT_ALLOWED_TAGS).not.toContain("iframe");
    });

    it("exports the default allowed-schemes list without data:", () => {
      expect(SANITIZE_DEFAULT_ALLOWED_SCHEMES).toEqual(["http", "https", "mailto"]);
    });
  });
});
