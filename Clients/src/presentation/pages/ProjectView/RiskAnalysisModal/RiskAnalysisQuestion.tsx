import {
  Box,
  FormControl,
  Stack,
  Typography,
} from "@mui/material";
import { IQuestion, IQuestionnaireAnswers } from "./iQuestion";
import Checkbox from "../../../components/Inputs/Checkbox";
import Radio from "../../../components/Inputs/Radio";
import { brand, background } from "../../../themes/palette";

const radioOptionStyle = {
  width: "100%",
  padding: "0px 4px",
  border: "1px solid #E4E7EC",
  borderRadius: "4px",
  backgroundColor: `${background.main}`,
  cursor: "pointer",
  transition: "all 0.2s ease-in-out",
  marginLeft: 0,
  marginRight: 0,
  "&:hover": {
    borderColor: `${brand.primary}`,
    backgroundColor: "#F9F9F9",
  },
  "&.selected": {
    borderColor: `${brand.primary}`,
    backgroundColor: "#F0F9F6",
  },
};

interface RiskAnalysisQuestionProps {
  question: IQuestion;
  onSelect: (id: string, value: string | string[]) => void;
  answers: IQuestionnaireAnswers;
}

const RiskAnalysisQuestion = ({
  question,
  onSelect,
  answers,
}: RiskAnalysisQuestionProps) => {
  return (
    <Stack>
      <Typography fontSize={15} fontWeight={600} my={4} color="text.primary">
        {question.id}. {question.text}
      </Typography>
      {/* Options */}
      <Stack spacing={2}>
        {question.inputType === "single_select" ? (
          <FormControl sx={{gap: 4}}>
            {question.options.map((option) => (
              <Box 
                key={option.value} 
                sx={{ "& > label": {
                  ...radioOptionStyle, 
                  padding: "10px",
                  margin: 0,
                  alignItems: "center",
                }}}
              >
                <Radio
                  id={option.value}
                  title={option.label}
                  size="small"
                  checked={answers[question.id] === option.value}
                  desc=""
                  value={option.value}
                  onChange={(event) => onSelect(question.id, event.target.value)}
                />
              </Box>
            ))}
          </FormControl>
        ) : (
          <FormControl sx={{gap: 4}}>
            {question.options.map((option) => {
              const selectedValues =
                answers[question.id] && Array.isArray(answers[question.id])
                  ? answers[question.id]
                  : [];
              const isChecked = (selectedValues ?? []).includes(option.value);
              return (
                <Box 
                  key={option.value} 
                  sx={{ "& > label": {
                    ...radioOptionStyle, 
                    padding: "10px",
                    margin: 0,
                  }}}
                >
                  <Checkbox
                    id={option.value}
                    label={option.label}
                    size="small"
                    isChecked={isChecked}
                    value={option.value}
                    onChange={(event) => {
                      const currentValues = (Array.isArray(answers[question.id]) ? answers[question.id] : []) as string[];
                      const newValues = event.target.checked
                        ? [...currentValues, option.value]
                        : currentValues.filter((v) => v !== option.value);
                      onSelect(question.id, newValues);
                    }}
                />
                </Box>
              );
            })}
          </FormControl>
        )}
      </Stack>
    </Stack>
  );
};
export default RiskAnalysisQuestion;
