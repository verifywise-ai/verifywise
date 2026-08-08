/**
 * Phase 6 — incident_response workflow definition tests (issue 3813).
 *
 * Trigger: incident.severity = critical.
 * Steps (Incident + Risk + Compliance agents):
 *   classify_incident -> link_related_risks -> create_remediation_tasks ->
 *   escalate_notify_admins
 *
 * The definition is pure data + step handlers. Handlers call the real domain
 * tool maps (availableIncidentTools / availableRiskTools), which are mocked
 * here so no DB / approval gateway is touched. Write steps gate by returning a
 * pause result per the engine's contract.
 */

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

jest.mock("../../../../advisor/functions/incidentFunctions", () => ({
  availableIncidentTools: { fetch_incidents: jest.fn() },
}));
jest.mock("../../../../advisor/functions/riskFunctions", () => ({
  availableRiskTools: { fetch_risks: jest.fn() },
}));
jest.mock("../../approvalGate", () => ({
  requestGateApproval: jest.fn(async (_ctx, _workflowId, _stepId, description) => ({
    type: "pause",
    reason: description,
    approvalId: "appr-test",
  })),
}));

import { incidentResponseWorkflow } from "../incidentResponse.workflow";
import type { WorkflowContext } from "../../types";
import { availableIncidentTools } from "../../../../advisor/functions/incidentFunctions";
import { availableRiskTools } from "../../../../advisor/functions/riskFunctions";
import { requestGateApproval } from "../../approvalGate";

const fetchIncidents = availableIncidentTools.fetch_incidents as unknown as jest.Mock;
const fetchRisks = availableRiskTools.fetch_risks as unknown as jest.Mock;
const mockRequestGateApproval = requestGateApproval as unknown as jest.Mock;

function ctx(overrides: Partial<WorkflowContext> = {}): WorkflowContext {
  return {
    workflowRunId: 1,
    organizationId: 42,
    userId: 7,
    triggerPayload: { incidentId: 99, severity: "critical" },
    results: {},
    ...overrides,
  };
}

function stepById(id: string) {
  const step = incidentResponseWorkflow.steps.find((s) => s.id === id);
  if (!step) throw new Error(`step ${id} not found`);
  return step;
}

beforeEach(() => {
  fetchIncidents.mockReset();
  fetchRisks.mockReset();
});

describe("workflows / incidentResponse definition shape", () => {
  it("exports a WorkflowDefinition with the incident_response key and critical trigger", () => {
    expect(incidentResponseWorkflow.id).toBe("incident_response");
    expect(incidentResponseWorkflow.triggerName).toBe("incident.critical");
    expect(incidentResponseWorkflow.name).toEqual(expect.any(String));
  });

  it("declares the Incident, Risk and Compliance agents", () => {
    expect(incidentResponseWorkflow.agents).toEqual(
      expect.arrayContaining(["incident", "risk", "compliance"]),
    );
  });

  it("declares the four steps in order", () => {
    expect(incidentResponseWorkflow.steps.map((s) => s.id)).toEqual([
      "classify_incident",
      "link_related_risks",
      "create_remediation_tasks",
      "escalate_notify_admins",
    ]);
  });

  it("marks the create/escalate steps as writes and the read steps as non-writes", () => {
    expect(stepById("classify_incident").isWrite).toBe(false);
    expect(stepById("link_related_risks").isWrite).toBe(false);
    expect(stepById("create_remediation_tasks").isWrite).toBe(true);
    expect(stepById("escalate_notify_admins").isWrite).toBe(true);
  });
});

describe("workflows / incidentResponse classify_incident (key decision)", () => {
  it("classifies and proceeds (ok) when the incident is critical (Very serious)", async () => {
    fetchIncidents.mockResolvedValue([
      { id: 99, severity: "Very serious", type: "Security breach" },
    ]);

    const result = await stepById("classify_incident").handler(ctx());

    expect(fetchIncidents).toHaveBeenCalledWith(expect.any(Object), 42);
    expect(result.type).toBe("ok");
    expect((result as { type: "ok"; output: any }).output).toMatchObject({
      incidentId: 99,
      isCritical: true,
    });
  });

  it("skips the workflow when the incident is not critical", async () => {
    fetchIncidents.mockResolvedValue([{ id: 99, severity: "Minor", type: "Misuse" }]);

    const result = await stepById("classify_incident").handler(
      ctx({ triggerPayload: { incidentId: 99, severity: "Minor" } }),
    );

    expect(result.type).toBe("skip");
  });

  it("skips when the incident cannot be found", async () => {
    fetchIncidents.mockResolvedValue([]);

    const result = await stepById("classify_incident").handler(ctx());

    expect(result.type).toBe("skip");
  });
});

describe("workflows / incidentResponse link_related_risks", () => {
  it("fetches related risks and returns ok", async () => {
    fetchRisks.mockResolvedValue([{ id: 5, risk_name: "Data leak" }]);

    const result = await stepById("link_related_risks").handler(
      ctx({ results: { classify_incident: { incidentId: 99, isCritical: true } } }),
    );

    expect(fetchRisks).toHaveBeenCalledWith(expect.any(Object), 42);
    expect(result.type).toBe("ok");
    expect((result as { type: "ok"; output: any }).output).toMatchObject({
      relatedRiskCount: 1,
    });
  });
});

describe("workflows / incidentResponse write steps gate for approval", () => {
  it("create_remediation_tasks pauses for approval (does not write directly)", async () => {
    const result = await stepById("create_remediation_tasks").handler(
      ctx({ results: { link_related_risks: { relatedRiskCount: 1 } } }),
    );

    expect(result.type).toBe("pause");
    // The gate must be created with this exact workflow/step id: it lands in
    // the approval's input_params and is what makes the Admin queue readable.
    expect(mockRequestGateApproval).toHaveBeenCalledWith(
      expect.anything(),
      "incident_response",
      "create_remediation_tasks",
      expect.any(String),
    );
  });

  it("escalate_notify_admins pauses for approval", async () => {
    const result = await stepById("escalate_notify_admins").handler(ctx());

    expect(result.type).toBe("pause");
    expect(mockRequestGateApproval).toHaveBeenCalledWith(
      expect.anything(),
      "incident_response",
      "escalate_notify_admins",
      expect.any(String),
    );
  });
});
