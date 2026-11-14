import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import dayjs from "dayjs";
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
      // Local midnight on the picked day, as the date picker sends it.
      deadline: dayjs("2024-01-01").toISOString(),
      doc: "doc.pdf",
      likelihood: 2,
      riskSeverity: 1,
      approver: 10,
      approvalStatus: 3,
      dateOfAssessment: dayjs("2024-06-01").toISOString(),
    };

    const backendData = result.current.buildBackendData(values);

    expect(backendData).toMatchObject({
      mitigation_status: "Not Started",
      mitigation_plan: "Plan",
      current_risk_level: "High",
      implementation_strategy: "Strategy",
      deadline: "2024-01-01",
      mitigation_evidence_document: "doc.pdf",
      likelihood_mitigation: "Unlikely",
      risk_approval: 10,
      approval_status: "Completed",
      date_of_assessment: "2024-06-01",
    });
  });

  it("maps a stored residual severity of Critical back to Catastrophic (R-H1)", () => {
    const { result } = renderHook(() => useMitigationSection());

    const mapped = result.current.mapFromInputValues({ risk_severity: "Critical" });
    expect(mapped.riskSeverity).toBe(5);
    // A save without changes sends the same stored value back.
    expect(result.current.buildBackendData(mapped).risk_severity).toBe("Critical");
  });

  it("leaves values the risk never had empty instead of prefilling them (R-M12)", () => {
    const { result } = renderHook(() => useMitigationSection());

    const mapped = result.current.mapFromInputValues({
      mitigation_status: null,
      current_risk_level: null,
      deadline: null,
      risk_approval: null,
      approval_status: null,
      date_of_assessment: null,
    });

    expect(mapped.mitigationStatus).toBe(0);
    expect(mapped.currentRiskLevel).toBe(0);
    expect(mapped.deadline).toBe("");
    expect(mapped.approver).toBe(0);
    expect(mapped.approvalStatus).toBe(0);
    expect(mapped.dateOfAssessment).toBe("");
  });

  it("sends unset selects, dates and approver as null so the server clears them (R-M12)", () => {
    const { result } = renderHook(() => useMitigationSection());

    const backendData = result.current.buildBackendData({
      ...mitigationInitialState,
      mitigationStatus: 0,
      currentRiskLevel: 0,
      deadline: "",
      approver: 0,
      approvalStatus: 0,
      dateOfAssessment: "",
    });

    expect(backendData).toMatchObject({
      mitigation_status: null,
      current_risk_level: null,
      deadline: null,
      risk_approval: null,
      approval_status: null,
      date_of_assessment: null,
    });
  });
});
