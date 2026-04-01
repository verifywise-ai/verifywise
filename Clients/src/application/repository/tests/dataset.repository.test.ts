import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  createDataset,
  deleteDataset,
  getAllDatasets,
  getDatasetById,
  getDatasetHistory,
  getDatasetsByModelId,
  getDatasetsByProjectId,
  updateDataset,
} from "../dataset.repository";

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

describe("Test Dataset Repository", () => {
  describe("createDataset", () => {
    it("should call post with provided routeUrl and data, and return response.data", async () => {
      const routeUrl = "/datasets";
      const data = { name: "My Dataset", description: "Test" };
      const mockData = { id: 1, ...data };

      vi.mocked(apiServices.post).mockResolvedValue({
        status: 201,
        statusText: "Created",
        data: mockData,
      });

      const response = await createDataset(routeUrl, data);

      expect(apiServices.post).toHaveBeenCalledWith(routeUrl, data);
      expect(response).toEqual(mockData);
    });

    it("should log and rethrow when post fails", async () => {
      const routeUrl = "/datasets";
      const data = { name: "Bad Dataset" };
      const error = new Error("post failed");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(createDataset(routeUrl, data)).rejects.toThrow(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error creating dataset:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("getAllDatasets", () => {
    it("should call get /datasets and return response.data", async () => {
      const mockData = [
        { id: 1, name: "DS1" },
        { id: 2, name: "DS2" },
      ];

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockData,
      });

      const response = await getAllDatasets();

      expect(apiServices.get).toHaveBeenCalledWith("/datasets");
      expect(response).toEqual(mockData);
    });

    it("should log and rethrow when get fails", async () => {
      const error = new Error("fetch failed");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getAllDatasets()).rejects.toThrow(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error fetching datasets:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("getDatasetById", () => {
    it("should call get /datasets/:id and return response.data", async () => {
      const id = 5;
      const mockData = { id: 5, name: "DS5" };

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockData,
      });

      const response = await getDatasetById(id);

      expect(apiServices.get).toHaveBeenCalledWith("/datasets/5");
      expect(response).toEqual(mockData);
    });

    it("should log and rethrow when get fails", async () => {
      const error = new Error("not found");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getDatasetById(99)).rejects.toThrow(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error fetching dataset:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("getDatasetsByModelId", () => {
    it("should call get /datasets/by-model/:modelId and return response.data", async () => {
      const modelId = 12;
      const mockData = [{ id: 1, modelId: 12 }];

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockData,
      });

      const response = await getDatasetsByModelId(modelId);

      expect(apiServices.get).toHaveBeenCalledWith("/datasets/by-model/12");
      expect(response).toEqual(mockData);
    });

    it("should log and rethrow when get fails", async () => {
      const error = new Error("model fetch failed");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getDatasetsByModelId(12)).rejects.toThrow(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error fetching datasets by model:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("getDatasetsByProjectId", () => {
    it("should call get /datasets/by-project/:projectId and return response.data", async () => {
      const projectId = 33;
      const mockData = [{ id: 2, projectId: 33 }];

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockData,
      });

      const response = await getDatasetsByProjectId(projectId);

      expect(apiServices.get).toHaveBeenCalledWith("/datasets/by-project/33");
      expect(response).toEqual(mockData);
    });

    it("should log and rethrow when get fails", async () => {
      const error = new Error("project fetch failed");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getDatasetsByProjectId(33)).rejects.toThrow(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error fetching datasets by project:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("updateDataset", () => {
    it("should call patch /datasets/:id with data and return response.data", async () => {
      const id = 7;
      const data = { name: "Updated DS" };
      const mockData = { id: 7, ...data };

      vi.mocked(apiServices.patch).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockData,
      });

      const response = await updateDataset(id, data);

      expect(apiServices.patch).toHaveBeenCalledWith("/datasets/7", data);
      expect(response).toEqual(mockData);
    });

    it("should log and rethrow when patch fails", async () => {
      const error = new Error("update failed");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.patch).mockRejectedValue(error);

      await expect(updateDataset(7, {})).rejects.toThrow(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error updating dataset:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("deleteDataset", () => {
    it("should call delete /datasets/:id and return response.data", async () => {
      const id = 8;
      const mockData = { deleted: true };

      vi.mocked(apiServices.delete).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockData,
      });

      const response = await deleteDataset(id);

      expect(apiServices.delete).toHaveBeenCalledWith("/datasets/8");
      expect(response).toEqual(mockData);
    });

    it("should log and rethrow when delete fails", async () => {
      const error = new Error("delete failed");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.delete).mockRejectedValue(error);

      await expect(deleteDataset(8)).rejects.toThrow(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error deleting dataset:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("getDatasetHistory", () => {
    it("should call get /datasets/:id/history and return response.data", async () => {
      const id = 3;
      const mockData = [{ timestamp: "2026-02-01", change: "Created" }];

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockData,
      });

      const response = await getDatasetHistory(id);

      expect(apiServices.get).toHaveBeenCalledWith("/datasets/3/history");
      expect(response).toEqual(mockData);
    });

    it("should log and rethrow when get fails", async () => {
      const error = new Error("history fetch failed");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getDatasetHistory(3)).rejects.toThrow(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error fetching dataset history:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
