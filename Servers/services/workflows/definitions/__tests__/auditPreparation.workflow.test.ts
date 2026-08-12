/**
 * Phase 6 — auditPreparation workflow definition tests (issue 3813).
 *
 * NET-NEW scheduled quarterly workflow. Steps (all agents):
 *   gather framework readiness -> identify gaps -> collect evidence status ->
 *   generate audit-preparation report -> notify admins.
 *
 * These tests assert the exported WorkflowDefinition shape (id/trigger/ordered
 * steps/isWrite flags) and exercise the key decision: the report-generation
 * write step gates for approval — it returns a pause result until the trigger
 * payload carries `approved: true`, then it proceeds. The notify step targets
 * only org admins. All persistence/query helpers are mocked (no DB / HTTP).
 */

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

jest.mock("../../../../utils/readiness.utils", () => ({
  getFrameworkScoresQuery: jest.fn(),
  getWeakestControlsQuery: jest.fn(),
}));
jest.mock("../../../../utils/evidenceAi.utils", () => ({
  getEvidenceGapsQuery: jest.fn(),
}));
jest.mock("../../../../utils/user.utils", () => ({
  getAllUsersQuery: jest.fn(),
}));
jest.mock("../../../../utils/notification.utils", () => ({
  createBulkNotificationsQuery: jest.fn(),
}));
jest.mock("../../approvalGate", () => ({
  requestGateApproval: jest.fn(async (_ctx, _workflowId, _stepId, description) => ({
    type: "pause",
    reason: description,
    approvalId: "appr-test",
  })),
}));

import { auditPreparationWorkflow } from "../auditPreparation.workflow";
import type { WorkflowContext } from "../../types";
import {
  getFrameworkScoresQuery,
  getWeakestControlsQuery,
} from "../../../../utils/readiness.utils";
import { getEvidenceGapsQuery } from "../../../../utils/evidenceAi.utils";
import { getAllUsersQuery } from "../../../../utils/user.utils";
import { createBulkNotificationsQuery } from "../../../../utils/notification.utils";
import { requestGateApproval } from "../../approvalGate";

const mockGetFrameworkScores = getFrameworkScoresQuery as unknown as jest.Mock;
const mockGetWeakestControls = getWeakestControlsQuery as unknown as jest.Mock;
const mockGetEvidenceGaps = getEvidenceGapsQuery as unknown as jest.Mock;
const mockGetAllUsers = getAllUsersQuery as unknown as jest.Mock;
const mockCreateBulkNotifications = createBulkNotificationsQuery as unknown as jest.Mock;
const mockRequestGateApproval = requestGateApproval as unknown as jest.Mock;

const STEP_IDS = [
  "gather_framework_readiness",
  "identify_gaps",
  "collect_evidence_status",
  "generate_audit_prep_report",
  "notify_admins",
];

function ctx(overrides: Partial<WorkflowContext> = {}): WorkflowContext {
  return {
    workflowRunId: 1,
    organizationId: 42,
    userId: 7,
    triggerPayload: {},
    results: {},
    ...overrides,
  };
}

