import { FileData } from "./File";

export type Question = {
  question_id?: number;
  order_no?: number;
  question: string;
  hint: string;
  priority_level: "high priority" | "medium priority" | "low priority";
  answer_type: string;
  input_type: string;
  evidence_required: boolean;
  is_required: boolean;
  dropdown_options?: any[];
  evidence_files?: FileData[];
  answer?: string;
  subtopic_id: number;
  status: string;
  answer_id: number;
  risks: number[];
  /** Set when this EU AI Act (organization) item was copied from a use case's work; cleared on save. */
  copied_from_project_id?: number | null;
  /** That use case, for example "Credit scoring (UC-12)". */
  copied_from_use_case?: string | null;
};
