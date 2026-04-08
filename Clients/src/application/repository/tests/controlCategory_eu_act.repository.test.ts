import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  createControlCategory,
  deleteControlCategory,
  getAllControlCategories,
  getControlCategoriesByProjectId,
  getControlCategoryById,
  updateControlCategory,
} from "../controlCategory_eu_act.repository";

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

describe("Test ControlCategory EU Act Repository", () => {
  describe("getControlCategoryById", () => {
    it("should call get /controlCategory/:id with default responseType and return response.data", async () => {
      const signal = new AbortController().signal;
      const mockData = { id: 10, name: "Category 10" };
      vi.mocked(apiServices.get).mockResolvedValue({ data: mockData } as any);

      const response = await getControlCategoryById({ id: 10, signal });

      expect(apiServices.get).toHaveBeenCalledWith("/controlCategory/10", {
        signal,
        responseType: "json",
      });
      expect(response).toEqual(mockData);
    });

    it("should use custom responseType when provided", async () => {
      const mockData = new Blob(["abc"], { type: "application/octet-stream" });
      vi.mocked(apiServices.get).mockResolvedValue({ data: mockData } as any);

      const response = await getControlCategoryById({
        id: 20,
        responseType: "blob",
      });

      expect(apiServices.get).toHaveBeenCalledWith("/controlCategory/20", {
        signal: undefined,
        responseType: "blob",
      });
      expect(response).toBe(mockData);
    });
  });

  describe("createControlCategory", () => {
    it("should call post /controlCategory with body and empty config object and return full response", async () => {
      const body = { name: "New Category" };
      const mockResponse = { status: 201, data: { id: 1, ...body } };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse as any);

      const response = await createControlCategory({ body });

      expect(apiServices.post).toHaveBeenCalledWith(
        "/controlCategory",
        body,
        {},
      );
      expect(response).toEqual(mockResponse);
    });
  });

  describe("updateControlCategory", () => {
    it("should call patch /controlCategory/:id with body and return full response", async () => {
      const body = { name: "Updated Category" };
      const mockResponse = { status: 200, data: { id: 8, ...body } };
      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse as any);

      const response = await updateControlCategory({ id: 8, body });

      expect(apiServices.patch).toHaveBeenCalledWith(
        "/controlCategory/8",
        body,
      );
      expect(response).toEqual(mockResponse);
    });
  });

  describe("deleteControlCategory", () => {
    it("should call delete /controlCategory/:id and return full response", async () => {
      const mockResponse = { status: 200, data: { deleted: true } };
      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse as any);

      const response = await deleteControlCategory({ id: 5 });

      expect(apiServices.delete).toHaveBeenCalledWith("/controlCategory/5");
      expect(response).toEqual(mockResponse);
    });
  });

  describe("getAllControlCategories", () => {
    it("should call get /controlCategory and return response.data", async () => {
      const mockData = [{ id: 1 }, { id: 2 }];
      vi.mocked(apiServices.get).mockResolvedValue({ data: mockData } as any);

      const response = await getAllControlCategories();

      expect(apiServices.get).toHaveBeenCalledWith("/controlCategory");
      expect(response).toEqual(mockData);
    });
  });

  describe("getControlCategoriesByProjectId", () => {
    it("should call byprojectid endpoint with signal and return response.data", async () => {
      const signal = new AbortController().signal;
      const mockData = [{ id: 12, projectId: 99 }];
      vi.mocked(apiServices.get).mockResolvedValue({ data: mockData } as any);

      const response = await getControlCategoriesByProjectId({
        projectId: 99,
        signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/controlCategory/byprojectid/99",
        { signal },
      );
      expect(response).toEqual(mockData);
    });

    it("should call byprojectid endpoint with undefined signal when not provided", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: [] } as any);

      await getControlCategoriesByProjectId({ projectId: 100 });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/controlCategory/byprojectid/100",
        { signal: undefined },
      );
    });
  });
});
