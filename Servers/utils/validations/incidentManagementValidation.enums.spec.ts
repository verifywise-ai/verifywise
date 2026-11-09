import {
  AIIncidentManagementApprovalStatus,
  AIIncidentManagementStatus,
  Severity,
} from "../../domain.layer/enums/ai-incident-management.enum";
import {
  APPROVAL_STATUS_ENUM,
  INCIDENT_SEVERITY_ENUM,
  INCIDENT_STATUS_ENUM,
  validateApprovalStatus,
  validateSeverity,
  validateStatus,
} from "./incidentManagementValidation.utils";

describe("incident badge allow-lists", () => {
  it("matches the incident severity enum, including Very serious", () => {
    expect([...INCIDENT_SEVERITY_ENUM].sort()).toEqual(Object.values(Severity).sort());
    expect(validateSeverity("Very serious").isValid).toBe(true);
    expect(validateSeverity("Very Serious").isValid).toBe(false);
  });

  it("matches the incident status enum", () => {
    expect([...INCIDENT_STATUS_ENUM].sort()).toEqual(
      Object.values(AIIncidentManagementStatus).sort(),
    );
    expect(validateStatus("Emergency action").isValid).toBe(true);
  });

  it("matches the approval status enum, including Not required", () => {
    expect([...APPROVAL_STATUS_ENUM].sort()).toEqual(
      Object.values(AIIncidentManagementApprovalStatus).sort(),
    );
    expect(validateApprovalStatus("Not required").isValid).toBe(true);
    expect(validateApprovalStatus("Not Required").isValid).toBe(false);
  });
});
