import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  getMyPermissions,
  getPermissionCatalog,
  getRolePermissions,
  replaceRolePermissions,
} from "../rolePermissions.repository";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const envelope = (data: unknown) => ({
  data: { message: "OK", data },
  status: 200,
  statusText: "OK",
});

beforeEach(() => vi.clearAllMocks());

describe("rolePermissions.repository", () => {
  it("getPermissionCatalog calls GET /roles/permissions/catalog and unwraps the envelope", async () => {
    vi.mocked(apiServices.get).mockResolvedValue(
      envelope([{ key: "risks.edit", module: "Risks", description: "Create and update risks" }]),
    );
    const result = await getPermissionCatalog();
    expect(apiServices.get).toHaveBeenCalledWith("/roles/permissions/catalog", {
      signal: undefined,
    });
    expect(result).toEqual([
      { key: "risks.edit", module: "Risks", description: "Create and update risks" },
    ]);
  });

  it("getRolePermissions calls GET /roles/:id/permissions and unwraps the envelope", async () => {
    vi.mocked(apiServices.get).mockResolvedValue(envelope(["risks.edit", "task.edit"]));
    const result = await getRolePermissions({ roleId: 7 });
    expect(apiServices.get).toHaveBeenCalledWith("/roles/7/permissions", { signal: undefined });
    expect(result).toEqual(["risks.edit", "task.edit"]);
  });

  it("getMyPermissions calls GET /roles/my-permissions and unwraps the envelope", async () => {
    vi.mocked(apiServices.get).mockResolvedValue(envelope(["roles.manage"]));
    const result = await getMyPermissions();
    expect(apiServices.get).toHaveBeenCalledWith("/roles/my-permissions", { signal: undefined });
    expect(result).toEqual(["roles.manage"]);
  });

  it("replaceRolePermissions calls PUT /roles/:id/permissions with the matrix body", async () => {
    const mockResponse = { data: undefined, status: 202, statusText: "Accepted" };
    vi.mocked(apiServices.put).mockResolvedValue(mockResponse);
    const permissions = [
      { permission_key: "risks.edit", allowed: true },
      { permission_key: "task.edit", allowed: false },
    ];
    const result = await replaceRolePermissions({ roleId: 7, permissions });
    expect(apiServices.put).toHaveBeenCalledWith("/roles/7/permissions", { permissions });
    expect(result).toEqual(mockResponse);
  });
});
