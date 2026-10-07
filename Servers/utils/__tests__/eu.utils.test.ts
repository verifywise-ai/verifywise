import { describe, it, expect, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

import {
  createNewSubControlsQuery,
  deriveControlStatus,
  findUsersNotInOrganization,
} from "../eu.utils";
import { sequelize } from "../../database/db";
import { STATUSES_COMPLIANCE } from "../../types/status.type";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;

describe("deriveControlStatus", () => {
  it("returns Waiting when there are no subcontrols", () => {
    expect(deriveControlStatus([])).toBe("Waiting");
  });

  it("returns Waiting when every subcontrol is Waiting or null", () => {
    expect(deriveControlStatus(["Waiting", "Waiting"])).toBe("Waiting");
    expect(deriveControlStatus([null, null])).toBe("Waiting");
    expect(deriveControlStatus(["Waiting", null, undefined])).toBe("Waiting");
  });

  it("returns Done only when every subcontrol is Done", () => {
    expect(deriveControlStatus(["Done", "Done"])).toBe("Done");
    expect(deriveControlStatus(["Done"])).toBe("Done");
  });

  it("returns In progress when a subcontrol is mid-flight", () => {
    expect(deriveControlStatus(["In progress"])).toBe("In progress");
    expect(deriveControlStatus(["Waiting", "Done"])).toBe("In progress");
    expect(deriveControlStatus(["In progress", "Waiting"])).toBe("In progress");
    expect(deriveControlStatus([null, "Done"])).toBe("In progress");
    expect(deriveControlStatus(["In progress", "Done", "Waiting"])).toBe("In progress");
  });
});

describe("findUsersNotInOrganization", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns empty when no candidate ids are provided", async () => {
    expect(await findUsersNotInOrganization([], 1)).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("filters out non-positive and non-integer ids before querying", async () => {
    expect(await findUsersNotInOrganization([0, -1, NaN as unknown as number], 1)).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns ids that are not in the organization", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 5 }] as any);
    const missing = await findUsersNotInOrganization([5, 7], 1);
    expect(missing).toEqual([7]);
  });

  it("dedupes candidate ids", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 5 }] as any);
    const missing = await findUsersNotInOrganization([5, 5, 5], 1);
    expect(missing).toEqual([]);
  });
});

describe("createNewSubControlsQuery", () => {
  const transaction = {} as any;
  const DEMO_OWNER = 42;

  /** First call is the struct lookup; the rest are the per-subcontrol inserts. */
  const mockStructThenInserts = (metaIds: number[]) => {
    mockQuery.mockResolvedValueOnce([metaIds.map((id) => ({ id }))] as any);
    for (const id of metaIds) mockQuery.mockResolvedValueOnce([{ id }] as any);
  };

  const sqlOf = (callIndex: number) => mockQuery.mock.calls[callIndex][0];
  const replacementsOf = (callIndex: number) =>
    (mockQuery.mock.calls[callIndex][1] as any).replacements;

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("reads the struct rows in id order so demo text pairs with the right subcontrol", async () => {
    mockStructThenInserts([1, 2]);

    await createNewSubControlsQuery(7, [], 3, false, 1, transaction, false, false);

    expect(sqlOf(0)).toContain("ORDER BY id");
  });

  it("walks statuses in order from the offset and marks rows as demo", async () => {
    mockStructThenInserts([1, 2, 3]);

    await createNewSubControlsQuery(7, [], 3, false, 1, transaction, true, true, DEMO_OWNER, 1);

    expect(replacementsOf(1)).toMatchObject({
      status: STATUSES_COMPLIANCE[1],
      owner: DEMO_OWNER,
      is_demo: true,
    });
    expect(replacementsOf(2)).toMatchObject({ status: STATUSES_COMPLIANCE[2] });
    expect(replacementsOf(3)).toMatchObject({ status: STATUSES_COMPLIANCE[0] });
  });

  it("leaves owner unset and starts at 'Waiting' for a real project", async () => {
    mockStructThenInserts([1, 2]);

    await createNewSubControlsQuery(7, [], 3, false, 1, transaction, false, false, DEMO_OWNER);

    expect(replacementsOf(1)).toMatchObject({ status: "Waiting", owner: null, is_demo: false });
    expect(replacementsOf(2)).toMatchObject({ status: "Waiting", owner: null, is_demo: false });
  });

  it("falls back to null demo text beyond the demo array", async () => {
    mockStructThenInserts([1, 2]);
    const demo = [{ implementation_details: "first" }];

    await createNewSubControlsQuery(7, demo, 3, true, 1, transaction, true, true, DEMO_OWNER);

    expect(replacementsOf(1)).toMatchObject({ implementation_details: "first" });
    expect(replacementsOf(2)).toMatchObject({ implementation_details: null });
  });
});
