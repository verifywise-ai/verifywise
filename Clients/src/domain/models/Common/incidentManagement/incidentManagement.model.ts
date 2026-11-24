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
  /** "YYYY-MM-DD" (a calendar day, no time). */
  occurred_date!: string;
  /** "YYYY-MM-DD" (a calendar day, no time). */
  date_detected!: string;
  /** Reporter's name as stored: the user's full name, or free text (Jira, older rows). */
  reporter!: string;
  /** FK to users: the reporter, when picked from the organization's users. */
  reporter_id?: number | null;
  /** The reporter_id user's current full name (null without one). */
  reporter_name?: string | null;
  categories_of_harm!: string[];
  affected_persons_groups?: string;
  description!: string;
  relationship_causality?: string;
  immediate_mitigations?: string;
  planned_corrective_actions?: string;
  model_system_version?: string;
  interim_report?: boolean;
  /** "YYYY-MM-DD", the day the approval decision was recorded. */
  approval_date?: string | null;
  approval_notes?: string;
  approval_status!: AIIncidentManagementApprovalStatus;
  approved_by!: string;
  /** FK to users: who recorded the approval decision (set by the server). */
  approved_by_id?: number | null;
  /** The approved_by_id user's current full name (null without one). */
  approved_by_name?: string | null;
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
    this.reporter_id = data.reporter_id ?? null;
    this.reporter_name = data.reporter_name ?? null;
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
    this.approved_by_id = data.approved_by_id ?? null;
    this.approved_by_name = data.approved_by_name ?? null;
    this.archived = data.archived;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  /** Who reported it, for display: the reporter user's full name, else the stored text. */
  static reporterLabel(incident: Pick<AIIncidentManagementModel, "reporter" | "reporter_name">) {
    return incident.reporter_name || incident.reporter || "";
  }

  /** Who approved it, for display: the approver user's full name, else the stored text. */
  static approverLabel(
    incident: Pick<AIIncidentManagementModel, "approved_by" | "approved_by_name">,
  ) {
    return incident.approved_by_name || incident.approved_by || "";
  }

  static createNewIncident(data: AIIncidentManagementModel): AIIncidentManagementModel {
    return new AIIncidentManagementModel(data);
  }
}
