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
  role: ClassificationRole | null;
  reasons: ClassificationReason[];
  obligations: ClassificationReason[];
}

export interface ClassificationRun {
  id: number;
  useCaseId: number | null;
  intakeSubmissionId: number | null;
  questionnaireVersion: number;
  role: ClassificationRole | null;
  answers: Answers;
  result: ClassificationResult;
  reviewerLevel: string | null;
  reviewerJustification: string | null;
  source: "wizard" | "intake";
  createdAt: string;
}
