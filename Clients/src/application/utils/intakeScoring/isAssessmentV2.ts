import type { RiskAssessment, RiskAssessmentV2 } from "../../repository/intakeForm.repository";

/** True for the rule-floored AI score; older keyword scores have no version. */
export function isAssessmentV2(
  a: RiskAssessment | RiskAssessmentV2 | null | undefined,
): a is RiskAssessmentV2 {
  return !!a && (a as RiskAssessmentV2).version === 2;
}
