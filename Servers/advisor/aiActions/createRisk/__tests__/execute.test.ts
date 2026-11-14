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

import { createRiskService } from "../../../../services/risk.service";
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
});
