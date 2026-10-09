import { useState } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import { ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { CustomizableButton } from "../../components/button/customizable-button";
import { getEuAiActQuestionnaire } from "../../../application/repository/euAiActClassification.repository";
import type { Question } from "../../../domain/types/euAiActClassification";

const EU_AI_ACT_QUESTIONNAIRE_QUERY_KEY = ["eu-ai-act-questionnaire"] as const;

function QuestionPreview({ question }: { question: Question }) {
  const theme = useTheme();
  return (
    <Box
      data-testid="eu-ai-act-step-question"
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
      {question.showWhen && (
        <Typography sx={{ fontSize: "12px", color: theme.palette.text.accent, mt: "4px" }}>
          Asked depending on earlier answers
        </Typography>
      )}
      <Box component="ul" sx={{ m: 0, mt: "8px", pl: "18px" }}>
        {question.options.map((option) => (
          <Typography
            component="li"
            key={option.value}
            sx={{ fontSize: "12px", color: theme.palette.text.secondary }}
          >
            {option.label}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

/**
 * Read-only preview of the EU AI Act risk step in the builder canvas. The step
 * is not part of the form schema: submitters answer it before the form's
 * questions, so it sits above them and cannot be edited or moved.
 */
export function EuAiActStepCard() {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: EU_AI_ACT_QUESTIONNAIRE_QUERY_KEY,
    queryFn: getEuAiActQuestionnaire,
    staleTime: 5 * 60 * 1000,
  });
  const questions = data?.questions ?? [];

  return (
    <Box
      data-testid="eu-ai-act-step-card"
      onClick={(e) => e.stopPropagation()}
      sx={{
        px: "24px",
        py: "16px",
        borderBottom: `1px solid ${theme.palette.border.light}`,
        backgroundColor: theme.palette.background.fill,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
        <Box sx={{ color: theme.palette.primary.main, display: "flex", mt: "2px" }}>
          <ShieldCheck size={16} strokeWidth={1.5} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: "14px", fontWeight: 600, color: theme.palette.text.primary }}>
            EU AI Act risk classification
          </Typography>
          <Typography sx={{ fontSize: "12px", color: theme.palette.text.secondary, mt: "2px" }}>
            Submitters answer these questions first. The result is shown only to reviewers.
          </Typography>
          {isLoading && (
            <Typography sx={{ fontSize: "12px", color: theme.palette.text.accent, mt: "4px" }}>
              Loading questions...
            </Typography>
          )}
          {isError && (
            <Typography sx={{ fontSize: "12px", color: theme.palette.text.accent, mt: "4px" }}>
              The questions could not be loaded.
            </Typography>
          )}
          {data && (
            <Typography sx={{ fontSize: "12px", color: theme.palette.text.accent, mt: "4px" }}>
              <span>Questions</span>
              {` (${questions.length})`}
            </Typography>
          )}
        </Box>
        {questions.length > 0 && (
          <CustomizableButton
            variant="text"
            size="small"
            text={expanded ? "Hide questions" : "Show questions"}
            startIcon={
              expanded ? (
                <ChevronUp size={14} strokeWidth={1.5} />
              ) : (
                <ChevronDown size={14} strokeWidth={1.5} />
              )
            }
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
          />
        )}
      </Box>
      {expanded && questions.length > 0 && (
        <Stack sx={{ gap: "8px", mt: "12px" }}>
          {questions.map((question) => (
            <QuestionPreview key={question.id} question={question} />
          ))}
        </Stack>
      )}
    </Box>
  );
}

export default EuAiActStepCard;
