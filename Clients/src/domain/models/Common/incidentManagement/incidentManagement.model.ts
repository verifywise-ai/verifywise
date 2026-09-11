import {
  AIIncidentManagementApprovalStatus,
  IncidentManagementStatus,
  Severity,
} from "../../../enums/aiIncidentManagement.enum";

export class AIIncidentManagementModel {
  id!: number;
  incident_id!: string;
  ai_project!: string;
  /** FK to model_inventories (issue #4583). */
  model_inventory_id?: number | null;
  /** FK to projects (issue #4583). */
  project_id?: number | null;
  /** FK to users — responsible owner (issue #4583). */
  assignee_id?: number | null;
  /** Joined display names (populated by the API). */
  model_inventory_name?: string | null;
  project_title?: string | null;
  assignee_name?: string | null;
  type!: string;
  severity!: Severity;
  status!: IncidentManagementStatus;
  occurred_date!: string;
  date_detected!: string;
  reporter!: string;
  categories_of_harm!: string[];
  affected_persons_groups?: string;
  description!: string;
  relationship_causality?: string;
  immediate_mitigations?: string;
  planned_corrective_actions?: string;
  model_system_version?: string;
  interim_report?: boolean;
  approval_date?: string;
  approval_notes?: string;
  approval_status!: AIIncidentManagementApprovalStatus;
  approved_by!: string;
  archived!: boolean;
  created_at?: Date;
  updated_at?: Date;

  constructor(data: AIIncidentManagementModel) {
    this.id = data.id;
    this.incident_id = data.incident_id;
    this.ai_project = data.ai_project;
    this.model_inventory_id = data.model_inventory_id ?? null;
    this.project_id = data.project_id ?? null;
    this.assignee_id = data.assignee_id ?? null;
    this.model_inventory_name = data.model_inventory_name ?? null;
    this.project_title = data.project_title ?? null;
    this.assignee_name = data.assignee_name ?? null;
    this.type = data.type;
    this.severity = data.severity;
    this.status = data.status;
    this.occurred_date = data.occurred_date;
    this.date_detected = data.date_detected;
    this.reporter = data.reporter;
    this.categories_of_harm = data.categories_of_harm;
    this.affected_persons_groups = data.affected_persons_groups;
    this.description = data.description;
    this.relationship_causality = data.relationship_causality;
    this.immediate_mitigations = data.immediate_mitigations;
    this.planned_corrective_actions = data.planned_corrective_actions;
    this.model_system_version = data.model_system_version;
    this.interim_report = data.interim_report;
    this.approval_date = data.approval_date;
    this.approval_notes = data.approval_notes;
    this.approval_status = data.approval_status;
    this.approved_by = data.approved_by;
    this.archived = data.archived;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  static createNewIncident(data: AIIncidentManagementModel): AIIncidentManagementModel {
    return new AIIncidentManagementModel(data);
  }
}
