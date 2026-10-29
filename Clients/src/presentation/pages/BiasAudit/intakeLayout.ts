/**
 * How the intake questions are laid out on the page, and the client's copy
 * of the server's applicability rule.
 *
 * The questions themselves (prompts, options, consequences, predicates) come
 * from the server; this file only groups them and names them briefly.
 */
import type {
  AedtPredicate,
  AedtQuestion,
} from "../../../application/repository/aedtBiasAudit.repository";

/** A short name for each question, used as its heading and wherever it must be named. */
export const QUESTION_TITLES: Record<string, string> = {
  "role.party": "Your role",
  "scope.weighting": "How much the result matters",
  "independence.auditor": "Who is performing this test",
  "data.held": "Demographic data you hold",
  "cutoff.applied_by": "Who applies the cutoff",
  "cutoff.planned": "Planned automation",
  "threshold.operational": "The cutoff your process uses",
  "pipeline.input_form": "What the tool takes as input",
  "pipeline.preprocessing": "Changes before scoring",
  "knockout.exists": "Knockout criteria",
  "history.prior_audit": "Earlier bias audits",
  "data.basis": "Historical or test data",
  "data.categories": "Categories the data covers",
};

export const questionTitle = (key: string): string => QUESTION_TITLES[key] ?? key;

export interface IntakeSection {
  id: string;
  title: string;
  /** The education block shown beside the section, if one exists. */
  educationKey: string | null;
  keys: string[];
}

/** Sections in the order the customer works through them. */
export const INTAKE_SECTIONS: IntakeSection[] = [
  { id: "party", title: "Your role", educationKey: "profile.party", keys: ["role.party"] },
  {
    id: "scope",
    title: "Scope",
    educationKey: "profile.scope",
    keys: ["scope.weighting"],
  },
  {
    id: "independence",
    title: "Independence",
    educationKey: "profile.independence",
    keys: ["independence.auditor"],
  },
  {
    id: "data",
    title: "Data you hold",
    educationKey: "profile.data_held",
    keys: ["data.held", "data.basis", "data.categories"],
  },
  {
    id: "cutoff",
    title: "How decisions are made",
    educationKey: "run.cutoff",
    keys: ["cutoff.applied_by", "cutoff.planned", "threshold.operational"],
  },
  {
    id: "input",
    title: "What the tool scores",
    educationKey: "run.preprocessing",
    keys: ["pipeline.input_form", "pipeline.preprocessing"],
  },
  {
    id: "knockout",
    title: "Knockout criteria",
    educationKey: "run.knockout",
    keys: ["knockout.exists"],
  },
  {
    id: "history",
    title: "Earlier bias audits",
    educationKey: null,
    keys: ["history.prior_audit"],
  },
];

const OTHER_SECTION: IntakeSection = {
  id: "other",
  title: "Other questions",
  educationKey: null,
  keys: [],
};

/** Groups questions into sections, keeping any the layout does not name. */
export function groupQuestions(
  questions: AedtQuestion[],
): Array<{ section: IntakeSection; questions: AedtQuestion[] }> {
  const placed = new Set(INTAKE_SECTIONS.flatMap((s) => s.keys));
  const groups = INTAKE_SECTIONS.map((section) => ({
    section,
    questions: section.keys
      .map((k) => questions.find((q) => q.key === k))
      .filter((q): q is AedtQuestion => q !== undefined),
  }));
  const rest = questions.filter((q) => !placed.has(q.key));
  if (rest.length > 0) groups.push({ section: OTHER_SECTION, questions: rest });
  return groups.filter((g) => g.questions.length > 0);
}

export type DraftAnswers = Record<string, { value: string | null; dontKnow: boolean }>;

/**
 * The server's applicability rule (`Servers/services/biasAudit/applicability.ts`),
 * applied to the answers on screen so a question that stops applying hides at
 * once. An undefined predicate always applies; a don't-know never counts as
 * answered. The server stays the authority: it re-evaluates on save.
 */
export function evaluatePredicate(p: AedtPredicate | undefined, answers: DraftAnswers): boolean {
  if (p === undefined) return true;
  if (p.not !== undefined) return !evaluatePredicate(p.not, answers);
  if (p.all !== undefined) return p.all.every((x) => evaluatePredicate(x, answers));
  if (p.any !== undefined) return p.any.some((x) => evaluatePredicate(x, answers));
  if (p.answered !== undefined) {
    const a = answers[p.answered];
    return a !== undefined && !a.dontKnow && a.value !== null && a.value !== "";
  }
  if (p.equals !== undefined) {
    const a = answers[p.equals.key];
    return a !== undefined && !a.dontKnow && a.value === p.equals.value;
  }
  return true;
}

/** True when the answer settles the question: present, not a don't-know, not blank. */
export function hasUsableAnswer(a: { value: string | null; dontKnow: boolean } | undefined) {
  return a !== undefined && !a.dontKnow && a.value !== null && a.value !== "";
}
