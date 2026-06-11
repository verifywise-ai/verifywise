/**
 * Phase 6 — Framework Gap Remediation workflow definition tests (issue 3813).
 *
 * Verifies the exported WorkflowDefinition:
 *   - has the expected id / triggerName / agents and ordered step ids
 *   - scan_frameworks queries framework_readiness_scores below the threshold
 *   - check_any_low SKIPS when no framework is below threshold, OK otherwise
 *     (the key decision branch)
 *   - fetch_weakest_controls queries the lowest-scoring controls
 *   - notify_admins SKIPS when the org has no admins, and otherwise dispatches
 *     a bulk in-app notification to the admins
 *
 * The persistence (sequelize) and notification gateways are mocked. No DB / HTTP.
 */

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

jest.mock("../../../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("../../../inAppNotification.service", () => ({
  sendBulkInAppNotifications: jest.fn(),
}));

import { frameworkGapWorkflow } from "../frameworkGap.workflow";
import type { WorkflowContext } from "../../types";
import { sequelize } from "../../../../database/db";
import { sendBulkInAppNotifications } from "../../../inAppNotification.service";
import {
  NotificationType,
  NotificationEntityType,
} from "../../../../domain.layer/interfaces/i.notification";

const mockQuery = sequelize.query as unknown as jest.Mock;
const mockSendBulk = sendBulkInAppNotifications as unknown as jest.Mock;

function ctx(partial: Partial<WorkflowContext> = {}): WorkflowContext {
  return {
    workflowRunId: 42,
    organizationId: 1,
    userId: 7,
    triggerPayload: {},
    results: {},
    ...partial,
  };
}

function stepById(id: string) {
  const s = frameworkGapWorkflow.steps.find((step) => step.id === id);
  if (!s) throw new Error(`step ${id} not found`);
  return s;
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue([] as any);
  mockSendBulk.mockReset();
  mockSendBulk.mockResolvedValue([] as any);
});

describe("frameworkGapWorkflow / definition shape", () => {
  it("exposes the expected workflow metadata", () => {
    expect(frameworkGapWorkflow.id).toBe("framework_gap_remediation");
    expect(frameworkGapWorkflow.triggerName).toBe(
      "compliance.score.below_threshold",
    );
    expect(frameworkGapWorkflow.agents).toEqual(["compliance", "policy"]);
  });

  it("declares the steps in order", () => {
    expect(frameworkGapWorkflow.steps.map((s) => s.id)).toEqual([
      "scan_frameworks",
      "check_any_low",
      "fetch_weakest_controls",
      "notify_admins",
    ]);
  });

  it("marks every step as read-only (no destructive writes)", () => {
    expect(frameworkGapWorkflow.steps.every((s) => s.isWrite === false)).toBe(
      true,
    );
  });
});

describe("frameworkGapWorkflow / scan_frameworks", () => {
  it("queries framework_readiness_scores below the threshold and returns rows", async () => {
    const rows = [{ framework_type: "iso_42001", avg_score: 55 }];
    mockQuery.mockResolvedValueOnce(rows as any);

    const result = await stepById("scan_frameworks").handler(ctx());

    expect(result).toEqual({ type: "ok", output: rows });
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("framework_readiness_scores");
    expect(String(sql)).toContain("avg_score < :threshold");
    expect((opts as any).replacements.orgId).toBe(1);
    expect((opts as any).replacements.threshold).toBe(70);
  });
});

describe("frameworkGapWorkflow / check_any_low (decision branch)", () => {
  it("skips when no framework is below threshold", async () => {
    const result = await stepById("check_any_low").handler(
      ctx({ results: { scan_frameworks: [] } }),
    );
    expect(result).toEqual({
      type: "skip",
      reason: "All frameworks above threshold",
    });
  });

  it("continues (ok) when at least one framework is below threshold", async () => {
    const result = await stepById("check_any_low").handler(
      ctx({
        results: {
          scan_frameworks: [
            { framework_type: "iso_42001", avg_score: 55 },
            { framework_type: "soc2", avg_score: 60 },
          ],
        },
      }),
    );
    expect(result).toEqual({ type: "ok", output: { lowFrameworks: 2 } });
  });
});

describe("frameworkGapWorkflow / fetch_weakest_controls", () => {
  it("queries the lowest-scoring controls with a limit", async () => {
    const rows = [{ framework_type: "iso_42001", control_id: 3, score: 10 }];
    mockQuery.mockResolvedValueOnce(rows as any);

    const result = await stepById("fetch_weakest_controls").handler(ctx());

    expect(result).toEqual({ type: "ok", output: rows });
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("control_readiness_scores");
    expect(String(sql)).toContain("ORDER BY overall_score ASC");
    expect((opts as any).replacements.orgId).toBe(1);
    expect((opts as any).replacements.limit).toBe(5);
  });
});

describe("frameworkGapWorkflow / notify_admins", () => {
  it("skips when the organization has no admins", async () => {
    // getOrgAdmins query returns no rows
    mockQuery.mockResolvedValueOnce([] as any);

    const result = await stepById("notify_admins").handler(
      ctx({
        results: {
          scan_frameworks: [{ framework_type: "iso_42001", avg_score: 55 }],
        },
      }),
    );

    expect(result).toEqual({
      type: "skip",
      reason: "No admins in organization",
    });
    expect(mockSendBulk).not.toHaveBeenCalled();
  });

  it("dispatches a bulk in-app notification to admins with the gap summary", async () => {
    // getOrgAdmins query returns two admins
    mockQuery.mockResolvedValueOnce([{ id: 11 }, { id: 22 }] as any);

    const result = await stepById("notify_admins").handler(
      ctx({
        results: {
          scan_frameworks: [
            { framework_type: "iso_42001", avg_score: 55 },
            { framework_type: "soc2", avg_score: 60 },
          ],
        },
      }),
    );

    expect(result).toEqual({ type: "ok", output: { notified_admins: 2 } });
    expect(mockSendBulk).toHaveBeenCalledTimes(1);
    const [orgId, bulk] = mockSendBulk.mock.calls[0];
    expect(orgId).toBe(1);
    expect((bulk as any).user_ids).toEqual([11, 22]);
    expect((bulk as any).type).toBe(NotificationType.SYSTEM);
    expect((bulk as any).entity_type).toBe(NotificationEntityType.ASSESSMENT);
    expect((bulk as any).message).toContain("iso_42001: 55%");
    expect((bulk as any).message).toContain("soc2: 60%");
    expect((bulk as any).metadata).toEqual({ workflow_run_id: 42 });
  });
});
