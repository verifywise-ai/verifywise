jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../history/riskHistory.utils", () => ({
  recordSnapshotIfChanged: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../customField.utils", () => ({ fetchCustomFieldsForEntities: jest.fn() }));
jest.mock("../user.utils", () => ({
  findUsersNotInOrganization: jest.fn().mockResolvedValue([]),
  parseReferencedIds: jest.fn().mockReturnValue([]),
}));

import { sequelize } from "../../database/db";
import { recordSnapshotIfChanged } from "../history/riskHistory.utils";
import { updateRiskByIdQuery } from "../risk.utils";

const mockQuery = sequelize.query as jest.Mock;
const mockSnapshot = recordSnapshotIfChanged as jest.Mock;

/** Stored row, then the UPDATE result, then an empty automation list. */
function arrange(before: Record<string, unknown>, after: Record<string, unknown>) {
  mockQuery.mockReset();
  mockSnapshot.mockClear();
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.startsWith("SELECT * FROM risks")) return [[{ id: 1, ...before }], 1];
    if (sql.includes("UPDATE risks")) return [{ dataValues: { id: 1, ...after } }];
    return [[], 0];
  });
}

describe("updateRiskByIdQuery risk_level snapshot", () => {
  it("records a risk_level snapshot when only the current level changes", async () => {
    arrange(
      { risk_level_autocalculated: "Low risk", current_risk_level: null },
      { risk_level_autocalculated: "Low risk", current_risk_level: "High risk" },
    );
    await updateRiskByIdQuery(1, { current_risk_level: "High risk" }, 3, {} as never);
    expect(mockSnapshot.mock.calls.map((c) => c[0])).toEqual(["risk_level"]);
  });

  it("does not record one when the effective level is unchanged", async () => {
    arrange(
      { risk_level_autocalculated: "Low risk", current_risk_level: "High risk" },
      { risk_level_autocalculated: "Medium risk", current_risk_level: "High risk" },
    );
    await updateRiskByIdQuery(1, { likelihood: "Rare" } as never, 3, {} as never);
    expect(mockSnapshot).not.toHaveBeenCalled();
  });
});
