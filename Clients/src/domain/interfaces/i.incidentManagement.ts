import {
  AIIncidentManagementApprovalStatus,
  IncidentManagementStatus,
  Severity,
} from "../enums/aiIncidentManagement.enum";

export interface IAIIncidentManagement {
  id: number;
  incident_id: string;
  ai_project: string;
  type: string;
  severity: Severity;
  status: IncidentManagementStatus;
  occurred_date: string;
  date_detected: string;
  reporter: string;
  categories_of_harm: string[];
  affected_persons_groups?: string;
  description: string;
  relationship_causality?: string;
  immediate_mitigations?: string;
  planned_corrective_actions?: string;
  model_system_version?: string;
  interim_report?: boolean;
  approval_date?: string;
  approval_notes?: string;
  approval_status: AIIncidentManagementApprovalStatus;
  approved_by: string;
  archived: boolean;
  created_at?: Date;
  updated_at?: Date;
}
