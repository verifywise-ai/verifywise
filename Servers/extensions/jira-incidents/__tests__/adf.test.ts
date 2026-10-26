import { adfToText, buildIncidentDescription } from "../adf";

const doc = (...content: unknown[]) => ({ type: "doc", version: 1, content });
const p = (...content: unknown[]) => ({ type: "paragraph", content });
const text = (t: string) => ({ type: "text", text: t });

describe("adfToText", () => {
  it("joins paragraphs with blank lines", () => {
    expect(adfToText(doc(p(text("One")), p(text("Two"))))).toBe("One\n\nTwo");
  });
  it("renders headings, bullet and ordered lists, code and mentions", () => {
    const value = doc(
      { type: "heading", attrs: { level: 2 }, content: [text("Impact")] },
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [p(text("a"))] },
          { type: "listItem", content: [p(text("b"))] },
        ],
      },
      { type: "orderedList", content: [{ type: "listItem", content: [p(text("first"))] }] },
      { type: "codeBlock", content: [text("x = 1")] },
      p(
        text("ping "),
        { type: "mention", attrs: { text: "@Ada" } },
        { type: "hardBreak" },
        text("bye"),
      ),
    );
    expect(adfToText(value)).toBe("Impact\n\n- a\n- b\n\n1. first\n\nx = 1\n\nping @Ada\nbye");
  });
  it("returns empty text for null, a plain string description or an empty doc", () => {
    expect(adfToText(null)).toBe("");
    expect(adfToText(doc())).toBe("");
    expect(adfToText("legacy text")).toBe("legacy text");
  });
});

describe("buildIncidentDescription", () => {
  it("puts the summary first, then a blank line and the body", () => {
    expect(buildIncidentDescription("Bot leaked data", doc(p(text("Body"))), "SEC-1")).toBe(
      "Bot leaked data\n\nBody",
    );
  });
  it("uses the summary alone when the body is empty", () => {
    expect(buildIncidentDescription("Bot leaked data", null, "SEC-1")).toBe("Bot leaked data");
  });
  it("pads a result shorter than 5 characters with the issue key", () => {
    expect(buildIncidentDescription("Bug", null, "SEC-42")).toBe("Bug (SEC-42)");
    expect(buildIncidentDescription("", null, "SEC-42")).toBe("SEC-42");
  });
  it("cuts to 32,767 characters", () => {
    const out = buildIncidentDescription("S", doc(p(text("x".repeat(40000)))), "SEC-1");
    expect(out).toHaveLength(32767);
  });
});
