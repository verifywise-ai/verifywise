/**
 * Live checks: hints shown to a submitter while they fill in a public intake
 * form, and stored on the submission for reviewers. Mirrors
 * Servers/domain.layer/interfaces/i.intakeLiveChecks.ts.
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

/** One answer the server read from an uploaded document. */
export interface PrefillSuggestion {
  questionId: string;
  value: string;
  location: string;
  excerpt: string;
  /** Signed by the server; echoed back on submit so provenance can be verified. */
  token: string;
}

/** What the submit payload carries for a prefilled answer. */
export interface PrefillSubmitEntry {
  token: string;
  confirmed: boolean;
}
