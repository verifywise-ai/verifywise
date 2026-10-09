import { Fragment, useId, useMemo } from "react";
import { Box, Drawer, Skeleton, Stack, Typography, useTheme } from "@mui/material";
import { X } from "lucide-react";
import { CustomizableButton } from "../../components/button/customizable-button";
import type { Question, Questionnaire } from "../../../domain/types/euAiActClassification";
import { followUpTriggerLabels, groupEuAiActQuestions } from "./euAiActQuestionSections";

const DRAWER_WIDTH = 560;

function FollowUpRule({
  question,
  questionsById,
}: {
  question: Question;
  questionsById: Map<string, Question>;
}) {
  const theme = useTheme();
  const labels = followUpTriggerLabels(question, questionsById);
  const sx = { fontSize: "12px", color: theme.palette.text.accent, mb: "6px" };
  if (!labels) {
    return <Typography sx={sx}>Shown depending on earlier answers</Typography>;
  }
  return (
    <Typography sx={sx} data-testid="eu-ai-act-follow-up-rule">
      <span>Shown when</span>{" "}
      {labels.map((label, index) => (
        <Fragment key={label}>
          {index > 0 && (
            <>
              {" "}
              <span>or</span>{" "}
            </>
          )}
          <Box component="span" sx={{ fontWeight: 500, color: theme.palette.text.secondary }}>
            {label}
          </Box>
        </Fragment>
      ))}
    </Typography>
  );
}

