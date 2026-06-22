import { AiRiskClassification } from "../enums/ai-risk-classification.enum";
import {
  ApprovalStatus,
  ApprovalRequestStatus,
  ApprovalStepStatus,
  ApprovalResult,
  EntityType,
} from "../enums/approval-workflow.enum";
import { DataClassification } from "../enums/data-classification.enum";
import { DatasetStatus } from "../enums/dataset-status.enum";
import { DatasetType } from "../enums/dataset-type.enum";
import { FriaStatus, FriaRiskLevel, FriaLikelihood, FriaSeverity } from "../enums/fria-status.enum";
import { HighRiskRole } from "../enums/high-risk-role.enum";
import { IntakeEntityType } from "../enums/intake-entity-type.enum";
import { IntakeFormStatus } from "../enums/intake-form-status.enum";
import { IntakeSubmissionStatus } from "../enums/intake-submission-status.enum";
import { ModelInventoryStatus } from "../enums/model-inventory-status.enum";
import { NISTAIMRFFunctionType, NISTFunctionTitles } from "../enums/nist-ai-rmf-function.enum";
import { PluginInstallationStatus } from "../enums/plugin.enum";
import { SlackNotificationRoutingType } from "../enums/slack.enum";
import { UserDateFormat } from "../enums/user-preferences.enum";
import {
  AIIncidentManagementStatus,
  AIIncidentManagementApprovalStatus,
  Severity,
  IncidentType,
} from "../enums/ai-incident-management.enum";
import { ModelRiskCategory } from "../enums/model-risk-category.enum";
import { ModelRiskLevel } from "../enums/model-risk-level.enum";
import { ModelRiskStatus } from "../enums/model-risk-status.enum";
import { LinkedObjectType } from "../enums/policy-manager.enum";
import { ProjectStatus } from "../enums/project-status.enum";
import { TaskPriority } from "../enums/task-priority.enum";
import { TaskStatus } from "../enums/task-status.enum";

/**
 * Helper to verify enum has expected keys and no duplicate values
 */
function verifyEnum(enumObj: Record<string, string>, expectedKeys: string[]) {
  const keys = Object.keys(enumObj).filter((k) => isNaN(Number(k)));
  expect(keys.sort()).toEqual(expectedKeys.sort());

  // Check no duplicate values
  const values = Object.values(enumObj);
  const uniqueValues = new Set(values);
  expect(uniqueValues.size).toBe(values.length);
}

