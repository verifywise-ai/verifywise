import { Question } from "../../../../domain/types/Question";
import { Subtopic } from "../../../../domain/types/Subtopic";

export interface EUAIActQuestionDrawerProps {
  open: boolean;
  onClose: () => void;
  question: Question;
  subtopic: Subtopic;
  currentProjectId: number;
  projectFrameworkId?: number;
  onSaveSuccess: (success: boolean, message?: string, questionId?: number) => void;
}

export interface EUAIActFormData {
  answer: string;
  status: string;
}

export const EUAIACT_STATUS_OPTIONS = [
  { id: "notStarted", name: "Not started" },
  { id: "inProgress", name: "In progress" },
  { id: "done", name: "Done" },
];
