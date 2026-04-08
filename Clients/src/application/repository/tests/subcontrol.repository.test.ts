import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  createSubcontrol,
  deleteSubcontrol,
  getSubcontrolById,
  updateSubcontrol,
} from "../subcontrol.repository";

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

describe("Test Subcontrol Repository", () => {
  describe("getSubcontrolById", () => {
    it("should call get with default responseType and return response.data", async () => {
      const id = 42;
      const signal: AbortSignal = new AbortController().signal;
      const mockData = { id: 42, name: "Subcontrol 42" };

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockData,
      });

      const response = await getSubcontrolById({ id, signal });

      expect(apiServices.get).toHaveBeenCalledWith("/subcontrols/42", {
        signal,
        responseType: "json",
      });
      expect(response).toEqual(mockData);
    });

    it("should call get with custom responseType", async () => {
      const id = 42;
      const signal: AbortSignal = new AbortController().signal;

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: "blob-content",
      });

      const response = await getSubcontrolById({
        id,
        signal,
        responseType: "blob",
      });

      expect(apiServices.get).toHaveBeenCalledWith("/subcontrols/42", {
        signal,
        responseType: "blob",
      });
      expect(response).toEqual("blob-content");
    });

    it("should call get with undefined signal when omitted", async () => {
      const id = 1;

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: { id: 1 },
      });

      await getSubcontrolById({ id });

      expect(apiServices.get).toHaveBeenCalledWith("/subcontrols/1", {
        signal: undefined,
        responseType: "json",
      });
    });
  });

  describe("createSubcontrol", () => {
    it("should call post and return full response", async () => {
      const body = { name: "New Subcontrol" };
      const mockResponse = {
        status: 201,
        statusText: "Created",
        data: { id: 1, ...body },
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await createSubcontrol({ body });

      expect(apiServices.post).toHaveBeenCalledWith("/subcontrols", body);
      expect(response).toEqual(mockResponse);
    });
  });

  describe("updateSubcontrol", () => {
    it("should call patch and return full response", async () => {
      const id = 10;
      const body = { name: "Updated Subcontrol" };
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: { id: 10, ...body },
      };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const response = await updateSubcontrol({ id, body });

      expect(apiServices.patch).toHaveBeenCalledWith("/subcontrols/10", body);
      expect(response).toEqual(mockResponse);
    });
  });

  describe("deleteSubcontrol", () => {
    it("should call delete and return full response", async () => {
      const id = 5;
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: { deleted: true },
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const response = await deleteSubcontrol({ id });

      expect(apiServices.delete).toHaveBeenCalledWith("/subcontrols/5");
      expect(response).toEqual(mockResponse);
    });
  });
});
