import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../database/db", () => ({
  __esModule: true,
  sequelize: { query: jest.fn() },
}));

import { deleteShadowAiDemoData } from "../shadowAiDemoData";
import { sequelize } from "../../../database/db";

const mockQuery = sequelize.query as unknown as jest.Mock<(...args: any[]) => Promise<any>>;

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string) =>
    sql.includes("to_regclass") ? [{ tbl: "shadow_ai_tools" }] : [[], 0],
  );
});

describe("deleteShadowAiDemoData", () => {
  it("deletes demo data but keeps the organization's saved Shadow AI settings", async () => {
    await deleteShadowAiDemoData(7, {} as any);

    const deletes = mockQuery.mock.calls
      .map((call) => String(call[0]))
      .filter((sql) => sql.startsWith("DELETE FROM"));
    expect(deletes).toContain(
      "DELETE FROM shadow_ai_events WHERE organization_id = :organizationId",
    );
    expect(deletes.some((sql) => sql.includes("shadow_ai_settings"))).toBe(false);
  });

  it("does nothing when the Shadow AI tables do not exist", async () => {
    mockQuery.mockImplementation(async () => [{ tbl: null }]);
    await deleteShadowAiDemoData(7, {} as any);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
