import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  likelihoodFromScale,
  severityFromScale,
  likelihoodFromCatalog,
  severityFromCatalog,
  weightedRiskScore,
  modelRiskLevelFor,
  modelRiskCategoryFor,
} from "../riskMappers";
import { ModelRiskCategory } from "../../../domain.layer/enums/model-risk-category.enum";
import { ModelRiskLevel } from "../../../domain.layer/enums/model-risk-level.enum";

const cases = JSON.parse(
  readFileSync(join(__dirname, "../__fixtures__/catalogMapperCases.json"), "utf8"),
) as Array<{
  source: "mit" | "ibm";
  kind: "likelihood" | "severity";
  input: string;
  expected: string;
}>;

describe("scale mappers", () => {
  it("maps 1..5 and clamps", () => {
    expect(likelihoodFromScale(1)).toBe("Rare");
    expect(likelihoodFromScale(5)).toBe("Almost Certain");
    expect(likelihoodFromScale(9)).toBe("Almost Certain");
    expect(likelihoodFromScale(2.6)).toBe("Possible");
    expect(severityFromScale(0)).toBe("Negligible");
    expect(severityFromScale(4)).toBe("Major");
    expect(severityFromScale(99)).toBe("Catastrophic");
  });
});

describe("catalog mappers (shared fixture)", () => {
  it.each(cases.map((c) => [c.source, c.kind, c.input, c.expected]))(
    "%s %s %j -> %s",
    (source, kind, input, expected) => {
      const fn = kind === "likelihood" ? likelihoodFromCatalog : severityFromCatalog;
      expect(fn(source as "mit" | "ibm", input as string)).toBe(expected);
    },
  );
});

describe("risk level and category", () => {
  it("weights likelihood*1 + severity*3", () => {
    expect(weightedRiskScore("Almost Certain", "Catastrophic")).toBe(20);
    expect(weightedRiskScore("Rare", "Negligible")).toBe(4);
  });

  it("collapses the five register levels onto the model levels", () => {
    expect(modelRiskLevelFor("Almost Certain", "Catastrophic")).toBe(ModelRiskLevel.CRITICAL);
    expect(modelRiskLevelFor("Rare", "Negligible")).toBe(ModelRiskLevel.LOW);
    expect(modelRiskLevelFor("Possible", "Negligible")).toBe(ModelRiskLevel.LOW);
    expect(modelRiskLevelFor("Possible", "Minor")).toBe(ModelRiskLevel.MEDIUM);
    expect(modelRiskLevelFor("Possible", "Moderate")).toBe(ModelRiskLevel.MEDIUM);
    expect(modelRiskLevelFor("Possible", "Major")).toBe(ModelRiskLevel.HIGH);
  });

  it("maps categories by keyword and defaults to Compliance", () => {
    expect(modelRiskCategoryFor([])).toBe(ModelRiskCategory.COMPLIANCE);
    expect(modelRiskCategoryFor(["Unmapped thing"])).toBe(ModelRiskCategory.COMPLIANCE);
    expect(modelRiskCategoryFor(["Privacy & data"])).toBe(ModelRiskCategory.DATA_QUALITY);
    expect(modelRiskCategoryFor(["Cybersecurity risk"])).toBe(ModelRiskCategory.SECURITY);
    expect(modelRiskCategoryFor(["Discrimination & toxicity"])).toBe(ModelRiskCategory.BIAS);
    expect(modelRiskCategoryFor(["Technological risk"])).toBe(ModelRiskCategory.PERFORMANCE);
  });
});
