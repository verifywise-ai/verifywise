jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn(), transaction: jest.fn() } }));

import { toPostgresTextArray } from "../riskImport.service";

describe("toPostgresTextArray", () => {
  it("quotes each element", () => {
    expect(toPostgresTextArray(["Data", "Model"])).toBe('{"Data","Model"}');
  });

  it("escapes double quotes", () => {
    expect(toPostgresTextArray(['say "hi"'])).toBe('{"say \\"hi\\""}');
  });

  // Escaping only the quotes turned `trailing\` into `"trailing\"`, whose closing quote
  // is escaped, so PostgreSQL rejected the literal or split it into other elements.
  it("escapes backslashes before quotes", () => {
    expect(toPostgresTextArray(["trailing\\"])).toBe('{"trailing\\\\"}');
    expect(toPostgresTextArray(['a\\",\\"b'])).toBe('{"a\\\\\\",\\\\\\"b"}');
  });

  it("returns an empty array literal for no elements", () => {
    expect(toPostgresTextArray([])).toBe("{}");
  });
});