describe("Domain Enums", () => {
  describe("AiRiskClassification", () => {
    it("should have all expected values", () => {
      verifyEnum(AiRiskClassification, [
        "PROHIBITED",
        "HIGH_RISK",
        "LIMITED_RISK",
        "MINIMAL_RISK",
        "GPAI",
        "GENERAL_RISK",
      ]);
    });

    it("should have correct string values", () => {
      expect(AiRiskClassification.PROHIBITED).toBe("Prohibited");
      expect(AiRiskClassification.HIGH_RISK).toBe("High risk");
    });
  });

  describe("ApprovalWorkflow enums", () => {
    it("ApprovalStatus should have expected values", () => {
      verifyEnum(ApprovalStatus, ["PENDING", "APPROVED", "REJECTED"]);
    });

    it("ApprovalRequestStatus should have expected values", () => {
      verifyEnum(ApprovalRequestStatus, ["PENDING", "APPROVED", "REJECTED", "WITHDRAWN"]);
    });

    it("ApprovalStepStatus should have expected values", () => {
      verifyEnum(ApprovalStepStatus, ["PENDING", "COMPLETED", "REJECTED"]);
    });

    it("ApprovalResult should have expected values", () => {
      verifyEnum(ApprovalResult, ["APPROVED", "REJECTED", "PENDING"]);
    });

    it("EntityType should have expected values", () => {
      verifyEnum(EntityType, [
        "USE_CASE",
        "FILE",
        "RISK",
        "VENDOR",
        "MODEL_INVENTORY",
        "POLICY",
        "INCIDENT",
        "TASK",
        "DATASET",
        "TRAINING",
        "EVIDENCE",
        "AI_ACTION",
        "AUTOMATION",
        "PMM_CONFIG",
        "NOTE",
      ]);
      expect(EntityType.USE_CASE).toBe("use_case");
    });
  });

  describe("DataClassification", () => {
    it("should have expected values", () => {
      verifyEnum(DataClassification, ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]);
    });
  });

  describe("DatasetStatus", () => {
    it("should have expected values", () => {
      verifyEnum(DatasetStatus, ["DRAFT", "ACTIVE", "DEPRECATED", "ARCHIVED"]);
    });
  });

  describe("DatasetType", () => {
    it("should have expected values", () => {
      verifyEnum(DatasetType, ["TRAINING", "VALIDATION", "TESTING", "PRODUCTION", "REFERENCE"]);
    });
  });

  describe("FRIA enums", () => {
    it("FriaStatus should have expected values", () => {
      verifyEnum(FriaStatus, ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]);
    });

    it("FriaRiskLevel should have expected values", () => {
      verifyEnum(FriaRiskLevel, ["LOW", "MEDIUM", "HIGH"]);
    });

    it("FriaLikelihood should have expected values", () => {
      verifyEnum(FriaLikelihood, ["LOW", "MEDIUM", "HIGH"]);
    });

    it("FriaSeverity should have expected values", () => {
      verifyEnum(FriaSeverity, ["LOW", "MEDIUM", "HIGH"]);
    });
  });

  describe("HighRiskRole", () => {
    it("should have expected values", () => {
      verifyEnum(HighRiskRole, ["DEPLOYER", "PROVIDER"]);
    });
  });

  describe("IntakeEntityType", () => {
    it("should have expected values", () => {
      verifyEnum(IntakeEntityType, ["MODEL", "USE_CASE"]);
    });
  });

  describe("IntakeFormStatus", () => {
    it("should have expected values", () => {
      verifyEnum(IntakeFormStatus, ["DRAFT", "ACTIVE", "ARCHIVED"]);
    });
  });

  describe("IntakeSubmissionStatus", () => {
    it("should have expected values", () => {
      verifyEnum(IntakeSubmissionStatus, ["PENDING", "APPROVED", "REJECTED", "SUPERSEDED"]);
    });
  });

  describe("ModelInventoryStatus", () => {
    it("should have expected values", () => {
      verifyEnum(ModelInventoryStatus, [
        "APPROVED",
        "RESTRICTED",
        "PENDING",
        "BLOCKED",
        "REJECTED",
      ]);
    });
  });

  describe("NIST AI RMF", () => {
    it("NISTAIMRFFunctionType should have expected values", () => {
      verifyEnum(NISTAIMRFFunctionType, ["GOVERN", "MAP", "MEASURE", "MANAGE"]);
    });

    it("NISTFunctionTitles should map all function types", () => {
      expect(NISTFunctionTitles[NISTAIMRFFunctionType.GOVERN]).toBe("Govern");
      expect(NISTFunctionTitles[NISTAIMRFFunctionType.MAP]).toBe("Map");
      expect(NISTFunctionTitles[NISTAIMRFFunctionType.MEASURE]).toBe("Measure");
      expect(NISTFunctionTitles[NISTAIMRFFunctionType.MANAGE]).toBe("Manage");
    });
  });

  describe("PluginInstallationStatus", () => {
    it("should have expected values", () => {
      verifyEnum(PluginInstallationStatus, ["INSTALLED"]);
    });
  });

  describe("SlackNotificationRoutingType", () => {
    it("should have expected values", () => {
      verifyEnum(SlackNotificationRoutingType, [
        "MEMBERSHIP_AND_ROLES",
        "PROJECTS_AND_ORGANIZATIONS",
        "POLICY_REMINDERS_AND_STATUS",
        "EVIDENCE_AND_TASK_ALERTS",
        "CONTROL_OR_POLICY_CHANGES",
      ]);
    });
  });

  describe("UserDateFormat", () => {
    it("should have expected values", () => {
      verifyEnum(UserDateFormat, [
        "DD_MM_YYYY_DASH",
        "MM_DD_YYYY_DASH",
        "DD_MM_YY_SLASH",
        "MM_DD_YY_SLASH",
      ]);
    });
  });

  describe("AI Incident Management enums", () => {
    it("AIIncidentManagementStatus should have expected values", () => {
      verifyEnum(AIIncidentManagementStatus, ["OPEN", "INVESTIGATING", "MITIGATED", "CLOSED"]);
    });

    it("AIIncidentManagementApprovalStatus should have expected values", () => {
      verifyEnum(AIIncidentManagementApprovalStatus, [
        "APPROVED",
        "REJECTED",
        "PENDING",
        "NOT_REQUIRED",
      ]);
    });

    it("Severity should have expected values", () => {
      verifyEnum(Severity, ["MINOR", "SERIOUS", "VERY_SERIOUS"]);
    });

    it("IncidentType should have expected values", () => {
      verifyEnum(IncidentType, [
        "MALFUNCTION",
        "UNEXPECTED_BEHAVIOR",
        "MODEL_DRIFT",
        "MISUSE",
        "DATA_CORRUPTION",
        "SECURITY_BREACH",
        "PERFORMANCE_DEGRADATION",
      ]);
    });
  });

  describe("ModelRiskCategory", () => {
    it("should have expected values", () => {
      verifyEnum(ModelRiskCategory, [
        "PERFORMANCE",
        "BIAS",
        "SECURITY",
        "DATA_QUALITY",
        "COMPLIANCE",
      ]);
    });
  });

  describe("ModelRiskLevel", () => {
    it("should have expected values", () => {
      verifyEnum(ModelRiskLevel, ["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
    });
  });

  describe("ModelRiskStatus", () => {
    it("should have expected values", () => {
      verifyEnum(ModelRiskStatus, ["OPEN", "IN_PROGRESS", "RESOLVED", "ACCEPTED"]);
    });
  });

  describe("LinkedObjectType", () => {
    it("should have expected values", () => {
      verifyEnum(LinkedObjectType, ["CONTROL", "RISK", "EVIDENCE"]);
    });
  });

  describe("ProjectStatus", () => {
    it("should have expected values", () => {
      verifyEnum(ProjectStatus, [
        "NOT_STARTED",
        "IN_PROGRESS",
        "UNDER_REVIEW",
        "COMPLETED",
        "CLOSED",
        "ON_HOLD",
        "REJECTED",
      ]);
    });
  });

  describe("TaskPriority", () => {
    it("should have expected values", () => {
      verifyEnum(TaskPriority, ["LOW", "MEDIUM", "HIGH"]);
    });
  });

  describe("TaskStatus", () => {
    it("should have expected values", () => {
      verifyEnum(TaskStatus, ["OPEN", "IN_PROGRESS", "COMPLETED", "OVERDUE", "DELETED"]);
    });
  });
});
