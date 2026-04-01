import { Stack, Typography } from "@mui/material";
import { Subtopic } from "../../../../domain/types/Subtopic";
import QuestionFrame from "../../../components/VWQuestion";
import { Question } from "../../../../domain/types/Question";
import { useSearchParams } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { text } from "../../../themes/palette";

type QuestionsProps = {
  subtopic: Subtopic;
  setRefreshKey: () => void;
  currentProjectId: number;
  questionsData: Question[];
};

const Questions = ({
  subtopic,
  setRefreshKey,
  currentProjectId,
  questionsData,
}: QuestionsProps) => {
  const [searchParams] = useSearchParams();
  const questionId = searchParams.get("questionId");
  const [highlightedQuestionId, setHighlightedQuestionId] = useState<
    number | null
  >(null);
  const questionRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const hasScrolledRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      questionId &&
      questionsData.length > 0 &&
      hasScrolledRef.current !== questionId
    ) {
      const targetQuestionId = Number(questionId);
      const targetQuestion = questionsData.find(
        (question: Question) => question.question_id === targetQuestionId
      );

      if (targetQuestion) {
        setHighlightedQuestionId(targetQuestionId);
        hasScrolledRef.current = questionId;

        // Scroll to the question after a longer delay to ensure DOM and data are ready
        setTimeout(() => {
          const questionElement = questionRefs.current[targetQuestionId];
          if (questionElement) {
            questionElement.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          }
        }, 300);

        // Remove highlight after 3 seconds
        setTimeout(() => {
          setHighlightedQuestionId(null);
        }, 3000);
      }
    }
  }, [questionId, questionsData]);

  // Additional effect to handle cases where questionId exists but data loads later
  useEffect(() => {
    if (
      questionId &&
      questionsData.length > 0 &&
      hasScrolledRef.current !== questionId
    ) {
      // Retry scroll after a delay if data just became available
      const timeoutId = setTimeout(() => {
        const targetQuestionId = Number(questionId);
        const targetQuestion = questionsData.find(
          (question: Question) => question.question_id === targetQuestionId
        );

        if (targetQuestion && questionRefs.current[targetQuestionId]) {
          setHighlightedQuestionId(targetQuestionId);
          hasScrolledRef.current = questionId;

          questionRefs.current[targetQuestionId]?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });

          setTimeout(() => {
            setHighlightedQuestionId(null);
          }, 3000);
        }
      }, 500);

      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [questionsData]);

  return (
    <Stack mb={15}>
      <Typography sx={{ fontSize: 16, color: `${text.secondary}` }}>
        {subtopic.title}
      </Typography>
      {questionsData
        .sort(
          (a: Question, b: Question) => (a.order_no ?? 0) - (b.order_no ?? 0)
        )
        .map((question: Question) => (
          <div
            key={question.question_id}
            ref={(el) => {
              if (question.question_id) {
                questionRefs.current[question.question_id] = el;
              }
            }}
            style={{
              backgroundColor:
                highlightedQuestionId === question.question_id
                  ? "#e3f5e6"
                  : "inherit",
              transition: "background-color 0.3s ease",
              borderRadius: "8px",
              padding:
                highlightedQuestionId === question.question_id ? "8px" : "0px",
            }}
          >
            <QuestionFrame
              question={question}
              setRefreshKey={setRefreshKey}
              currentProjectId={currentProjectId}
            />
          </div>
        ))}
    </Stack>
  );
};

export default Questions;
