import { useEffect, useState, useCallback } from "react";
import { getAssessmentAnswers } from "../repository/assesment.repository";

interface AssessmentProps {
  assessmentId: string | null | undefined;
}

export interface Question {
  id: number;
  subtopicId: string;
  questionText: string;
  answerType: string;
  evidenceFileRequired: boolean;
  hint: string;
  isRequired: boolean;
  priorityLevel: "high priority" | "medium priority" | "low priority";
  evidenceFiles?: File[];
  answer: string;
}

export interface Subtopic {
  id: number;
  topicId: number;
  name: string;
  questions: Question[];
}

export interface Topic {
  id: number;
  assessmentId: string;
  title: string;
  subtopics: Subtopic[];
  file?: any;
}

interface ApiQuestion {
  id: number;
  subtopic_id: string;
  question: string;
  answer_type: string;
  evidence_file_required: boolean;
  hint: string;
  is_required: boolean;
  priority_level: "high priority" | "medium priority" | "low priority";
  evidence_files?: File[];
  answer: string;
}

interface ApiSubtopic {
  id: number;
  topic_id: number;
  name: string;
  questions: ApiQuestion[];
}

interface ApiTopic {
  id: number;
  assessment_id: string;
  title: string;
  subTopics: ApiSubtopic[];
}

interface ApiResponse {
  data: {
    message: {
      topics: ApiTopic[];
    };
  };
}

const convertResponseAttributes = (response: ApiResponse): Topic[] => {
  const responseTopics = response?.data?.message?.topics;

  const topics = responseTopics.map((topic: ApiTopic) => {
    return {
      id: topic.id,
      assessmentId: topic.assessment_id,
      title: topic.title,
      subtopics: topic.subTopics.map((subtopic: ApiSubtopic) => {
        return {
          id: subtopic.id,
          topicId: subtopic.topic_id,
          name: subtopic.name,
          questions: subtopic.questions.map((question: ApiQuestion) => {
            return {
              id: question.id,
              subtopicId: question.subtopic_id,
              questionText: question.question,
              answerType: question.answer_type,
              evidenceFileRequired: question.evidence_file_required,
              hint: question.hint,
              isRequired: question.is_required,
              priorityLevel: question.priority_level,
              evidenceFiles: question.evidence_files || [],
              answer: question.answer,
            };
          }),
        };
      }),
    };
  });

  return topics;
};

const useAssessmentAnswers = ({ assessmentId }: AssessmentProps) => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAssessmentAnswers = useCallback(
    async ({ controller }: { controller: AbortController }) => {
      if (!controller) return;

      setIsLoading(true);
      setError(null);

      try {
        const response = await getAssessmentAnswers({
          assessmentId: assessmentId!,
        });
        if (response?.data?.message?.topics?.length > 0) {
          const topics = convertResponseAttributes(response);
          setTopics(topics);
        } else {
          setError("No assessment answers found for this project.");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        if (error instanceof Error) {
          setError(error.message);
        } else {
          setError(String(error));
        }
      } finally {
        setIsLoading(false);
      }
    },
    [assessmentId],
  );

  useEffect(() => {
    const controller = new AbortController();
    // Fetch assessment answers only if assessmentId is provided
    if (assessmentId) {
      fetchAssessmentAnswers({ controller });
    }
    return () => controller.abort();
  }, [assessmentId, fetchAssessmentAnswers]);

  return { topics, isLoading, error };
};

export default useAssessmentAnswers;
