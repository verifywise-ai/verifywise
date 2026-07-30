/**
 * Phase 6 — Policy Renewal workflow definition tests (issue 3813).
 *
 * Verifies the exported WorkflowDefinition shape (key, trigger, ordered steps)
 * and exercises each step handler in isolation with mocked dependencies:
 *   - fetch_policy: explicit policyId path, auto-pick fallback, not-found fail
 *   - check_eligibility: the key decision — skip when the review date is
 *     outside the 0..30-day window, ok (with lead_days) when inside it
 *   - notify_owner: sends an in-app notification to the policy author and
 *     skips when there is no author_id
 *
 * sequelize.query (the persistence gateway) and sendInAppNotification (the
 * external notification side-effect) are mocked. No DB / HTTP.
 */

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

jest.mock("../../../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("../../../inAppNotification.service", () => ({
  sendInAppNotification: jest.fn(),
}));

import { policyRenewalWorkflow } from "../policyRenewal.workflow";
import type { WorkflowContext } from "../../types";
import { sequelize } from "../../../../database/db";
import { sendInAppNotification } from "../../../inAppNotification.service";
import {
  NotificationType,
  NotificationEntityType,
} from "../../../../domain.layer/interfaces/i.notification";

const mockQuery = sequelize.query as unknown as jest.Mock;
const mockNotify = sendInAppNotification as unknown as jest.Mock;

/** Find a step handler by id (fails loudly if the step is missing). */
function handlerFor(id: string) {
  const s = policyRenewalWorkflow.steps.find((st) => st.id === id);
  if (!s) throw new Error(`step "${id}" not found`);
  return s.handler;
}

function ctx(partial: Partial<WorkflowContext> = {}): WorkflowContext {
  return {
    workflowRunId: 1,
    organizationId: 1,
    triggerPayload: {},
    results: {},
    ...partial,
  };
}

/** A review date `days` from now, as an ISO string. */
function reviewDateIn(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue([] as any);
  mockNotify.mockReset();
  mockNotify.mockResolvedValue({} as any);
});

