import {
  AIIncidentManagementApprovalStatus,
  AIIncidentManagementStatus,
  IncidentType,
  Severity,
} from "../../enums/ai-incident-management.enum";
import { IAIIncidentManagement } from "../../interfaces/i.aiIncidentManagement";

/**
 * Sample mock data for AI Incident Management
 */
const mockAIIncidents = (reporter1: string, reporter2: string): IAIIncidentManagement[] => {
  return [
    {
      id: 1,
      incident_id: "INC-1001",
      ai_project: "Fraud Detection System",
      type: IncidentType.MODEL_DRIFT,
      severity: Severity.MINOR,
      status: AIIncidentManagementStatus.OPEN,
      occurred_date: new Date("2025-01-10"),
      date_detected: new Date("2025-01-12"),
      reporter: reporter1,
      approval_status: AIIncidentManagementApprovalStatus.PENDING,
      approved_by: "",
      categories_of_harm: ["Financial Impact", "Customer Trust"],
      affected_persons_groups: "Customers using credit evaluation model",
      description:
        "Unexpected model drift detected, causing higher false positive rates in fraud detection.",
      relationship_causality: "Direct relationship with AI model retraining cycle",
      immediate_mitigations:
        "Temporarily disabled auto-retrain and reverted to last stable version.",
      planned_corrective_actions: "Conduct data quality audit and retrain with verified dataset.",
      model_system_version: "v2.3.1",
      interim_report: false,
      archived: false,
      created_at: new Date("2025-01-12"),
      updated_at: new Date("2025-01-12"),
    },
    {
      id: 2,
      incident_id: "INC-1002",
      ai_project: "Content Moderation Engine",
      type: IncidentType.UNEXPECTED_BEHAVIOR,
      severity: Severity.MINOR,
      status: AIIncidentManagementStatus.INVESTIGATING,
      occurred_date: new Date("2025-02-02"),
      date_detected: new Date("2025-02-03"),
      reporter: reporter2,
      approval_status: AIIncidentManagementApprovalStatus.APPROVED,
      approved_by: "John Smith (Compliance Officer)",
      categories_of_harm: ["Reputation", "Fairness"],
      affected_persons_groups: "Social media content creators",
      description:
        "AI system flagged non-harmful content as inappropriate due to keyword misinterpretation.",
      relationship_causality: "Partially related to bias in keyword-based classification module.",
      immediate_mitigations: "Rolled back keyword weights and adjusted thresholds.",
      planned_corrective_actions: "Introduce contextual NLP analysis in next release.",
      model_system_version: "v1.4.0",
      interim_report: true,
      archived: false,
      created_at: new Date("2025-02-03"),
      updated_at: new Date("2025-02-05"),
    },
    {
      id: 3,
      incident_id: "INC-1003",
      ai_project: "Healthcare Diagnosis Assistant",
      type: IncidentType.DATA_CORRUPTION,
      severity: Severity.VERY_SERIOUS,
      status: AIIncidentManagementStatus.MITIGATED,
      occurred_date: new Date("2025-03-18"),
      date_detected: new Date("2025-03-20"),
      reporter: reporter1,
      approval_status: AIIncidentManagementApprovalStatus.REJECTED,
      approved_by: "Sarah Johnson (AI Lead)",
      categories_of_harm: ["Safety", "Ethical Concerns"],
      affected_persons_groups: "Patients diagnosed with rare conditions",
      description: "Corrupted data input caused misdiagnosis in patient recommendation module.",
      relationship_causality: "Directly caused by faulty data ingestion pipeline.",
      immediate_mitigations: "Isolated corrupted dataset and restored backups.",
      planned_corrective_actions: "Add validation checks and monitoring for input data integrity.",
      model_system_version: "v3.0.2",
      interim_report: false,
      archived: false,
      created_at: new Date("2025-03-20"),
      updated_at: new Date("2025-03-21"),
    },
  ];
};

export { mockAIIncidents };
