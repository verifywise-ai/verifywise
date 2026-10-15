/**
 * Readiness: how close the customer is to commissioning an independent audit
 * that would survive scrutiny.
 *
 * Measured impact ratios are deliberately not an input. A customer with good
 * governance and a genuine 0.78 scores high and has the 0.78 reported plainly.
 * Folding results into the score would reward improving the score by changing
 * the data, which is the failure this module exists to prevent.
 *
 * An unanswered veto yields no score at all rather than a low one: a 40%
 * implies the other 60% is meaningful, and when scope is unknown it is not.
 *
 * Open items: every applicable non-veto question without a usable answer is
 * listed, whether the customer answered "don't know" or never answered at
 * all. That includes gating questions such as data.basis; an unanswered
 * gating question is an open item, not an error, and earns nothing.
 */
import { VETO_KEYS } from "../../structures/NYC-Local-Law-144/intake.questions";
import type { QuestionWeight } from "../../structures/NYC-Local-Law-144/intake.types";
import { applicableQuestions, hasValue } from "./applicability";
import type { AnswerMap } from "./applicability";

const WEIGHTS: Record<Exclude<QuestionWeight, "veto">, number> = {
  high: 2,
  standard: 1,
  low: 0.5,
};

export interface ReadinessResult {
  score: number | null;
  blockedReason: string | null;
  missingVetoes: string[];
  openItems: Array<{ key: string; prompt: string }>;
  scope: "in_scope" | "out_of_scope" | "undetermined";
  earned: number;
  possible: number;
}

export function computeReadiness(answers: AnswerMap): ReadinessResult {
  const missingVetoes = VETO_KEYS.filter((k) => !hasValue(answers, k));
  if (missingVetoes.length > 0) {
    return {
      score: null,
      blockedReason: `Scope is not established: answer ${missingVetoes.join(", ")} before a score can be shown.`,
      missingVetoes: [...missingVetoes],
      openItems: [],
      scope: "undetermined",
      earned: 0,
      possible: 0,
    };
  }

  if (answers["scope.weighting"].value === "one_of_several") {
    return {
      score: null,
      blockedReason: null,
      missingVetoes: [],
      openItems: [],
      scope: "out_of_scope",
      earned: 0,
      possible: 0,
    };
  }

  let earned = 0;
  let possible = 0;
  const openItems: Array<{ key: string; prompt: string }> = [];
  for (const q of applicableQuestions(answers)) {
    if (q.weight === "veto") continue;
    const w = WEIGHTS[q.weight];
    possible += w;
    if (hasValue(answers, q.key)) earned += w;
    else openItems.push({ key: q.key, prompt: q.prompt });
  }

  return {
    score: possible === 0 ? 0 : Math.round((earned / possible) * 100),
    blockedReason: null,
    missingVetoes: [],
    openItems,
    scope: "in_scope",
    earned,
    possible,
  };
}
