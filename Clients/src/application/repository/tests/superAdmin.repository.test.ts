import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  getOrganizations,
  createOrganization,
  deleteOrganization,
  updateOrganization,
  getUserCount,
  getAllUsers,
  getOrgUsers,
  inviteUserToOrg,
  updateUser,
  removeUser,
} from "../superAdmin.repository";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Fixtures
const mockOrganization = {
  id: 1,
  name: "Test Org",
  logo: "logo.png",
  created_at: "2026-01-01T00:00:00Z",
  onboarding_status: "completed",
  user_count: 5,
};

const mockOrgUser = {
  id: 1,
  name: "Jane",
  surname: "Doe",
  email: "jane@example.com",
  role_id: 3,
  role_name: "Editor",
  created_at: "2026-01-01T00:00:00Z",
  last_login: "2026-04-27T00:00:00Z",
};

const mockGlobalUser = {
  ...mockOrgUser,
  organization_id: 1,
  organization_name: "Test Org",
};

describe("superAdmin.repository", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------------
  // getOrganizations
  // ----------------------------------------------------------------
  describe("getOrganizations", () => {
    beforeEach(() => {
      vi.mocked(apiServices.get).mockClear();
    });

    it("should call the correct endpoint", async () => {
      const mockResponse = { data: { code: 200, data: [mockOrganization] } };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse as any);

      const result = await getOrganizations();

      expect(apiServices.get).toHaveBeenCalledWith("/super-admin/organizations");
      expect(result).toEqual(mockResponse);
    });

    it("should handle an empty list", async () => {
      const mockResponse = { data: { code: 200, data: [] } };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse as any);

      const result = await getOrganizations();

      expect(result).toEqual(mockResponse);
    });

    it("should propagate network errors", async () => {
      const mockError = new Error("Network error");
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getOrganizations()).rejects.toThrow("Network error");
      expect(apiServices.get).toHaveBeenCalledOnce();
    });

    it("should propagate 500 server errors", async () => {
      const mockError = {
        response: { status: 500, statusText: "Internal Server Error" },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getOrganizations()).rejects.toEqual(mockError);
    });
  });

  // ----------------------------------------------------------------
  // createOrganization
  // ----------------------------------------------------------------
  describe("createOrganization", () => {
    beforeEach(() => {
      vi.mocked(apiServices.post).mockClear();
    });

    it("should post to the correct endpoint with data", async () => {
      const payload = { name: "New Org", logo: "new-logo.png" };
      const mockResponse = {
        data: { code: 201, data: { ...mockOrganization, ...payload } },
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse as any);

      const result = await createOrganization(payload);

      expect(apiServices.post).toHaveBeenCalledWith("/super-admin/organizations", payload);
      expect(result).toEqual(mockResponse);
    });

    it("should post without optional logo field", async () => {
      const payload = { name: "No Logo Org" };
      const mockResponse = {
        data: { code: 201, data: { ...mockOrganization, name: payload.name } },
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse as any);

      const result = await createOrganization(payload);

      expect(apiServices.post).toHaveBeenCalledWith("/super-admin/organizations", payload);
      expect(result).toEqual(mockResponse);
    });

    it("should propagate network errors", async () => {
      const mockError = new Error("Failed to create organization");
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(createOrganization({ name: "Fail Org" })).rejects.toThrow(
        "Failed to create organization",
      );
    });

    it("should propagate 400 validation errors", async () => {
      const mockError = {
        response: { status: 400, statusText: "Bad Request" },
      };
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(createOrganization({ name: "" })).rejects.toEqual(mockError);
    });
  });

  // ----------------------------------------------------------------
  // deleteOrganization
  // ----------------------------------------------------------------
  describe("deleteOrganization", () => {
    beforeEach(() => {
      vi.mocked(apiServices.delete).mockClear();
    });

    it("should call delete with the correct endpoint", async () => {
      const mockResponse = { data: { code: 200 } };
      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse as any);

      const result = await deleteOrganization(1);

      expect(apiServices.delete).toHaveBeenCalledWith("/super-admin/organizations/1");
      expect(result).toEqual(mockResponse);
    });

    it("should interpolate different IDs correctly", async () => {
      const mockResponse = { data: { code: 200 } };
      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse as any);

      await deleteOrganization(42);

      expect(apiServices.delete).toHaveBeenCalledWith("/super-admin/organizations/42");
    });

    it("should propagate network errors", async () => {
      const mockError = new Error("Delete failed");
      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(deleteOrganization(1)).rejects.toThrow("Delete failed");
      expect(apiServices.delete).toHaveBeenCalledOnce();
    });

    it("should propagate 404 errors", async () => {
      const mockError = {
        response: { status: 404, statusText: "Not Found" },
      };
      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(deleteOrganization(999)).rejects.toEqual(mockError);
    });
  });

  // ----------------------------------------------------------------
  // updateOrganization
  // ----------------------------------------------------------------
  describe("updateOrganization", () => {
    beforeEach(() => {
      vi.mocked(apiServices.patch).mockClear();
    });

    it("should patch with the correct endpoint and data", async () => {
      const payload = { name: "Updated Org" };
      const mockResponse = {
        data: { code: 200, data: { ...mockOrganization, ...payload } },
      };
      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse as any);

      const result = await updateOrganization(1, payload);

      expect(apiServices.patch).toHaveBeenCalledWith("/super-admin/organizations/1", payload);
      expect(result).toEqual(mockResponse);
    });

    it("should patch with only logo field", async () => {
      const payload = { logo: "new-logo.png" };
      const mockResponse = { data: { code: 200 } };
      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse as any);

      await updateOrganization(5, payload);

      expect(apiServices.patch).toHaveBeenCalledWith("/super-admin/organizations/5", payload);
    });

    it("should propagate network errors", async () => {
      const mockError = new Error("Update failed");
      vi.mocked(apiServices.patch).mockRejectedValue(mockError);

      await expect(updateOrganization(1, { name: "Fail" })).rejects.toThrow("Update failed");
    });

    it("should propagate 403 forbidden errors", async () => {
      const mockError = {
        response: { status: 403, statusText: "Forbidden" },
      };
      vi.mocked(apiServices.patch).mockRejectedValue(mockError);

      await expect(updateOrganization(1, { name: "Fail" })).rejects.toEqual(mockError);
    });
  });

  // ----------------------------------------------------------------
  // getUserCount
  // ----------------------------------------------------------------
  describe("getUserCount", () => {
    beforeEach(() => {
      vi.mocked(apiServices.get).mockClear();
    });

    it("should call the correct endpoint", async () => {
      const mockResponse = { data: { code: 200, data: { count: 10 } } };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse as any);

      const result = await getUserCount();

      expect(apiServices.get).toHaveBeenCalledWith("/super-admin/users/count");
      expect(result).toEqual(mockResponse);
    });

    it("should propagate network errors", async () => {
      const mockError = new Error("Network error");
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getUserCount()).rejects.toThrow("Network error");
      expect(apiServices.get).toHaveBeenCalledOnce();
    });

    it("should propagate 500 server errors", async () => {
      const mockError = {
        response: { status: 500, statusText: "Internal Server Error" },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getUserCount()).rejects.toEqual(mockError);
    });
  });

  // ----------------------------------------------------------------
  // getAllUsers
  // ----------------------------------------------------------------
  describe("getAllUsers", () => {
    beforeEach(() => {
      vi.mocked(apiServices.get).mockClear();
    });

    it("should call the correct endpoint", async () => {
      const mockResponse = {
        data: { code: 200, data: [mockGlobalUser] },
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse as any);

      const result = await getAllUsers();

      expect(apiServices.get).toHaveBeenCalledWith("/super-admin/users");
      expect(result).toEqual(mockResponse);
    });

    it("should handle an empty list", async () => {
      const mockResponse = { data: { code: 200, data: [] } };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse as any);

      const result = await getAllUsers();

      expect(result).toEqual(mockResponse);
    });

    it("should propagate network errors", async () => {
      const mockError = new Error("Network error");
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getAllUsers()).rejects.toThrow("Network error");
      expect(apiServices.get).toHaveBeenCalledOnce();
    });

    it("should propagate 500 server errors", async () => {
      const mockError = {
        response: { status: 500, statusText: "Internal Server Error" },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getAllUsers()).rejects.toEqual(mockError);
    });
  });

  // ----------------------------------------------------------------
  // getOrgUsers
  // ----------------------------------------------------------------
  describe("getOrgUsers", () => {
    beforeEach(() => {
      vi.mocked(apiServices.get).mockClear();
    });

    it("should call the correct endpoint with orgId", async () => {
      const mockResponse = {
        data: { code: 200, data: [mockOrgUser] },
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse as any);

      const result = await getOrgUsers(1);

      expect(apiServices.get).toHaveBeenCalledWith("/super-admin/organizations/1/users");
      expect(result).toEqual(mockResponse);
    });

    it("should interpolate different orgIds correctly", async () => {
      const mockResponse = { data: { code: 200, data: [] } };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse as any);

      await getOrgUsers(99);

      expect(apiServices.get).toHaveBeenCalledWith("/super-admin/organizations/99/users");
    });

    it("should propagate network errors", async () => {
      const mockError = new Error("Network error");
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getOrgUsers(1)).rejects.toThrow("Network error");
      expect(apiServices.get).toHaveBeenCalledOnce();
    });

    it("should propagate 404 errors", async () => {
      const mockError = {
        response: { status: 404, statusText: "Not Found" },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getOrgUsers(999)).rejects.toEqual(mockError);
    });
  });

  // ----------------------------------------------------------------
  // inviteUserToOrg
  // ----------------------------------------------------------------
  describe("inviteUserToOrg", () => {
    beforeEach(() => {
      vi.mocked(apiServices.post).mockClear();
    });

    it("should post to the correct endpoint with all fields", async () => {
      const payload = {
        email: "new@example.com",
        name: "New",
        surname: "User",
        roleId: 3,
      };
      const mockResponse = { data: { code: 201 } };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse as any);

      const result = await inviteUserToOrg(1, payload);

      expect(apiServices.post).toHaveBeenCalledWith("/super-admin/organizations/1/invite", payload);
      expect(result).toEqual(mockResponse);
    });

    it("should post without optional surname field", async () => {
      const payload = {
        email: "new@example.com",
        name: "New",
        roleId: 2,
      };
      const mockResponse = { data: { code: 201 } };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse as any);

      const result = await inviteUserToOrg(5, payload);

      expect(apiServices.post).toHaveBeenCalledWith("/super-admin/organizations/5/invite", payload);
      expect(result).toEqual(mockResponse);
    });

    it("should propagate network errors", async () => {
      const mockError = new Error("Invite failed");
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(
        inviteUserToOrg(1, {
          email: "fail@example.com",
          name: "Fail",
          roleId: 1,
        }),
      ).rejects.toThrow("Invite failed");
    });

    it("should propagate 400 validation errors", async () => {
      const mockError = {
        response: { status: 400, statusText: "Bad Request" },
      };
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(inviteUserToOrg(1, { email: "", name: "", roleId: 0 })).rejects.toEqual(
        mockError,
      );
    });

    it("should propagate 409 conflict errors", async () => {
      const mockError = {
        response: { status: 409, statusText: "Conflict" },
      };
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(
        inviteUserToOrg(1, {
          email: "existing@example.com",
          name: "Existing",
          roleId: 3,
        }),
      ).rejects.toEqual(mockError);
    });
  });

  // ----------------------------------------------------------------
  // updateUser
  // ----------------------------------------------------------------
  describe("updateUser", () => {
    beforeEach(() => {
      vi.mocked(apiServices.patch).mockClear();
    });

    it("should patch with the correct endpoint and data", async () => {
      const payload = { name: "Updated", surname: "User" };
      const mockResponse = { data: { code: 200 } };
      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse as any);

      const result = await updateUser(1, payload);

      expect(apiServices.patch).toHaveBeenCalledWith("/super-admin/users/1", payload);
      expect(result).toEqual(mockResponse);
    });

    it("should interpolate different userIds correctly", async () => {
      const payload = { email: "changed@example.com" };
      const mockResponse = { data: { code: 200 } };
      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse as any);

      await updateUser(77, payload);

      expect(apiServices.patch).toHaveBeenCalledWith("/super-admin/users/77", payload);
    });

    it("should patch with only roleId field", async () => {
      const payload = { roleId: 2 };
      const mockResponse = { data: { code: 200 } };
      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse as any);

      await updateUser(1, payload);

      expect(apiServices.patch).toHaveBeenCalledWith("/super-admin/users/1", payload);
    });

    it("should propagate network errors", async () => {
      const mockError = new Error("Update user failed");
      vi.mocked(apiServices.patch).mockRejectedValue(mockError);

      await expect(updateUser(1, { name: "Fail" })).rejects.toThrow("Update user failed");
    });

    it("should propagate 404 errors", async () => {
      const mockError = {
        response: { status: 404, statusText: "Not Found" },
      };
      vi.mocked(apiServices.patch).mockRejectedValue(mockError);

      await expect(updateUser(999, { name: "Ghost" })).rejects.toEqual(mockError);
    });

    it("should propagate 403 forbidden errors", async () => {
      const mockError = {
        response: { status: 403, statusText: "Forbidden" },
      };
      vi.mocked(apiServices.patch).mockRejectedValue(mockError);

      await expect(updateUser(1, { name: "Blocked" })).rejects.toEqual(mockError);
    });
  });

  // ----------------------------------------------------------------
  // removeUser
  // ----------------------------------------------------------------
  describe("removeUser", () => {
    beforeEach(() => {
      vi.mocked(apiServices.delete).mockClear();
    });

    it("should call delete with the correct endpoint", async () => {
      const mockResponse = { data: { code: 200 } };
      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse as any);

      const result = await removeUser(1);

      expect(apiServices.delete).toHaveBeenCalledWith("/super-admin/users/1");
      expect(result).toEqual(mockResponse);
    });

    it("should interpolate different userIds correctly", async () => {
      const mockResponse = { data: { code: 200 } };
      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse as any);

      await removeUser(55);

      expect(apiServices.delete).toHaveBeenCalledWith("/super-admin/users/55");
    });

    it("should propagate network errors", async () => {
      const mockError = new Error("Remove user failed");
      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(removeUser(1)).rejects.toThrow("Remove user failed");
      expect(apiServices.delete).toHaveBeenCalledOnce();
    });

    it("should propagate 404 errors", async () => {
      const mockError = {
        response: { status: 404, statusText: "Not Found" },
      };
      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(removeUser(999)).rejects.toEqual(mockError);
    });

    it("should propagate 403 forbidden errors", async () => {
      const mockError = {
        response: { status: 403, statusText: "Forbidden" },
      };
      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(removeUser(1)).rejects.toEqual(mockError);
    });
  });
});
