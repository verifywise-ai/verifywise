import { useState } from "react";
import { Box, Stack } from "@mui/material";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { CustomizableButton } from "../button/customizable-button";
import ProgressTracker from "./ProgressTracker";
import QuestionView from "./QuestionView";
import {
  isAnswered,
  pruneHiddenAnswers,
  visibleQuestions,
} from "../../../application/utils/euAiActQuestionnaire";
import type { Answers, Questionnaire } from "../../../domain/types/euAiActClassification";

interface EuAiActQuestionnaireProps {
  questionnaire: Questionnaire;
  answers: Answers;
  onAnswersChange: (answers: Answers) => void;
  /** Called on the last visible question. Hidden answers are already pruned from `answers`. */
  onComplete: () => void;
  completeLabel: string;
  isCompleting?: boolean;
}

const EuAiActQuestionnaire = ({
  questionnaire,
  answers,
  onAnswersChange,
  onComplete,
  completeLabel,
  isCompleting = false,
}: EuAiActQuestionnaireProps) => {
  const [index, setIndex] = useState(0);
  const visible = visibleQuestions(questionnaire, answers);
  const position = Math.max(0, Math.min(index, visible.length - 1));
  const question = visible[position];
  const isLast = position === visible.length - 1;

  const select = (id: string, value: string | string[]) =>
    onAnswersChange(pruneHiddenAnswers(questionnaire, { ...answers, [id]: value }));

  return (
    <Stack sx={{ gap: "24px" }}>
      <ProgressTracker currentStep={position + 1} totalSteps={visible.length} />
      {question && <QuestionView question={question} answers={answers} onSelect={select} />}
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
        <Box>
          {position > 0 && (
            <CustomizableButton
              variant="outlined"
              text="Back"
              icon={<ArrowLeft size={16} />}
              onClick={() => setIndex(position - 1)}
            />
          )}
        </Box>
        <CustomizableButton
          variant="contained"
          text={isLast ? completeLabel : "Next"}
          endIcon={isLast ? undefined : <ArrowRight size={16} />}
          isDisabled={!question || !isAnswered(question, answers) || isCompleting}
          onClick={() => (isLast ? onComplete() : setIndex(position + 1))}
        />
      </Box>
    </Stack>
  );
};

export default EuAiActQuestionnaire;
