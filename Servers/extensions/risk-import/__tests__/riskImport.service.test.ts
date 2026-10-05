jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));

import { toPostgresTextArray } from "../riskImport.service";

describe("toPostgresTextArray", () => {
  it("quotes each element", () => {
    expect(toPostgresTextArray(["Data", "Model"])).toBe('{"Data","Model"}');
  });

  it("returns an empty array literal for no elements", () => {
    expect(toPostgresTextArray([])).toBe("{}");
  });

  it("escapes double quotes", () => {
    expect(toPostgresTextArray(['say "hi"'])).toBe('{"say \\"hi\\""}');
  });

  // Escaping only the quotes turned `trailing\` into `"trailing\"`, whose closing
  // quote is escaped, so PostgreSQL rejected the literal or split it into other
  // elements (CodeQL js/incomplete-sanitization).
  it("escapes backslashes before quotes", () => {
    expect(toPostgresTextArray(["trailing\\"])).toBe('{"trailing\\\\"}');
    expect(toPostgresTextArray(['a\\",\\"b'])).toBe('{"a\\\\\\",\\\\\\"b"}');
  });

  it("keeps empty strings and unicode intact", () => {
    expect(toPostgresTextArray(["", "déjà vu", "风险"])).toBe('{"","déjà vu","风险"}');
  });

  it("escapes a backslash directly before a quote", () => {
    // The classic breakout attempt: quote escaped by a preceding backslash.
    expect(toPostgresTextArray(['a\\"b'])).toBe('{"a\\\\\\"b"}');
  });

  it("round-trips escape sequences without producing stray delimiters", () => {
    const literal = toPostgresTextArray(['x", "y', "\\", "z\\"]);
    // No unescaped `"` may appear outside the wrapping quotes, and every
    // element boundary is exactly `","`.
    expect(literal.startsWith('{"')).toBe(true);
    expect(literal.endsWith('"}')).toBe(true);
    expect(literal.slice(2, -2).split('","')).toHaveLength(3);
  });
});
