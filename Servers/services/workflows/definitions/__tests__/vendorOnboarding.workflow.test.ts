/**
 * Phase 6 — Vendor Onboarding workflow tests (issue 3813).
 *
 * Trigger: vendor.created. Vendor + Risk + Compliance agents.
 * Steps:
 *   1. fetch_vendor          — load vendor (Vendor agent, read)
 *   2. verify_risk_assessment — load/verify vendor risk assessment (Vendor agent, read)
 *   3. run_risk_checks       — score the risks (Risk agent, read)
 *   4. decide_missing_controls — branch on whether follow-up is needed (Compliance agent)
 *   5. create_followup_tasks — gated write: pauses for approval (Compliance agent, write)
 *   6. notify_owner          — notify the vendor owner (Vendor agent)
 *
 * The data/util/notification layer is mocked. No DB / HTTP. Step handlers are
 * invoked directly with a hand-built WorkflowContext to exercise the branch.
 */

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

jest.mock("../../../../utils/vendor.utils", () => ({
  getVendorByIdQuery: jest.fn(),
}));
jest.mock("../../../../utils/vendorRisk.utils", () => ({
  getVendorRisksByVendorIdQuery: jest.fn(),
}));
jest.mock("../../../inAppNotification.service", () => ({
  sendInAppNotification: jest.fn(),
}));
jest.mock("../../approvalGate", () => ({
  requestGateApproval: jest.fn(async (_ctx, _workflowId, _stepId, description) => ({
    type: "pause",
    reason: description,
    approvalId: "appr-test",
  })),
}));

import { vendorOnboardingWorkflow } from "../vendorOnboarding.workflow";
import type { WorkflowContext, WorkflowStep } from "../../types";
import { getVendorByIdQuery } from "../../../../utils/vendor.utils";
import { getVendorRisksByVendorIdQuery } from "../../../../utils/vendorRisk.utils";
import { sendInAppNotification } from "../../../inAppNotification.service";
import { requestGateApproval } from "../../approvalGate";

const mockGetVendor = getVendorByIdQuery as unknown as jest.Mock;
const mockGetVendorRisks = getVendorRisksByVendorIdQuery as unknown as jest.Mock;
const mockNotify = sendInAppNotification as unknown as jest.Mock;
const mockRequestGateApproval = requestGateApproval as unknown as jest.Mock;

function stepById(id: string): WorkflowStep {
  const s = vendorOnboardingWorkflow.steps.find((st) => st.id === id);
  if (!s) throw new Error(`step ${id} not found`);
  return s;
}

function ctx(overrides: Partial<WorkflowContext> = {}): WorkflowContext {
  return {
    workflowRunId: 1,
    organizationId: 42,
    userId: 7,
    triggerPayload: { vendorId: 9 },
    results: {},
    ...overrides,
  };
}

beforeEach(() => {
  mockGetVendor.mockReset();
  mockGetVendorRisks.mockReset();
  mockNotify.mockReset();
  mockNotify.mockResolvedValue({} as never);
});

describe("workflows / vendorOnboarding definition", () => {
  it("exports the expected workflow key, trigger and agents", () => {
    expect(vendorOnboardingWorkflow.id).toBe("vendor_onboarding");
    expect(vendorOnboardingWorkflow.triggerName).toBe("vendor.created");
    expect(vendorOnboardingWorkflow.agents).toEqual(
      expect.arrayContaining(["vendor", "risk", "compliance"]),
    );
  });

  it("declares the steps in the expected order", () => {
    expect(vendorOnboardingWorkflow.steps.map((s) => s.id)).toEqual([
      "fetch_vendor",
      "verify_risk_assessment",
      "run_risk_checks",
      "decide_missing_controls",
      "create_followup_tasks",
      "notify_owner",
    ]);
  });

  it("marks only the follow-up task creation step as a write step", () => {
    const writeSteps = vendorOnboardingWorkflow.steps.filter((s) => s.isWrite).map((s) => s.id);
    expect(writeSteps).toEqual(["create_followup_tasks"]);
  });
});

describe("workflows / vendorOnboarding — fetch_vendor", () => {
  it("loads the vendor and returns it as ok output", async () => {
    mockGetVendor.mockResolvedValue({ id: 9, vendor_name: "Acme", assignee: 5 } as never);

    const result = await stepById("fetch_vendor").handler(ctx());

    expect(mockGetVendor).toHaveBeenCalledWith(9, 42);
    expect(result).toEqual({ type: "ok", output: { id: 9, vendor_name: "Acme", assignee: 5 } });
  });

  it("fails when the triggered vendor cannot be found", async () => {
    mockGetVendor.mockResolvedValue(null as never);

    const result = await stepById("fetch_vendor").handler(ctx());

    expect(result.type).toBe("fail");
  });
});

