import { createDemographicNormalizer } from "./demographics";

const CATEGORIES = {
  sex: { groups: ["Male", "Female"] },
  race_ethnicity: {
    groups: [
      "Hispanic or Latino",
      "White",
      "Black or African American",
      "Native Hawaiian or Pacific Islander",
      "Asian",
      "Native American or Alaska Native",
      "Two or more races",
    ],
  },
};

const n = () => createDemographicNormalizer(CATEGORIES);

describe("known values", () => {
  it.each([
    ["male", "Male"],
    ["  MALE ", "Male"],
    ["M", "Male"],
    ["man", "Male"],
    ["Female", "Female"],
    ["f", "Female"],
    ["Woman", "Female"],
  ])("reads %s as %s for sex", (raw, want) => {
    expect(n().normalize("sex", raw)).toBe(want);
  });

  it.each([
    ["hispanic", "Hispanic or Latino"],
    ["Latina", "Hispanic or Latino"],
    ["HISPANIC/LATINO", "Hispanic or Latino"],
    ["White", "White"],
    ["caucasian", "White"],
    ["White (Not Hispanic or Latino)", "White"],
    ["white, non-hispanic", "White"],
    ["African American", "Black or African American"],
    ["black", "Black or African American"],
    ["Black (Not Hispanic or Latino)", "Black or African American"],
    ["Native Hawaiian or Other Pacific Islander", "Native Hawaiian or Pacific Islander"],
    ["pacific islander", "Native Hawaiian or Pacific Islander"],
    ["asian", "Asian"],
    ["american indian or alaska native", "Native American or Alaska Native"],
    ["Native American", "Native American or Alaska Native"],
    ["two or more", "Two or more races"],
    ["Multiracial", "Two or more races"],
  ])("reads %s as %s for race and ethnicity", (raw, want) => {
    expect(n().normalize("race_ethnicity", raw)).toBe(want);
  });

  it("collapses inner whitespace", () => {
    expect(n().normalize("race_ethnicity", "Black  or   African American")).toBe(
      "Black or African American",
    );
  });

  it("keeps sex aliases out of the race column", () => {
    expect(n().normalize("race_ethnicity", "M")).toBe("M");
  });
});

describe("no answer", () => {
  it.each([
    "",
    "   ",
    "Prefer not to say",
    "PREFER NOT TO ANSWER",
    "Decline to state",
    "Declined to answer",
    "Unknown",
    "N/A",
    "n/a",
    "NA",
    "none",
    "Not specified",
    "--",
  ])("treats %j as blank", (raw) => {
    expect(n().normalize("sex", raw)).toBe("");
    expect(n().normalize("race_ethnicity", raw)).toBe("");
  });
});

describe("values that match nothing", () => {
  const read = (values: string[]) => {
    const norm = n();
    const records = values.map((v) => ({ sex: norm.normalize("sex", v) }));
    return { records, found: norm.finish(records) };
  };
  const repeat = (value: string, times: number) => Array<string>(times).fill(value);

  it("keeps a label-like value as its own group and reports it with its count", () => {
    const { records, found } = read([...repeat(" Non-binary ", 3), ...repeat("non-BINARY", 2)]);
    expect(records.every((r) => r.sex === "Non-binary")).toBe(true);
    expect(found).toEqual({ sex: { named: [{ value: "Non-binary", count: 5 }], otherRecords: 0 } });
  });

  it("orders named values most frequent first", () => {
    const { found } = read([...repeat("Other", 7), ...repeat("Agender", 5), ...repeat("Xeno", 9)]);
    expect(found.sex.named.map((u) => u.value)).toEqual(["Xeno", "Other", "Agender"]);
  });

  it("reports nothing when every value matched", () => {
    expect(read(["male", ""]).found).toEqual({});
  });

  it.each([
    ["too few records", repeat("Non-binary", 4)],
    ["an email address", repeat("jo@example.com", 10)],
    ["mostly digits", repeat("E10042", 10)],
    ["no letters", repeat("12345", 10)],
    ["too long for a label", repeat("A long free text answer that goes well past a label", 10)],
  ])("does not keep %s: blanks it and counts it", (_why, values) => {
    const { records, found } = read(values);
    expect(records.every((r) => r.sex === "")).toBe(true);
    expect(found).toEqual({ sex: { named: [], otherRecords: values.length } });
  });

  it("does not keep one-off values such as names", () => {
    const { records, found } = read(["Jane Doe", "John Smith", ...repeat("Non-binary", 5)]);
    expect(records.slice(0, 2).map((r) => r.sex)).toEqual(["", ""]);
    expect(JSON.stringify(found)).not.toContain("Jane");
    expect(found.sex).toEqual({ named: [{ value: "Non-binary", count: 5 }], otherRecords: 2 });
  });

  it("leaves a qualifier on its own as an unmatched value", () => {
    const norm = n();
    expect(norm.normalize("race_ethnicity", "Not Hispanic or Latino")).toBe(
      "Not Hispanic or Latino",
    );
  });
});

describe("hostile input", () => {
  const SEPARATOR_RUN = 2_000_000;

  it.each([
    ["trailing", `a${",".repeat(SEPARATOR_RUN)}`],
    ["not reaching the end", `a${"-".repeat(SEPARATOR_RUN)}b`],
    ["spaces", `a${" ".repeat(SEPARATOR_RUN)}b`],
    ["parentheses", "(".repeat(SEPARATOR_RUN)],
  ])("handles a very long value (%s) quickly and keeps none of it", (_name, value) => {
    const norm = n();
    const started = Date.now();
    expect(norm.normalize("race_ethnicity", value)).toBe("");
    expect(Date.now() - started).toBeLessThan(500);
    expect(norm.finish([])).toEqual({ race_ethnicity: { named: [], otherRecords: 1 } });
  });

  it("stays fast on a separator run just under the length cap", () => {
    const norm = n();
    const started = Date.now();
    for (let i = 0; i < 5000; i++) {
      norm.normalize("race_ethnicity", `white${",".repeat(190)}x${i}`);
    }
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("still reads a qualifier with trailing separators", () => {
    expect(n().normalize("race_ethnicity", "White, non-hispanic ,; -")).toBe("White");
  });
});

it("ignores a column that is not a known category", () => {
  expect(n().handles("selected")).toBe(false);
  expect(n().handles("sex")).toBe(true);
  expect(n().normalize("selected", "Maybe")).toBe("Maybe");
});