function handlerById(id: string) {
  const step = auditPreparationWorkflow.steps.find((s) => s.id === id);
  if (!step) throw new Error(`step ${id} not found`);
  return step;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("auditPreparation workflow / definition shape", () => {
  it("exports a definition keyed audit_preparation with a scheduled quarterly trigger", () => {
    expect(auditPreparationWorkflow.id).toBe("audit_preparation");
    expect(auditPreparationWorkflow.name).toMatch(/audit/i);
    expect(auditPreparationWorkflow.triggerName).toBe("scheduled.quarterly.audit_preparation");
  });

  it("declares its participating agents", () => {
    expect(auditPreparationWorkflow.agents).toEqual(
      expect.arrayContaining(["compliance-agent", "evidence-agent"]),
    );
  });

  it("declares the five steps in order", () => {
    expect(auditPreparationWorkflow.steps.map((s) => s.id)).toEqual(STEP_IDS);
  });

  it("flags only the report + notify steps as writes", () => {
    const writes = auditPreparationWorkflow.steps.filter((s) => s.isWrite).map((s) => s.id);
    expect(writes).toEqual(["generate_audit_prep_report", "notify_admins"]);
  });

  it("every step has a description and an agent", () => {
    for (const s of auditPreparationWorkflow.steps) {
      expect(typeof s.description).toBe("string");
      expect(s.description.length).toBeGreaterThan(0);
      expect(typeof s.agent).toBe("string");
      expect(s.agent.length).toBeGreaterThan(0);
    }
  });
});

describe("auditPreparation workflow / read step handlers", () => {
  it("gather_framework_readiness returns ok with the org framework scores", async () => {
    const scores = [{ framework_type: "eu_ai_act", avg_score: 55 }];
    mockGetFrameworkScores.mockResolvedValue(scores);

    const result = await handlerById("gather_framework_readiness").handler(ctx());

    expect(mockGetFrameworkScores).toHaveBeenCalledWith(42);
    expect(result).toEqual({ type: "ok", output: { frameworks: scores } });
  });

  it("identify_gaps returns ok with the weakest controls", async () => {
    const weak = [{ control_id: 3, framework_type: "eu_ai_act", overall_score: 12 }];
    mockGetWeakestControls.mockResolvedValue(weak);

    const result = await handlerById("identify_gaps").handler(ctx());

    expect(mockGetWeakestControls).toHaveBeenCalledWith(42, expect.any(Number));
    expect(result).toEqual({ type: "ok", output: { gaps: weak } });
  });

  it("collect_evidence_status returns ok with evidence gaps", async () => {
    const gaps = [{ control_id: 1, evidence_count: 0, avg_quality: 0 }];
    mockGetEvidenceGaps.mockResolvedValue(gaps);

    const result = await handlerById("collect_evidence_status").handler(ctx());

    expect(mockGetEvidenceGaps).toHaveBeenCalledWith(42);
    expect(result).toEqual({ type: "ok", output: { evidence: gaps } });
  });
});

describe("auditPreparation workflow / report step gates for approval", () => {
  it("pauses for approval when the trigger payload is not approved", async () => {
    const result = await handlerById("generate_audit_prep_report").handler(
      ctx({
        results: {
          gather_framework_readiness: { frameworks: [{ framework_type: "eu_ai_act" }] },
          identify_gaps: { gaps: [{ control_id: 3 }] },
          collect_evidence_status: { evidence: [{ control_id: 1 }] },
        },
      }),
    );

    expect(result.type).toBe("pause");
    // The gate must be created with this exact workflow/step id: it lands in
    // the approval's input_params and is what makes the Admin queue readable.
    expect(mockRequestGateApproval).toHaveBeenCalledWith(
      expect.anything(),
      "audit_preparation",
      "generate_audit_prep_report",
      expect.any(String),
    );
  });

  it("produces the report once approved, summarizing the prior steps", async () => {
    const result = await handlerById("generate_audit_prep_report").handler(
      ctx({
        triggerPayload: { approved: true },
        results: {
          gather_framework_readiness: {
            frameworks: [{ framework_type: "eu_ai_act" }, { framework_type: "iso_42001" }],
          },
          identify_gaps: { gaps: [{ control_id: 3 }, { control_id: 9 }] },
          collect_evidence_status: { evidence: [{ control_id: 1 }] },
        },
      }),
    );

    expect(result.type).toBe("ok");
    const output = (result as { type: "ok"; output: any }).output;
    expect(output.report).toMatchObject({
      frameworks_assessed: 2,
      gaps_identified: 2,
      evidence_items_reviewed: 1,
    });
  });
});

describe("auditPreparation workflow / notify_admins step", () => {
  it("notifies only org admins (role_id === 1) with the report summary", async () => {
    mockGetAllUsers.mockResolvedValue([
      { id: 1, role_id: 1 },
      { id: 2, role_id: 3 },
      { id: 5, role_id: 1 },
    ]);
    mockCreateBulkNotifications.mockResolvedValue([]);

    const result = await handlerById("notify_admins").handler(
      ctx({
        results: {
          generate_audit_prep_report: {
            report: { frameworks_assessed: 2, gaps_identified: 2, evidence_items_reviewed: 1 },
          },
        },
      }),
    );

    expect(mockGetAllUsers).toHaveBeenCalledWith(42);
    expect(mockCreateBulkNotifications).toHaveBeenCalledTimes(1);
    const [bulk, orgId] = mockCreateBulkNotifications.mock.calls[0];
    expect((bulk as any).user_ids).toEqual([1, 5]);
    expect(orgId).toBe(42);
    expect(result.type).toBe("ok");
  });

  it("skips when there are no admins to notify", async () => {
    mockGetAllUsers.mockResolvedValue([{ id: 2, role_id: 3 }]);

    const result = await handlerById("notify_admins").handler(
      ctx({
        results: {
          generate_audit_prep_report: { report: { frameworks_assessed: 0 } },
        },
      }),
    );

    expect(mockCreateBulkNotifications).not.toHaveBeenCalled();
    expect(result.type).toBe("skip");
  });
});
