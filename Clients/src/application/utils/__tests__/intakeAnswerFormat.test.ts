import { describe, it, expect } from "vitest";
import {
  describeFormula,
  formatAnswer,
  formatCalculatedValue,
  splitFormula,
} from "../intakeAnswerFormat";

describe("formatCalculatedValue", () => {
  it("formats with grouping, fixed decimals and a prefix", () => {
    expect(formatCalculatedValue(14400, { decimals: 2, prefix: "€" }, "en-US")).toBe("€ 14,400.00");
  });
  it("formats with a suffix and no decimals", () => {
    expect(formatCalculatedValue(1200, { decimals: 0, suffix: "people" }, "en-US")).toBe(
      "1,200 people",
    );
  });
  it("uses the given locale's separators", () => {
    expect(formatCalculatedValue(14400, { decimals: 2 }, "de-DE")).toBe("14.400,00");
  });
  it("formats negatives", () => {
    expect(formatCalculatedValue(-2.5, { decimals: 1 }, "en-US")).toBe("-2.5");
  });
  it("never uses exponent notation for large values", () => {
    expect(formatCalculatedValue(1e21, { decimals: 0 }, "en-US")).toBe(
      "1,000,000,000,000,000,000,000",
    );
  });
  it("falls back to 2 decimals when decimals is invalid", () => {
    expect(formatCalculatedValue(1, { decimals: 9 }, "en-US")).toBe("1.00");
  });
  it("shows a dash when there is no value", () => {
    expect(formatCalculatedValue(null, { decimals: 2, prefix: "€" }, "en-US")).toBe("—");
    expect(formatCalculatedValue(undefined, {}, "en-US")).toBe("—");
  });
  it("ignores a prefix or suffix that is not text instead of throwing", () => {
    const field = { decimals: 0, prefix: 5, suffix: null } as unknown as { decimals: number };
    expect(formatCalculatedValue(3, field, "en-US")).toBe("3");
  });
});

describe("describeFormula", () => {
  const fields = [
    { id: "cost", label: "Monthly cost" },
    { id: "field_1-a", label: "Head-count" },
  ];
  it("replaces references with labels and operators with symbols", () => {
    expect(describeFormula("{cost} * 12", fields)).toBe("= Monthly cost × 12");
  });
  it("keeps dashes inside labels and ids", () => {
    expect(describeFormula("{field_1-a} - {cost} / 2", fields)).toBe(
      "= Head-count − Monthly cost ÷ 2",
    );
  });
  it("marks a removed field", () => {
    expect(describeFormula("{gone} + 1", fields)).toBe("= missing field + 1");
  });
  it("is empty for an empty formula", () => {
    expect(describeFormula("  ", fields)).toBe("");
  });
});

describe("splitFormula", () => {
  it("splits references from text with offsets into the formula", () => {
    expect(splitFormula("{cost} * {field_1-a}")).toEqual([
      { kind: "ref", fieldId: "cost", start: 0, end: 6 },
      { kind: "text", text: " * ", start: 6 },
      { kind: "ref", fieldId: "field_1-a", start: 9, end: 20 },
    ]);
  });
  it("leaves an unfinished reference as text", () => {
    expect(splitFormula("2 + {co")).toEqual([{ kind: "text", text: "2 + {co", start: 0 }]);
  });
  it("is empty for an empty formula", () => {
    expect(splitFormula("")).toEqual([]);
  });
});

describe("formatAnswer", () => {
  const formatDate = (date: string) => `date:${date}`;
  const multiselect = {
    type: "multiselect",
    options: [
      { label: "Alpha", value: "a" },
      { label: "Beta", value: "b" },
    ],
  };

  it("shows a dash for a multi-select with nothing picked", () => {
    expect(formatAnswer(multiselect, [], formatDate)).toBe("—");
  });
  it("shows a dash for text that is only spaces", () => {
    expect(formatAnswer({ type: "text" }, "   ", formatDate)).toBe("—");
  });
  it("lists picked options by label", () => {
    expect(formatAnswer(multiselect, ["a", "b"], formatDate)).toBe("Alpha, Beta");
  });
  it("keeps an unchecked checkbox as No", () => {
    expect(formatAnswer({ type: "checkbox" }, false, formatDate)).toBe("No");
  });
});
