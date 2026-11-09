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
  it("keeps the value as its own group and reports it with its count", () => {
    const norm = n();
    expect(norm.normalize("sex", " Non-binary ")).toBe("Non-binary");
    expect(norm.normalize("sex", "non-BINARY")).toBe("Non-binary");
    expect(norm.normalize("race_ethnicity", "Other")).toBe("Other");
    expect(norm.unmatched()).toEqual({
      sex: [{ value: "Non-binary", count: 2 }],
      race_ethnicity: [{ value: "Other", count: 1 }],
    });
  });

  it("leaves a qualifier on its own unmatched, not blank", () => {
    const norm = n();
    expect(norm.normalize("race_ethnicity", "Not Hispanic or Latino")).toBe(
      "Not Hispanic or Latino",
    );
    expect(norm.unmatched().race_ethnicity).toHaveLength(1);
  });

  it("reports nothing when every value matched", () => {
    const norm = n();
    norm.normalize("sex", "male");
    norm.normalize("sex", "");
    expect(norm.unmatched()).toEqual({});
  });

  it("orders values most frequent first", () => {
    const norm = n();
    for (const v of ["Other", "X", "X", "Other", "Other", "Y"]) norm.normalize("sex", v);
    expect(norm.unmatched().sex.map((u) => u.value)).toEqual(["Other", "X", "Y"]);
  });
});

it("ignores a column that is not a known category", () => {
  expect(n().handles("selected")).toBe(false);
  expect(n().handles("sex")).toBe(true);
  expect(n().normalize("selected", "Maybe")).toBe("Maybe");
});
