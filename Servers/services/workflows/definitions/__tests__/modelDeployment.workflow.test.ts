/**
 * Phase 6 — Model Deployment workflow definition tests (issue 3813).
 *
 * Verifies the exported WorkflowDefinition:
 *   - has the expected id / triggerName / agents and ordered steps
 *   - risk_assessment queries the model risk snapshot
 *   - control_coverage queries framework control coverage
 *   - decide_evidence_gap branches to create_evidence_task when the
 *     accumulated control gaps meet the threshold, else to ready_report
 *   - create_evidence_task is a write step that notifies admins
 *   - ready_report / notify_completion notify admins
 *
 * The DB (sequelize.query) and the in-app notification service are mocked.
 * No DB / HTTP. Step handlers are invoked directly with a WorkflowContext.
 */

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

jest.mock("../../../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("../../../inAppNotification.service", () => ({
  sendBulkInAppNotifications: jest.fn(),
}));

import { modelDeploymentWorkflow } from "../modelDeployment.workflow";
import type { WorkflowContext, WorkflowStep } from "../../types";
import { sequelize } from "../../../../database/db";
import { sendBulkInAppNotifications } from "../../../inAppNotification.service";

const mockQuery = sequelize.query as unknown as jest.Mock;
const mockNotify = sendBulkInAppNotifications as unknown as jest.Mock;

function stepById(id: string): WorkflowStep {
  const s = modelDeploymentWorkflow.steps.find((x) => x.id === id);
  if (!s) throw new Error(`step ${id} not found`);
  return s;
}

function ctx(overrides: Partial<WorkflowContext> = {}): WorkflowContext {
  return {
    workflowRunId: 99,
    organizationId: 1,
    userId: 7,
    triggerPayload: { modelId: 42, modelName: "Fraud Model" },
    results: {},
    ...overrides,
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue([] as any);
  mockNotify.mockReset();
  mockNotify.mockResolvedValue([] as any);
});

describe("workflows / modelDeploymentWorkflow definition", () => {
  it("exposes the expected workflow metadata", () => {
    expect(modelDeploymentWorkflow.id).toBe("model_deployment");
    expect(modelDeploymentWorkflow.triggerName).toBe("model.status.deployed");
    expect(modelDeploymentWorkflow.agents).toEqual(["risk", "compliance", "model"]);
  });

  it("declares the steps in the expected order", () => {
    expect(modelDeploymentWorkflow.steps.map((s) => s.id)).toEqual([
      "risk_assessment",
      "control_coverage",
      "decide_evidence_gap",
      "create_evidence_task",
      "notify_completion",
      "ready_report",
    ]);
  });

  it("marks only create_evidence_task as a write step", () => {
    const writes = modelDeploymentWorkflow.steps.filter((s) => s.isWrite).map((s) => s.id);
    expect(writes).toEqual(["create_evidence_task"]);
  });
});

describe("workflows / modelDeploymentWorkflow handlers", () => {
  it("risk_assessment returns the model risk snapshot from the DB", async () => {
    mockQuery.mockResolvedValueOnce([{ total: 3, critical: 1 }] as any);

    const res = await stepById("risk_assessment").handler(ctx());

    expect(res).toEqual({ type: "ok", output: { count: 3, criticalCount: 1 } });
    // queried model_risks scoped to org + model
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain("model_risks");
    expect((mockQuery.mock.calls[0][1] as any).replacements).toMatchObject({
      orgId: 1,
      modelId: 42,
    });
  });

  it("risk_assessment short-circuits to an empty snapshot when no modelId", async () => {
    const res = await stepById("risk_assessment").handler(ctx({ triggerPayload: {} }));

    expect(res).toEqual({ type: "ok", output: { count: 0, criticalCount: 0 } });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("control_coverage returns framework coverage rows from the DB", async () => {
    mockQuery.mockResolvedValueOnce([
      { framework_type: "iso_42001", avg_score: 70, total_controls: 10, gap_controls: 2 },
    ] as any);

    const res = (await stepById("control_coverage").handler(ctx())) as {
      type: string;
      output: Array<Record<string, unknown>>;
    };

    expect(res.type).toBe("ok");
    expect(res.output).toEqual([
      { frameworkType: "iso_42001", avgScore: 70, totalControls: 10, gapControls: 2 },
    ]);
    expect(String(mockQuery.mock.calls[0][0])).toContain("framework_readiness_scores");
  });

  it("decide_evidence_gap branches to create_evidence_task when gaps meet the threshold", async () => {
    const c = ctx({
      results: {
        control_coverage: [
          { frameworkType: "iso_42001", avgScore: 50, totalControls: 10, gapControls: 4 },
          { frameworkType: "soc2", avgScore: 50, totalControls: 10, gapControls: 3 },
        ],
      },
    });

    const res = await stepById("decide_evidence_gap").handler(c);

    expect(res).toEqual({ type: "branch", gotoStepId: "create_evidence_task" });
  });

  it("decide_evidence_gap branches to ready_report when gaps are below the threshold", async () => {
    const c = ctx({
      results: {
        control_coverage: [
          { frameworkType: "iso_42001", avgScore: 90, totalControls: 10, gapControls: 1 },
        ],
      },
    });

    const res = await stepById("decide_evidence_gap").handler(c);

    expect(res).toEqual({ type: "branch", gotoStepId: "ready_report" });
  });

  it("create_evidence_task notifies admins and reports the evidence task was flagged", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 11 }, { id: 12 }] as any); // getOrgAdmins

    const res = await stepById("create_evidence_task").handler(ctx());

    expect(res).toEqual({ type: "ok", output: { evidence_task_flagged: true } });
    expect(mockNotify).toHaveBeenCalledTimes(1);
    const [orgArg, bulkArg] = mockNotify.mock.calls[0] as [number, any];
    expect(orgArg).toBe(1);
    expect(bulkArg.user_ids).toEqual([11, 12]);
    expect(bulkArg.metadata).toMatchObject({ workflow_run_id: 99 });
  });

  it("create_evidence_task does not notify when there are no admins", async () => {
    mockQuery.mockResolvedValueOnce([] as any); // getOrgAdmins -> none

    const res = await stepById("create_evidence_task").handler(ctx());

    expect(res).toEqual({ type: "ok", output: { evidence_task_flagged: true } });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("ready_report notifies admins and reports the report is ready", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 11 }] as any); // getOrgAdmins

    const res = await stepById("ready_report").handler(ctx());

    expect(res).toEqual({ type: "ok", output: { report_ready: true } });
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it("notify_completion notifies admins that the workflow completed", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 11 }] as any); // getOrgAdmins

    const res = await stepById("notify_completion").handler(ctx());

    expect(res).toEqual({ type: "ok", output: { notified: true } });
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });
});
