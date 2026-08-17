import { normalizeSlateHtml } from "../normalizeSlateHtml";

describe("normalizeSlateHtml", () => {
  it("converts slate block divs into their semantic tags", () => {
    const input = '<div data-slate-type="h1" data-block-id="1">Title</div>';
    const result = normalizeSlateHtml(input);
    expect(result).toContain("<h1");
    expect(result).toContain("Title");
  });

  it("converts paragraph slate blocks", () => {
    const input = '<div data-slate-type="p">Hello world</div>';
    const result = normalizeSlateHtml(input);
    expect(result).toContain("<p");
    expect(result).toContain("Hello world");
  });

  it("converts blockquote slate blocks", () => {
    const input = '<div data-slate-type="blockquote">Quoted text</div>';
    const result = normalizeSlateHtml(input);
    expect(result).toContain("<blockquote");
  });

  it("strips the slate-editor wrapper div", () => {
    const input = '<div class="slate-editor" data-x="1"><p>Body</p></div>';
    const result = normalizeSlateHtml(input);
    expect(result).not.toContain('class="slate-editor"');
  });

  it("unwraps data-slate-string spans, keeping their text content", () => {
    const input = '<span data-slate-string="true">plain text</span>';
    const result = normalizeSlateHtml(input);
    expect(result).toBe("plain text");
  });

  it("removes data-slate-leaf spans while keeping following text", () => {
    const input = '<span data-slate-leaf="true">leaf text</span>';
    const result = normalizeSlateHtml(input);
    expect(result).not.toContain("data-slate-leaf");
    expect(result).toContain("leaf text");
  });

  it("removes data-slate-node text spans", () => {
    const input = '<span data-slate-node="text">node text</span>';
    const result = normalizeSlateHtml(input);
    expect(result).not.toContain("data-slate-node");
  });

  it("strips arbitrary data-slate-* attributes", () => {
    const input = '<p data-slate-inline="true" data-slate-void="false">content</p>';
    const result = normalizeSlateHtml(input);
    expect(result).not.toContain("data-slate-inline");
    expect(result).not.toContain("data-slate-void");
  });

  it("strips data-block-id attributes", () => {
    const input = '<p data-block-id="abc123">content</p>';
    const result = normalizeSlateHtml(input);
    expect(result).not.toContain("data-block-id");
  });

  it("strips slate-prefixed class attributes", () => {
    const input = '<p class="slate-paragraph">content</p>';
    const result = normalizeSlateHtml(input);
    expect(result).not.toContain('class="slate-paragraph"');
  });

  it("removes position:relative inline styles", () => {
    const input = '<div style="position: relative;">content</div>';
    const result = normalizeSlateHtml(input);
    expect(result).not.toContain("position:");
  });

  it("removes empty style attributes", () => {
    const input = '<p style="">content</p>';
    const result = normalizeSlateHtml(input);
    expect(result).not.toContain('style=""');
  });

  it("removes empty class attributes", () => {
    const input = '<p class="">content</p>';
    const result = normalizeSlateHtml(input);
    expect(result).not.toContain('class=""');
  });

  it("converts leftover generic divs with text content into paragraphs", () => {
    const input = "<div>Just some text</div>";
    const result = normalizeSlateHtml(input);
    expect(result).toContain("<p>Just some text");
    expect(result).toContain("</p>");
  });

  it("collapses adjacent closing paragraph tags", () => {
    const input = "<p>First</p></p>";
    const result = normalizeSlateHtml(input);
    expect(result).not.toContain("</p></p>");
  });

  it("returns an empty string unchanged", () => {
    expect(normalizeSlateHtml("")).toBe("");
  });

  it("handles a full legacy slate document end to end", () => {
    const input =
      '<div class="slate-editor"><div data-slate-type="h1" data-block-id="1"><span data-slate-string="true">Heading</span></div><div data-slate-type="p" data-block-id="2"><span data-slate-leaf="true"><span data-slate-node="text">Body text</span></span></div></div>';
    const result = normalizeSlateHtml(input);
    expect(result).toContain("<h1");
    expect(result).toContain("Heading");
    expect(result).toContain("<p");
    expect(result).toContain("Body text");
    expect(result).not.toContain("data-slate");
    expect(result).not.toContain("slate-editor");
  });
});
