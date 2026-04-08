import CustomAxios from "../../../infrastructure/api/customAxios";
import {
  getFeatureSettings,
  updateFeatureSettings,
} from "../featureSettings.repository";

vi.mock("../../../infrastructure/api/customAxios", () => {
  return {
    default: {
      get: vi.fn(),
      patch: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Test FeatureSettings Repository", () => {
  describe("getFeatureSettings", () => {
    it("should call get and return response.data.data", async () => {
      const mockData = {
        id: 1,
        lifecycle_enabled: true,
        audit_ledger_enabled: false,
        updated_at: "2026-03-05T00:00:00.000Z",
        updated_by: null,
      };

      vi.mocked(CustomAxios.get).mockResolvedValue({
        data: { data: mockData },
      });

      const response = await getFeatureSettings();

      expect(CustomAxios.get).toHaveBeenCalledWith("/feature-settings");
      expect(response).toEqual(mockData);
    });
  });

  describe("updateFeatureSettings", () => {
    it("should call patch with lifecycle_enabled and return response.data.data", async () => {
      const settings = { lifecycle_enabled: true };
      const mockData = {
        id: 1,
        lifecycle_enabled: true,
        audit_ledger_enabled: false,
        updated_at: "2026-03-05T00:00:00.000Z",
        updated_by: 5,
      };

      vi.mocked(CustomAxios.patch).mockResolvedValue({
        data: { data: mockData },
      });

      const response = await updateFeatureSettings(settings);

      expect(CustomAxios.patch).toHaveBeenCalledWith(
        "/feature-settings",
        settings,
      );
      expect(response).toEqual(mockData);
    });

    it("should call patch with audit_ledger_enabled and return response.data.data", async () => {
      const settings = { audit_ledger_enabled: true };
      const mockData = {
        id: 1,
        lifecycle_enabled: false,
        audit_ledger_enabled: true,
        updated_at: "2026-03-05T00:00:00.000Z",
        updated_by: 3,
      };

      vi.mocked(CustomAxios.patch).mockResolvedValue({
        data: { data: mockData },
      });

      const response = await updateFeatureSettings(settings);

      expect(CustomAxios.patch).toHaveBeenCalledWith(
        "/feature-settings",
        settings,
      );
      expect(response).toEqual(mockData);
    });

    it("should call patch with both settings fields and return response.data.data", async () => {
      const settings = { lifecycle_enabled: false, audit_ledger_enabled: true };
      const mockData = {
        id: 1,
        lifecycle_enabled: false,
        audit_ledger_enabled: true,
        updated_at: "2026-03-05T00:00:00.000Z",
        updated_by: 2,
      };

      vi.mocked(CustomAxios.patch).mockResolvedValue({
        data: { data: mockData },
      });

      const response = await updateFeatureSettings(settings);

      expect(CustomAxios.patch).toHaveBeenCalledWith(
        "/feature-settings",
        settings,
      );
      expect(response).toEqual(mockData);
    });
  });
});
