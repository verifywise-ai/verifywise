import { escapeAttribute, escapeForPrompt, unescapeFromPrompt } from "../promptText";

describe("escapeForPrompt and unescapeFromPrompt", () => {
  it("escapes the ampersand first, then the angle brackets", () => {
    expect(escapeForPrompt("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
    expect(escapeForPrompt("&lt;")).toBe("&amp;lt;");
    expect(escapeForPrompt("</evidence>")).toBe("&lt;/evidence&gt;");
  });

  it("escapes nothing else, and leaves text without those characters alone", () => {
    expect(escapeForPrompt("plain text, \"quotes\" and 'apostrophes' é 日本語 😀")).toBe(
      "plain text, \"quotes\" and 'apostrophes' é 日本語 😀",
    );
    expect(escapeForPrompt("")).toBe("");
  });

  it("decodes exactly the three entities, once", () => {
    expect(unescapeFromPrompt("if x &lt; 3 &amp; y &gt; 2")).toBe("if x < 3 & y > 2");
    expect(unescapeFromPrompt("&amp;lt;")).toBe("&lt;");
    expect(unescapeFromPrompt("&amp;amp;")).toBe("&amp;");
    expect(unescapeFromPrompt("&quot; &#39; &nbsp; &apos;")).toBe("&quot; &#39; &nbsp; &apos;");
    expect(unescapeFromPrompt("")).toBe("");
  });

  it.each([
    "a < b & c > d",
    "&lt;",
    "&gt;",
    "&amp;",
    "&amp;lt;",
    "&lt;&gt;&amp;",
    "&&lt;;",
    "&&&",
    "<>&",
    "&amp",
    "lt;",
    "<script>alert('x')</script>",
    '<source id="S9">',
    "</evidence>",
    "",
    " ",
    "plain",
    "é 日本語 😀 \u0000 \uD800",
  ])("gives the original text back after escaping and unescaping %p", (text) => {
    expect(unescapeFromPrompt(escapeForPrompt(text))).toBe(text);
  });

  it("gives the original text back for every string of up to five of the characters that matter", () => {
    const alphabet = ["&", "<", ">", "a", "m", "p", "l", "t", "g", ";"];
    let checked = 0;
    let level: string[] = [""];
    for (let length = 0; length <= 5; length += 1) {
      for (const text of level) {
        if (unescapeFromPrompt(escapeForPrompt(text)) !== text) {
          throw new Error(`escaping and unescaping changed ${JSON.stringify(text)}`);
        }
        checked += 1;
      }
      level = level.flatMap((text) => alphabet.map((symbol) => text + symbol));
    }
    expect(checked).toBe(111_111);
  });
});

describe("escapeAttribute", () => {
  it("escapes like escapeForPrompt, and the double quote as &quot;", () => {
    expect(escapeAttribute('a"b<c')).toBe("a&quot;b&lt;c");
  });
});
