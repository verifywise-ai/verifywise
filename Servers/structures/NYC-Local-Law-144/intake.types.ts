export type QuestionWeight = "veto" | "high" | "standard" | "low";
export type QuestionScope = "profile" | "run";
export type GateTarget = "ratios" | "stance" | "scoring_rate" | "generation";

/** A consequence an answer imposes on the stance, rather than on the score. */
export interface StanceConsequence {
  kind: "limitation" | "scope_note" | "blank_field" | "metric_forced";
  text: string;
  payload?: Record<string, string>;
  /** The question key that emitted this consequence; set when the gates collect it. */
  sourceKey?: string;
}

export interface IntakeOption {
  value: string;
  label: string;
  /** Shown to the customer BEFORE they answer. */
  consequence?: string;
  emits?: StanceConsequence[];
}

/** Evaluated against answers already given. Keys are question keys. */
export interface Predicate {
  not?: Predicate;
  all?: Predicate[];
  any?: Predicate[];
  answered?: string;
  equals?: { key: string; value: string };
}

export interface IntakeQuestion {
  key: string;
  scope: QuestionScope;
  prompt: string;
  statutoryRef?: string;
  weight: QuestionWeight;
  options: IntakeOption[];
  allowDontKnow: boolean;
  notesRequired: boolean;
  notesPrompt?: string;
  appliesWhen?: Predicate;
  gates?: GateTarget[];
  /** Read by plan 3's generator. Null for questions generation ignores. */
  generationField?: "artifact_kind" | "knockout" | "score_scale";
}
