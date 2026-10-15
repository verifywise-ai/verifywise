export type ClassificationLevel =
  "Prohibited" | "High risk" | "Limited risk" | "Minimal risk" | "Out of scope";

export type ClassificationRole = "Provider" | "Deployer";

export interface QuestionOption {
  value: string;
  label: string;
  description?: string;
  /** Cannot be combined with other answers ("None of these"). */
  exclusive?: boolean;
}

/** Holds when the referenced question is answered and its answer matches. */
export interface Condition {
  questionId: string;
  anyOf?: string[];
  noneOf?: string[];
}

export interface Question {
  id: string;
  text: string;
  help?: string;
  articleRef: string;
  inputType: "single_select" | "multi_select";
  /**
   * A multi_select question that used to be single_select: a saved single
   * answer (a string) still validates and is read as a one-item list.
   */
  acceptsSingleValue?: boolean;
  options: QuestionOption[];
  /** Shown when any group matches; a group matches when all its conditions hold. Omitted: always shown. */
  showWhen?: Condition[][];
}

export interface Questionnaire {
  version: number;
  questions: Question[];
}

export type Answers = Record<string, string | string[]>;

export interface ClassificationReason {
  article: string;
  text: string;
  appliesFrom?: string;
}

export interface ClassificationResult {
  questionnaireVersion: number;
  level: ClassificationLevel;
  /** The roles the answers name, Provider first. Always set by the scorer. */
  roles: ClassificationRole[];
  /** Deprecated single role: Provider when present, else Deployer, else null. */
  role: ClassificationRole | null;
  reasons: ClassificationReason[];
  obligations: ClassificationReason[];
}

/**
 * A result as stored in eu_ai_act_classifications.result (JSONB). Results
 * stored before the role list existed have no `roles`; read them with
 * `result.roles ?? result.role`.
 */
export type StoredClassificationResult = Omit<ClassificationResult, "roles"> & {
  roles?: ClassificationRole[];
};
