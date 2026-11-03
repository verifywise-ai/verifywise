import { Box, ButtonBase, Typography } from "@mui/material";
import { Sparkles } from "lucide-react";
import { HINT_KIND_ORDER, type LiveCheckHint } from "../../../domain/types/intakeLiveChecks";
import { border } from "../../themes/palette";
import { HINT_KIND_COLORS, HINT_KIND_LABELS } from "../../components/IntakeLiveChecks/hintKinds";
import { CustomizableButton } from "../../components/button/customizable-button";
import type { AiCheckBlock, AiCheckStatus } from "../../../application/hooks/useIntakeLiveChecks";

export interface AssistantAiCheck {
  status: AiCheckStatus;
  blockedBy: AiCheckBlock | null;
  onCheck: () => void;
}

const AI_BUTTON_TEXT: Record<AiCheckStatus, string> = {
  idle: "Check my answers",
  running: "Checking answers",
  done: "Check again",
  error: "Check again",
};

/** One line under the AI button: why it cannot run, or what the last check did. */
function aiCheckNote(ai: AssistantAiCheck, aiHintCount: number): string | null {
  // "paused" has its own line in the panel; "running" shows on the button.
  if (ai.blockedBy === "short") return "Write a sentence or two first";
  if (ai.blockedBy === "checked") {
    return aiHintCount === 0 ? "Nothing else to flag" : "Checked. Edit an answer to check again.";
  }
  if (ai.blockedBy === null && ai.status === "error") {
    return "This check didn't work. You can try again.";
  }
  return null;
}

/**
 * "Intake assistant": counts per hint kind, the open hints (each jumps to its
 * question), the button for an AI check when the form has AI, how many
 * prefilled answers still need confirming, and the promise that none of this
 * blocks submission.
 */
export function IntakeAssistantPanel({
  hints,
  unconfirmedCount,
  aiPaused,
  ai,
  questionLabel,
  onSelect,
}: {
  hints: LiveCheckHint[];
  unconfirmedCount: number;
  aiPaused: boolean;
  /** Absent when the form has no AI checks. */
  ai?: AssistantAiCheck;
  questionLabel: (questionId: string) => string;
  onSelect: (questionId: string) => void;
}) {
  const aiNote = ai ? aiCheckNote(ai, hints.filter((h) => h.source === "ai").length) : null;
  const counts = HINT_KIND_ORDER.map((kind) => ({
    kind,
    count: hints.filter((h) => h.kind === kind).length,
  })).filter((c) => c.count > 0);

  return (
    // Not an <aside>: the app sidebar's global "aside" CSS would fix its width
    // at 260px and shrink its text. role="complementary" keeps the landmark.
    <Box
      component="section"
      role="complementary"
      aria-label="Intake assistant"
      data-testid="intake-assistant-panel"
      sx={{
        p: "16px",
        border: `1px solid ${border.dark}`,
        borderRadius: "4px",
        backgroundColor: "background.main",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <Typography component="h2" sx={{ fontSize: "14px", fontWeight: 600, color: "text.primary" }}>
        Intake assistant
      </Typography>

      {counts.length === 0 ? (
        <Typography sx={{ fontSize: "13px", color: "text.secondary" }}>No hints so far.</Typography>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {counts.map(({ kind, count }) => (
            <Box
              key={kind}
              data-testid={`assistant-count-${kind}`}
              sx={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: HINT_KIND_COLORS[kind].text,
                  flexShrink: 0,
                }}
              />
              <Typography
                component="span"
                sx={{ fontSize: "13px", color: "text.primary", flex: 1 }}
              >
                {HINT_KIND_LABELS[kind]}
              </Typography>
              <Typography component="span" sx={{ fontSize: "13px", fontWeight: 600 }}>
                {count}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {hints.length > 0 && (
        <Box
          component="ul"
          sx={{
            listStyle: "none",
            m: 0,
            p: 0,
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          {hints.map((hint) => (
            <li key={hint.id}>
              <ButtonBase
                onClick={() => onSelect(hint.questionId)}
                sx={{
                  "width": "100%",
                  "justifyContent": "flex-start",
                  "textAlign": "left",
                  "p": "6px 8px",
                  "borderRadius": "4px",
                  "gap": "8px",
                  "&:hover": { backgroundColor: "background.accent" },
                }}
              >
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    mt: "6px",
                    alignSelf: "flex-start",
                    borderRadius: "50%",
                    backgroundColor: HINT_KIND_COLORS[hint.kind].text,
                    flexShrink: 0,
                  }}
                />
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    data-vw-no-translate={hint.source === "ai" ? "true" : undefined}
                    sx={{ fontSize: "13px", fontWeight: 500, color: "text.primary" }}
                  >
                    {hint.title}
                  </Typography>
                  <Typography
                    data-vw-no-translate="true"
                    sx={{
                      fontSize: "12px",
                      color: "text.tertiary",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {questionLabel(hint.questionId)}
                  </Typography>
                </Box>
              </ButtonBase>
            </li>
          ))}
        </Box>
      )}

      {ai && (
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          <CustomizableButton
            variant="outlined"
            fullWidth
            startIcon={<Sparkles size={14} strokeWidth={1.5} />}
            text={AI_BUTTON_TEXT[ai.status]}
            loading={ai.status === "running"}
            isDisabled={ai.blockedBy !== null}
            onClick={ai.onCheck}
            testId="assistant-ai-check"
            sx={{ height: "30px", minHeight: "30px" }}
          />
          {/* Always rendered, empty when there is nothing to say, so screen readers announce each result. */}
          <Typography
            role="status"
            aria-live="polite"
            data-testid="assistant-ai-note"
            sx={{
              fontSize: "12px",
              color: "text.tertiary",
              lineHeight: 1.5,
              mt: aiNote ? "6px" : 0,
            }}
          >
            {aiNote}
          </Typography>
        </Box>
      )}

      {unconfirmedCount > 0 && (
        <Typography
          data-testid="assistant-unconfirmed"
          sx={{ fontSize: "13px", color: "text.primary" }}
        >
          <span>{unconfirmedCount}</span>{" "}
          <span>
            {unconfirmedCount === 1
              ? "answer was read from the vendor document. Confirm before submitting."
              : "answers were read from the vendor document. Confirm before submitting."}
          </span>
        </Typography>
      )}

      {aiPaused && (
        <Typography sx={{ fontSize: "12px", color: "text.tertiary" }}>
          AI checks paused for a few minutes
        </Typography>
      )}

      <Typography sx={{ fontSize: "12px", color: "text.tertiary", lineHeight: 1.5 }}>
        These checks never block submission. Your reviewer sees them too.
      </Typography>
    </Box>
  );
}

export default IntakeAssistantPanel;
