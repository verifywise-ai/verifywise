import {
  getAllMappings,
  getMappingsBetween,
  createMapping,
  updateMapping,
  deleteMapping,
  createBulkMappings,
  getAllScenarios,
  createScenario,
  updateScenario,
  deleteScenario,
  activateScenario,
  simulateScenario,
  getActivationHistory,
  deactivateScenario,
  getScenarioProgress,
  getRecommendations,
  getCoverage,
  refreshCoverage,
  getUnifiedView,
  getPreferences,
  updatePreferences,
} from "../governanceOs.repository";
import { apiServices } from "../../../infrastructure/api/networkServices";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("governanceOs.repository", () => {
  describe("getAllMappings", () => {
    it("builds a query string from the provided filters", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { mappings: [] } });
      const signal = new AbortController().signal;

      await getAllMappings({ frameworkId: 1, strength: "strong", domain: "privacy", signal });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/governance-os/mappings?frameworkId=1&strength=strong&domain=privacy",
        { signal },
      );
    });

    it("makes a get request without a query string when no filters are given", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { mappings: [] } });

      await getAllMappings();

      expect(apiServices.get).toHaveBeenCalledWith("/governance-os/mappings", {
        signal: undefined,
      });
    });
  });

  describe("getMappingsBetween", () => {
    it("makes a get request scoped to source and target ids", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { mappings: [] } });

      await getMappingsBetween({ sourceId: 1, targetId: 2 });

      expect(apiServices.get).toHaveBeenCalledWith("/governance-os/mappings/between/1/2", {
        signal: undefined,
      });
    });
  });

  describe("createMapping", () => {
    it("makes a post request with the mapping body", async () => {
      const body = { source_control_id: 1, target_control_id: 2 };
      vi.mocked(apiServices.post).mockResolvedValue({ data: { id: 1, ...body } });

      const result = await createMapping({ body });

      expect(apiServices.post).toHaveBeenCalledWith("/governance-os/mappings", body);
      expect(result).toEqual({ id: 1, ...body });
    });
  });

  describe("updateMapping", () => {
    it("makes a put request scoped to the mapping id", async () => {
      const body = { strength: "moderate" };
      vi.mocked(apiServices.put).mockResolvedValue({ data: { id: 5, ...body } });

      await updateMapping({ id: 5, body });

      expect(apiServices.put).toHaveBeenCalledWith("/governance-os/mappings/5", body);
    });
  });

  describe("deleteMapping", () => {
    it("makes a delete request scoped to the mapping id", async () => {
      vi.mocked(apiServices.delete).mockResolvedValue({ data: { ok: true } });

      await deleteMapping({ id: 5 });

      expect(apiServices.delete).toHaveBeenCalledWith("/governance-os/mappings/5");
    });
  });

  describe("createBulkMappings", () => {
    it("makes a post request with the mappings array", async () => {
      const body = { mappings: [{ source_control_id: 1, target_control_id: 2 }] };
      vi.mocked(apiServices.post).mockResolvedValue({ data: { created: 1 } });

      await createBulkMappings({ body });

      expect(apiServices.post).toHaveBeenCalledWith("/governance-os/mappings/bulk", body);
    });
  });

  describe("getAllScenarios", () => {
    it("makes a get request for all scenarios", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: [] });

      await getAllScenarios();

      expect(apiServices.get).toHaveBeenCalledWith("/governance-os/scenarios", {
        signal: undefined,
      });
    });
  });

  describe("createScenario", () => {
    it("makes a post request with the scenario body", async () => {
      const body = { name: "Scenario A" };
      vi.mocked(apiServices.post).mockResolvedValue({ data: { id: 1, ...body } });

      await createScenario({ body });

      expect(apiServices.post).toHaveBeenCalledWith("/governance-os/scenarios", body);
    });
  });

  describe("updateScenario", () => {
    it("makes a put request scoped to the scenario id", async () => {
      const body = { name: "Updated" };
      vi.mocked(apiServices.put).mockResolvedValue({ data: { id: 1, ...body } });

      await updateScenario({ id: 1, body });

      expect(apiServices.put).toHaveBeenCalledWith("/governance-os/scenarios/1", body);
    });
  });

  describe("deleteScenario", () => {
    it("makes a delete request scoped to the scenario id", async () => {
      vi.mocked(apiServices.delete).mockResolvedValue({ data: { ok: true } });

      await deleteScenario({ id: 1 });

      expect(apiServices.delete).toHaveBeenCalledWith("/governance-os/scenarios/1");
    });
  });

  describe("activateScenario", () => {
    it("makes a post request scoped to the scenario id with the body", async () => {
      const body = { project_id: 3 };
      vi.mocked(apiServices.post).mockResolvedValue({ data: { activated: true } });

      await activateScenario({ id: 1, body });

      expect(apiServices.post).toHaveBeenCalledWith("/governance-os/scenarios/1/activate", body);
    });
  });

  describe("simulateScenario", () => {
    it("makes a post request with the simulation body", async () => {
      const body = { scenario_id: 1 };
      vi.mocked(apiServices.post).mockResolvedValue({ data: { result: {} } });

      await simulateScenario({ body });

      expect(apiServices.post).toHaveBeenCalledWith("/governance-os/scenarios/simulate", body);
    });
  });

  describe("getActivationHistory", () => {
    it("makes a get request for activation history", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: [] });

      await getActivationHistory();

      expect(apiServices.get).toHaveBeenCalledWith("/governance-os/activations", {
        signal: undefined,
      });
    });
  });

  describe("deactivateScenario", () => {
    it("makes a post request scoped to the activation id", async () => {
      vi.mocked(apiServices.post).mockResolvedValue({ data: { deactivated: true } });

      await deactivateScenario({ id: 7 });

      expect(apiServices.post).toHaveBeenCalledWith("/governance-os/activations/7/deactivate", {});
    });
  });

  describe("getScenarioProgress", () => {
    it("makes a get request scoped to the activation id", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { progress: 50 } });

      await getScenarioProgress({ id: 7 });

      expect(apiServices.get).toHaveBeenCalledWith("/governance-os/activations/7/progress", {
        signal: undefined,
      });
    });
  });

  describe("getRecommendations", () => {
    it("makes a post request with the recommendation request body", async () => {
      const body = { framework_ids: [1, 2] } as any;
      vi.mocked(apiServices.post).mockResolvedValue({ data: { recommendations: [] } });

      await getRecommendations({ body });

      expect(apiServices.post).toHaveBeenCalledWith("/governance-os/recommend", body);
    });
  });

  describe("getCoverage", () => {
    it("makes a get request scoped to the project id", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { coverage: 80 } });

      await getCoverage({ projectId: 3 });

      expect(apiServices.get).toHaveBeenCalledWith("/governance-os/coverage/3", {
        signal: undefined,
      });
    });
  });

  describe("refreshCoverage", () => {
    it("makes a post request scoped to the project id", async () => {
      vi.mocked(apiServices.post).mockResolvedValue({ data: { coverage: 85 } });

      await refreshCoverage({ projectId: 3 });

      expect(apiServices.post).toHaveBeenCalledWith("/governance-os/coverage/3/refresh", {});
    });
  });

  describe("getUnifiedView", () => {
    it("makes a get request scoped to the project id", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: {} });

      await getUnifiedView({ projectId: 3 });

      expect(apiServices.get).toHaveBeenCalledWith("/governance-os/unified-view/3", {
        signal: undefined,
      });
    });
  });

  describe("getPreferences", () => {
    it("makes a get request for preferences", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: {} });

      await getPreferences();

      expect(apiServices.get).toHaveBeenCalledWith("/governance-os/preferences", {
        signal: undefined,
      });
    });
  });

  describe("updatePreferences", () => {
    it("makes a put request with the preferences body", async () => {
      const body = { defaultFramework: "iso42001" };
      vi.mocked(apiServices.put).mockResolvedValue({ data: body });

      await updatePreferences({ body });

      expect(apiServices.put).toHaveBeenCalledWith("/governance-os/preferences", body);
    });
  });
});
