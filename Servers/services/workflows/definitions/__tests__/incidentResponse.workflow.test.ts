/**
 * Phase 6 — incident_response workflow definition tests (issue 3813).
 *
 * Trigger: incident.severity = critical.
 * Steps (Incident + Risk + Compliance agents):
 *   classify_incident -> link_related_risks -> create_remediation_tasks ->
 *   escalate_notify_admins
 *
 * The definition is pure data + step handlers. The incident reads and the
 * gated writes (incidentResponseActions) and the risk tool map are mocked
 * here so no DB / approval gateway is touched. Write steps pause on their
 * first visit and perform their write on the post-approval resume.
 */

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

jest.mock("../../incidentResponseActions", () => ({
  loadIncidentForResponse: jest.fn(),
  createRemediationTask: jest.fn(),
  notifyAdminsOfCriticalIncident: jest.fn(),
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
import {
  createRemediationTask,
  loadIncidentForResponse,
  notifyAdminsOfCriticalIncident,
} from "../../incidentResponseActions";
import { availableRiskTools } from "../../../../advisor/functions/riskFunctions";
import { requestGateApproval } from "../../approvalGate";

const loadIncident = loadIncidentForResponse as unknown as jest.Mock<any>;
const createTask = createRemediationTask as unknown as jest.Mock<any>;
const notifyAdmins = notifyAdminsOfCriticalIncident as unknown as jest.Mock<any>;

const incident = (overrides: Record<string, unknown> = {}) => ({
  id: 99,
  reference: "INC-99",
  useCase: "Credit scoring",
  severity: "Very serious",
  type: "Security breach",
  assigneeId: 5,
  ownerName: "Ada Owner",
  ...overrides,
});
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
  loadIncident.mockReset();
  createTask.mockReset();
  notifyAdmins.mockReset();
  fetchRisks.mockReset();
  mockRequestGateApproval.mockClear();
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
  it("loads its incident directly by id in the run's organization (I-M6)", async () => {
    loadIncident.mockResolvedValue(incident());

    const result = await stepById("classify_incident").handler(ctx());

    // A direct, organization-scoped lookup: no "newest 50" list to fall out of.
    expect(loadIncident).toHaveBeenCalledTimes(1);
    expect(loadIncident).toHaveBeenCalledWith(42, 99);
    expect(result.type).toBe("ok");
    expect((result as { type: "ok"; output: any }).output).toMatchObject({
      incidentId: 99,
      reference: "INC-99",
      isCritical: true,
    });
  });

  it("finds an old incident however many newer ones exist", async () => {
    loadIncident.mockResolvedValue(incident({ id: 3 }));

    const result = await stepById("classify_incident").handler(
      ctx({ triggerPayload: { incidentId: 3, severity: "Very serious" } }),
    );

    expect(loadIncident).toHaveBeenCalledWith(42, 3);
    expect(result.type).toBe("ok");
  });

  it("skips the workflow when the incident is no longer critical", async () => {
    loadIncident.mockResolvedValue(incident({ severity: "Minor" }));

    const result = await stepById("classify_incident").handler(ctx());

    expect(result.type).toBe("skip");
  });

  it("skips when the incident cannot be found in the organization", async () => {
    loadIncident.mockResolvedValue(null);

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
    expect(createTask).not.toHaveBeenCalled();
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
    expect(notifyAdmins).not.toHaveBeenCalled();
  });
});

describe("workflows / incidentResponse write steps after approval (Decision 9)", () => {
  const approved = () =>
    ctx({
      resumedApprovalId: "appr-1",
      results: { classify_incident: { incidentId: 99, isCritical: true } },
    });

  it("create_remediation_tasks creates the task with the incident as it is now", async () => {
    loadIncident.mockResolvedValue(incident({ assigneeId: 8 }));
    createTask.mockResolvedValue({
      taskId: 700,
      assigneeId: 8,
      assigneeSource: "owner",
      alreadyCreated: false,
    });

    const result = await stepById("create_remediation_tasks").handler(approved());

    expect(mockRequestGateApproval).not.toHaveBeenCalled();
    expect(loadIncident).toHaveBeenCalledWith(42, 99);
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ resumedApprovalId: "appr-1" }),
      expect.objectContaining({ id: 99, assigneeId: 8 }),
    );
    expect(result).toEqual({
      type: "ok",
      output: expect.objectContaining({ taskId: 700, assigneeId: 8, alreadyCreated: false }),
    });
  });

  it("escalate_notify_admins notifies the Admins", async () => {
    loadIncident.mockResolvedValue(incident());
    notifyAdmins.mockResolvedValue({ notified: [1, 2], alreadyNotified: [], failed: [] });

    const result = await stepById("escalate_notify_admins").handler(approved());

    expect(notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ workflowRunId: 1 }),
      expect.objectContaining({ id: 99 }),
    );
    expect(result).toEqual({
      type: "ok",
      output: expect.objectContaining({ notified: [1, 2] }),
    });
  });

  it("falls back to the trigger payload's incident when classify output is absent", async () => {
    loadIncident.mockResolvedValue(incident());
    notifyAdmins.mockResolvedValue({ notified: [], alreadyNotified: [], failed: [] });

    await stepById("escalate_notify_admins").handler(ctx({ resumedApprovalId: "appr-2" }));

    expect(loadIncident).toHaveBeenCalledWith(42, 99);
  });

  it.each(["create_remediation_tasks", "escalate_notify_admins"])(
    "%s skips when the incident was deleted before approval",
    async (stepId) => {
      loadIncident.mockResolvedValue(null);

      const result = await stepById(stepId).handler(approved());

      expect(result.type).toBe("skip");
      expect(createTask).not.toHaveBeenCalled();
      expect(notifyAdmins).not.toHaveBeenCalled();
    },
  );
});
