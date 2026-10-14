import { FORBIDDEN_WORDS } from "./vocabulary";

describe("forbidden vocabulary", () => {
  it("pins the five words", () => {
    expect([...FORBIDDEN_WORDS]).toEqual([
      "compliant",
      "certified",
      "passed",
      "bias-free",
      "audited",
    ]);
  });
});
