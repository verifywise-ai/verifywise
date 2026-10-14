import { formatCustomFieldValue } from "../formatCustomFieldValue";
import {
  entityCountNoun,
  formatScore,
  roundScore,
  scoredOptions,
  stringOptions,
} from "../../../../domain/interfaces/i.customField";

const scored = {
  field_type: "scored_select",
  options: [
    { id: "opt_1", label: "High", score: 3 },
    { id: "opt_2", label: "Half", score: 0.5 },
  ],
};

const noopFormatDate = (value: string) => value;

describe("scored select display", () => {
  it("shows the label with its score", () => {
    expect(formatCustomFieldValue(scored, "opt_1", undefined, noopFormatDate)).toBe("High (3)");
    expect(formatCustomFieldValue(scored, "opt_2", undefined, noopFormatDate)).toBe("Half (0.5)");
  });
  it("shows a dash for an id that matches no option, and for no value", () => {
    expect(formatCustomFieldValue(scored, "opt_gone", undefined, noopFormatDate)).toBe("—");
    expect(formatCustomFieldValue(scored, null, undefined, noopFormatDate)).toBe("—");
  });
  it("formats scores without trailing zeros and never -0", () => {
    expect(formatScore(3)).toBe("3");
    expect(formatScore(0.333)).toBe("0.33");
    expect(formatScore(-0)).toBe("0");
  });
  it("rounds like the server: half up, never -0", () => {
    expect(roundScore(-0.125)).toBe(-0.12);
    expect(roundScore(0.125)).toBe(0.13);
    expect(Object.is(roundScore(-0.001), 0)).toBe(true);
  });
  it("does not throw on a score that is not a number", () => {
    expect(formatScore(null as unknown as number)).toBe("—");
  });
  it("keeps select formatting unchanged", () => {
    expect(
      formatCustomFieldValue(
        { field_type: "select", options: ["US"] },
        "US",
        undefined,
        noopFormatDate,
      ),
    ).toBe("US");
  });
});

describe("option helpers", () => {
  it("separates string and scored options by field type", () => {
    expect(stringOptions({ field_type: "select", options: ["US"] })).toEqual(["US"]);
    expect(stringOptions(scored)).toEqual([]);
    expect(scoredOptions(scored)).toHaveLength(2);
    expect(scoredOptions({ field_type: "select", options: ["US"] })).toEqual([]);
  });
  it("names records in the singular or plural", () => {
    expect(entityCountNoun("project", 1)).toBe("use case");
    expect(entityCountNoun("project", 80)).toBe("use cases");
    expect(entityCountNoun("model_inventory", 2)).toBe("models");
  });
});
