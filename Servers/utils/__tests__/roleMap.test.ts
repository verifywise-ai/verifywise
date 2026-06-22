import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../role.utils", () => ({
  getAllRolesQuery: jest.fn(),
}));

import { getAllRolesQuery } from "../role.utils";
import { getRoleNameById, hasRoleId, invalidateRoleMapCache, ROLE_MAP_TTL_MS } from "../roleMap";

const mockGetAllRoles = getAllRolesQuery as jest.MockedFunction<typeof getAllRolesQuery>;

const seedRoles = (rows: Array<{ id: number; name: string }>) =>
  rows.map((r) => ({ id: r.id, name: r.name }) as any);

describe("roleMap cache", () => {
  beforeEach(() => {
    invalidateRoleMapCache();
    mockGetAllRoles.mockReset();
    jest.useRealTimers();
  });

  it("resolves a role id to its name from the DB on first call", async () => {
    mockGetAllRoles.mockResolvedValueOnce(
      seedRoles([
        { id: 1, name: "Admin" },
        { id: 2, name: "Reviewer" },
      ]),
    );

    await expect(getRoleNameById(1)).resolves.toBe("Admin");
    expect(mockGetAllRoles).toHaveBeenCalledTimes(1);
  });

  it("returns undefined for unknown role ids", async () => {
    mockGetAllRoles.mockResolvedValueOnce(seedRoles([{ id: 1, name: "Admin" }]));

    await expect(getRoleNameById(999)).resolves.toBeUndefined();
  });

  it("hasRoleId returns true for known ids and false for unknown", async () => {
    mockGetAllRoles.mockResolvedValueOnce(seedRoles([{ id: 1, name: "Admin" }]));

    await expect(hasRoleId(1)).resolves.toBe(true);
    await expect(hasRoleId(42)).resolves.toBe(false);
    // Only one DB query for both lookups — cache hit on the second call
    expect(mockGetAllRoles).toHaveBeenCalledTimes(1);
  });

  it("caches the map across calls (one DB query for many lookups)", async () => {
    mockGetAllRoles.mockResolvedValueOnce(
      seedRoles([
        { id: 1, name: "Admin" },
        { id: 2, name: "Reviewer" },
        { id: 3, name: "Editor" },
      ]),
    );

    await getRoleNameById(1);
    await getRoleNameById(2);
    await getRoleNameById(3);
    await hasRoleId(1);

    expect(mockGetAllRoles).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent cold-cache requests into a single DB query", async () => {
    let resolveFn: (v: any) => void = () => {};
    const pending = new Promise<any>((r) => {
      resolveFn = r;
    });
    mockGetAllRoles.mockReturnValueOnce(pending as any);

    const calls = Promise.all([getRoleNameById(1), getRoleNameById(2), hasRoleId(1), hasRoleId(3)]);

    resolveFn(
      seedRoles([
        { id: 1, name: "Admin" },
        { id: 2, name: "Reviewer" },
      ]),
    );

    const [a, b, c, d] = await calls;
    expect(a).toBe("Admin");
    expect(b).toBe("Reviewer");
    expect(c).toBe(true);
    expect(d).toBe(false);
    expect(mockGetAllRoles).toHaveBeenCalledTimes(1);
  });

  it("invalidateRoleMapCache forces a fresh DB read on the next call", async () => {
    mockGetAllRoles.mockResolvedValueOnce(seedRoles([{ id: 1, name: "Admin" }]));
    await getRoleNameById(1);

    mockGetAllRoles.mockResolvedValueOnce(
      seedRoles([
        { id: 1, name: "Administrator" }, // renamed in DB
        { id: 7, name: "Approver" }, // freshly inserted
      ]),
    );

    invalidateRoleMapCache();

    await expect(getRoleNameById(1)).resolves.toBe("Administrator");
    await expect(getRoleNameById(7)).resolves.toBe("Approver");
    expect(mockGetAllRoles).toHaveBeenCalledTimes(2);
  });

  it("refreshes from DB after the cache TTL elapses", async () => {
    jest.useFakeTimers();
    mockGetAllRoles.mockResolvedValueOnce(seedRoles([{ id: 1, name: "Admin" }]));
    await getRoleNameById(1);
    expect(mockGetAllRoles).toHaveBeenCalledTimes(1);

    // Inside TTL — still cached
    jest.advanceTimersByTime(ROLE_MAP_TTL_MS - 1);
    await getRoleNameById(1);
    expect(mockGetAllRoles).toHaveBeenCalledTimes(1);

    // Past TTL — refresh expected
    jest.advanceTimersByTime(2);
    mockGetAllRoles.mockResolvedValueOnce(
      seedRoles([
        { id: 1, name: "Admin" },
        { id: 9, name: "NewRole" },
      ]),
    );
    await expect(getRoleNameById(9)).resolves.toBe("NewRole");
    expect(mockGetAllRoles).toHaveBeenCalledTimes(2);
  });

  it("skips rows missing id or name (defensive)", async () => {
    mockGetAllRoles.mockResolvedValueOnce([
      { id: 1, name: "Admin" } as any,
      { id: null, name: "Broken" } as any,
      { id: 2, name: null } as any,
      { id: 3, name: "Editor" } as any,
    ]);

    await expect(getRoleNameById(1)).resolves.toBe("Admin");
    await expect(getRoleNameById(2)).resolves.toBeUndefined();
    await expect(getRoleNameById(3)).resolves.toBe("Editor");
  });
});
