import { Box, Typography, useTheme } from "@mui/material";
import { Scale } from "lucide-react";
import ReasonList from "../../components/EuAiActQuestionnaire/ReasonList";
import Alert from "../../components/Alert";
import Chip from "../../components/Chip";
import Field from "../../components/Inputs/Field";
import Select from "../../components/Inputs/Select";
import { AiRiskClassification } from "../../../domain/enums/aiRiskClassification.enum";
import type { EuAiActClassificationPreview } from "../../../application/repository/intakeForm.repository";
import { visibleQuestions } from "../../../application/utils/euAiActQuestionnaire";

export type EuAiActClassificationData = EuAiActClassificationPreview;

interface EuAiActClassificationPanelProps {
  classification: EuAiActClassificationData;
  isPending: boolean;
  selectedLevel: string;
  onLevelChange: (level: string) => void;
  justification: string;
  onJustificationChange: (value: string) => void;
}

const LEVEL_ITEMS = [
  AiRiskClassification.PROHIBITED,
  AiRiskClassification.HIGH_RISK,
  AiRiskClassification.LIMITED_RISK,
  AiRiskClassification.MINIMAL_RISK,
  AiRiskClassification.OUT_OF_SCOPE,
].map((level) => ({ _id: level, name: level }));

export default function EuAiActClassificationPanel({
  classification,
  isPending,
  selectedLevel,
  onLevelChange,
  justification,
  onJustificationChange,
}: EuAiActClassificationPanelProps) {
  const theme = useTheme();
  const { questionnaire, answers, role, current, changedSinceSubmission } = classification;
  const changed = selectedLevel !== current.level;
  const trimmedLength = justification.trim().length;

  const answered = visibleQuestions(questionnaire, answers).filter(
    (question) => answers[question.id] !== undefined,
  );

  const labelsFor = (questionId: string): string => {
    const question = questionnaire.questions.find((q) => q.id === questionId);
    const raw = answers[questionId];
    const values = Array.isArray(raw) ? raw : [raw];
    return values
      .map((value) => question?.options.find((o) => o.value === value)?.label ?? String(value))
      .join(", ");
  };

  return (
    <Box
      sx={{
        border: `1px solid ${theme.palette.border.dark}`,
        borderRadius: "4px",
        p: "20px",
        backgroundColor: theme.palette.background.accent,
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Scale size={16} color={theme.palette.text.tertiary} strokeWidth={1.5} />
        <Typography sx={{ fontSize: "14px", fontWeight: 600, color: theme.palette.text.primary }}>
          EU AI Act classification
        </Typography>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <Chip label={current.level} />
        {role && (
          <Typography sx={{ fontSize: "13px", color: theme.palette.text.tertiary }}>
            <span>Role:</span> <span>{role}</span>
          </Typography>
        )}
        {changedSinceSubmission && (
          <Typography sx={{ fontSize: "12px", color: theme.palette.text.tertiary }}>
            Updated since submission
          </Typography>
        )}
      </Box>

      {current.reasons.length > 0 && <ReasonList heading="Why" items={current.reasons} />}

      {answered.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Typography sx={{ fontSize: "13px", fontWeight: 600 }}>Answers</Typography>
          {answered.map((question) => (
            <Box key={question.id} sx={{ display: "flex", flexDirection: "column" }}>
              <Typography sx={{ fontSize: "13px", color: theme.palette.text.tertiary }}>
                {question.text}
              </Typography>
              <Typography sx={{ fontSize: "13px" }}>{labelsFor(question.id)}</Typography>
            </Box>
          ))}
        </Box>
      )}

      {isPending && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <Select
            id="eu-ai-act-level"
            label="Classification for the new use case"
            value={selectedLevel}
            onChange={(e) => onLevelChange(String(e.target.value))}
            items={LEVEL_ITEMS}
          />
          {changed && (
            <Field
              id="eu-ai-act-justification"
              label="Justification"
              placeholder="Explain why you are changing the computed classification (min. 10 characters)"
              value={justification}
              onChange={(e) => onJustificationChange(e.target.value)}
              rows={2}
              error={
                trimmedLength > 0 && trimmedLength < 10
                  ? "Justification must be at least 10 characters"
                  : undefined
              }
            />
          )}
          {selectedLevel === AiRiskClassification.PROHIBITED && (
            <Alert
              variant="warning"
              body="Approving creates a use case classified as prohibited."
              isToast={false}
              sx={{ position: "static" }}
            />
          )}
        </Box>
      )}
    </Box>
  );
}
