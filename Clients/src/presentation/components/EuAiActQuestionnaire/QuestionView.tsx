import { Box, FormControl, Stack, Typography, type Theme } from "@mui/material";
import Checkbox from "../Inputs/Checkbox";
import Radio from "../Inputs/Radio";
import type { Answers, Question } from "../../../domain/types/euAiActClassification";

const optionStyle = (theme: Theme) => ({
  "width": "100%",
  "border": `1px solid ${theme.palette.border.dark}`,
  "borderRadius": "4px",
  "backgroundColor": theme.palette.background.main,
  "cursor": "pointer",
  "transition": "all 0.2s ease-in-out",
  "padding": "10px",
  "margin": 0,
  "&:hover": {
    borderColor: theme.palette.primary.main,
    backgroundColor: theme.palette.background.accent,
  },
});

interface QuestionViewProps {
  question: Question;
  answers: Answers;
  onSelect: (id: string, value: string | string[]) => void;
}

const QuestionView = ({ question, answers, onSelect }: QuestionViewProps) => {
  const headingId = `eu-ai-act-question-${question.id}`;
  const answer = answers[question.id];
  const current = (Array.isArray(answer) ? answer : []) as string[];
  const exclusiveValues = question.options.filter((o) => o.exclusive).map((o) => o.value);

  return (
    <Stack sx={{ gap: "8px" }}>
      <Typography id={headingId} fontSize={15} fontWeight={600} color="text.primary">
        {question.text}
      </Typography>
      {question.help && (
        <Typography fontSize={13} color="text.secondary">
          {question.help}
        </Typography>
      )}
      {question.articleRef && (
        <Typography fontSize={12} color="text.tertiary">
          {question.articleRef}
        </Typography>
      )}
      <FormControl
        role={question.inputType === "single_select" ? "radiogroup" : "group"}
        aria-labelledby={headingId}
        sx={{ gap: "12px", mt: "8px" }}
      >
        {question.options.map((option) => {
          const inputId = `${question.id}-${option.value}`;
          return (
            <Box key={option.value} sx={(theme) => ({ "& > label": optionStyle(theme) })}>
              {question.inputType === "single_select" ? (
                <Radio
                  id={inputId}
                  title={option.label}
                  size="small"
                  checked={answer === option.value}
                  desc={option.description ?? ""}
                  value={option.value}
                  onChange={(event) => onSelect(question.id, event.target.value)}
                />
              ) : (
                <>
                  <Checkbox
                    id={inputId}
                    label={option.label}
                    size="small"
                    isChecked={current.includes(option.value)}
                    value={option.value}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? option.exclusive
                          ? [option.value]
                          : [...current.filter((v) => !exclusiveValues.includes(v)), option.value]
                        : current.filter((v) => v !== option.value);
                      onSelect(question.id, next);
                    }}
                  />
                  {option.description && (
                    <Typography fontSize={12} color="text.secondary" sx={{ pl: "36px", pb: "8px" }}>
                      {option.description}
                    </Typography>
                  )}
                </>
              )}
            </Box>
          );
        })}
      </FormControl>
    </Stack>
  );
};

export default QuestionView;
