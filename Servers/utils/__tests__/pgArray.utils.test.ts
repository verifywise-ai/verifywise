import { pgTextArray } from "../pgArray.utils";

describe("pgTextArray", () => {
  it("quotes every element", () => {
    expect(pgTextArray(["Operational risk", "Legal risk"])).toBe(
      '{"Operational risk","Legal risk"}',
    );
  });

  it("returns an empty literal for no values", () => {
    expect(pgTextArray([])).toBe("{}");
  });

  it("keeps commas and braces inside their element", () => {
    expect(pgTextArray(["a,b", "{c}"])).toBe('{"a,b","{c}"}');
  });

  it("escapes a backslash before escaping quotes", () => {
    // A trailing backslash left unescaped would escape the closing quote.
    expect(pgTextArray(["ends\\"])).toBe('{"ends\\\\"}');
    expect(pgTextArray(['say "hi"'])).toBe('{"say \\"hi\\""}');
    expect(pgTextArray(['\\"'])).toBe('{"\\\\\\""}');
  });
});
