const mockQuery = jest.fn();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));

import {
  assertCanAccessProject,
  assertCanDeleteFiles,
  canAccessProject,
} from "../filePermissions.utils";
import { ForbiddenException } from "../../domain.layer/exceptions/custom.exception";

const ctx = { userId: 5, role: "Editor", organizationId: 9 };

beforeEach(() => jest.clearAllMocks());

describe("canAccessProject", () => {
  it("lets Admin and SuperAdmin through without a query", async () => {
    expect(await canAccessProject(1, { ...ctx, role: "Admin" })).toBe(true);
    expect(await canAccessProject(1, { ...ctx, role: "SuperAdmin" })).toBe(true);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("allows when the project resolves for the caller", async () => {
    mockQuery.mockResolvedValue([{ ok: 1 }]);
    expect(await canAccessProject(2, ctx)).toBe(true);
  });

  it("denies when the project does not resolve", async () => {
    mockQuery.mockResolvedValue([]);
    expect(await canAccessProject(2, ctx)).toBe(false);
  });
});

describe("assertCanAccessProject", () => {
  it("throws ForbiddenException when access fails", async () => {
    mockQuery.mockResolvedValue([]);
    await expect(assertCanAccessProject(2, ctx)).rejects.toThrow(ForbiddenException);
  });
});

describe("assertCanDeleteFiles", () => {
  it("is a no-op for empty lists", async () => {
    await assertCanDeleteFiles([], ctx);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("lets Admin and SuperAdmin through without a query", async () => {
    await assertCanDeleteFiles([1, 2], { ...ctx, role: "Admin" });
    await assertCanDeleteFiles([1, 2], { ...ctx, role: "SuperAdmin" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("passes when no file violates the caller's rights", async () => {
    mockQuery.mockResolvedValue([]); // no offending rows
    await assertCanDeleteFiles([1, 2, 3], ctx);
    const [, options] = mockQuery.mock.calls[0];
    expect(options.replacements).toEqual(
      expect.objectContaining({ organizationId: 9, ids: [1, 2, 3], userId: 5 }),
    );
  });

  it("throws when any file is outside the caller's rights", async () => {
    mockQuery.mockResolvedValue([{ id: 7 }]);
    await expect(assertCanDeleteFiles([1, 7], ctx)).rejects.toThrow(ForbiddenException);
  });
});
