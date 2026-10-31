/**
 * The two rule sets of the analysis give the same findings and the same credibility labels on every
 * case: a case replays the model's recorded answers, and the credibility prompt (since vr-9)
 * leaves out the model's confidence, which the label never reads (spec D5.1). A case that fails
 * here has a finding whose fate or label depends on the confidence of the model.
 *
 * The cases replay recordings; nothing here may reach the network, so the guarded fetch is replaced
 * by one that throws, as in cases.test.ts.
 */
const guardedFetch = jest.fn(async () => {
  throw new Error("an evaluation case must not reach the network");
});
jest.mock("../../../webResearch/guardedFetch", () => ({
  ...jest.requireActual("../../../webResearch/guardedFetch"),
  guardedFetch,
}));

import { EVAL_CASES } from "../cases";
import { type CaseRun, runEvalCase } from "../runCase";

describe("the credibility rules over the replay cases", () => {
  it.each(EVAL_CASES.map((evalCase) => [evalCase.id, evalCase] as const))(
    "%s: keeps the same findings and labels under the credibility rules",
    async (_id, evalCase) => {
      const before = await runEvalCase(evalCase);
      const after = await runEvalCase(evalCase, { rules: "credibility" });
      const withoutConfidence = (run: CaseRun) =>
        run.kept.map(({ confidence: _confidence, ...rest }) => rest);

      expect(withoutConfidence(after)).toEqual(withoutConfidence(before));
      expect(after.credibility).toEqual(before.credibility);
      expect(guardedFetch).not.toHaveBeenCalled();
    },
  );
});
