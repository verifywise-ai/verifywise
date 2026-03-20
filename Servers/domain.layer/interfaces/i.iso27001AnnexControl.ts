export type ControlStatus =
  | "Waiting"
  | "In progress"
  | "Done"
  | "Review"
  | "Approved";

export interface IISO27001AnnexControl {
  id?: number;
  implementation_description: string;
  // NOTE: evidence_links are now stored in file_entity_links table
  status: string;
  owner: number;
  reviewer: number;
  approver: number;
  due_date: Date;
  auditor_feedback: string;
  annexcontrol_meta_id: number;
  projects_frameworks_id: number;
  created_at: Date;
  is_demo: boolean;
}