describe("workflows / definitions / policyRenewal", () => {
  it("exports the policy_renewal definition with the 30-day trigger and ordered steps", () => {
    expect(policyRenewalWorkflow.id).toBe("policy_renewal");
    expect(policyRenewalWorkflow.triggerName).toBe("policy.due_date.minus_30d");
    expect(policyRenewalWorkflow.agents).toEqual(["policy", "compliance"]);
    expect(policyRenewalWorkflow.steps.map((s) => s.id)).toEqual([
      "fetch_policy",
      "check_eligibility",
      "notify_owner",
      "log_outcome",
    ]);
    // none of the steps mutate domain state
    expect(policyRenewalWorkflow.steps.every((s) => s.isWrite === false)).toBe(true);
  });

  describe("fetch_policy", () => {
    it("loads the policy named by the trigger payload", async () => {
      const policyRow = {
        id: 42,
        title: "Acceptable Use",
        status: "published",
        next_review_date: reviewDateIn(10),
        author_id: 7,
      };
      mockQuery.mockResolvedValueOnce([policyRow] as any);

      const result = await handlerFor("fetch_policy")(
        ctx({ organizationId: 9, triggerPayload: { policyId: 42 } }),
      );

      expect(result).toEqual({ type: "ok", output: policyRow });
      // explicit policyId: only the detail query runs (no candidate lookup)
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const replacements = (mockQuery.mock.calls[0][1] as any).replacements;
      expect(replacements).toMatchObject({ orgId: 9, policyId: 42 });
    });

    it("auto-picks the earliest-review policy when no policyId is supplied", async () => {
      const policyRow = {
        id: 5,
        title: "Data Retention",
        status: "draft",
        next_review_date: reviewDateIn(3),
        author_id: 2,
      };
      // 1st query: candidate lookup -> id 5; 2nd query: detail fetch
      mockQuery.mockResolvedValueOnce([{ id: 5 }] as any);
      mockQuery.mockResolvedValueOnce([policyRow] as any);

      const result = await handlerFor("fetch_policy")(ctx({ triggerPayload: {} }));

      expect(result).toEqual({ type: "ok", output: policyRow });
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it("skips when there are no policies with a review date to auto-pick", async () => {
      mockQuery.mockResolvedValueOnce([] as any); // candidate lookup empty

      const result = await handlerFor("fetch_policy")(ctx({ triggerPayload: {} }));

      expect((result as any).type).toBe("skip");
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("fails when the named policy does not exist", async () => {
      mockQuery.mockResolvedValueOnce([] as any); // detail fetch empty

      const result = await handlerFor("fetch_policy")(ctx({ triggerPayload: { policyId: 999 } }));

      expect((result as any).type).toBe("fail");
      expect((result as any).error).toContain("999");
    });
  });

  describe("check_eligibility (key decision)", () => {
    it("returns ok with lead_days when the review date is inside the 30-day window", async () => {
      const policy = { id: 1, title: "P", next_review_date: reviewDateIn(10), author_id: 3 };

      const result = await handlerFor("check_eligibility")(
        ctx({ results: { fetch_policy: policy } }),
      );

      expect((result as any).type).toBe("ok");
      // floor of the day delta — ~10 days out, allow for sub-second elapsed time
      expect((result as any).output.lead_days).toBeGreaterThanOrEqual(9);
      expect((result as any).output.lead_days).toBeLessThanOrEqual(10);
    });

    it("skips when the review date is more than 30 days away", async () => {
      const policy = { id: 1, title: "P", next_review_date: reviewDateIn(45), author_id: 3 };

      const result = await handlerFor("check_eligibility")(
        ctx({ results: { fetch_policy: policy } }),
      );

      expect((result as any).type).toBe("skip");
    });

    it("skips when the review date is already in the past", async () => {
      const policy = { id: 1, title: "P", next_review_date: reviewDateIn(-5), author_id: 3 };

      const result = await handlerFor("check_eligibility")(
        ctx({ results: { fetch_policy: policy } }),
      );

      expect((result as any).type).toBe("skip");
    });

    it("skips when the policy has no next_review_date", async () => {
      const policy = { id: 1, title: "P", next_review_date: null, author_id: 3 };

      const result = await handlerFor("check_eligibility")(
        ctx({ results: { fetch_policy: policy } }),
      );

      expect((result as any).type).toBe("skip");
    });
  });

  describe("notify_owner", () => {
    it("sends a POLICY_DUE_SOON in-app notification to the policy author", async () => {
      const policy = {
        id: 42,
        title: "Acceptable Use",
        next_review_date: reviewDateIn(10),
        author_id: 7,
      };

      const result = await handlerFor("notify_owner")(
        ctx({ workflowRunId: 55, organizationId: 9, results: { fetch_policy: policy } }),
      );

      expect((result as any).type).toBe("ok");
      expect((result as any).output).toEqual({ notified: 7 });
      expect(mockNotify).toHaveBeenCalledTimes(1);
      const [orgArg, notif] = mockNotify.mock.calls[0];
      expect(orgArg).toBe(9);
      expect(notif).toMatchObject({
        user_id: 7,
        type: NotificationType.POLICY_DUE_SOON,
        entity_type: NotificationEntityType.POLICY,
        entity_id: 42,
        entity_name: "Acceptable Use",
        metadata: { workflow_run_id: 55 },
      });
    });

    it("skips when the policy has no author_id", async () => {
      const policy = {
        id: 42,
        title: "Acceptable Use",
        next_review_date: reviewDateIn(10),
        author_id: null,
      };

      const result = await handlerFor("notify_owner")(ctx({ results: { fetch_policy: policy } }));

      expect((result as any).type).toBe("skip");
      expect(mockNotify).not.toHaveBeenCalled();
    });
  });

  describe("log_outcome", () => {
    it("summarizes the policy id and lead days from prior steps", async () => {
      const result = await handlerFor("log_outcome")(
        ctx({
          results: {
            fetch_policy: { id: 42, title: "P" },
            check_eligibility: { lead_days: 9 },
          },
        }),
      );

      expect(result).toEqual({
        type: "ok",
        output: { policy_id: 42, lead_days: 9 },
      });
    });
  });
});
