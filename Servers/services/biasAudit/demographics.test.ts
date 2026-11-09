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
    expect(n().normalize("race_ethnicity", "M")).toBe("");
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

describe("no-answer forms added by review", () => {
  it.each([
    "Decline to self identify",
    "I don't wish to answer",
    "I don\u2019t wish to answer",
    "I do not wish to disclose",
    "Prefer not to identify",
    "Choose not to disclose",
    "Rather not say",
    "Withheld",
  ])("treats %j as no answer, not as an unrecognized value", (raw) => {
    const norm = n();
    expect(norm.normalize("sex", raw)).toBe("");
    expect(norm.unmatched()).toEqual({});
  });

  it("does not read a bare U as no answer", () => {
    const norm = n();
    expect(norm.normalize("sex", "U")).toBe("");
    expect(norm.unmatched()).toEqual({ sex: { named: [], otherRecords: 1 } });
  });
});

describe("qualifier and Latine forms", () => {
  it.each([
    ["White (Not Hispanic/Latino)", "White"],
    ["White (Non-Hispanic/Latine)", "White"],
    ["Black, not Hispanic or Latine", "Black or African American"],
    ["Asian (Not Latino)", "Asian"],
    ["Latine", "Hispanic or Latino"],
    ["Hispanic/Latine", "Hispanic or Latino"],
    ["Hispanic or Latine", "Hispanic or Latino"],
    ["Latino/a", "Hispanic or Latino"],
  ])("reads %s as %s", (raw, want) => {
    expect(n().normalize("race_ethnicity", raw)).toBe(want);
  });
});

describe("recognized labels outside the category list", () => {
  const read = (key: string, values: string[]) => {
    const norm = n();
    return { got: values.map((v) => norm.normalize(key, v)), found: norm.unmatched() };
  };

  it.each([
    ["non-binary", "Non-binary"],
    ["NonBinary", "Non-binary"],
    ["Genderqueer", "Genderqueer"],
    ["gender fluid", "Gender fluid"],
    ["genderfluid", "Gender fluid"],
    ["Agender", "Agender"],
    ["Transgender", "Transgender"],
    ["trans woman", "Transgender woman"],
    ["Two Spirit", "Two-spirit"],
    ["Other", "Other"],
  ])("keeps %s as the group %s, even once", (raw, want) => {
    const { got, found } = read("sex", [raw]);
    expect(got).toEqual([want]);
    expect(found).toEqual({ sex: { named: [{ value: want, count: 1 }], otherRecords: 0 } });
  });

  it("merges spellings and orders named values most frequent first", () => {
    const { found } = read("sex", ["agender", "Non-binary", "nonbinary", "non binary"]);
    expect(found.sex.named).toEqual([
      { value: "Non-binary", count: 3 },
      { value: "Agender", count: 1 },
    ]);
  });

  it("keeps labels to their own column", () => {
    expect(read("race_ethnicity", ["non-binary"]).got).toEqual([""]);
    expect(read("sex", ["Middle Eastern"]).got).toEqual([""]);
  });

  it("recognizes a race label outside the list", () => {
    expect(read("race_ethnicity", ["MENA"]).got).toEqual(["Middle Eastern or North African"]);
  });

  it("reports nothing when every value matched the category list", () => {
    expect(read("sex", ["male", ""]).found).toEqual({});
  });
});

describe("anything else is counted and not kept", () => {
  const five = (value: string) => Array<string>(5).fill(value);

  it.each([
    ["a name on several rows", five("Jane Doe")],
    ["an email address", five("jo@example.com")],
    ["an ID", five("E10042")],
    ["free text", five("A long free text answer past any label")],
  ])("blanks %s and stores only a count", (_why, values) => {
    const norm = n();
    expect(values.map((v) => norm.normalize("sex", v))).toEqual(Array(5).fill(""));
    const found = norm.unmatched();
    expect(found).toEqual({ sex: { named: [], otherRecords: 5 } });
    expect(JSON.stringify(found)).not.toContain(values[0]);
  });

  it("leaves a qualifier on its own unrecognized", () => {
    const norm = n();
    expect(norm.normalize("race_ethnicity", "Not Hispanic or Latino")).toBe("");
    expect(norm.unmatched().race_ethnicity).toEqual({ named: [], otherRecords: 1 });
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
    expect(norm.unmatched()).toEqual({ race_ethnicity: { named: [], otherRecords: 1 } });
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
