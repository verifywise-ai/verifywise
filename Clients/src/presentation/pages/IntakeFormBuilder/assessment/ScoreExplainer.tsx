import { useState } from "react";
import { Box, Collapse, Typography, useTheme } from "@mui/material";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { RiskAssessmentV2 } from "../../../../application/repository/intakeForm.repository";
import type { ClassificationLevel } from "../../../../application/utils/intakeScoring/scoreMath";
import type { ScoreView } from "./scoreView";

export interface ScoreExplainerProps {
  assessment: RiskAssessmentV2;
  view: ScoreView;
  level: ClassificationLevel | null;
  /** Articles behind the level, as the classification panel lists them. */
  levelReasons: Array<{ article: string; text: string }>;
  levelChanged: boolean;
  isModel: boolean;
  questionLabels: Record<string, string>;
  override?: { tier: string; justification: string; byName: string | null } | null;
}

/** "How this score is built": every input to the score, in order. */
function ScoreExplainer({
  assessment,
  view,
  level,
  levelReasons,
  levelChanged,
  isModel,
  questionLabels,
  override,
}: ScoreExplainerProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const ai = assessment.ai;

  const heading = (text: string) => (
    <Typography sx={{ fontSize: "12px", fontWeight: 600, color: theme.palette.text.secondary }}>
      {text}
    </Typography>
  );
  const body = { fontSize: "13px", color: theme.palette.text.primary } as const;

  return (
    <Box>
      <Box
        component="button"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        sx={{
          "display": "flex",
          "alignItems": "center",
          "gap": "6px",
          "background": "none",
          "border": "none",
          "cursor": "pointer",
          "padding": 0,
          "color": theme.palette.text.tertiary,
          "fontSize": "13px",
          "fontWeight": 500,
          "&:hover": { color: theme.palette.text.primary },
        }}
      >
        {open ? (
          <ChevronUp size={15} strokeWidth={1.5} />
        ) : (
          <ChevronDown size={15} strokeWidth={1.5} />
        )}
        <span>How this score is built</span>
      </Box>

      <Collapse in={open} timeout="auto" unmountOnExit>
        <Box
          sx={{
            mt: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            borderLeft: `2px solid ${theme.palette.border.dark}`,
            pl: "12px",
          }}
        >
          <Box>
            {heading("EU AI Act level")}
            {level ? (
              <>
                <Typography sx={body}>{level}</Typography>
                {levelReasons.map((r) => (
                  <Typography
                    key={`${r.article}-${r.text}`}
                    sx={{ fontSize: "12px", color: theme.palette.text.tertiary }}
                  >
                    <span>{r.article}</span>: <span>{r.text}</span>
                  </Typography>
                ))}
              </>
            ) : (
              <Typography sx={body}>
                {isModel
                  ? "EU AI Act questions apply to use cases, not models."
                  : "Not rule-checked: this form doesn't ask the EU AI Act questions."}
              </Typography>
            )}
          </Box>

          <Box>
            {heading("Rule minimum")}
            <Typography sx={body}>
              {view.ruleMinimum === null ? <span>None</span> : <span>{view.ruleMinimum}</span>}
            </Typography>
            {levelChanged && (
              <Typography sx={{ fontSize: "12px", color: theme.palette.text.tertiary }}>
                Minimum based on your level change
              </Typography>
            )}
          </Box>

          <Box>
            {heading("AI scores")}
            {ai ? (
              <>
                <Typography sx={body}>
                  {ai.runs.map((score, i) => (
                    <span key={`run-${i}`}>
                      {i > 0 ? ", " : ""}
                      {score}
                    </span>
                  ))}
                  {Array.from({ length: ai.failedRuns }, (_, i) => (
                    <span key={`failed-${i}`}>
                      {ai.runs.length + i > 0 ? ", " : ""}
                      <span>failed</span>
                    </span>
                  ))}
                </Typography>
                {ai.median !== null && (
                  <Typography sx={{ fontSize: "12px", color: theme.palette.text.tertiary }}>
                    <span>Median</span> {ai.median} · <span>Range</span> {ai.min}–{ai.max}
                  </Typography>
                )}
              </>
            ) : (
              <Typography sx={body}>No AI scores</Typography>
            )}
          </Box>

          <Typography sx={{ ...body, fontStyle: "normal" }}>
            The final score is the higher of the rule minimum and the AI median. The AI can raise
            the score but never lower it.
          </Typography>

          {ai && ai.reasons.length > 0 && (
            <Box>
              {heading("Reasons")}
              <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {ai.reasons.map((r) => (
                  <Box key={`${r.questionId}-${r.text}`}>
                    <Typography sx={body}>{r.text}</Typography>
                    <Typography sx={{ fontSize: "12px", color: theme.palette.text.tertiary }}>
                      "{r.excerpt}" ({questionLabels[r.questionId] ?? r.questionId})
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {override && (
            <Box>
              {heading("Band override")}
              <Typography sx={body}>
                <span>Band set to</span> <span>{override.tier}</span>
                {override.byName && (
                  <>
                    {" "}
                    <span>by</span> {override.byName}
                  </>
                )}
              </Typography>
              <Typography sx={{ fontSize: "12px", color: theme.palette.text.tertiary }}>
                {override.justification}
              </Typography>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

export default ScoreExplainer;
