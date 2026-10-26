import { useState } from "react";
import { Box, CircularProgress, Typography, useTheme } from "@mui/material";
import { RotateCw } from "lucide-react";
import Chip from "../../../components/Chip";
import { CustomizableButton } from "../../../components/button/customizable-button";
import type { RiskAssessmentV2 } from "../../../../application/repository/intakeForm.repository";
import type { ClassificationLevel } from "../../../../application/utils/intakeScoring/scoreMath";
import ScoreExplainer from "./ScoreExplainer";
import { scoreViewFor } from "./scoreView";

/** How many reasons show before the explainer. */
const TOP_REASONS = 3;

export interface ScoreSectionProps {
  assessment: RiskAssessmentV2 | null;
  /** The level the reviewer has selected (defaults to the rules level). */
  selectedLevel: ClassificationLevel | null;
  /** The level under the current rules, before any reviewer change. */
  rulesLevel: ClassificationLevel | null;
  /** The level the AI was given when the score was computed. */
  assessedLevel: ClassificationLevel | null;
  levelReasons?: Array<{ article: string; text: string }>;
  isModel: boolean;
  questionLabels?: Record<string, string>;
  override?: { tier: string; justification: string; byName: string | null } | null;
  onRetry(): Promise<void>;
  retryAvailable: boolean;
}

/** The v2 score: number and band, range, what set it, reasons, status and Retry. */
function ScoreSection({
  assessment,
  selectedLevel,
  rulesLevel,
  assessedLevel,
  levelReasons = [],
  isModel,
  questionLabels = {},
  override,
  onRetry,
  retryAvailable,
}: ScoreSectionProps) {
  const theme = useTheme();
  const [retrying, setRetrying] = useState(false);

  const muted = { fontSize: "13px", color: theme.palette.text.tertiary } as const;

  async function handleRetry() {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  if (!assessment || assessment.status === "pending") {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <CircularProgress size={14} sx={{ color: theme.palette.text.tertiary }} />
          <Typography sx={muted}>Scoring…</Typography>
        </Box>
        {retryAvailable && <RetryButton retrying={retrying} onClick={handleRetry} />}
      </Box>
    );
  }

  const level = isModel ? null : selectedLevel;
  const view = scoreViewFor(assessment, level);
  const levelChanged = !isModel && selectedLevel !== rulesLevel;
  const rulesUpdated = !isModel && !!assessedLevel && rulesLevel !== assessedLevel;
  const ai = assessment.ai;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Score */}
      <Box sx={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        {view.finalScore === null ? (
          <Typography sx={{ fontSize: "15px", fontWeight: 600, color: theme.palette.text.primary }}>
            No score yet
          </Typography>
        ) : (
          <>
            <Typography
              data-testid="intake-score"
              sx={{ fontSize: "20px", fontWeight: 600, color: theme.palette.text.primary }}
            >
              {view.rulesOnly && (
                <>
                  <span>at least</span>{" "}
                </>
              )}
              <span>{view.finalScore}</span>
            </Typography>
            {view.band && <Chip label={view.band} />}
            {view.rulesOnly && <Typography sx={muted}>(rules only)</Typography>}
          </>
        )}
      </Box>

      {/* Range and what set the score */}
      {assessment.status === "complete" && ai && ai.min !== null && ai.max !== null && (
        <Typography sx={muted}>
          <span>AI scores ranged</span>{" "}
          <span>
            {ai.min}–{ai.max}
          </span>
        </Typography>
      )}
      {view.finalScore !== null && !view.rulesOnly && (
        <Typography sx={muted}>
          {view.source === "ai"
            ? "The AI median set this score."
            : "The rule minimum set this score. The AI scored it lower."}
        </Typography>
      )}

      {override && (
        <Typography sx={muted}>
          <span>Band set to</span> <span>{override.tier}</span>
          {override.byName && (
            <>
              {" "}
              <span>by</span> {override.byName}
            </>
          )}
        </Typography>
      )}

      {/* Status notes */}
      {assessment.status === "ai_not_configured" && (
        <Typography sx={muted}>AI scoring isn't set up for this form.</Typography>
      )}
      {assessment.status === "ai_failed" && (
        <Typography sx={{ fontSize: "13px", color: theme.palette.status.error.text }}>
          AI scoring failed. The score shown comes from the rules only.
        </Typography>
      )}
      {(isModel || level === null) && (
        <Typography sx={muted}>
          {isModel
            ? "Not rule-checked. EU AI Act questions apply to use cases, not models."
            : "Not rule-checked. This form doesn't ask the EU AI Act questions."}
        </Typography>
      )}
      {levelChanged && <Typography sx={muted}>Minimum based on your level change</Typography>}
      {rulesUpdated && <Typography sx={muted}>Rules updated since this was scored</Typography>}

      {retryAvailable && <RetryButton retrying={retrying} onClick={handleRetry} />}

      {/* Top reasons */}
      {ai && ai.reasons.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {ai.reasons.slice(0, TOP_REASONS).map((r) => (
            <Box key={`${r.questionId}-${r.text}`}>
              <Typography sx={{ fontSize: "13px", color: theme.palette.text.primary }}>
                {r.text}
              </Typography>
              <Typography sx={{ fontSize: "12px", color: theme.palette.text.tertiary }}>
                "{r.excerpt}" ({questionLabels[r.questionId] ?? r.questionId})
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      <ScoreExplainer
        assessment={assessment}
        view={view}
        level={level}
        levelReasons={levelReasons}
        levelChanged={levelChanged}
        isModel={isModel}
        questionLabels={questionLabels}
        override={override}
      />
    </Box>
  );
}

function RetryButton({ retrying, onClick }: { retrying: boolean; onClick: () => void }) {
  return (
    <Box>
      <CustomizableButton
        variant="outlined"
        size="small"
        text="Retry"
        startIcon={<RotateCw size={14} strokeWidth={1.5} />}
        loading={retrying}
        isDisabled={retrying}
        onClick={onClick}
        testId="intake-score-retry"
      />
    </Box>
  );
}

export default ScoreSection;
