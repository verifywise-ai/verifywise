import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../role.utils", () => ({
  getAllRolesQuery: jest.fn<any>(),
}));

import {
  getRoleNameById,
  roleIdExists,
  getRoleMap,
  invalidateRoleCache,
  _setRoleCacheTtlMs,
  _resetRoleCache,
} from "../roleCache.utils";
import { getAllRolesQuery } from "../role.utils";

const mockGetAllRoles = getAllRolesQuery as jest.MockedFunction<typeof getAllRolesQuery>;

const buildRows = (entries: Array<[number, string]>): any[] =>
  entries.map(([id, name]) => ({ id, name }));

describe("roleCache.utils", () => {
  beforeEach(() => {
    _resetRoleCache();
    jest.clearAllMocks();
  });

  describe("getRoleMap", () => {
    it("returns a Map of id → name on first call and queries the DB once", async () => {
      mockGetAllRoles.mockResolvedValueOnce(
        buildRows([
          [1, "Admin"],
          [2, "Reviewer"],
          [3, "Editor"],
        ]),
      );

      const map = await getRoleMap();
      expect(map.get(1)).toBe("Admin");
      expect(map.get(2)).toBe("Reviewer");
      expect(map.get(3)).toBe("Editor");
      expect(mockGetAllRoles).toHaveBeenCalledTimes(1);
    });

    it("serves subsequent reads from cache without re-querying", async () => {
      mockGetAllRoles.mockResolvedValueOnce(buildRows([[1, "Admin"]]));

      await getRoleMap();
      await getRoleMap();
      await getRoleNameById(1);

      expect(mockGetAllRoles).toHaveBeenCalledTimes(1);
    });

    it("refetches after TTL expiry", async () => {
      _setRoleCacheTtlMs(1);

      mockGetAllRoles
        .mockResolvedValueOnce(buildRows([[1, "Admin"]]))
        .mockResolvedValueOnce(buildRows([[1, "Manager"]]));

      const first = await getRoleNameById(1);
      expect(first).toBe("Admin");

      // Wait for the TTL to lapse.
      await new Promise((r) => setTimeout(r, 5));

      const second = await getRoleNameById(1);
      expect(second).toBe("Manager");
      expect(mockGetAllRoles).toHaveBeenCalledTimes(2);
    });

    it("dedupes concurrent cold-cache fetches into a single DB call", async () => {
      let resolveRows: ((v: any[]) => void) | undefined;
      mockGetAllRoles.mockImplementationOnce(
        () => new Promise<any[]>((res) => (resolveRows = res as any)),
      );

      const p1 = getRoleMap();
      const p2 = getRoleMap();
      const p3 = getRoleMap();

      resolveRows!(buildRows([[1, "Admin"]]));

      await Promise.all([p1, p2, p3]);
      expect(mockGetAllRoles).toHaveBeenCalledTimes(1);
    });

    it("skips rows missing required fields", async () => {
      mockGetAllRoles.mockResolvedValueOnce([
        { id: 1, name: "Admin" },
        { id: 2 },
        { name: "WithoutId" },
        { id: 3, name: "Editor" },
      ] as any);

      const map = await getRoleMap();
      expect(map.get(1)).toBe("Admin");
      expect(map.has(2)).toBe(false);
      expect(map.get(3)).toBe("Editor");
      expect(map.size).toBe(2);
    });
  });

  describe("getRoleNameById", () => {
    it("returns the cached role name", async () => {
      mockGetAllRoles.mockResolvedValueOnce(
        buildRows([
          [1, "Admin"],
          [2, "Reviewer"],
        ]),
      );

      expect(await getRoleNameById(1)).toBe("Admin");
      expect(await getRoleNameById(2)).toBe("Reviewer");
    });

    it("returns undefined for an unknown id", async () => {
      mockGetAllRoles.mockResolvedValueOnce(buildRows([[1, "Admin"]]));
      expect(await getRoleNameById(999)).toBeUndefined();
    });
  });

  describe("roleIdExists", () => {
    it("returns true for a known id", async () => {
      mockGetAllRoles.mockResolvedValueOnce(buildRows([[1, "Admin"]]));
      expect(await roleIdExists(1)).toBe(true);
    });

    it("returns false for an unknown id", async () => {
      mockGetAllRoles.mockResolvedValueOnce(buildRows([[1, "Admin"]]));
      expect(await roleIdExists(999)).toBe(false);
    });
  });

  describe("invalidateRoleCache", () => {
    it("forces the next lookup to re-query the DB", async () => {
      mockGetAllRoles
        .mockResolvedValueOnce(buildRows([[1, "Admin"]]))
        .mockResolvedValueOnce(buildRows([[1, "Manager"]]));

      expect(await getRoleNameById(1)).toBe("Admin");

      invalidateRoleCache();

      expect(await getRoleNameById(1)).toBe("Manager");
      expect(mockGetAllRoles).toHaveBeenCalledTimes(2);
    });

    it("is safe to call before any read", async () => {
      mockGetAllRoles.mockResolvedValueOnce(buildRows([[1, "Admin"]]));
      invalidateRoleCache();
      expect(await getRoleNameById(1)).toBe("Admin");
    });
  });
});
