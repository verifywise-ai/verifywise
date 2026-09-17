// Question identifiers
export type QuestionId =
  | "Q1"
  | "Q1a"
  | "Q1b"
  | "Q1c"
  | "Q1c_followup"
  | "Q1d"
  | "Q2"
  | "Q3"
  | "Q4"
  | "Q5";

// User's answers to the questionnaire
export interface IQuestionnaireAnswers {
  Q1?: string;
  Q1a?: string;
  Q1b?: string;
  Q1c?: string;
  Q1c_followup?: string;
  Q1d?: string;
  Q2?: string[];
  Q3?: string;
  Q4?: string;
  Q5?: string;
}

// Input types for questions
export type QuestionInputType = "single_select" | "multi_select";

// Question option interface
export interface IQuestionOption {
  value: string;
  label: string;
  description?: string;
}

// Question definition interface
export interface IQuestion {
  id: QuestionId;
  text: string;
  inputType: QuestionInputType;
  options: IQuestionOption[];
  isRequired: boolean;
  showCondition?: (answers: IQuestionnaireAnswers) => boolean;
}

export type RiskClassification =
  | "PROHIBITED"
  | "HIGH_RISK"
  | "LIMITED_RISK"
  | "MINIMAL_RISK"
  | "PENDING";

export interface ClassificationResult {
  level: RiskClassification;
}

export interface ResultsDisplayProps {
  classification: ClassificationResult;
  answers: IQuestionnaireAnswers;
  onRestart?: () => void;
  onSave?: () => void;
}
