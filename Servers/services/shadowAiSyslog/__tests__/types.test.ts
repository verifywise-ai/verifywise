import { isParserType, PARSER_TYPES } from "../types";

describe("PARSER_TYPES", () => {
  it("lists the four parsers", () => {
    expect(PARSER_TYPES).toEqual(["zscaler", "netskope", "squid", "generic_kv"]);
  });

  it("isParserType accepts exactly those", () => {
    for (const type of PARSER_TYPES) expect(isParserType(type)).toBe(true);
    for (const value of ["", "ZSCALER", "cef", null, undefined, 1]) {
      expect(isParserType(value)).toBe(false);
    }
  });
});
