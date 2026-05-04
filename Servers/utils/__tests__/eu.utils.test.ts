import { describe, it, expect, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

import { deriveControlStatus, findUsersNotInOrganization } from "../eu.utils";
import { sequelize } from "../../database/db";

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