describe("workflows / vendorOnboarding — verify_risk_assessment", () => {
  it("loads the vendor's existing risk assessment", async () => {
    mockGetVendorRisks.mockResolvedValue([{ id: 1, risk_severity: "Major" }] as never);

    const result = await stepById("verify_risk_assessment").handler(
      ctx({ results: { fetch_vendor: { id: 9, assignee: 5 } } }),
    );

    expect(mockGetVendorRisks).toHaveBeenCalledWith(9, 42);
    expect(result).toMatchObject({
      type: "ok",
      output: { vendorId: 9, riskCount: 1, hasAssessment: true },
    });
  });

  it("reports no assessment when the vendor has no risks", async () => {
    mockGetVendorRisks.mockResolvedValue([] as never);

    const result = await stepById("verify_risk_assessment").handler(
      ctx({ results: { fetch_vendor: { id: 9, assignee: 5 } } }),
    );

    expect(result).toMatchObject({
      type: "ok",
      output: { vendorId: 9, riskCount: 0, hasAssessment: false },
    });
  });
});

describe("workflows / vendorOnboarding — run_risk_checks", () => {
  it("counts high-severity risks from the loaded assessment", async () => {
    const result = await stepById("run_risk_checks").handler(
      ctx({
        results: {
          verify_risk_assessment: {
            vendorId: 9,
            riskCount: 3,
            hasAssessment: true,
            risks: [
              { risk_severity: "Major" },
              { risk_severity: "Catastrophic" },
              { risk_severity: "Minor" },
            ],
          },
        },
      }),
    );

    expect(result).toMatchObject({ type: "ok", output: { highSeverityCount: 2 } });
  });
});

describe("workflows / vendorOnboarding — decide_missing_controls (branch)", () => {
  it("branches to create_followup_tasks when the vendor has no risk assessment", async () => {
    const result = await stepById("decide_missing_controls").handler(
      ctx({
        results: {
          verify_risk_assessment: { vendorId: 9, riskCount: 0, hasAssessment: false },
          run_risk_checks: { highSeverityCount: 0 },
        },
      }),
    );

    expect(result).toEqual({ type: "branch", gotoStepId: "create_followup_tasks" });
  });

  it("branches to create_followup_tasks when high-severity risks are present", async () => {
    const result = await stepById("decide_missing_controls").handler(
      ctx({
        results: {
          verify_risk_assessment: { vendorId: 9, riskCount: 2, hasAssessment: true },
          run_risk_checks: { highSeverityCount: 1 },
        },
      }),
    );

    expect(result).toEqual({ type: "branch", gotoStepId: "create_followup_tasks" });
  });

  it("branches to notify_owner when the assessment is complete and low-severity", async () => {
    const result = await stepById("decide_missing_controls").handler(
      ctx({
        results: {
          verify_risk_assessment: { vendorId: 9, riskCount: 2, hasAssessment: true },
          run_risk_checks: { highSeverityCount: 0 },
        },
      }),
    );

    expect(result).toEqual({ type: "branch", gotoStepId: "notify_owner" });
  });
});

describe("workflows / vendorOnboarding — create_followup_tasks (gated write)", () => {
  it("pauses for approval instead of writing tasks directly", async () => {
    const result = await stepById("create_followup_tasks").handler(
      ctx({
        results: {
          fetch_vendor: { id: 9, vendor_name: "Acme", assignee: 5 },
          run_risk_checks: { highSeverityCount: 2 },
        },
      }),
    );

    expect(result.type).toBe("pause");
    // The gate must be created with this exact workflow/step id: it lands in
    // the approval's input_params and is what makes the Admin queue readable.
    expect(mockRequestGateApproval).toHaveBeenCalledWith(
      expect.anything(),
      "vendor_onboarding",
      "create_followup_tasks",
      expect.any(String),
    );
  });
});

describe("workflows / vendorOnboarding — notify_owner", () => {
  it("notifies the vendor owner (assignee) about onboarding", async () => {
    const result = await stepById("notify_owner").handler(
      ctx({ results: { fetch_vendor: { id: 9, vendor_name: "Acme", assignee: 5 } } }),
    );

    expect(mockNotify).toHaveBeenCalledTimes(1);
    const [orgArg, payload] = mockNotify.mock.calls[0] as [number, Record<string, unknown>];
    expect(orgArg).toBe(42);
    expect(payload).toMatchObject({ user_id: 5, entity_type: "vendor", entity_id: 9 });
    expect(result).toMatchObject({ type: "ok", output: { notified: 5 } });
  });

  it("skips notifying when the vendor has no owner to notify", async () => {
    const result = await stepById("notify_owner").handler(
      ctx({ results: { fetch_vendor: { id: 9, vendor_name: "Acme", assignee: null } } }),
    );

    expect(mockNotify).not.toHaveBeenCalled();
    expect(result.type).toBe("skip");
  });
});
