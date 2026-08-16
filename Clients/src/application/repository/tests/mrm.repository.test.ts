import {
  getFleetTiering,
  assignModelTier,
  getValidations,
  createValidation,
  updateValidation,
  signoffValidation,
  getFindings,
  createFinding,
  updateFinding,
  getModelRoles,
  setModelRoles,
  getModelMonitoring,
  getMetricTrend,
  getModelBreaches,
  getIngestionTokens,
  createIngestionToken,
  rotateIngestionToken,
  revokeIngestionToken,
  getThresholds,
  createThreshold,
  updateThreshold,
  deleteThreshold,
  getMetricKeys,
  createMetricKey,
  getRevalidationEvents,
  getAttestationSummary,
  downloadAttestationReport,
  getMrmSettings,
  updateMrmSettings,
} from "../mrm.repository";
import { apiServices } from "../../../infrastructure/api/networkServices";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mrm.repository", () => {
  describe("getFleetTiering", () => {
    it("makes a get request and returns the fleet rows", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [{ id: 1 }] } });

      const result = await getFleetTiering();

      expect(apiServices.get).toHaveBeenCalledWith("/mrm/tiering", { signal: undefined });
      expect(result).toEqual([{ id: 1 }]);
    });

    it("returns an empty array when data is absent", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: {} });

      const result = await getFleetTiering();

      expect(result).toEqual([]);
    });
  });

  describe("assignModelTier", () => {
    it("makes a put request scoped to the model id", async () => {
      const payload = { tier: "tier_1" } as any;
      vi.mocked(apiServices.put).mockResolvedValue({ data: { data: { id: 1, ...payload } } });

      const result = await assignModelTier(1, payload);

      expect(apiServices.put).toHaveBeenCalledWith("/mrm/models/1/tier", payload);
      expect(result).toEqual({ id: 1, ...payload });
    });
  });

  describe("getValidations", () => {
    it("builds a query string when modelId is given", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [] } });

      await getValidations(5);

      expect(apiServices.get).toHaveBeenCalledWith("/mrm/validations?modelId=5", {
        signal: undefined,
      });
    });

    it("makes a get request without a query string when modelId is not given", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [] } });

      await getValidations();

      expect(apiServices.get).toHaveBeenCalledWith("/mrm/validations", { signal: undefined });
    });
  });

  describe("createValidation", () => {
    it("makes a post request scoped to the model id", async () => {
      const payload = { validation_type: "initial" } as any;
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: { id: 1, ...payload } } });

      await createValidation(5, payload);

      expect(apiServices.post).toHaveBeenCalledWith("/mrm/models/5/validations", payload);
    });
  });

  describe("updateValidation", () => {
    it("makes a patch request scoped to the validation id", async () => {
      const payload = { status: "completed" } as any;
      vi.mocked(apiServices.patch).mockResolvedValue({ data: { data: { id: 1, ...payload } } });

      await updateValidation(1, payload);

      expect(apiServices.patch).toHaveBeenCalledWith("/mrm/validations/1", payload);
    });
  });

  describe("signoffValidation", () => {
    it("makes a post request scoped to the validation id", async () => {
      const payload = { signed_off_by: 1 } as any;
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: { id: 1, ...payload } } });

      await signoffValidation(1, payload);

      expect(apiServices.post).toHaveBeenCalledWith("/mrm/validations/1/signoff", payload);
    });
  });

  describe("getFindings", () => {
    it("builds a query string from provided filters", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [] } });

      await getFindings({ modelId: 1, validationId: 2 });

      expect(apiServices.get).toHaveBeenCalledWith("/mrm/findings?modelId=1&validationId=2", {
        signal: undefined,
      });
    });

    it("makes a get request without a query string when no filters are given", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [] } });

      await getFindings();

      expect(apiServices.get).toHaveBeenCalledWith("/mrm/findings", { signal: undefined });
    });
  });

  describe("createFinding", () => {
    it("makes a post request scoped to the validation id", async () => {
      const payload = { severity: "high" } as any;
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: { id: 1, ...payload } } });

      await createFinding(1, payload);

      expect(apiServices.post).toHaveBeenCalledWith("/mrm/validations/1/findings", payload);
    });
  });

  describe("updateFinding", () => {
    it("makes a patch request scoped to the finding id", async () => {
      const payload = { status: "resolved" } as any;
      vi.mocked(apiServices.patch).mockResolvedValue({ data: { data: { id: 1, ...payload } } });

      await updateFinding(1, payload);

      expect(apiServices.patch).toHaveBeenCalledWith("/mrm/findings/1", payload);
    });
  });

  describe("getModelRoles", () => {
    it("makes a get request scoped to the model id", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [{ id: 1 }] } });

      const result = await getModelRoles(1);

      expect(apiServices.get).toHaveBeenCalledWith("/mrm/models/1/roles", { signal: undefined });
      expect(result).toEqual([{ id: 1 }]);
    });
  });

  describe("setModelRoles", () => {
    it("makes a put request with the assignments payload", async () => {
      const assignments = [{ user_id: 1, role: "owner" }] as any;
      vi.mocked(apiServices.put).mockResolvedValue({ data: { data: assignments } });

      await setModelRoles(1, assignments);

      expect(apiServices.put).toHaveBeenCalledWith("/mrm/models/1/roles", { assignments });
    });
  });

  describe("getModelMonitoring", () => {
    it("makes a get request scoped to the model id", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [] } });

      await getModelMonitoring(1);

      expect(apiServices.get).toHaveBeenCalledWith("/mrm/models/1/monitoring", {
        signal: undefined,
      });
    });
  });

  describe("getMetricTrend", () => {
    it("makes a get request with the encoded metric name", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [] } });

      await getMetricTrend(1, "accuracy score");

      expect(apiServices.get).toHaveBeenCalledWith(
        "/mrm/models/1/monitoring/trend?metric=accuracy%20score",
        { signal: undefined },
      );
    });
  });

  describe("getModelBreaches", () => {
    it("makes a get request scoped to the model id", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [] } });

      await getModelBreaches(1);

      expect(apiServices.get).toHaveBeenCalledWith("/mrm/models/1/monitoring/breaches", {
        signal: undefined,
      });
    });
  });

  describe("getIngestionTokens", () => {
    it("makes a get request for ingestion tokens", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [] } });

      await getIngestionTokens();

      expect(apiServices.get).toHaveBeenCalledWith("/mrm/ingestion-tokens", { signal: undefined });
    });
  });

  describe("createIngestionToken", () => {
    it("makes a post request with the token payload", async () => {
      const payload = { model_id: 1 } as any;
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: { token: "abc" } } });

      await createIngestionToken(payload);

      expect(apiServices.post).toHaveBeenCalledWith("/mrm/ingestion-tokens", payload);
    });
  });

  describe("rotateIngestionToken", () => {
    it("makes a post request scoped to the token id", async () => {
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: { token: "new" } } });

      await rotateIngestionToken(1);

      expect(apiServices.post).toHaveBeenCalledWith("/mrm/ingestion-tokens/1/rotate", {});
    });
  });

  describe("revokeIngestionToken", () => {
    it("makes a post request scoped to the token id", async () => {
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: { id: 1, revoked: true } } });

      await revokeIngestionToken(1);

      expect(apiServices.post).toHaveBeenCalledWith("/mrm/ingestion-tokens/1/revoke", {});
    });
  });

  describe("getThresholds", () => {
    it("builds a query string from provided filters", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [] } });

      await getThresholds({ modelId: 1, metric: "accuracy" });

      expect(apiServices.get).toHaveBeenCalledWith("/mrm/thresholds?modelId=1&metric=accuracy", {
        signal: undefined,
      });
    });
  });

  describe("createThreshold", () => {
    it("makes a post request scoped to the model id", async () => {
      const payload = { metric: "accuracy", min: 0.8 } as any;
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: { id: 1, ...payload } } });

      await createThreshold(1, payload);

      expect(apiServices.post).toHaveBeenCalledWith("/mrm/models/1/thresholds", payload);
    });
  });

  describe("updateThreshold", () => {
    it("makes a patch request scoped to the threshold id", async () => {
      const payload = { min: 0.9 } as any;
      vi.mocked(apiServices.patch).mockResolvedValue({ data: { data: { id: 1, ...payload } } });

      await updateThreshold(1, payload);

      expect(apiServices.patch).toHaveBeenCalledWith("/mrm/thresholds/1", payload);
    });
  });

  describe("deleteThreshold", () => {
    it("makes a delete request scoped to the threshold id", async () => {
      vi.mocked(apiServices.delete).mockResolvedValue({ data: undefined });

      await deleteThreshold(1);

      expect(apiServices.delete).toHaveBeenCalledWith("/mrm/thresholds/1");
    });
  });

  describe("getMetricKeys", () => {
    it("makes a get request for metric keys", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [] } });

      await getMetricKeys();

      expect(apiServices.get).toHaveBeenCalledWith("/mrm/metric-keys", { signal: undefined });
    });
  });

  describe("createMetricKey", () => {
    it("makes a post request with the metric key payload", async () => {
      const payload = { key: "accuracy" } as any;
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: { id: 1, ...payload } } });

      await createMetricKey(payload);

      expect(apiServices.post).toHaveBeenCalledWith("/mrm/metric-keys", payload);
    });
  });

  describe("getRevalidationEvents", () => {
    it("makes a get request scoped to the model id", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [] } });

      await getRevalidationEvents(1);

      expect(apiServices.get).toHaveBeenCalledWith("/mrm/models/1/revalidation-events", {
        signal: undefined,
      });
    });
  });

  describe("getAttestationSummary", () => {
    it("makes a get request for the attestation summary", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: { totalModels: 10 } } });

      const result = await getAttestationSummary();

      expect(apiServices.get).toHaveBeenCalledWith("/mrm/attestation/summary", {
        signal: undefined,
      });
      expect(result).toEqual({ totalModels: 10 });
    });
  });

  describe("downloadAttestationReport", () => {
    it("triggers a browser download when the response is a non-empty blob", async () => {
      const blob = new Blob(["docx-content"]);
      vi.mocked(apiServices.get).mockResolvedValue({
        data: blob,
        headers: { "content-disposition": 'attachment; filename="report.docx"' },
      });

      const createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
      const revokeObjectURL = vi.fn();
      window.URL.createObjectURL = createObjectURL;
      window.URL.revokeObjectURL = revokeObjectURL;
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      await downloadAttestationReport();

      expect(apiServices.get).toHaveBeenCalledWith("/mrm/attestation/report", {
        responseType: "blob",
      });
      expect(createObjectURL).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();

      clickSpy.mockRestore();
    });

    it("throws when the response is not a Blob", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { error: "failed" }, headers: {} });

      await expect(downloadAttestationReport()).rejects.toThrow(
        "Attestation report generation failed on the server.",
      );
    });

    it("throws when the response blob is empty", async () => {
      const emptyBlob = new Blob([]);
      vi.mocked(apiServices.get).mockResolvedValue({ data: emptyBlob, headers: {} });

      await expect(downloadAttestationReport()).rejects.toThrow(
        "Attestation report generation failed on the server.",
      );
    });
  });

  describe("getMrmSettings", () => {
    it("makes a get request for mrm settings", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: { retentionDays: 90 } } });

      const result = await getMrmSettings();

      expect(apiServices.get).toHaveBeenCalledWith("/mrm/settings", { signal: undefined });
      expect(result).toEqual({ retentionDays: 90 });
    });
  });

  describe("updateMrmSettings", () => {
    it("makes a put request with the settings update", async () => {
      const update = { retentionDays: 120 } as any;
      vi.mocked(apiServices.put).mockResolvedValue({ data: { data: update } });

      const result = await updateMrmSettings(update);

      expect(apiServices.put).toHaveBeenCalledWith("/mrm/settings", update);
      expect(result).toEqual(update);
    });
  });
});
