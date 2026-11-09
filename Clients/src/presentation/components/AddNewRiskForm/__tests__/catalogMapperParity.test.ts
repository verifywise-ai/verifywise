import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  mapLikelihoodMIT,
  mapLikelihoodIBM,
  mapSeverityMIT,
  mapSeverityIBM,
} from "../riskSuggestionMappers";
import { Likelihood, Severity } from "../../RiskLevel/constants";

// One fixture shared with the server (Servers/services/intakeScoring/riskMappers.ts).
// The server table must give the same label for every row, so the intake
// suggestions land on the same register values the client would pick.
const FIXTURE = join(
  __dirname,
  "../../../../../../Servers/services/intakeScoring/__fixtures__/catalogMapperCases.json",
);

const cases = JSON.parse(readFileSync(FIXTURE, "utf8")) as Array<{
  source: "mit" | "ibm";
  kind: "likelihood" | "severity";
  input: string;
  expected: string;
}>;

const LABEL_OF_LIKELIHOOD: Record<number, string> = {
  [Likelihood.Rare]: "Rare",
  [Likelihood.Unlikely]: "Unlikely",
  [Likelihood.Possible]: "Possible",
  [Likelihood.Likely]: "Likely",
  [Likelihood.AlmostCertain]: "Almost Certain",
};
const LABEL_OF_SEVERITY: Record<number, string> = {
  [Severity.Negligible]: "Negligible",
  [Severity.Minor]: "Minor",
  [Severity.Moderate]: "Moderate",
  [Severity.Major]: "Major",
  [Severity.Catastrophic]: "Catastrophic",
};

describe("catalog mapper parity with the server fixture", () => {
  it("loads cases", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases.map((c) => [c.source, c.kind, c.input, c.expected]))(
    "%s %s %j -> %s",
    (source, kind, input, expected) => {
      let label: string;
      if (kind === "likelihood") {
        const fn = source === "mit" ? mapLikelihoodMIT : mapLikelihoodIBM;
        label = LABEL_OF_LIKELIHOOD[fn(input as string)];
      } else {
        const fn = source === "mit" ? mapSeverityMIT : mapSeverityIBM;
        label = LABEL_OF_SEVERITY[fn(input as string)];
      }
      expect(label).toBe(expected);
    },
  );
});
