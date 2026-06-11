import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMitigationSection, mitigationInitialState } from "../useMitigationSection";
import { MitigationFormValues } from "../../interface";

vi.mock("../../projectRiskValue", () => ({
  mitigationStatusItems: [{ _id: 1, name: "Not Started" }],
  riskLevelItems: [{ _id: 2, name: "High" }],
  approvalStatusItems: [{ _id: 3, name: "Completed" }],
  likelihoodItems: [
    { _id: 1, name: "Rare" },
    { _id: 2, name: "Unlikely" },
  ],
  riskSeverityItems: [
    { _id: 1, name: "Negligible" },
    { _id: 5, name: "Catastrophic" },
  ],
}));

describe("useMitigationSection", () => {
  it("initializes with default state", () => {
    const { result } = renderHook(() => useMitigationSection());

    expect(result.current.mitigationValues).toEqual(mitigationInitialState);
    expect(result.current.originalMitigationValues).toEqual(mitigationInitialState);
    expect(result.current.validateRef.current).toBeNull();
  });

  it("initializes with provided initial values", () => {
    const customInitial: MitigationFormValues = {
      ...mitigationInitialState,
      mitigationPlan: "Test plan",
    };
    const { result } = renderHook(() => useMitigationSection(customInitial));

    expect(result.current.mitigationValues.mitigationPlan).toBe("Test plan");
    expect(result.current.originalMitigationValues.mitigationPlan).toBe("Test plan");
  });

  it("updates mitigation values", () => {
    const { result } = renderHook(() => useMitigationSection());

    act(() => {
      result.current.setMitigationValues((prev) => ({
        ...prev,
        mitigationPlan: "Updated plan",
      }));
    });

    expect(result.current.mitigationValues.mitigationPlan).toBe("Updated plan");
  });

  it("maps input values to mitigation form values", () => {
    const { result } = renderHook(() => useMitigationSection());

    const inputValues = {
      mitigation_status: "Not Started",
      mitigation_plan: "Plan A",
      current_risk_level: "High",
      implementation_strategy: "Strategy A",
      deadline: "2024-01-15T00:00:00.000Z",
      mitigation_evidence_document: "doc.pdf",
      likelihood_mitigation: "Rare",
      risk_severity: "Catastrophic",
      risk_approval: 42,
      approval_status: "Completed",
      date_of_assessment: "2024-02-01T00:00:00.000Z",
      recommendations: "Do this",
    };

    const mapped = result.current.mapFromInputValues(inputValues);

    expect(mapped.mitigationStatus).toBe(1);
    expect(mapped.mitigationPlan).toBe("Plan A");
    expect(mapped.currentRiskLevel).toBe(2);
    expect(mapped.implementationStrategy).toBe("Strategy A");
    expect(mapped.deadline).toBe("2024-01-15T00:00:00.000Z");
    expect(mapped.doc).toBe("doc.pdf");
    expect(mapped.likelihood).toBe(1);
    expect(mapped.riskSeverity).toBe(5);
    expect(mapped.approver).toBe(42);
    expect(mapped.approvalStatus).toBe(3);
    expect(mapped.dateOfAssessment).toBe("2024-02-01T00:00:00.000Z");
    expect(mapped.recommendations).toBe("Do this");
  });

  it("maps Catastrophic severity to Critical in backend data", () => {
    const { result } = renderHook(() => useMitigationSection());

    const values: MitigationFormValues = {
      ...mitigationInitialState,
      riskSeverity: 5,
    };

    const backendData = result.current.buildBackendData(values);
    expect(backendData.risk_severity).toBe("Critical");
  });

  it("maps non-Catastrophic severity correctly in backend data", () => {
    const { result } = renderHook(() => useMitigationSection());

    const values: MitigationFormValues = {
      ...mitigationInitialState,
      riskSeverity: 1,
    };

    const backendData = result.current.buildBackendData(values);
    expect(backendData.risk_severity).toBe("Negligible");
  });

  it("builds complete backend data object", () => {
    const { result } = renderHook(() => useMitigationSection());

    const values: MitigationFormValues = {
      ...mitigationInitialState,
      mitigationStatus: 1,
      mitigationPlan: "Plan",
      currentRiskLevel: 2,
      implementationStrategy: "Strategy",
      deadline: "2024-01-01T00:00:00.000Z",
      doc: "doc.pdf",
      likelihood: 2,
      riskSeverity: 1,
      approver: 10,
      approvalStatus: 3,
      dateOfAssessment: "2024-06-01T00:00:00.000Z",
    };

    const backendData = result.current.buildBackendData(values);

    expect(backendData).toMatchObject({
      mitigation_status: "Not Started",
      mitigation_plan: "Plan",
      current_risk_level: "High",
      implementation_strategy: "Strategy",
      deadline: "2024-01-01T00:00:00.000Z",
      mitigation_evidence_document: "doc.pdf",
      likelihood_mitigation: "Unlikely",
      risk_approval: 10,
      approval_status: "Completed",
      date_of_assessment: "2024-06-01T00:00:00.000Z",
    });
  });
});
