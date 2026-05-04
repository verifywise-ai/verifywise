// interfaces/i.aiIncidentManagement.ts
import {
  AIIncidentManagementStatus,
  AIIncidentManagementApprovalStatus,
  Severity,
  IncidentType,
} from "../enums/ai-incident-management.enum";

export interface IAIIncidentManagement {
  id?: number;
  incident_id?: string; // For UI/display
  ai_project: string;
  type: IncidentType;
  severity: Severity;
  status: AIIncidentManagementStatus;
  occurred_date: Date | string;
  date_detected: Date | string;
  reporter: string;
  categories_of_harm: string[]; // Array of strings
  affected_persons_groups?: string;
  description: string;
  relationship_causality?: string;
  immediate_mitigations?: string;
  planned_corrective_actions?: string;
  model_system_version?: string;
  interim_report?: boolean;
  archived?: boolean;
  approval_status: AIIncidentManagementApprovalStatus;
  approved_by?: string;
  approval_date?: Date | string;
  approval_notes?: string;
  created_at?: Date;
  updated_at?: Date;
}
