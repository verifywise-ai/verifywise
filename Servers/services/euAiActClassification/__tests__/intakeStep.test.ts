import { describe, it, expect } from "@jest/globals";
import { prepareIntakeRiskStep } from "../intakeStep";

const ANSWERS = {
  scope: "in_scope",
  role: "deployer",
  art5_practices: ["none"],
  rbi_law_enforcement: "no",
  intimate_content: "no",
  safety_function: "no",
  annex_iii_areas: ["none"],
  transparency: ["interacts"],
};

describe("prepareIntakeRiskStep", () => {
  it("does nothing when the step is off, even if answers are sent", () => {
    expect(prepareIntakeRiskStep(false, ANSWERS)).toEqual({ ok: true, prepared: null });
  });

  it("requires answers when the step is on", () => {
    expect(prepareIntakeRiskStep(true, undefined)).toEqual({
      ok: false,
      message: "Complete the EU AI Act risk classification step",
      errors: [],
    });
  });

  it("rejects tampered answers, including a client-sent level", () => {
    const outcome = prepareIntakeRiskStep(true, { ...ANSWERS, level: "Minimal risk" });
    expect(outcome.ok).toBe(false);
  });

  it("scores valid answers on the server", () => {
    const outcome = prepareIntakeRiskStep(true, ANSWERS);
    expect(outcome.ok && outcome.prepared?.result.level).toBe("Limited risk");
    expect(outcome.ok && outcome.prepared?.questionnaireVersion).toBe(2);
  });
});
