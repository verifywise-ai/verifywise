import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));
jest.mock("../../domain.layer/models/modelRisk/modelRisk.model", () => ({ ModelRiskModel: {} }));

import { createNewModelRiskQuery } from "../modelRisk.utils";

beforeEach(() => {
  mockQuery.mockReset();
});

// M-M10: a named replacement whose value is undefined made Sequelize refuse
// the insert ("Named replacement :target_date has no entry").
describe("createNewModelRiskQuery with only a name", () => {
  it("stores every unset optional field as null, never undefined", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1 }]);
    await createNewModelRiskQuery({ risk_name: "Drift" } as any, 1);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const { replacements } = mockQuery.mock.calls[0][1] as { replacements: Record<string, unknown> };
    for (const [key, value] of Object.entries(replacements)) {
      expect([key, value]).not.toEqual([key, undefined]);
    }
    expect(replacements).toMatchObject({
      risk_category: null,
      risk_level: null,
      target_date: null,
      owner: null,
      model_id: null,
    });
  });

  it("stores an empty target date as null", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1 }]);
    await createNewModelRiskQuery({ risk_name: "Drift", target_date: "" } as any, 1);
    const { replacements } = mockQuery.mock.calls[0][1] as { replacements: Record<string, unknown> };
    expect(replacements.target_date).toBeNull();
  });
});
