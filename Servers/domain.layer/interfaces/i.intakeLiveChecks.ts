/**
 * Live checks: hints shown to a submitter while they fill in a public intake
 * form, stored on the submission (intake_submissions.live_checks JSONB) so
 * reviewers can see what the submitter saw.
 */

export type HintKind = "prohibited" | "regulation" | "contradiction" | "vague";

/** Display order of hint kinds, most serious first. */
export const HINT_KIND_ORDER: HintKind[] = ["prohibited", "regulation", "contradiction", "vague"];

export interface LiveCheckHint {
  id: string;
  kind: HintKind;
  source: "rule" | "ai";
  questionId: string;
  alsoQuestionId?: string;
  ruleId?: string;
  ref?: string;
  title: string;
  text: string;
  excerpt?: string;
}

/** Where a prefilled answer came from in the uploaded document. */
export interface PrefillProvenance {
  fileName: string;
  location: string;
  excerpt: string;
  confirmed: boolean;
}

export type LiveChecksAiStatus = "pending" | "done" | "failed" | "skipped";

export interface ILiveChecks {
  version: 1;
  rules: LiveCheckHint[];
  ai: {
    status: LiveChecksAiStatus;
    hints: LiveCheckHint[];
    stageStartedAt?: string;
    /** The submitter's language, used by the job and by retries. */
    language?: "en" | "de" | "fr" | "es";
  };
  prefill: Record<string, PrefillProvenance>;
}
