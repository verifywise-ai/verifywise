import {
  getAllAiApps,
  getAiAppById,
  createAiApp,
  updateAiApp,
  updateAiAppStatus,
  deleteAiApp,
  linkModelsToAiApp,
  setPoliciesForAiApp,
  setDataExposureForAiApp,
  getPolicySuggestions,
  promoteFromShadowAi,
} from "../aiApp.repository";
import { apiServices } from "../../../infrastructure/api/networkServices";
import { AiAppStatus } from "../../../domain/enums/aiApp.enum";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("aiApp.repository", () => {
  describe("getAllAiApps", () => {
    it("builds a query string from the provided filters", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        data: { data: { ai_apps: [], total: 0 } },
      });

      const signal = new AbortController().signal;
      await getAllAiApps(
        { status: AiAppStatus.APPROVED, vendorId: 3, page: 1, limit: 20, sortBy: "name", order: "asc" },
        signal,
      );

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-apps?status=approved&vendorId=3&page=1&limit=20&sortBy=name&order=asc",
        { signal },
      );
    });

    it("makes a get request without a query string when no filters are given", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: { ai_apps: [], total: 0 } } });

      const result = await getAllAiApps();

      expect(apiServices.get).toHaveBeenCalledWith("/ai-apps", { signal: undefined });
      expect(result).toEqual({ ai_apps: [], total: 0 });
    });
  });

  describe("getAiAppById", () => {
    it("makes a get request scoped to the app id", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: { id: 1 } } });

      const result = await getAiAppById(1);

      expect(apiServices.get).toHaveBeenCalledWith("/ai-apps/1", { signal: undefined });
      expect(result).toEqual({ id: 1 });
    });
  });

  describe("createAiApp", () => {
    it("makes a post request with the app payload", async () => {
      const payload = { name: "New App" } as any;
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: { id: 2, ...payload } } });

      const result = await createAiApp(payload);

      expect(apiServices.post).toHaveBeenCalledWith("/ai-apps", payload);
      expect(result).toEqual({ id: 2, ...payload });
    });
  });

  describe("updateAiApp", () => {
    it("makes a patch request scoped to the app id", async () => {
      const payload = { name: "Updated" } as any;
      vi.mocked(apiServices.patch).mockResolvedValue({ data: { data: { id: 3, ...payload } } });

      const result = await updateAiApp(3, payload);

      expect(apiServices.patch).toHaveBeenCalledWith("/ai-apps/3", payload);
      expect(result).toEqual({ id: 3, ...payload });
    });
  });

  describe("updateAiAppStatus", () => {
    it("makes a patch request with the new status", async () => {
      vi.mocked(apiServices.patch).mockResolvedValue({
        data: { data: { id: 4, status: AiAppStatus.RESTRICTED } },
      });

      const result = await updateAiAppStatus(4, AiAppStatus.RESTRICTED);

      expect(apiServices.patch).toHaveBeenCalledWith("/ai-apps/4/status", {
        status: AiAppStatus.RESTRICTED,
      });
      expect(result).toEqual({ id: 4, status: AiAppStatus.RESTRICTED });
    });
  });

  describe("deleteAiApp", () => {
    it("makes a delete request scoped to the app id", async () => {
      vi.mocked(apiServices.delete).mockResolvedValue({ data: { data: { id: 5 } } });

      const result = await deleteAiApp(5);

      expect(apiServices.delete).toHaveBeenCalledWith("/ai-apps/5");
      expect(result).toEqual({ id: 5 });
    });
  });

  describe("linkModelsToAiApp", () => {
    it("makes a post request with the model inventory ids", async () => {
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: { id: 6 } } });

      await linkModelsToAiApp(6, [10, 11]);

      expect(apiServices.post).toHaveBeenCalledWith("/ai-apps/6/models", {
        model_inventory_ids: [10, 11],
      });
    });
  });

  describe("setPoliciesForAiApp", () => {
    it("makes a post request with the policies payload", async () => {
      const policies = [{ policy_id: 1, status: "applicable" }];
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: { id: 7 } } });

      await setPoliciesForAiApp(7, policies);

      expect(apiServices.post).toHaveBeenCalledWith("/ai-apps/7/policies", { policies });
    });
  });

  describe("setDataExposureForAiApp", () => {
    it("makes a post request with the data exposure payload", async () => {
      const dataExposure = [{ data_type: "pii", allowed: false }];
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: { id: 8 } } });

      await setDataExposureForAiApp(8, dataExposure);

      expect(apiServices.post).toHaveBeenCalledWith("/ai-apps/8/data-exposure", {
        data_exposure: dataExposure,
      });
    });
  });

  describe("getPolicySuggestions", () => {
    it("makes a get request with the encoded name", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [{ id: 1 }] } });

      const result = await getPolicySuggestions("My App");

      expect(apiServices.get).toHaveBeenCalledWith("/ai-apps/policy-suggestions?name=My%20App", {
        signal: undefined,
      });
      expect(result).toEqual([{ id: 1 }]);
    });
  });

  describe("promoteFromShadowAi", () => {
    it("makes a post request scoped to the shadow ai tool id", async () => {
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: { id: 9 } } });

      const result = await promoteFromShadowAi(20);

      expect(apiServices.post).toHaveBeenCalledWith("/ai-apps/from-shadow-ai/20", {});
      expect(result).toEqual({ id: 9 });
    });
  });
});
