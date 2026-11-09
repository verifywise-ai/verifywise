import type { HintKind, LiveCheckHint } from "../../../domain/types/intakeLiveChecks";
import { status } from "../../themes/palette";

/** Text, background and border colors for each hint kind: red, amber, amber, blue. */
export const HINT_KIND_COLORS: Record<HintKind, { text: string; bg: string; border: string }> = {
  prohibited: status.error,
  regulation: status.warning,
  contradiction: status.warning,
  vague: status.info,
};

/** Short label for each hint kind, used in counts and reviewer chips. */
export const HINT_KIND_LABELS: Record<HintKind, string> = {
  prohibited: "Possible prohibited practice",
  regulation: "Possible regulated use",
  contradiction: "Conflicting answers",
  vague: "Needs more detail",
};

/** Hints that concern one question; a contradiction concerns both of its questions. */
export const hintsForQuestion = (hints: LiveCheckHint[], questionId: string) =>
  hints.filter((h) => h.questionId === questionId || h.alsoQuestionId === questionId);
