import { useState } from "react";
import { Box, Collapse, IconButton, Stack, Typography } from "@mui/material";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import Alert from "../../../components/Alert";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { palette, radiusPx } from "../../../themes/palette";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import {
  useAiAppAssessmentHistory,
  useAiAppQuestionnaires,
} from "../../../../application/hooks/useAiAppBulk";
import { fill } from "../../../../i18n/fill";
import type { IAiAppAssessment } from "../../../../domain/interfaces/i.aiAppBulk";
import {
  AssessmentAnswers,
  AssessmentStatusChip,
  AssessorName,
  questionnaireNameFor,
  questionsFor,
  RiskScoreChip,
} from "../AIAppAssessments/AssessmentDisplay";
import AssessmentAnswerModal from "../AIAppAssessments/AssessmentAnswerModal";
import { controlButtonSx } from "../style";

export default function AIAppAssessmentHistory({ appId }: { appId: number }) {
  const { t } = useTranslation();
  const formatDate = useFormattedDate();
  const { data: assessments = [], isLoading, error } = useAiAppAssessmentHistory(appId);
  const { data: questionnaires = [] } = useAiAppQuestionnaires();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [answering, setAnswering] = useState<IAiAppAssessment | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <Box sx={{ mt: "32px" }}>
      <Stack direction="row" alignItems="center" gap="8px" sx={{ mb: "16px" }}>
        <History size={16} strokeWidth={1.5} color={palette.text.secondary} />
        <Typography sx={{ fontSize: 15, fontWeight: 600 }}>Assessment history</Typography>
      </Stack>

      {error ? (
        <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
          Could not load the assessment history.
        </Typography>
      ) : !isLoading && assessments.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
          No questionnaire assessments yet.
        </Typography>
      ) : (
        <Stack sx={{ border: `1px solid ${palette.border.dark}`, borderRadius: radiusPx.sm }}>
          {assessments.map((assessment, index) => {
            const isCompleted = assessment.status === "completed";
            const isExpanded = expandedId === assessment.id;
            const name = questionnaireNameFor(assessment, questionnaires);
            return (
              <Box
                key={assessment.id}
                sx={{ borderTop: index === 0 ? "none" : `1px solid ${palette.border.dark}` }}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  gap="12px"
                  flexWrap="wrap"
                  sx={{ p: "8px 12px" }}
                >
                  {isCompleted ? (
                    <IconButton
                      size="small"
                      onClick={() => setExpandedId(isExpanded ? null : assessment.id)}
                      aria-expanded={isExpanded}
                      aria-label={fill(t("Show answers for {name}"), { name })}
                      data-testid={`ai-app-history-expand-${assessment.id}`}
                    >
                      {isExpanded ? (
                        <ChevronDown size={14} strokeWidth={1.5} />
                      ) : (
                        <ChevronRight size={14} strokeWidth={1.5} />
                      )}
                    </IconButton>
                  ) : (
                    <Box sx={{ width: "26px" }} />
                  )}
                  <Typography sx={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: "140px" }}>
                    {name}
                  </Typography>
                  {isCompleted ? (
                    <RiskScoreChip score={assessment.risk_score} />
                  ) : (
                    <AssessmentStatusChip status={assessment.status} />
                  )}
                  {isCompleted && <AssessorName name={assessment.assessed_by_name} />}
                  <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
                    {formatDate(isCompleted ? assessment.assessed_at : assessment.created_at)}
                  </Typography>
                  {!isCompleted && assessment.can_answer && (
                    <CustomizableButton
                      text="Answer"
                      variant="outlined"
                      onClick={() => setAnswering(assessment)}
                      testId={`ai-app-history-answer-${assessment.id}`}
                      sx={controlButtonSx}
                    />
                  )}
                </Stack>
                {isCompleted && (
                  <Collapse in={isExpanded} unmountOnExit>
                    <Box sx={{ p: "4px 12px 12px 50px" }}>
                      <AssessmentAnswers
                        questions={questionsFor(assessment, questionnaires)}
                        answers={assessment.answers}
                      />
                    </Box>
                  </Collapse>
                )}
              </Box>
            );
          })}
        </Stack>
      )}

      {answering && (
        <AssessmentAnswerModal
          key={answering.id}
          assessment={answering}
          questions={questionsFor(answering, questionnaires)}
          onClose={() => setAnswering(null)}
          onSaved={() => setSaved(true)}
        />
      )}

      {saved && (
        <Alert
          variant="success"
          body={t("Assessment saved")}
          isToast
          onClick={() => setSaved(false)}
        />
      )}
    </Box>
  );
}
