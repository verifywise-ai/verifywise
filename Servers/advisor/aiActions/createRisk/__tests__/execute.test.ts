jest.mock("../../../../database/db", () => ({
  sequelize: { query: jest.fn().mockResolvedValue([]) },
}));
jest.mock("../../../../services/risk.service", () => ({ createRiskService: jest.fn() }));
jest.mock("../../../../services/automations/automationProducer", () => ({
  enqueueRiskLinkRecompute: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../../../utils/task.utils", () => ({ createNewTaskQuery: jest.fn() }));
jest.mock("../../../../services/inAppNotification.service", () => ({
  sendInAppNotification: jest.fn(),
}));

jest.mock("../../../../utils/rolePermissions.utils", () => ({
  roleHasPermission: jest.fn().mockResolvedValue(false),
}));
jest.mock("../../../../services/riskApproverNotification.service", () => ({
  notifyNewRiskApprover: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../../../utils/riskVisibility.utils", () => ({
  riskViewerForUserQuery: jest.fn().mockResolvedValue({ userId: 2, role: "Editor" }),
}));

import { createRiskService } from "../../../../services/risk.service";
import { roleHasPermission } from "../../../../utils/rolePermissions.utils";
import { notifyNewRiskApprover } from "../../../../services/riskApproverNotification.service";
import { executeCreateRisk } from "../execute";

const mockCreate = createRiskService as jest.Mock;

describe("executeCreateRisk", () => {
  it("leaves the risk level to the service", async () => {
    mockCreate.mockResolvedValue({ id: 3 });
    await executeCreateRisk({
      inputParams: {
        risk_name: "Bias in ranking",
        risk_description: "d",
        ai_lifecycle_phase: "Deployment & integration",
        risk_category: ["Data privacy risk"],
        impact: "i",
        severity: "Major",
        likelihood: "Likely",
        deadline: "2027-01-01",
        date_of_assessment: "2026-11-01",
      },
      organizationId: 1,
      requesterId: 2,
      transaction: { afterCommit: jest.fn() },
    } as never);
    const payload = mockCreate.mock.calls[0][0];
    expect("risk_level_autocalculated" in payload).toBe(false);
    expect(payload.severity).toBe("Major");
  });

  it("passes the requester as the viewer, so linking is checked", async () => {
    mockCreate.mockResolvedValue({ id: 3 });
    await executeCreateRisk({
      inputParams: {
        risk_name: "R",
        risk_description: "d",
        ai_lifecycle_phase: "Deployment & integration",
        risk_category: ["Data privacy risk"],
        impact: "i",
        deadline: "2027-01-01",
        date_of_assessment: "2026-11-01",
        project_ids: [5],
      },
      organizationId: 1,
      requesterId: 2,
      transaction: { afterCommit: jest.fn() },
    } as never);
    expect(mockCreate.mock.calls.at(-1)[1]).toEqual(
      expect.objectContaining({ viewer: { userId: 2, role: "Editor" } }),
    );
  });

  it("creates a risk with no approver or assessment date", async () => {
    (roleHasPermission as jest.Mock).mockClear();
    mockCreate.mockResolvedValue({ id: 3, risk_approval: null });
    const afterCommit = jest.fn();
    await executeCreateRisk({
      inputParams: {
        risk_name: "R",
        risk_description: "d",
        ai_lifecycle_phase: "Deployment & integration",
        risk_category: ["Data privacy risk"],
        impact: "i",
        deadline: "2027-01-01",
      },
      organizationId: 1,
      requesterId: 2,
      transaction: { afterCommit },
    } as never);
    const payload = mockCreate.mock.calls.at(-1)[0];
    expect(payload.date_of_assessment).toBeUndefined();
    expect(payload.risk_approval).toBeUndefined();
    // No approval field sent, so the Admin permission is not looked up.
    expect(roleHasPermission).not.toHaveBeenCalled();
    expect(mockCreate.mock.calls.at(-1)[1].callerIsAdmin).toBe(false);
    // Only the link recompute is queued; no approver to notify.
    expect(afterCommit).toHaveBeenCalledTimes(1);
  });

  it("creates a risk without any mitigation field, storing none", async () => {
    mockCreate.mockResolvedValue({ id: 3 });
    await executeCreateRisk({
      inputParams: {
        risk_name: "R",
        risk_description: "d",
        ai_lifecycle_phase: "Deployment & integration",
        risk_category: ["Data privacy risk"],
        impact: "i",
      },
      organizationId: 1,
      requesterId: 2,
      transaction: { afterCommit: jest.fn() },
    } as never);
    const payload = mockCreate.mock.calls.at(-1)[0];
    expect(payload).toMatchObject({
      mitigation_status: undefined,
      mitigation_plan: undefined,
      current_risk_level: undefined,
      implementation_strategy: undefined,
      deadline: undefined,
    });
  });

  it("notifies a named approver after commit", async () => {
    const risk = { id: 3, risk_name: "R", risk_approval: 8 };
    mockCreate.mockResolvedValue(risk);
    const afterCommit = jest.fn();
    await executeCreateRisk({
      inputParams: {
        risk_name: "R",
        risk_description: "d",
        ai_lifecycle_phase: "Deployment & integration",
        risk_category: ["Data privacy risk"],
        impact: "i",
        deadline: "2027-01-01",
        approver: 8,
      },
      organizationId: 1,
      requesterId: 2,
      transaction: { afterCommit },
    } as never);
    expect(notifyNewRiskApprover).not.toHaveBeenCalled();
    afterCommit.mock.calls.forEach(([fn]) => fn());
    expect(notifyNewRiskApprover).toHaveBeenCalledWith(1, 2, risk);
  });
});
