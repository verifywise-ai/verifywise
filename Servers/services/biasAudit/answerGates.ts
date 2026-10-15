/**
 * Answer gates: given the intake answers, what the later run and stance steps
 * may do. Pure computation.
 *
 * Rules the tests pin:
 * - A veto left unanswered withholds ratios, generation, the scoring rate and
 *   the stance. Scope is unknown, so nothing downstream means anything.
 * - A gate is satisfied when its question does not apply. Only a question that
 *   applies and has no usable answer blocks. Otherwise an out-of-scope customer
 *   would be denied a stance because data.basis never applies to them.
 * - Audio input blocks generation: the module cannot generate audio.
 * - The forced metric comes from the metric_forced consequence of the chosen
 *   cutoff answer.
 * - The stance is withheld when every applicable non-veto answer given is a
 *   don't-know, since the customer would be describing nothing.
 */
import { VETO_KEYS } from "../../structures/NYC-Local-Law-144/intake.questions";
import type {
  GateTarget,
  StanceConsequence,
} from "../../structures/NYC-Local-Law-144/intake.types";
import { applicableQuestions, hasValue } from "./applicability";
import type { AnswerMap } from "./applicability";

export interface AnswerGateResult {
  blocked: Record<GateTarget, string[]>;
  mayProduceStance: boolean;
  mayComputeRatios: boolean;
  mayGenerate: boolean;
  mayComputeScoringRate: boolean;
  consequences: StanceConsequence[];
  forcedMetric: string | null;
}

/** Limitation text for a don't-know, which selects no option and so fires no `emits`. */
const NOT_ESTABLISHED: Record<string, string> = {
  "pipeline.preprocessing":
    "Whether the input is transformed before scoring was not established, so no finding " +
    "can be attributed to the scoring step alone.",
  "knockout.exists":
    "Whether any criterion fails a candidate outright was not established. If one does, " +
    "the rate combines candidates who scored low with candidates who were failed outright.",
  "cutoff.applied_by":
    "Whether a cutoff is applied by the platform or by a person was not established, so " +
    "which of 5-301(b) and 5-301(c) governs is unsettled.",
  "history.prior_audit":
    "Whether this tool has been through an audit before, and whether it has changed since, " +
    "was not established.",
};

export function runAnswerGates(answers: AnswerMap): AnswerGateResult {
  const blocked: Record<GateTarget, string[]> = {
    ratios: [],
    stance: [],
    scoring_rate: [],
    generation: [],
  };
  const applicable = applicableQuestions(answers);
  const consequences: StanceConsequence[] = [];
  let forcedMetric: string | null = null;

  const missingVetoes = VETO_KEYS.filter((k) => !hasValue(answers, k));
  for (const k of missingVetoes) {
    const msg = `${k} is unanswered, so scope is not established`;
    for (const target of ["ratios", "stance", "scoring_rate", "generation"] as GateTarget[]) {
      blocked[target].push(msg);
    }
  }

  for (const q of applicable) {
    const answer = answers[q.key];
    if (!hasValue(answers, q.key)) {
      if (q.weight !== "veto") {
        for (const target of q.gates ?? []) blocked[target].push(`${q.key} is unanswered`);
      }
      if (answer?.dontKnow && NOT_ESTABLISHED[q.key] !== undefined) {
        consequences.push({ kind: "limitation", text: NOT_ESTABLISHED[q.key], sourceKey: q.key });
      }
      continue;
    }
    const option = q.options.find((o) => o.value === answer.value);
    for (const c of option?.emits ?? []) {
      consequences.push({ ...c, sourceKey: q.key });
      if (c.kind === "metric_forced" && forcedMetric === null) {
        forcedMetric = c.payload?.metric ?? c.text;
      }
    }
  }

  if (
    hasValue(answers, "pipeline.input_form") &&
    answers["pipeline.input_form"].value === "audio"
  ) {
    blocked.generation.push("pipeline.input_form is audio, which this module cannot generate");
  }

  const nonVetoGiven = applicable.filter(
    (q) => q.weight !== "veto" && answers[q.key] !== undefined,
  );
  if (nonVetoGiven.length > 0 && nonVetoGiven.every((q) => answers[q.key].dontKnow)) {
    blocked.stance.push("every applicable answer is I don't know, so there is nothing to describe");
  }

  return {
    blocked,
    mayProduceStance: blocked.stance.length === 0,
    mayComputeRatios: blocked.ratios.length === 0,
    mayGenerate: blocked.generation.length === 0,
    mayComputeScoringRate: blocked.scoring_rate.length === 0,
    consequences,
    forcedMetric,
  };
}
