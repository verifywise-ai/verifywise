import { JOB_DESCRIPTION_KEY_MAX, jobDescriptionKey, jobDescriptionText } from "./jobDescription";

describe("jobDescriptionKey", () => {
  it("makes one key of titles that differ only in case, spacing and punctuation", () => {
    const keys = [
      "Senior Engineer",
      "  senior   engineer ",
      "SENIOR-ENGINEER",
      "Senior, Engineer.",
    ].map(jobDescriptionKey);
    expect(new Set(keys)).toEqual(new Set(["senior-engineer"]));
  });

  it("keeps letters outside ASCII", () => {
    expect(jobDescriptionKey("Ingénieur Données")).toBe("ingénieur-données");
  });

  it("is null for a title with no letter or digit", () => {
    expect(jobDescriptionKey("")).toBeNull();
    expect(jobDescriptionKey(" — !? ")).toBeNull();
  });

  it("fits the column and never ends on a hyphen", () => {
    const key = jobDescriptionKey(`${"a".repeat(63)} b`)!;
    expect(key).toBe("a".repeat(63));
    expect(Array.from(jobDescriptionKey("word ".repeat(40))!).length).toBeLessThanOrEqual(
      JOB_DESCRIPTION_KEY_MAX,
    );
  });
});

describe("jobDescriptionText", () => {
  it("prints a key as words", () => {
    expect(jobDescriptionText("senior-engineer")).toBe("senior engineer");
  });
});
