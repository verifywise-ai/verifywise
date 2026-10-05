const mockQuery = jest.fn();
jest.mock("../../../database/db", () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));

import { reorderItems, reorderPhases } from "../modelLifecycle.service";

beforeEach(() => jest.clearAllMocks());

describe("model lifecycle reorder services", () => {
  it("reorders phases with a single set-based UPDATE", async () => {
    await reorderPhases(7, [3, 1, 2]);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("UPDATE model_lifecycle_phases");
    expect(sql).toContain("FROM unnest($orderedIds::int[], $orderIndexes::int[])");
    expect(sql).not.toContain("display_order = :order");
    expect(options.bind).toEqual({
      orderedIds: [3, 1, 2],
      orderIndexes: [1, 2, 3],
      organizationId: 7,
    });
  });

  it("scopes the item reorder to the phase", async () => {
    await reorderItems(7, 9, [2, 1]);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("UPDATE model_lifecycle_items");
    expect(sql).toContain("phase_id = $phaseId");
    expect(sql).toContain("FROM unnest($orderedIds::int[], $orderIndexes::int[])");
    expect(options.bind).toEqual({
      orderedIds: [2, 1],
      orderIndexes: [1, 2],
      organizationId: 7,
      phaseId: 9,
    });
  });

  it("issues no query for an empty list", async () => {
    await reorderPhases(7, []);
    await reorderItems(7, 9, []);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("refuses to inline non-integer ids (defense in depth)", async () => {
    await expect(reorderPhases(7, [1, "2" as unknown as number])).rejects.toThrow();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
