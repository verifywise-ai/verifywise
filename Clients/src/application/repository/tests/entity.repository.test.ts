import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  archiveIncidentById,
  assignFrameworkToProject,
  checkDemoDataExists,
  checkUserExists,
  createNewUser,
  deleteAutoDrivers,
  deleteEntityById,
  generateReport,
  getAllEntities,
  getAllFrameworks,
  getAllUsers,
  getEntityById,
  loginUser,
  postAutoDrivers,
  resetPassword,
  updateEntityById,
} from "../entity.repository";

vi.mock("../../../infrastructure/api/networkServices", () => {
  return {
    apiServices: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Test Entity Repository", () => {
  // ── createNewUser ──────────────────────────────────────────────────────────

  describe("createNewUser", () => {
    it("should call post with routeUrl and body, and return full response", async () => {
      const routeUrl = "/users";
      const body = { name: "Alice" };
      const mockResponse = {
        status: 201,
        statusText: "Created",
        data: { id: 1 },
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await createNewUser({ routeUrl, body });

      expect(apiServices.post).toHaveBeenCalledWith(routeUrl, body);
      expect(response).toEqual(mockResponse);
    });
  });

  // ── loginUser ──────────────────────────────────────────────────────────────

  describe("loginUser", () => {
    it("should call post with routeUrl and body, and return full response", async () => {
      const routeUrl = "/auth/login";
      const body = { email: "a@b.com", credential: "secret" };
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: { token: "jwt" },
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await loginUser({ routeUrl, body });

      expect(apiServices.post).toHaveBeenCalledWith(routeUrl, body);
      expect(response).toEqual(mockResponse);
    });

    it("should log and rethrow when post fails", async () => {
      const error = new Error("Unauthorized");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(
        loginUser({ routeUrl: "/auth/login", body: {} }),
      ).rejects.toThrow(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error logging in user:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  // ── getEntityById ──────────────────────────────────────────────────────────

  describe("getEntityById", () => {
    it("should call get with signal and default responseType, returning response.data", async () => {
      const routeUrl = "/projects/1";
      const signal: AbortSignal = new AbortController().signal;
      const mockData = { id: 1, name: "Project A" };

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockData,
      });

      const response = await getEntityById({ routeUrl, signal });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl, {
        signal,
        responseType: "json",
      });
      expect(response).toEqual(mockData);
    });

    it("should call get with custom responseType", async () => {
      const routeUrl = "/projects/1/report";
      const signal: AbortSignal = new AbortController().signal;

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: "blob",
      });

      const response = await getEntityById({
        routeUrl,
        signal,
        responseType: "blob",
      });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl, {
        signal,
        responseType: "blob",
      });
      expect(response).toEqual("blob");
    });

    it("should NOT log and still rethrow on 404 errors", async () => {
      const error = { status: 404, message: "Not found" };
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(
        getEntityById({
          routeUrl: "/projects/99",
          signal: new AbortController().signal,
        }),
      ).rejects.toEqual(error);
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("should log and rethrow on non-404 errors", async () => {
      const error = { status: 500, message: "Server error" };
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(
        getEntityById({
          routeUrl: "/projects/1",
          signal: new AbortController().signal,
        }),
      ).rejects.toEqual(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error getting entity by ID:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  // ── updateEntityById ───────────────────────────────────────────────────────

  describe("updateEntityById", () => {
    it("should call patch with routeUrl, body, and headers, returning response", async () => {
      const routeUrl = "/projects/1";
      const body = { name: "Updated" };
      const headers = { Authorization: "Bearer token" };
      const mockResponse = { status: 200, statusText: "OK", data: { id: 1 } };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const response = await updateEntityById({ routeUrl, body, headers });

      expect(apiServices.patch).toHaveBeenCalledWith(routeUrl, body, {
        headers: { Authorization: "Bearer token" },
      });
      expect(response).toEqual(mockResponse);
    });

    it("should swallow the error and return undefined when patch fails", async () => {
      const error = new Error("Patch failed");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.patch).mockRejectedValue(error);

      const response = await updateEntityById({
        routeUrl: "/projects/1",
        body: {},
      });

      expect(response).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  // ── deleteEntityById ───────────────────────────────────────────────────────

  describe("deleteEntityById", () => {
    it("should call delete with routeUrl and return response", async () => {
      const routeUrl = "/projects/5";
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: { deleted: true },
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const response = await deleteEntityById({ routeUrl });

      expect(apiServices.delete).toHaveBeenCalledWith(routeUrl);
      expect(response).toEqual(mockResponse);
    });

    it("should log and rethrow when delete fails", async () => {
      const error = new Error("Delete failed");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.delete).mockRejectedValue(error);

      await expect(
        deleteEntityById({ routeUrl: "/projects/5" }),
      ).rejects.toThrow(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error deleting user by ID:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  // ── getAllEntities ─────────────────────────────────────────────────────────

  describe("getAllEntities", () => {
    it("should call get with routeUrl and params, returning response.data", async () => {
      const routeUrl = "/projects";
      const params = { page: 1 };
      const mockData = [{ id: 1 }, { id: 2 }];

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockData,
      });

      const response = await getAllEntities({ routeUrl, params });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl, { params });
      expect(response).toEqual(mockData);
    });

    it("should call get with undefined params when omitted", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: [],
      });

      await getAllEntities({ routeUrl: "/projects" });

      expect(apiServices.get).toHaveBeenCalledWith("/projects", {
        params: undefined,
      });
    });

    it("should log and rethrow when get fails", async () => {
      const error = new Error("Network error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getAllEntities({ routeUrl: "/projects" })).rejects.toThrow(
        error,
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error getting all users:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  // ── checkUserExists ────────────────────────────────────────────────────────

  describe("checkUserExists", () => {
    it("should call get with routeUrl and return response.data", async () => {
      const routeUrl = "/users/exists";
      const mockData = { exists: true };

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockData,
      });

      const response = await checkUserExists({ routeUrl });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl);
      expect(response).toEqual(mockData);
    });

    it("should log and rethrow when get fails", async () => {
      const error = new Error("Server error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(
        checkUserExists({ routeUrl: "/users/exists" }),
      ).rejects.toThrow(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error checking if user exists:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  // ── postAutoDrivers ────────────────────────────────────────────────────────

  describe("postAutoDrivers", () => {
    it("should call post /autoDrivers and return full response", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: { created: true },
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await postAutoDrivers();

      expect(apiServices.post).toHaveBeenCalledWith("/autoDrivers");
      expect(response).toEqual(mockResponse);
    });

    it("should log and rethrow when post fails", async () => {
      const error = new Error("Creation error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(postAutoDrivers()).rejects.toThrow(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error creating demo data:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  // ── checkDemoDataExists ────────────────────────────────────────────────────

  describe("checkDemoDataExists", () => {
    it("should return true when a demo project title is found", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: [
          { project_title: "AI Compliance Checker" },
          { project_title: "Other Project" },
        ],
      });

      const result = await checkDemoDataExists();

      expect(apiServices.get).toHaveBeenCalledWith("/projects");
      expect(result).toBe(true);
    });

    it("should return true for the second demo title", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: [
          { project_title: "Information Security & AI Governance Framework" },
        ],
      });

      const result = await checkDemoDataExists();

      expect(result).toBe(true);
    });

    it("should return false when no demo project titles are found", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: [{ project_title: "My Custom Project" }],
      });

      const result = await checkDemoDataExists();

      expect(result).toBe(false);
    });

    it("should return false on error (does not rethrow)", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.get).mockRejectedValue(new Error("Network error"));

      const result = await checkDemoDataExists();

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error checking demo data:",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });

  // ── deleteAutoDrivers ──────────────────────────────────────────────────────

  describe("deleteAutoDrivers", () => {
    it("should call delete /autoDrivers and return full response", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: { deleted: true },
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const response = await deleteAutoDrivers();

      expect(apiServices.delete).toHaveBeenCalledWith("/autoDrivers");
      expect(response).toEqual(mockResponse);
    });

    it("should log and rethrow when delete fails", async () => {
      const error = new Error("Delete error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.delete).mockRejectedValue(error);

      await expect(deleteAutoDrivers()).rejects.toThrow(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error deleting demo data:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  // ── resetPassword ──────────────────────────────────────────────────────────

  describe("resetPassword", () => {
    it("should call post with routeUrl and body, returning full response", async () => {
      const routeUrl = "/auth/reset-password";
      const body = { newCredential: "newPass123" };
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: { reset: true },
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await resetPassword({ routeUrl, body });

      expect(apiServices.post).toHaveBeenCalledWith(routeUrl, body);
      expect(response).toEqual(mockResponse);
    });
  });

  // ── getAllUsers ────────────────────────────────────────────────────────────

  describe("getAllUsers", () => {
    it("should call get /users and return response.data", async () => {
      const mockData = [{ id: 1, name: "Alice" }];

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockData,
      });

      const response = await getAllUsers();

      expect(apiServices.get).toHaveBeenCalledWith("/users");
      expect(response).toEqual(mockData);
    });

    it("should log and rethrow when get fails", async () => {
      const error = new Error("Server error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getAllUsers()).rejects.toThrow(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error getting all users:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  // ── generateReport ─────────────────────────────────────────────────────────

  describe("generateReport", () => {
    it("should call post with routeUrl, body, signal and blob responseType, returning response", async () => {
      const routeUrl = "/reports/generate";
      const body = { projectId: 1 };
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = { status: 200, statusText: "OK", data: new Blob() };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await generateReport({ routeUrl, body, signal });

      expect(apiServices.post).toHaveBeenCalledWith(routeUrl, body, {
        signal,
        responseType: "blob",
      });
      expect(response).toEqual(mockResponse);
    });

    it("should swallow the error and return undefined when post fails", async () => {
      const error = new Error("Report generation failed");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.post).mockRejectedValue(error);

      const response = await generateReport({
        routeUrl: "/reports/generate",
        body: {},
      });

      expect(response).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  // ── getAllFrameworks ───────────────────────────────────────────────────────

  describe("getAllFrameworks", () => {
    it("should call get /frameworks and return response.data", async () => {
      const mockData = [{ id: 1, name: "EU AI Act" }];

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockData,
      });

      const response = await getAllFrameworks();

      expect(apiServices.get).toHaveBeenCalledWith("/frameworks");
      expect(response).toEqual(mockData);
    });

    it("should log and rethrow when get fails", async () => {
      const error = new Error("Framework fetch error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getAllFrameworks()).rejects.toThrow(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error getting all frameworks:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  // ── assignFrameworkToProject ───────────────────────────────────────────────

  describe("assignFrameworkToProject", () => {
    it("should call post with correct URL and return status + data", async () => {
      const frameworkId = 3;
      const projectId = "proj-42";
      const mockResponse = {
        status: 201,
        statusText: "Created",
        data: { assigned: true },
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await assignFrameworkToProject({
        frameworkId,
        projectId,
      });

      expect(apiServices.post).toHaveBeenCalledWith(
        `/frameworks/toProject?frameworkId=3&projectId=proj-42`,
        {},
      );
      expect(response).toEqual({ status: 201, data: { assigned: true } });
    });

    it("should log and rethrow when post fails", async () => {
      const error = new Error("Assignment error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(
        assignFrameworkToProject({ frameworkId: 1, projectId: "p1" }),
      ).rejects.toThrow(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error assigning framework to project:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  // ── archiveIncidentById ────────────────────────────────────────────────────

  describe("archiveIncidentById", () => {
    it("should call patch to routeUrl/archive with body and headers, returning response", async () => {
      const routeUrl = "/incidents/7";
      const body = { isArchived: true };
      const headers = { Authorization: "Bearer token" };
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: { archived: true },
      };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const response = await archiveIncidentById({ routeUrl, body, headers });

      expect(apiServices.patch).toHaveBeenCalledWith(
        "/incidents/7/archive",
        body,
        { headers: { Authorization: "Bearer token" } },
      );
      expect(response).toEqual(mockResponse);
    });

    it("should log and rethrow when patch fails", async () => {
      const error = new Error("Archive error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.patch).mockRejectedValue(error);

      await expect(
        archiveIncidentById({ routeUrl: "/incidents/7", body: {} }),
      ).rejects.toThrow(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error archiving incident:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
