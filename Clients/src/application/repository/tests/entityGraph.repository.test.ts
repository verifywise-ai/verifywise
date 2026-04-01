import { apiServices } from "../../../infrastructure/api/networkServices";
import { fetchEntityGraphData } from "../entityGraph.repository";

vi.mock("../../../infrastructure/api/networkServices", () => {
  return {
    apiServices: {
      get: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

const ok = (data: unknown) => ({ status: 200, statusText: "OK", data });

// Helper: build a minimal mock for all 9 endpoints in order:
// /projects, /modelInventory, /modelRisks, /vendors, /vendorRisks/all,
// /projectRisks, /evidenceHub, /frameworks, /users
const makeGetMock = ({
  useCases = [] as any[],
  models = [] as any[],
  modelRisks = [] as any[],
  vendors = [] as any[],
  vendorRisks = [] as any[],
  projectRisks = [] as any[],
  evidence = [] as any[],
  frameworks = [] as any[],
  users = [] as any[],
} = {}) => {
  const map: Record<string, unknown> = {
    "/projects": ok(useCases),
    "/modelInventory": ok(models),
    "/modelRisks": ok(modelRisks),
    "/vendors": ok(vendors),
    "/vendorRisks/all": ok(vendorRisks),
    "/projectRisks": ok(projectRisks),
    "/evidenceHub": ok(evidence),
    "/frameworks": ok(frameworks),
    "/users": ok(users),
  };
  vi.mocked(apiServices.get).mockImplementation((url: string) =>
    Promise.resolve(map[url] as any),
  );
};

describe("Test EntityGraph Repository", () => {
  describe("fetchEntityGraphData – basic shape", () => {
    it("should return the correct top-level keys", async () => {
      makeGetMock();

      const result = await fetchEntityGraphData();

      expect(result).toHaveProperty("useCases");
      expect(result).toHaveProperty("models");
      expect(result).toHaveProperty("risks");
      expect(result).toHaveProperty("vendors");
      expect(result).toHaveProperty("evidence");
      expect(result).toHaveProperty("frameworks");
      expect(result).toHaveProperty("users");
    });

    it("should map direct array responses correctly", async () => {
      const useCase = { id: 1, project_title: "My Project", owner: 2 };
      const model = {
        id: 10,
        provider: "OpenAI",
        model: "gpt-4",
        status: "active",
        projects: [],
        frameworks: [],
      };
      makeGetMock({ useCases: [useCase], models: [model] });

      const result = await fetchEntityGraphData();

      expect(result.useCases).toEqual([useCase]);
      expect(result.models).toEqual([model]);
    });

    it("should handle nested {data: {data: []}} response format", async () => {
      const framework = { id: 1, name: "EU AI Act" };
      // Return nested format for frameworks
      vi.mocked(apiServices.get).mockImplementation((url: string) =>
        url === "/frameworks"
          ? Promise.resolve(ok({ data: [framework] }) as any)
          : Promise.resolve(ok([]) as any),
      );

      const result = await fetchEntityGraphData();

      expect(result.frameworks).toEqual([framework]);
    });

    it("should return empty arrays when data is neither array nor nested data", async () => {
      vi.mocked(apiServices.get).mockResolvedValue(ok(null) as any);

      const result = await fetchEntityGraphData();

      expect(result.useCases).toEqual([]);
      expect(result.risks).toEqual([]);
    });
  });

  describe("fetchEntityGraphData – error handling", () => {
    it("should silently return empty data for any endpoint that rejects", async () => {
      vi.mocked(apiServices.get).mockRejectedValue(new Error("Network error")); // .catch inside repo returns empty

      const result = await fetchEntityGraphData();

      expect(result.useCases).toEqual([]);
      expect(result.models).toEqual([]);
      expect(result.risks).toEqual([]);
    });

    it("should still return data from successful endpoints when some fail", async () => {
      const user = { id: 1, name: "Alice", surname: "Smith" };
      vi.mocked(apiServices.get).mockImplementation((url: string) =>
        url === "/users"
          ? Promise.resolve(ok([user]) as any)
          : Promise.reject(new Error("fail")),
      );

      const result = await fetchEntityGraphData();

      expect(result.users).toEqual([user]);
      expect(result.useCases).toEqual([]);
    });
  });

  describe("fetchEntityGraphData – progress callback", () => {
    it("should call onProgress for each of the 9 endpoints", async () => {
      makeGetMock();
      const onProgress = vi.fn();

      await fetchEntityGraphData(onProgress);

      expect(onProgress).toHaveBeenCalledTimes(9);
      // First call: loaded=1, total=9; last call: loaded=9, total=9
      expect(onProgress).toHaveBeenNthCalledWith(1, expect.any(Number), 9);
      expect(onProgress).toHaveBeenLastCalledWith(9, 9);
    });

    it("should work without a progress callback (optional parameter)", async () => {
      makeGetMock();

      await expect(fetchEntityGraphData()).resolves.toBeDefined();
    });
  });

  describe("fetchEntityGraphData – risk combining", () => {
    it("should include model risks with source='model'", async () => {
      const modelRisk = {
        id: 5,
        risk_name: "Bias Risk",
        risk_level: "high",
        model_id: 10,
      };
      makeGetMock({ modelRisks: [modelRisk] });

      const result = await fetchEntityGraphData();

      expect(result.risks).toHaveLength(1);
      expect(result.risks[0]).toMatchObject({
        id: 5,
        risk_name: "Bias Risk",
        risk_level: "high",
        model_id: 10,
        source: "model",
      });
    });

    it("should offset project risk IDs by 100000 and use source='project'", async () => {
      const projectRisk = {
        id: 3,
        risk_name: "Compliance Risk",
        current_risk_level: "medium",
        project_id: 7,
      };
      makeGetMock({ projectRisks: [projectRisk] });

      const result = await fetchEntityGraphData();

      expect(result.risks).toHaveLength(1);
      expect(result.risks[0]).toMatchObject({
        id: 100003,
        risk_name: "Compliance Risk",
        risk_level: "medium",
        model_id: null,
        project_id: 7,
        source: "project",
      });
    });

    it("should offset vendor risk IDs by 200000 and use source='vendor'", async () => {
      const vendorRisk = {
        risk_id: 2,
        risk_description: "Vendor data breach risk",
        risk_severity: "critical",
        vendor_id: 4,
        vendor_name: "Acme Corp",
      };
      makeGetMock({ vendorRisks: [vendorRisk] });

      const result = await fetchEntityGraphData();

      expect(result.risks).toHaveLength(1);
      expect(result.risks[0]).toMatchObject({
        id: 200002,
        risk_level: "critical",
        model_id: null,
        vendor_id: 4,
        source: "vendor",
        vendor_name: "Acme Corp",
        risk_description: "Vendor data breach risk",
      });
    });

    it("should truncate vendor risk_name to 50 chars from risk_description", async () => {
      const longDesc = "A".repeat(80);
      const vendorRisk = {
        risk_id: 1,
        risk_description: longDesc,
        risk_severity: "low",
        vendor_id: 1,
      };
      makeGetMock({ vendorRisks: [vendorRisk] });

      const result = await fetchEntityGraphData();

      expect(result.risks[0].risk_name).toHaveLength(50);
      expect(result.risks[0].risk_name).toBe("A".repeat(50));
    });

    it("should fall back to 'Vendor Risk' when risk_description is empty", async () => {
      const vendorRisk = {
        risk_id: 9,
        risk_description: "",
        risk_severity: "low",
        vendor_id: 1,
      };
      makeGetMock({ vendorRisks: [vendorRisk] });

      const result = await fetchEntityGraphData();

      expect(result.risks[0].risk_name).toBe("Vendor Risk");
    });

    it("should combine all three risk sources into one array", async () => {
      makeGetMock({
        modelRisks: [{ id: 1, risk_name: "M", risk_level: "low", model_id: 1 }],
        projectRisks: [
          {
            id: 2,
            risk_name: "P",
            current_risk_level: "medium",
            project_id: 1,
          },
        ],
        vendorRisks: [
          {
            risk_id: 3,
            risk_description: "V",
            risk_severity: "high",
            vendor_id: 1,
          },
        ],
      });

      const result = await fetchEntityGraphData();

      expect(result.risks).toHaveLength(3);
      expect(result.risks.map((r) => r.source)).toEqual(
        expect.arrayContaining(["model", "project", "vendor"]),
      );
    });
  });

  describe("fetchEntityGraphData – makes correct API calls", () => {
    it("should call get for all 9 endpoints", async () => {
      makeGetMock();

      await fetchEntityGraphData();

      const calledUrls = vi
        .mocked(apiServices.get)
        .mock.calls.map(([url]) => url);
      expect(calledUrls).toEqual(
        expect.arrayContaining([
          "/projects",
          "/modelInventory",
          "/modelRisks",
          "/vendors",
          "/vendorRisks/all",
          "/projectRisks",
          "/evidenceHub",
          "/frameworks",
          "/users",
        ]),
      );
      expect(apiServices.get).toHaveBeenCalledTimes(9);
    });
  });
});
