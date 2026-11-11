import { useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import StandardModal from "../../../components/Modals/StandardModal";
import Select from "../../../components/Inputs/Select";
import Alert from "../../../components/Alert";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { palette } from "../../../themes/palette";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { useSaveAiAppAssessmentAnswers } from "../../../../application/hooks/useAiAppBulk";
import { errorMessage } from "../../../../application/repository/aiAppBulk.repository";
import type { IAiAppAssessment, IAiAppQuestion } from "../../../../domain/interfaces/i.aiAppBulk";
import { RISK_SCORE_OPTIONS } from "../utils";
import { controlSelectSx } from "../style";

interface AssessmentAnswerModalProps {
  assessment: IAiAppAssessment;
  questions: IAiAppQuestion[];
  onClose: () => void;
  onSaved: () => void;
  /** Absent when this is the last pending assessment on the page. */
  onNext?: () => void;
}

export default function AssessmentAnswerModal({
  assessment,
  questions,
  onClose,
  onSaved,
  onNext,
}: AssessmentAnswerModalProps) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<"save" | "next" | null>(null);
  const saveMutation = useSaveAiAppAssessmentAnswers();

  const isComplete = questions.length > 0 && questions.every((q) => answers[q.key]);

  const save = async (goNext: boolean) => {
    setError(null);
    setAction(goNext ? "next" : "save");
    try {
      await saveMutation.mutateAsync({ id: assessment.id, answers });
      onSaved();
      if (goNext && onNext) onNext();
      else onClose();
    } catch (err) {
      setError(errorMessage(err, t("Could not save the answers. Try again.")));
    } finally {
      setAction(null);
    }
  };

  return (
    <StandardModal
      isOpen
      onClose={onClose}
      title={assessment.ai_app_name ?? t("Assessment")}
      description="Rate every question from 1 to 5. Saved answers cannot be changed."
      customFooter={
        <Stack direction="row" justifyContent="flex-end" gap="8px" sx={{ width: "100%" }}>
          <CustomizableButton
            text="Cancel"
            variant="outlined"
            onClick={onClose}
            testId="ai-app-assessment-cancel"
          />
          <CustomizableButton
            text="Save"
            variant="outlined"
            onClick={() => save(false)}
            disabled={!isComplete || saveMutation.isPending}
            loading={action === "save"}
            testId="ai-app-assessment-save"
          />
          <CustomizableButton
            text="Save and next"
            variant="contained"
            onClick={() => save(true)}
            disabled={!isComplete || saveMutation.isPending || !onNext}
            loading={action === "next"}
            testId="ai-app-assessment-save-next"
          />
        </Stack>
      }
    >
      <Stack gap="16px">
        {questions.length === 0 && (
          <Alert
            variant="warning"
            body={t("This assessment's questionnaire is no longer available.")}
            inline
          />
        )}
        {questions.map((question) => (
          <Box key={question.key}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, mb: "4px" }}>
              {question.label}
            </Typography>
            {question.description && (
              <Typography sx={{ fontSize: 13, color: palette.text.secondary, mb: "8px" }}>
                {question.description}
              </Typography>
            )}
            <Select
              id={`ai-app-assessment-${question.key}`}
              ariaLabel={question.label}
              placeholder="Select a rating"
              value={answers[question.key] ?? ""}
              onChange={(e) =>
                setAnswers((prev) => ({ ...prev, [question.key]: Number(e.target.value) }))
              }
              items={[...RISK_SCORE_OPTIONS]}
              dataTestId={`ai-app-assessment-${question.key}`}
              sx={controlSelectSx}
            />
          </Box>
        ))}
        {error && <Alert variant="error" body={error} inline />}
      </Stack>
    </StandardModal>
  );
}
