import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  createSubtopic,
  deleteSubtopic,
  getSubtopicById,
  updateSubtopic,
} from "../subtopic.repository";

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

describe("Test Subtopic Repository", () => {
  describe("getSubtopicById", () => {
    it("should call get with default responseType and return response.data", async () => {
      const id = 7;
      const signal: AbortSignal = new AbortController().signal;
      const mockData = { id: 7, name: "Subtopic 7" };

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockData,
      });

      const response = await getSubtopicById({ id, signal });

      expect(apiServices.get).toHaveBeenCalledWith("/subtopics/7", {
        signal,
        responseType: "json",
      });
      expect(response).toEqual(mockData);
    });

    it("should call get with custom responseType", async () => {
      const id = 7;
      const signal: AbortSignal = new AbortController().signal;

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: "blob-content",
      });

      const response = await getSubtopicById({
        id,
        signal,
        responseType: "blob",
      });

      expect(apiServices.get).toHaveBeenCalledWith("/subtopics/7", {
        signal,
        responseType: "blob",
      });
      expect(response).toEqual("blob-content");
    });

    it("should call get with undefined signal when omitted", async () => {
      const id = 9;

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: { id: 9 },
      });

      await getSubtopicById({ id });

      expect(apiServices.get).toHaveBeenCalledWith("/subtopics/9", {
        signal: undefined,
        responseType: "json",
      });
    });
  });

  describe("createSubtopic", () => {
    it("should call post and return full response", async () => {
      const body = { name: "New Subtopic" };
      const mockResponse = {
        status: 201,
        statusText: "Created",
        data: { id: 1, ...body },
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await createSubtopic({ body });

      expect(apiServices.post).toHaveBeenCalledWith("/subtopics", body);
      expect(response).toEqual(mockResponse);
    });
  });

  describe("updateSubtopic", () => {
    it("should call patch and return full response", async () => {
      const id = 11;
      const body = { name: "Updated Subtopic" };
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: { id: 11, ...body },
      };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const response = await updateSubtopic({ id, body });

      expect(apiServices.patch).toHaveBeenCalledWith("/subtopics/11", body);
      expect(response).toEqual(mockResponse);
    });
  });

  describe("deleteSubtopic", () => {
    it("should call delete and return full response", async () => {
      const id = 3;
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: { deleted: true },
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const response = await deleteSubtopic({ id });

      expect(apiServices.delete).toHaveBeenCalledWith("/subtopics/3");
      expect(response).toEqual(mockResponse);
    });
  });
});
