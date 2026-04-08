import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  createAITrustCentreResource,
  createAITrustCentreSubprocessor,
  deleteAITrustCentreLogo,
  deleteAITrustCentreResource,
  deleteAITrustCentreSubprocessor,
  getAITrustCentreLogo,
  getAITrustCentreOverview,
  getAITrustCentreResources,
  getAITrustCentreSubprocessors,
  updateAITrustCentreOverview,
  updateAITrustCentreResource,
  updateAITrustCentreSubprocessor,
  uploadAITrustCentreLogo,
} from "../aiTrustCentre.repository";

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

describe("Test AI Trust Centre Repository", () => {
  describe("getAITrustCentreOverview", () => {
    it("should fetch trust centre overview", async () => {
      const mockData = { title: "Overview" };
      const mockResponse = { data: mockData, status: 200, statusText: "OK" };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getAITrustCentreOverview();

      expect(apiServices.get).toHaveBeenCalledWith("/aiTrustCentre/overview");
      expect(response).toEqual(mockData);
    });

    it("should throw and log when fetch trust centre overview fails", async () => {
      const error = new Error("API Error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      vi.mocked(apiServices.get).mockRejectedValueOnce(error);

      await expect(getAITrustCentreOverview()).rejects.toThrow("API Error");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error fetching AI Trust Center overview:",
        error,
      );
    });
  });

  describe("updateAITrustCentreOverview", () => {
    it("should update trust centre overview", async () => {
      const input = { title: "New Overview" };
      const mockResponse = { data: input, status: 200, statusText: "OK" };
      vi.mocked(apiServices.put).mockResolvedValue(mockResponse);

      const response = await updateAITrustCentreOverview(input);

      expect(apiServices.put).toHaveBeenCalledWith(
        "/aiTrustCentre/overview",
        input,
      );
      expect(response).toEqual(input);
    });

    it("should throw and log when update trust centre overview fails", async () => {
      const error = new Error("API Error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      vi.mocked(apiServices.put).mockRejectedValueOnce(error);

      await expect(updateAITrustCentreOverview({ title: "x" })).rejects.toThrow(
        "API Error",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error updating AI Trust Center overview:",
        error,
      );
    });
  });

  describe("uploadAITrustCentreLogo", () => {
    it("should upload trust centre logo as multipart/form-data", async () => {
      const logoFile = new File(["logo"], "logo.png", { type: "image/png" });
      const mockData = { uploaded: true };
      const mockResponse = { data: mockData, status: 200, statusText: "OK" };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await uploadAITrustCentreLogo(logoFile);

      expect(apiServices.post).toHaveBeenCalledWith(
        "/aiTrustCentre/logo",
        expect.any(FormData),
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );
      expect(response).toEqual(mockData);
    });

    it("should throw and log when logo upload fails", async () => {
      const error = new Error("API Error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      vi.mocked(apiServices.post).mockRejectedValueOnce(error);

      const logoFile = new File(["logo"], "logo.png", { type: "image/png" });
      await expect(uploadAITrustCentreLogo(logoFile)).rejects.toThrow(
        "API Error",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error uploading AI Trust Center logo:",
        error,
      );
    });
  });

  describe("deleteAITrustCentreLogo", () => {
    it("should delete trust centre logo", async () => {
      const mockData = { deleted: true };
      const mockResponse = { data: mockData, status: 200, statusText: "OK" };
      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const response = await deleteAITrustCentreLogo();

      expect(apiServices.delete).toHaveBeenCalledWith("/aiTrustCentre/logo");
      expect(response).toEqual(mockData);
    });

    it("should throw and log when logo deletion fails", async () => {
      const error = new Error("API Error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      vi.mocked(apiServices.delete).mockRejectedValueOnce(error);

      await expect(deleteAITrustCentreLogo()).rejects.toThrow("API Error");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error deleting AI Trust Center logo:",
        error,
      );
    });
  });

  describe("createAITrustCentreResource", () => {
    it("should create trust centre resource with multipart/form-data", async () => {
      const file = new File(["resource"], "resource.pdf", {
        type: "application/pdf",
      });
      const mockData = { id: 10, name: "Resource 1" };
      const mockResponse = {
        data: mockData,
        status: 201,
        statusText: "Created",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await createAITrustCentreResource(
        file,
        "Resource 1",
        "Description",
        true,
      );

      expect(apiServices.post).toHaveBeenCalledWith(
        "/aiTrustCentre/resources",
        expect.any(FormData),
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );
      expect(response).toEqual(mockData);
    });

    it("should throw and log when resource creation fails", async () => {
      const error = new Error("API Error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      vi.mocked(apiServices.post).mockRejectedValueOnce(error);

      const file = new File(["resource"], "resource.pdf", {
        type: "application/pdf",
      });
      await expect(
        createAITrustCentreResource(file, "Resource 1", "Description", true),
      ).rejects.toThrow("API Error");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error creating AI Trust Center resource:",
        error,
      );
    });
  });

  describe("getAITrustCentreResources", () => {
    it("should fetch trust centre resources", async () => {
      const mockData = [{ id: 1, name: "Doc" }];
      const mockResponse = { data: mockData, status: 200, statusText: "OK" };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getAITrustCentreResources();

      expect(apiServices.get).toHaveBeenCalledWith("/aiTrustCentre/resources");
      expect(response).toEqual(mockData);
    });

    it("should throw and log when resources fetch fails", async () => {
      const error = new Error("API Error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      vi.mocked(apiServices.get).mockRejectedValueOnce(error);

      await expect(getAITrustCentreResources()).rejects.toThrow("API Error");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error fetching AI Trust Center resources:",
        error,
      );
    });
  });

  describe("deleteAITrustCentreResource", () => {
    it("should delete trust centre resource", async () => {
      const mockData = { deleted: true };
      const mockResponse = { data: mockData, status: 200, statusText: "OK" };
      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const response = await deleteAITrustCentreResource(9);

      expect(apiServices.delete).toHaveBeenCalledWith(
        "/aiTrustCentre/resources/9",
      );
      expect(response).toEqual(mockData);
    });

    it("should throw and log when resource deletion fails", async () => {
      const error = new Error("API Error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      vi.mocked(apiServices.delete).mockRejectedValueOnce(error);

      await expect(deleteAITrustCentreResource(9)).rejects.toThrow("API Error");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error deleting AI Trust Center resource:",
        error,
      );
    });
  });

  describe("updateAITrustCentreResource", () => {
    it("should update trust centre resource with file and oldFileId", async () => {
      const file = new File(["resource2"], "resource2.pdf", {
        type: "application/pdf",
      });
      const mockData = { id: 7, updated: true };
      const mockResponse = { data: mockData, status: 200, statusText: "OK" };
      vi.mocked(apiServices.put).mockResolvedValue(mockResponse);

      const response = await updateAITrustCentreResource(
        7,
        "Resource",
        "Description",
        true,
        file,
        99,
      );

      expect(apiServices.put).toHaveBeenCalledWith(
        "/aiTrustCentre/resources/7",
        expect.any(FormData),
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );
      expect(response).toEqual(mockData);
    });

    it("should update trust centre resource without optional file fields", async () => {
      const mockData = { id: 8, updated: true };
      const mockResponse = { data: mockData, status: 200, statusText: "OK" };
      vi.mocked(apiServices.put).mockResolvedValue(mockResponse);

      const response = await updateAITrustCentreResource(
        8,
        "Resource",
        "Description",
        false,
      );

      expect(apiServices.put).toHaveBeenCalledWith(
        "/aiTrustCentre/resources/8",
        expect.any(FormData),
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );
      expect(response).toEqual(mockData);
    });

    it("should throw and log when resource update fails", async () => {
      const error = new Error("API Error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      vi.mocked(apiServices.put).mockRejectedValueOnce(error);

      await expect(
        updateAITrustCentreResource(7, "Resource", "Description", true),
      ).rejects.toThrow("API Error");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error updating AI Trust Center resource:",
        error,
      );
    });
  });

  describe("getAITrustCentreSubprocessors", () => {
    it("should fetch trust centre subprocessors", async () => {
      const mockData = [{ id: 1, name: "Vendor A" }];
      const mockResponse = { data: mockData, status: 200, statusText: "OK" };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getAITrustCentreSubprocessors();

      expect(apiServices.get).toHaveBeenCalledWith(
        "/aiTrustCentre/subprocessors",
      );
      expect(response).toEqual(mockData);
    });

    it("should throw and log when subprocessors fetch fails", async () => {
      const error = new Error("API Error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      vi.mocked(apiServices.get).mockRejectedValueOnce(error);

      await expect(getAITrustCentreSubprocessors()).rejects.toThrow(
        "API Error",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error fetching AI Trust Center subprocessors:",
        error,
      );
    });
  });

  describe("createAITrustCentreSubprocessor", () => {
    it("should create trust centre subprocessor with application/json header", async () => {
      const mockData = { id: 3, name: "Vendor B" };
      const mockResponse = {
        data: mockData,
        status: 201,
        statusText: "Created",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await createAITrustCentreSubprocessor(
        "Vendor B",
        "Hosting",
        "EU",
        "https://vendor-b.test",
      );

      expect(apiServices.post).toHaveBeenCalledWith(
        "/aiTrustCentre/subprocessors",
        {
          name: "Vendor B",
          purpose: "Hosting",
          location: "EU",
          url: "https://vendor-b.test",
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
      expect(response).toEqual(mockData);
    });

    it("should throw and log when subprocessor creation fails", async () => {
      const error = new Error("API Error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      vi.mocked(apiServices.post).mockRejectedValueOnce(error);

      await expect(
        createAITrustCentreSubprocessor(
          "Vendor B",
          "Hosting",
          "EU",
          "https://vendor-b.test",
        ),
      ).rejects.toThrow("API Error");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error creating AI Trust Center subprocessor:",
        error,
      );
    });
  });

  describe("updateAITrustCentreSubprocessor", () => {
    it("should update trust centre subprocessor with application/json header", async () => {
      const mockData = { id: 5, name: "Vendor C" };
      const mockResponse = { data: mockData, status: 200, statusText: "OK" };
      vi.mocked(apiServices.put).mockResolvedValue(mockResponse);

      const response = await updateAITrustCentreSubprocessor(
        5,
        "Vendor C",
        "Storage",
        "US",
        "https://vendor-c.test",
      );

      expect(apiServices.put).toHaveBeenCalledWith(
        "/aiTrustCentre/subprocessors/5",
        {
          name: "Vendor C",
          purpose: "Storage",
          location: "US",
          url: "https://vendor-c.test",
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
      expect(response).toEqual(mockData);
    });

    it("should throw and log when subprocessor update fails", async () => {
      const error = new Error("API Error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      vi.mocked(apiServices.put).mockRejectedValueOnce(error);

      await expect(
        updateAITrustCentreSubprocessor(
          5,
          "Vendor C",
          "Storage",
          "US",
          "https://vendor-c.test",
        ),
      ).rejects.toThrow("API Error");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error updating AI Trust Center subprocessor:",
        error,
      );
    });
  });

  describe("deleteAITrustCentreSubprocessor", () => {
    it("should delete trust centre subprocessor", async () => {
      const mockData = { deleted: true };
      const mockResponse = { data: mockData, status: 200, statusText: "OK" };
      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const response = await deleteAITrustCentreSubprocessor(11);

      expect(apiServices.delete).toHaveBeenCalledWith(
        "/aiTrustCentre/subprocessors/11",
      );
      expect(response).toEqual(mockData);
    });

    it("should throw and log when subprocessor deletion fails", async () => {
      const error = new Error("API Error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      vi.mocked(apiServices.delete).mockRejectedValueOnce(error);

      await expect(deleteAITrustCentreSubprocessor(11)).rejects.toThrow(
        "API Error",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error deleting AI Trust Center subprocessor:",
        error,
      );
    });
  });

  describe("getAITrustCentreLogo", () => {
    it("should fetch trust centre logo by tenant id", async () => {
      const mockData = { logo_url: "https://cdn/logo.png" };
      const mockResponse = { data: mockData, status: 200, statusText: "OK" };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getAITrustCentreLogo("tenant-123");

      expect(apiServices.get).toHaveBeenCalledWith(
        "/aiTrustCentre/tenant-123/logo",
        {
          responseType: "json",
        },
      );
      expect(response).toEqual(mockData);
    });

    it("should return null when logo endpoint responds 404 via response.status", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      vi.mocked(apiServices.get).mockRejectedValueOnce({
        response: { status: 404 },
      });

      const response = await getAITrustCentreLogo("tenant-123");

      expect(response).toBeNull();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("should return null when logo endpoint responds 404 via top-level status", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      vi.mocked(apiServices.get).mockRejectedValueOnce({ status: 404 });

      const response = await getAITrustCentreLogo("tenant-123");

      expect(response).toBeNull();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("should throw and log when logo fetch fails with non-404 error", async () => {
      const error = new Error("API Error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      vi.mocked(apiServices.get).mockRejectedValueOnce(error);

      await expect(getAITrustCentreLogo("tenant-123")).rejects.toThrow(
        "API Error",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error fetching AI Trust Center logo:",
        error,
      );
    });
  });
});