function QuestionCard({
  question,
  questionsById,
}: {
  question: Question;
  questionsById: Map<string, Question>;
}) {
  const theme = useTheme();
  const isFollowUp = Boolean(question.showWhen?.length);
  const describedOptions = question.options.filter((option) => option.description);

  return (
    <Box
      data-testid="eu-ai-act-step-question"
      sx={
        isFollowUp
          ? {
              ml: "12px",
              pl: "12px",
              borderLeft: `2px solid ${theme.palette.border.dark}`,
            }
          : undefined
      }
    >
      {isFollowUp && <FollowUpRule question={question} questionsById={questionsById} />}
      <Box
        sx={{
          p: "12px",
          border: `1px solid ${theme.palette.border.light}`,
          borderRadius: "4px",
          backgroundColor: theme.palette.background.main,
        }}
      >
        <Typography sx={{ fontSize: "13px", fontWeight: 600, color: theme.palette.text.primary }}>
          {question.text}
        </Typography>
        {question.articleRef && (
          <Typography sx={{ fontSize: "12px", color: theme.palette.text.tertiary, mt: "2px" }}>
            {question.articleRef}
          </Typography>
        )}
        {question.help && (
          <Typography sx={{ fontSize: "12px", color: theme.palette.text.secondary, mt: "6px" }}>
            {question.help}
          </Typography>
        )}
        {question.inputType === "multi_select" && (
          <Typography sx={{ fontSize: "12px", color: theme.palette.text.accent, mt: "8px" }}>
            Select all that apply
          </Typography>
        )}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: "6px", mt: "8px" }}>
          {question.options.map((option) => (
            <Box
              component="span"
              key={option.value}
              title={option.exclusive ? "Cannot be combined with other answers" : undefined}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                px: "8px",
                py: "2px",
                fontSize: "12px",
                lineHeight: "18px",
                borderRadius: "4px",
                color: theme.palette.text.secondary,
                backgroundColor: option.exclusive
                  ? theme.palette.background.main
                  : theme.palette.background.fill,
                border: `1px ${option.exclusive ? "dashed" : "solid"} ${theme.palette.border.light}`,
              }}
            >
              {option.label}
            </Box>
          ))}
        </Box>
        {describedOptions.length > 0 && (
          <Stack component="dl" sx={{ gap: "4px", m: 0, mt: "8px" }}>
            {describedOptions.map((option) => (
              <Box key={option.value} sx={{ fontSize: "12px", lineHeight: "18px" }}>
                <Box
                  component="dt"
                  sx={{ display: "inline", fontWeight: 500, color: theme.palette.text.secondary }}
                >
                  {option.label}
                </Box>{" "}
                <Box
                  component="dd"
                  sx={{ display: "inline", m: 0, color: theme.palette.text.tertiary }}
                >
                  {option.description}
                </Box>
              </Box>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
}

interface EuAiActQuestionnaireDrawerProps {
  open: boolean;
  onClose: () => void;
  questionnaire: Questionnaire | undefined;
  isLoading: boolean;
  isError: boolean;
  /** True while a fetch is in flight, so "Try again" cannot start another. */
  isRetryDisabled?: boolean;
  onRetry: () => void;
}

/**
 * Read-only view of the EU AI Act questionnaire that submitters answer before
 * the form, grouped by the part of the Act each question checks.
 */
export function EuAiActQuestionnaireDrawer({
  open,
  onClose,
  questionnaire,
  isLoading,
  isError,
  isRetryDisabled = false,
  onRetry,
}: EuAiActQuestionnaireDrawerProps) {
  const theme = useTheme();
  const titleId = useId();
  const questions = useMemo(() => questionnaire?.questions ?? [], [questionnaire]);
  const sections = useMemo(() => groupEuAiActQuestions(questions), [questions]);
  const questionsById = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        "role": "dialog",
        "aria-modal": true,
        "aria-labelledby": titleId,
        "sx": {
          width: { xs: "100%", sm: DRAWER_WIDTH },
          maxWidth: "100%",
          backgroundColor: theme.palette.background.modal,
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px",
          p: "16px 20px",
          borderBottom: `1px solid ${theme.palette.border.light}`,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            id={titleId}
            sx={{ fontSize: "16px", fontWeight: 600, color: theme.palette.text.primary }}
          >
            EU AI Act questionnaire
          </Typography>
          {questionnaire && (
            <Typography sx={{ fontSize: "12px", color: theme.palette.text.secondary, mt: "2px" }}>
              <span>{questions.length}</span> <span>questions</span> ·{" "}
              <span>asked before the form</span>
            </Typography>
          )}
        </Box>
        <CustomizableButton
          variant="text"
          iconOnly
          ariaLabel="Close"
          size="small"
          onClick={onClose}
        >
          <X size={18} strokeWidth={1.5} />
        </CustomizableButton>
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", p: "20px" }}>
        {isLoading && (
          <Stack sx={{ gap: "8px" }} aria-busy="true">
            <Typography sx={{ fontSize: "12px", color: theme.palette.text.accent }}>
              Loading questions...
            </Typography>
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} variant="rounded" height={88} sx={{ borderRadius: "4px" }} />
            ))}
          </Stack>
        )}
        {isError && !questionnaire && (
          <Stack direction="row" sx={{ alignItems: "center", gap: "8px" }}>
            <Typography sx={{ fontSize: "12px", color: theme.palette.text.accent }}>
              The questions could not be loaded.
            </Typography>
            <CustomizableButton
              variant="text"
              size="small"
              text="Try again"
              onClick={onRetry}
              isDisabled={isRetryDisabled}
            />
          </Stack>
        )}
        {questionnaire && (
          <Stack sx={{ gap: "24px" }}>
            {sections.map((section) => (
              <Box component="section" key={section.title} data-testid="eu-ai-act-question-section">
                <Typography
                  component="h3"
                  sx={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: theme.palette.text.secondary,
                    mb: "8px",
                  }}
                >
                  {section.title}
                </Typography>
                <Stack sx={{ gap: "8px" }}>
                  {section.questions.map((question) => (
                    <QuestionCard
                      key={question.id}
                      question={question}
                      questionsById={questionsById}
                    />
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Box>
    </Drawer>
  );
}

export default EuAiActQuestionnaireDrawer;
