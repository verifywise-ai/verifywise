/**
 * This file is currently in use
 */

import {
  Box,
  Button,
  Chip,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { Info as GreyCircleInfoIcon } from "lucide-react";
import RichTextEditor from "../../../../components/RichTextEditor";
import { priorities, PriorityLevel } from "../priorities";
import { Topic } from "../../../../../application/hooks/useAssessmentAnswers";
import { text, background, border as borderPalette } from "../../../../themes/palette";

interface AssessmentQuestionsProps {
  assessmentsValues: Topic[];
  activeTab: number;
  setAssessmentsValue: (
    value: ((prevValue: Topic[]) => Topic[]) | Topic[]
  ) => void;
  handleOpenFileUploadModal: () => void;
}

const AssessmentQuestions = ({
  assessmentsValues,
  activeTab,
  setAssessmentsValue,
  handleOpenFileUploadModal,
}: AssessmentQuestionsProps) => {
  const theme = useTheme();

  const handleAssessmentChange = ({
    activeTab,
    subtopicId,
    questionId,
    answer,
  }: {
    activeTab: number;
    subtopicId: number;
    questionId: number;
    answer: string;
    // evidenceFiles?: string[];
  }) => {
    const changeAssessmentsValues = (prevValues: Topic[]): Topic[] => {
      const newAssessmentValues = [...prevValues];

      const subtopicIndex = newAssessmentValues[activeTab].subtopics.findIndex(
        (st) => st.id === subtopicId
      );

      const questionIndex = newAssessmentValues[activeTab].subtopics[
        subtopicIndex
      ].questions.findIndex((q) => q.id === questionId);

      newAssessmentValues[activeTab].subtopics[subtopicIndex].questions[
        questionIndex
      ].answer = answer;

      return newAssessmentValues;
    };

    setAssessmentsValue((prevValues) => changeAssessmentsValues(prevValues));
  };

  return (
    <>
      {assessmentsValues[activeTab]?.subtopics.map((subtopic) => (
        <Stack key={subtopic.id} mb={15}>
          <Typography sx={{ fontSize: 16, color: `${text.secondary}` }}>
            {subtopic.name}
          </Typography>
          {subtopic.questions.map((question) => (
            <Box key={question.id} mt={10}>
              <Box
                className={"tiptap-header"}
                p={5}
                display="flex"
                alignItems="center"
                bgcolor={"#FBFAFA"}
                sx={{
                  border: `1px solid ${borderPalette.dark}`,
                  borderBottom: "none",
                  borderRadius: "4px 4px 0 0",
                  gap: 4,
                  justifyContent: "space-between",
                }}
              >
                <Typography sx={{ fontSize: 13, color: `${text.secondary}` }}>
                  {question.questionText}
                  {question.hint && (
                    <Box component="span" ml={2}>
                      <Tooltip
                        title={question.hint}
                        sx={{ fontSize: 13 }}
                        componentsProps={{
                          tooltip: {
                            sx: {
                              fontSize: 12,
                            },
                          },
                        }}
                      >
                        <GreyCircleInfoIcon size={16} />
                      </Tooltip>
                    </Box>
                  )}
                </Typography>
                <Chip
                  label={question.priorityLevel}
                  sx={{
                    backgroundColor:
                      priorities[question.priorityLevel as PriorityLevel].color,
                    color: `${background.main}`,
                  }}
                  size="small"
                />
              </Box>

              <RichTextEditor
                toolbar="full"
                key={`${assessmentsValues[activeTab].id}-${subtopic.id}-${question.id}`}
                onContentChange={(content: string) => {
                  const cleanedContent =
                    " " + content.replace(/^<p>/, "").replace(/<\/p>$/, "");

                  handleAssessmentChange({
                    activeTab,
                    subtopicId: subtopic.id,
                    questionId: question.id,
                    answer: cleanedContent,
                  });
                }}
                headerSx={{
                  borderRadius: 0,
                  BorderTop: "none",
                  borderColor: "border.dark",
                }}
                bodySx={{
                  borderColor: "border.dark",
                  borderRadius: "0 0 4px 4px",
                  "& .ProseMirror > p": {
                    margin: 0,
                  },
                }}
                initialContent={question.answer || " "}
              />
              <Stack
                sx={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Button
                  variant="contained"
                  sx={{
                    mt: 2,
                    borderRadius: 2,
                    minWidth: 155,      // ✅ minimum width
                    height: 25,
                    fontSize: 11,
                    border: "1px solid #d0d5dd",
                    backgroundColor: "white",
                    color: "text.secondary",
                    "&:hover": {
                      backgroundColor: "background.accent",
                      border: "1px solid #d0d5dd",
                    },
                  }}
                  disableRipple={
                    theme.components?.MuiButton?.defaultProps?.disableRipple
                  }
                  onClick={handleOpenFileUploadModal}
                >
                  Add, remove or download evidence
                </Button>
                <Typography
                  sx={{ fontSize: 11, color: "text.secondary", fontWeight: "300" }}
                >
                  {question.isRequired === true ? "required" : ""}
                </Typography>
              </Stack>
            </Box>
          ))}
        </Stack>
      ))}
    </>
  );
};

export default AssessmentQuestions;
