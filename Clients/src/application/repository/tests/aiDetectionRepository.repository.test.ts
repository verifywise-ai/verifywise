import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  createRepository,
  deleteRepository,
  getRepositories,
  getRepository,
  getRepositoryCount,
  getRepositoryScans,
  triggerRepositoryScan,
  updateRepository,
} from "../aiDetectionRepository.repository";

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

describe("Test AI Detection Repository Registry", () => {
  describe("getRepositories", () => {
    it("should make a get request with provided page and limit", async () => {
      const mockData = {
        data: [],
        pagination: { page: 2, limit: 10, total: 100, totalPages: 10 },
      };
      const mockResponse = {
        data: { data: mockData },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getRepositories(2, 10);

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/repositories?page=2&limit=10",
      );
      expect(response).toEqual(mockData);
    });

    it("should use default page and limit when not provided", async () => {
      const mockData = {
        data: [],
        pagination: { page: 1, limit: 20, total: 5, totalPages: 1 },
      };
      const mockResponse = {
        data: { data: mockData },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getRepositories();

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/repositories?page=1&limit=20",
      );
      expect(response).toEqual(mockData);
    });
  });

  describe("getRepository", () => {
    it("should make a get request to retrieve a repository by id", async () => {
      const mockData = { id: 123, name: "repo-1" };
      const mockResponse = {
        data: { data: mockData },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getRepository(123);

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/repositories/123",
      );
      expect(response).toEqual(mockData);
    });
  });

  describe("createRepository", () => {
    it("should make a post request to create a repository", async () => {
      const input = {
        repository_url: "https://github.com/acme/repo",
        branch: "main",
      };
      const mockData = { id: 123, ...input };
      const mockResponse = {
        data: { data: mockData },
        status: 201,
        statusText: "Created",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await createRepository(input as any);

      expect(apiServices.post).toHaveBeenCalledWith(
        "/ai-detection/repositories",
        input,
      );
      expect(response).toEqual(mockData);
    });
  });

  describe("updateRepository", () => {
    it("should make a patch request to update a repository", async () => {
      const id = 123;
      const input = { branch: "develop" };
      const mockData = {
        id,
        repository_url: "https://github.com/acme/repo",
        ...input,
      };
      const mockResponse = {
        data: { data: mockData },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const response = await updateRepository(id, input as any);

      expect(apiServices.patch).toHaveBeenCalledWith(
        "/ai-detection/repositories/123",
        input,
      );
      expect(response).toEqual(mockData);
    });
  });

  describe("deleteRepository", () => {
    it("should make a delete request to remove a repository", async () => {
      vi.mocked(apiServices.delete).mockResolvedValue({} as any);

      const response = await deleteRepository(123);

      expect(apiServices.delete).toHaveBeenCalledWith(
        "/ai-detection/repositories/123",
      );
      expect(response).toBeUndefined();
    });
  });

  describe("triggerRepositoryScan", () => {
    it("should make a post request to trigger a repository scan", async () => {
      const mockData = { id: 456, status: "pending" };
      const mockResponse = {
        data: { data: mockData },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await triggerRepositoryScan(123);

      expect(apiServices.post).toHaveBeenCalledWith(
        "/ai-detection/repositories/123/scan",
      );
      expect(response).toEqual(mockData);
    });
  });

  describe("getRepositoryScans", () => {
    it("should make a get request with provided page and limit", async () => {
      const mockData = {
        scans: [],
        pagination: { page: 3, limit: 15, total: 30, totalPages: 2 },
      };
      const mockResponse = {
        data: { data: mockData },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getRepositoryScans(123, 3, 15);

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/repositories/123/scans?page=3&limit=15",
      );
      expect(response).toEqual(mockData);
    });

    it("should use default page and limit when not provided", async () => {
      const mockData = {
        scans: [],
        pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
      };
      const mockResponse = {
        data: { data: mockData },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getRepositoryScans(123);

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/repositories/123/scans?page=1&limit=20",
      );
      expect(response).toEqual(mockData);
    });
  });

  describe("getRepositoryCount", () => {
    it("should make a get request and return total repositories from pagination", async () => {
      const mockResponse = {
        data: {
          data: {
            data: [{ id: 1 }],
            pagination: { page: 1, limit: 1, total: 42, totalPages: 42 },
          },
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getRepositoryCount();

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/repositories?page=1&limit=1",
      );
      expect(response).toBe(42);
    });
  });
});
