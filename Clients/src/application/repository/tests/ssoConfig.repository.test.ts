import { apiServices } from "../../../infrastructure/api/networkServices";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("ssoConfig.repository", () => {
  describe("GetSsoFeatureEnabled", () => {
    it("returns true when the backend reports the feature enabled", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: { enabled: true } } });
      const { GetSsoFeatureEnabled } = await import("../ssoConfig.repository");

      const result = await GetSsoFeatureEnabled();

      expect(apiServices.get).toHaveBeenCalledWith("ssoConfig/feature");
      expect(result).toBe(true);
    });

    it("returns false when the backend reports the feature disabled", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: { enabled: false } } });
      const { GetSsoFeatureEnabled } = await import("../ssoConfig.repository");

      const result = await GetSsoFeatureEnabled();

      expect(result).toBe(false);
    });

    it("falls back to response.data when data.data is absent", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { enabled: true } });
      const { GetSsoFeatureEnabled } = await import("../ssoConfig.repository");

      const result = await GetSsoFeatureEnabled();

      expect(result).toBe(true);
    });

    it("returns false and swallows errors when the request fails", async () => {
      vi.mocked(apiServices.get).mockRejectedValue(new Error("network error"));
      const { GetSsoFeatureEnabled } = await import("../ssoConfig.repository");

      const result = await GetSsoFeatureEnabled();

      expect(result).toBe(false);
    });

    it("caches the promise and only calls the API once across multiple calls", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: { enabled: true } } });
      const { GetSsoFeatureEnabled } = await import("../ssoConfig.repository");

      await GetSsoFeatureEnabled();
      await GetSsoFeatureEnabled();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
    });
  });

  describe("GetSsoConfig", () => {
    it("makes a get request with signal and responseType", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { enabled: true } });
      const { GetSsoConfig } = await import("../ssoConfig.repository");
      const signal = new AbortController().signal;

      const result = await GetSsoConfig({ routeUrl: "ssoConfig/1", signal });

      expect(apiServices.get).toHaveBeenCalledWith("ssoConfig/1", {
        signal,
        responseType: "json",
      });
      expect(result).toEqual({ data: { enabled: true } });
    });
  });

  describe("UpdateSsoConfig", () => {
    it("makes a put request with the body and returns response data", async () => {
      vi.mocked(apiServices.put).mockResolvedValue({ data: { updated: true } });
      const { UpdateSsoConfig } = await import("../ssoConfig.repository");

      const result = await UpdateSsoConfig({ routeUrl: "ssoConfig/1", body: { enabled: true } });

      expect(apiServices.put).toHaveBeenCalledWith("ssoConfig/1", { enabled: true });
      expect(result).toEqual({ updated: true });
    });
  });

  describe("ToggleSsoStatus", () => {
    it("makes a put request with the body and returns response data", async () => {
      vi.mocked(apiServices.put).mockResolvedValue({ data: { enabled: false } });
      const { ToggleSsoStatus } = await import("../ssoConfig.repository");

      const result = await ToggleSsoStatus({ routeUrl: "ssoConfig/1/toggle", body: { enabled: false } });

      expect(apiServices.put).toHaveBeenCalledWith("ssoConfig/1/toggle", { enabled: false });
      expect(result).toEqual({ enabled: false });
    });
  });

  describe("CheckSsoStatus", () => {
    it("makes a get request with the default provider when none is given", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        data: { data: { isEnabled: true, hasConfig: true } },
      });
      const { CheckSsoStatus } = await import("../ssoConfig.repository");

      const result = await CheckSsoStatus();

      expect(apiServices.get).toHaveBeenCalledWith("ssoConfig/check-status?provider=AzureAD");
      expect(result).toEqual({ isEnabled: true, hasConfig: true });
    });

    it("includes organizationId in the query when provided", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        data: { data: { isEnabled: false, hasConfig: false } },
      });
      const { CheckSsoStatus } = await import("../ssoConfig.repository");

      await CheckSsoStatus(42, "Okta");

      expect(apiServices.get).toHaveBeenCalledWith(
        "ssoConfig/check-status?provider=Okta&organizationId=42",
      );
    });

    it("falls back to response.data when data.data is absent", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { isEnabled: true, hasConfig: true } });
      const { CheckSsoStatus } = await import("../ssoConfig.repository");

      const result = await CheckSsoStatus();

      expect(result).toEqual({ isEnabled: true, hasConfig: true });
    });
  });

  describe("GetSsoOrgs", () => {
    it("makes a get request with the default provider when none is given", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [{ id: 1, name: "Org" }] } });
      const { GetSsoOrgs } = await import("../ssoConfig.repository");

      const result = await GetSsoOrgs();

      expect(apiServices.get).toHaveBeenCalledWith("ssoConfig/orgs?provider=AzureAD");
      expect(result).toEqual([{ id: 1, name: "Org" }]);
    });

    it("makes a get request with the given provider", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [] } });
      const { GetSsoOrgs } = await import("../ssoConfig.repository");

      await GetSsoOrgs("Okta");

      expect(apiServices.get).toHaveBeenCalledWith("ssoConfig/orgs?provider=Okta");
    });
  });
});
