import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IAIIncidentManagement } from "../../interfaces/i.aiIncidentManagement";
import { ValidationException } from "../../exceptions/custom.exception";
import {
  AIIncidentManagementApprovalStatus,
  AIIncidentManagementStatus,
  IncidentType,
  Severity,
} from "../../enums/ai-incident-management.enum";

@Table({
  tableName: "ai_incident_managements",
  timestamps: true,
  underscored: true,
})
export class AIIncidentManagementModel
  extends Model<AIIncidentManagementModel>
  implements IAIIncidentManagement
{
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  incident_id?: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  ai_project!: string;

  @Column({
    type: DataType.ENUM(...Object.values(IncidentType)),
    allowNull: false,
  })
  type!: IncidentType;

  @Column({
    type: DataType.ENUM(...Object.values(Severity)),
    allowNull: false,
  })
  severity!: Severity;

  @Column({
    type: DataType.ENUM(...Object.values(AIIncidentManagementStatus)),
    allowNull: false,
  })
  status!: AIIncidentManagementStatus;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  occurred_date!: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  date_detected!: Date;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  reporter!: string;

  @Column({
    type: DataType.ENUM(...Object.values(AIIncidentManagementApprovalStatus)),
    allowNull: false,
  })
  approval_status!: AIIncidentManagementApprovalStatus;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  approved_by?: string;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  approval_date?: Date;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  approval_notes?: string;

  @Column({
    type: DataType.ARRAY(DataType.STRING),
    allowNull: false,
    defaultValue: [],
  })
  categories_of_harm!: string[];

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  affected_persons_groups?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  description!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  relationship_causality?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  immediate_mitigations?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  planned_corrective_actions?: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  model_system_version?: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: true,
    defaultValue: false,
  })
  interim_report?: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  archived?: boolean;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  created_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  updated_at?: Date;

  /**
   * Validation before saving
   */
  async validateIncidentData(): Promise<void> {
    if (!this.ai_project?.trim())
      throw new ValidationException("AI Project is required", "aiProject", this.ai_project);
    if (!this.description?.trim())
      throw new ValidationException("Description is required", "description", this.description);
    if (!this.categories_of_harm || !this.categories_of_harm.length)
      throw new ValidationException(
        "At least one category of harm is required",
        "categoriesOfHarm",
        this.categories_of_harm,
      );
    if (!this.relationship_causality?.trim())
      throw new ValidationException(
        "Relationship/Causality is required",
        "relationshipCausality",
        this.relationship_causality,
      );
    if (!this.severity)
      throw new ValidationException("Severity is required", "severity", this.severity);
    if (!this.occurred_date)
      throw new ValidationException(
        "Date occurred is required",
        "occurredDate",
        this.occurred_date,
      );
    if (!this.date_detected)
      throw new ValidationException(
        "Date detected is required",
        "dateDetected",
        this.date_detected,
      );
    if (!this.reporter?.trim())
      throw new ValidationException("Reporter is required", "reporter", this.reporter);
  }

  /**
   * Get incident data without sensitive or internal information
   */
  toSafeJSON(): any {
    return {
      id: this.id,
      incident_id: this.incident_id,
      ai_project: this.ai_project,
      type: this.type,
      severity: this.severity,
      status: this.status,
      occurred_date: this.occurred_date?.toISOString(),
      date_detected: this.date_detected?.toISOString(),
      reporter: this.reporter,
      categories_of_harm: this.categories_of_harm || [],
      affected_persons_groups: this.affected_persons_groups,
      description: this.description,
      relationship_causality: this.relationship_causality,
      immediate_mitigations: this.immediate_mitigations,
      planned_corrective_actions: this.planned_corrective_actions,
      model_system_version: this.model_system_version,
      interim_report: this.interim_report,
      archived: this.archived,
      approval_status: this.approval_status,
      approved_by: this.approved_by,
      approval_date: this.approval_date?.toISOString() || null,
      approval_notes: this.approval_notes,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString(),
    };
  }

  /**
   * Create AIIncidentManagementModel instance from JSON data
   */

  static fromJSON(json: any): AIIncidentManagementModel {
    return new AIIncidentManagementModel(json);
  }

  /**
   * Convert full incident model to JSON representation
   */
  toJSON(): any {
    return {
      id: this.id,
      incident_id: this.incident_id,
      ai_project: this.ai_project,
      type: this.type,
      severity: this.severity,
      status: this.status,
      occurred_date: this.occurred_date?.toISOString(),
      date_detected: this.date_detected?.toISOString(),
      reporter: this.reporter,
      categories_of_harm: this.categories_of_harm || [],
      affected_persons_groups: this.affected_persons_groups,
      description: this.description,
      relationship_causality: this.relationship_causality,
      immediate_mitigations: this.immediate_mitigations,
      planned_corrective_actions: this.planned_corrective_actions,
      model_system_version: this.model_system_version,
      interim_report: this.interim_report,
      archived: this.archived,
      approval_status: this.approval_status,
      approved_by: this.approved_by,
      approval_date: this.approval_date?.toISOString() || null,
      approval_notes: this.approval_notes,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString(),
    };
  }

  /**
   * Create a new incident
   */
  static createNewIncident(data: Partial<IAIIncidentManagement>): AIIncidentManagementModel {
    const incident = new AIIncidentManagementModel({
      ai_project: data.ai_project || "",
      type: data.type!,
      severity: data.severity!,
      status: data.status || AIIncidentManagementStatus.OPEN,
      occurred_date: data.occurred_date || new Date(),
      date_detected: data.date_detected || new Date(),
      reporter: data.reporter || "",
      categories_of_harm: data.categories_of_harm || [],
      affected_persons_groups: data.affected_persons_groups || "",
      description: data.description || "",
      relationship_causality: data.relationship_causality || "",
      immediate_mitigations: data.immediate_mitigations || "",
      planned_corrective_actions: data.planned_corrective_actions || "",
      model_system_version: data.model_system_version || "",
      interim_report: data.interim_report || false,
      archived: data.archived || false,
      approval_status: data.approval_status || AIIncidentManagementApprovalStatus.PENDING,
      approved_by: data.approved_by || "",
      approval_date: data.approval_date || undefined,
      approval_notes: data.approval_notes || "",
      created_at: new Date(),
      updated_at: new Date(),
    });
    return incident;
  }

  /**
   * Update an existing incident
   */
  static updateIncident(
    existingIncident: AIIncidentManagementModel,
    data: Partial<IAIIncidentManagement>,
  ): AIIncidentManagementModel {
    Object.assign(existingIncident, {
      ai_project: data.ai_project ?? existingIncident.ai_project,
      type: data.type ?? existingIncident.type,
      severity: data.severity ?? existingIncident.severity,
      status: data.status ?? existingIncident.status,
      occurred_date: data.occurred_date ?? existingIncident.occurred_date,
      date_detected: data.date_detected ?? existingIncident.date_detected,
      reporter: data.reporter ?? existingIncident.reporter,
      categories_of_harm: data.categories_of_harm ?? existingIncident.categories_of_harm,
      affected_persons_groups:
        data.affected_persons_groups ?? existingIncident.affected_persons_groups,
      description: data.description ?? existingIncident.description,
      relationship_causality:
        data.relationship_causality ?? existingIncident.relationship_causality,
      immediate_mitigations: data.immediate_mitigations ?? existingIncident.immediate_mitigations,
      planned_corrective_actions:
        data.planned_corrective_actions ?? existingIncident.planned_corrective_actions,
      model_system_version: data.model_system_version ?? existingIncident.model_system_version,
      interim_report: data.interim_report ?? existingIncident.interim_report,
      archived: data.archived ?? existingIncident.archived,
      approval_status: data.approval_status ?? existingIncident.approval_status,
      approved_by: data.approved_by ?? existingIncident.approved_by,
      approval_date: data.approval_date ?? existingIncident.approval_date,
      approval_notes: data.approval_notes ?? existingIncident.approval_notes,
      updated_at: new Date(),
    });

    return existingIncident;
  }

  /**
   * Archive (or unarchive) an incident
   */
  static archiveIncident(
    existingIncident: AIIncidentManagementModel,
    archived: boolean = true,
  ): AIIncidentManagementModel {
    existingIncident.archived = archived;
    existingIncident.updated_at = new Date();
    return existingIncident;
  }

  constructor(init?: Partial<IAIIncidentManagement>) {
    super();
    Object.assign(this, init);
  }
}
