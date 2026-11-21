import { escapeHtml } from "../sanitization.utils";

describe("escapeHtml", () => {
  it("escapes the five characters that open or close markup, in text and in a quoted attribute", () => {
    expect(escapeHtml("<b>x</b> & \"y\" 'z'")).toBe(
      "&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot; &#39;z&#39;",
    );
  });

  it("leaves text without those characters as it is", () => {
    expect(escapeHtml("Quarterly vendor review, 2026 (ISO 27001) – done")).toBe(
      "Quarterly vendor review, 2026 (ISO 27001) – done",
    );
    expect(escapeHtml("")).toBe("");
  });

  it("escapes the ampersand first, so the entities it writes are not escaped again", () => {
    expect(escapeHtml("A & B")).toBe("A &amp; B");
    // Text that already looks like an entity is text: it is shown as typed.
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("turns markup into text that an HTML parser shows as typed", () => {
    const escaped = escapeHtml('<img src=x onerror="alert(1)">');

    expect(escaped).not.toContain("<");
    expect(escaped).not.toContain(">");
    expect(escaped).not.toContain('"');
  });

  it("escapes every occurrence, not only the first", () => {
    expect(escapeHtml("<<>>&&\"\"''")).toBe("&lt;&lt;&gt;&gt;&amp;&amp;&quot;&quot;&#39;&#39;");
  });

  it("gives text for a value that is not a string, and nothing for a missing one, instead of throwing", () => {
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(42)).toBe("42");
  });
});
