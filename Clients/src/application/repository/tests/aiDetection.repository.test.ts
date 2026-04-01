import type { RiskScoringConfig } from "../../../domain/ai-detection/riskScoringTypes";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  cancelScan,
  deleteScan,
  exportAIBOM,
  getActiveScan,
  getAIDetectionStats,
  getComplianceMapping,
  getDependencyGraph,
  getGovernanceSummary,
  getRiskScore,
  getRiskScoringConfig,
  getScan,
  getScanFindings,
  getScans,
  getScanSecurityFindings,
  getScanSecuritySummary,
  getScanStatus,
  pollScanStatus,
  recalculateRiskScore,
  startScan,
  updateFindingGovernanceStatus,
  updateRiskScoringConfig,
} from "../aiDetection.repository";

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

describe("Test AI Detection Repository", () => {
  describe("startScan", () => {
    it("should make a post request to start an AI detection scan with the correct parameters", async () => {
      const mockResponse = {
        data: {
          data: { scanId: "scan_12345" },
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const scanId = "scan_12345";

      const response = await startScan(scanId);

      expect(apiServices.post).toHaveBeenCalledWith(
        "/ai-detection/scans",
        {
          repository_url: "scan_12345",
        },
        {
          signal: undefined,
        },
      );
      expect(response).toEqual(mockResponse.data.data);
    });
    it("should add the signal parameter if provided", async () => {
      const mockResponse = {
        data: {
          data: { scanId: "scan_12345" },
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const scanId = "scan_12345";
      const signal: AbortSignal = new AbortController().signal;

      const response = await startScan(scanId, signal);

      expect(apiServices.post).toHaveBeenCalledWith(
        "/ai-detection/scans",
        {
          repository_url: "scan_12345",
        },
        {
          signal,
        },
      );
      expect(response).toEqual(mockResponse.data.data);
    });
  });
  describe("getScanStatus", () => {
    it("should make a get request to retrieve the status of an AI detection scan with the correct parameters", async () => {
      const mockResponse = {
        data: { data: { status: "in_progress" } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);
      const scanId = 12345;
      const signal: AbortSignal = new AbortController().signal;

      const response = await getScanStatus(scanId, signal);

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/scans/12345/status",
        { signal },
      );
      expect(response).toEqual(mockResponse.data.data);
    });
  });
  describe("getScan", () => {
    it("should make a get request to retrieve the results of an AI detection scan with the correct parameters", async () => {
      const mockResponse = {
        data: { data: { scanId: "scan_12345", results: [] } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);
      const scanId = 12345;
      const signal: AbortSignal = new AbortController().signal;

      const response = await getScan(scanId, signal);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/scans/12345",
        { signal },
      );

      expect(response).toEqual(mockResponse.data.data);
    });
  });
  describe("getScanFindings", () => {
    it("should make a get request to retrieve the findings of an AI detection scan with the correct parameters", async () => {
      const mockResponse = {
        data: { data: { findings: [] } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);
      const scanId = 12345;
      const page = 1;
      const limit = 10;
      const confidence = "high";
      const finding_type = "library";
      const signal: AbortSignal = new AbortController().signal;

      const response = await getScanFindings(
        scanId,
        {
          page,
          limit,
          confidence,
          finding_type,
        },
        signal,
      );

      expect(apiServices.get).toHaveBeenCalledWith(
        `/ai-detection/scans/12345/findings?page=1&limit=10&confidence=high&finding_type=library`,
        {
          signal,
        },
      );

      expect(response).toEqual(mockResponse.data.data);
    });
    it("should skip the page parameter if not provided", async () => {
      const mockResponse = {
        data: { data: { findings: [] } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);
      const scanId = 12345;
      const limit = 10;
      const confidence = "high";
      const finding_type = "library";
      const signal: AbortSignal = new AbortController().signal;

      await getScanFindings(
        scanId,
        {
          limit,
          confidence,
          finding_type,
        },
        signal,
      );

      expect(apiServices.get).toHaveBeenCalledWith(
        `/ai-detection/scans/12345/findings?limit=10&confidence=high&finding_type=library`,
        {
          signal,
        },
      );
    });
    it("should skip the limit parameter if not provided", async () => {
      const mockResponse = {
        data: { data: { findings: [] } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);
      const scanId = 12345;
      const page = 1;
      const confidence = "high";
      const finding_type = "library";
      const signal: AbortSignal = new AbortController().signal;

      await getScanFindings(
        scanId,
        {
          page,
          confidence,
          finding_type,
        },
        signal,
      );

      expect(apiServices.get).toHaveBeenCalledWith(
        `/ai-detection/scans/12345/findings?page=1&confidence=high&finding_type=library`,
        {
          signal,
        },
      );
    });
    it("should skip the confidence parameter if not provided", async () => {
      const mockResponse = {
        data: { data: { findings: [] } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);
      const scanId = 12345;
      const page = 1;
      const limit = 10;
      const finding_type = "library";
      const signal: AbortSignal = new AbortController().signal;

      await getScanFindings(
        scanId,
        {
          page,
          limit,
          finding_type,
        },
        signal,
      );

      expect(apiServices.get).toHaveBeenCalledWith(
        `/ai-detection/scans/12345/findings?page=1&limit=10&finding_type=library`,
        {
          signal,
        },
      );
    });
    it("should skip the finding_type parameter if not provided", async () => {
      const mockResponse = {
        data: { data: { findings: [] } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);
      const scanId = 12345;
      const page = 1;
      const limit = 10;
      const confidence = "high";
      const signal: AbortSignal = new AbortController().signal;

      await getScanFindings(
        scanId,
        {
          page,
          limit,
          confidence,
        },
        signal,
      );

      expect(apiServices.get).toHaveBeenCalledWith(
        `/ai-detection/scans/12345/findings?page=1&limit=10&confidence=high`,
        {
          signal,
        },
      );
    });
  });
  describe("getScanSecurityFindings", () => {
    it("should make a get request to retrieve the security findings of an AI detection scan with the correct parameters", async () => {
      const mockResponse = {
        data: { data: { findings: [] } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);
      const scanId = 12345;
      const page = 1;
      const limit = 10;
      const severity = "high";
      const signal: AbortSignal = new AbortController().signal;

      const response = await getScanSecurityFindings(
        scanId,
        {
          page,
          limit,
          severity,
        },
        signal,
      );

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/scans/12345/security-findings?page=1&limit=10&severity=high",
        {
          signal,
        },
      );

      expect(response).toEqual(mockResponse.data.data);
    });

    it("should skip the page parameter if not provided", async () => {
      const mockResponse = {
        data: { data: { findings: [] } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);
      const scanId = 12345;
      const limit = 10;
      const severity = "high";
      const signal: AbortSignal = new AbortController().signal;

      await getScanSecurityFindings(
        scanId,
        {
          limit,
          severity,
        },
        signal,
      );

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/scans/12345/security-findings?limit=10&severity=high",
        {
          signal,
        },
      );
    });

    it("should skip the limit parameter if not provided", async () => {
      const mockResponse = {
        data: { data: { findings: [] } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);
      const scanId = 12345;
      const page = 1;
      const severity = "high";
      const signal: AbortSignal = new AbortController().signal;

      await getScanSecurityFindings(
        scanId,
        {
          page,
          severity,
        },
        signal,
      );

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/scans/12345/security-findings?page=1&severity=high",
        {
          signal,
        },
      );
    });

    it("should skip the severity parameter if not provided", async () => {
      const mockResponse = {
        data: { data: { findings: [] } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);
      const scanId = 12345;
      const page = 1;
      const limit = 10;
      const signal: AbortSignal = new AbortController().signal;

      await getScanSecurityFindings(
        scanId,
        {
          page,
          limit,
        },
        signal,
      );

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/scans/12345/security-findings?page=1&limit=10",
        {
          signal,
        },
      );
    });

    it("should throw when api request fails", async () => {
      const scanId = 12345;
      const signal: AbortSignal = new AbortController().signal;

      vi.mocked(apiServices.get).mockRejectedValueOnce(new Error("API Error"));

      await expect(getScanSecurityFindings(scanId, {}, signal)).rejects.toThrow(
        "API Error",
      );
    });
  });
  describe("getScanSecuritySummary", () => {
    it("should make a get request to retrieve the security summary of an AI detection scan with the correct parameters", async () => {
      const mockResponse = {
        data: { data: { summary: {} } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);
      const scanId = 12345;
      const signal: AbortSignal = new AbortController().signal;

      const response = await getScanSecuritySummary(scanId, signal);

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/scans/12345/security-summary",
        { signal },
      );
      expect(response).toEqual(mockResponse.data.data);
    });
  });
  describe("getScans", () => {
    it("should make a get request to retrieve the list of AI detection scans for a given project with the correct parameters", async () => {
      const mockResponse = {
        data: { data: { scans: [] } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);
      const page = 1;
      const limit = 10;
      const status = "pending";
      const signal: AbortSignal = new AbortController().signal;

      const response = await getScans(
        {
          page,
          limit,
          status,
        },
        signal,
      );

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/scans?page=1&limit=10&status=pending",
        { signal },
      );
      expect(response).toEqual(mockResponse.data.data);
    });
    it("should skip the page parameter if not provided", async () => {
      const mockResponse = {
        data: { data: { scans: [] } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);
      const limit = 10;
      const status = "pending";
      const signal: AbortSignal = new AbortController().signal;

      await getScans(
        {
          limit,
          status,
        },
        signal,
      );

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/scans?limit=10&status=pending",
        { signal },
      );
    });
    it("should skip the limit parameter if not provided", async () => {
      const mockResponse = {
        data: { data: { scans: [] } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);
      const page = 1;
      const status = "pending";
      const signal: AbortSignal = new AbortController().signal;

      await getScans(
        {
          page,
          status,
        },
        signal,
      );

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/scans?page=1&status=pending",
        { signal },
      );
    });
    it("should skip the status parameter if not provided", async () => {
      const mockResponse = {
        data: { data: { scans: [] } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);
      const page = 1;
      const limit = 10;
      const signal: AbortSignal = new AbortController().signal;

      await getScans(
        {
          page,
          limit,
        },
        signal,
      );

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/scans?page=1&limit=10",
        { signal },
      );
    });
  });
  describe("cancelScan", () => {
    it("should make a post request to cancel an AI detection scan with the correct parameters", async () => {
      const mockResponse = {
        data: {
          data: {
            id: 12345,
            status: "cancelled",
            message: "Scan cancelled successfully",
          },
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);
      const scanId = 12345;

      const response = await cancelScan(scanId);

      expect(apiServices.post).toHaveBeenCalledWith(
        `/ai-detection/scans/12345/cancel`,
        {},
        {
          signal: undefined,
        },
      );
      expect(response).toEqual(mockResponse.data.data);
    });
  });
  describe("deleteScan", () => {
    it("should make a delete request to delete an AI detection scan with the correct parameters", async () => {
      const mockResponse = {
        data: { data: { message: "Scan deleted successfully" } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);
      const scanId = 12345;
      const response = await deleteScan(scanId);

      expect(apiServices.delete).toHaveBeenCalledWith(
        `/ai-detection/scans/12345`,
        {
          signal: undefined,
        },
      );
      expect(response).toEqual(mockResponse.data.data);
    });
  });
  describe("getActiveScan", () => {
    it("should make a get request to retrieve the active AI detection scan for a given project", async () => {
      const activeScan = { id: 12345, status: "in_progress" };
      const mockResponse = {
        data: {
          data: activeScan,
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);
      const signal: AbortSignal = new AbortController().signal;

      const response = await getActiveScan(signal);

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/scans/active",
        {
          signal,
        },
      );
      expect(response).toEqual(activeScan);
    });
    it("should null if api throws an error", async () => {
      vi.mocked(apiServices.get).mockRejectedValue("API Error");
      const signal: AbortSignal = new AbortController().signal;

      const response = await getActiveScan(signal);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/scans/active",
        {
          signal,
        },
      );
      expect(response).toBeNull();
    });
  });
  describe("pollScanStatus", () => {
    it("if signal is aborted, should throw an AbortError", async () => {
      const scanId = 12345;
      const abortController = new AbortController();
      const signal = abortController.signal;

      abortController.abort();

      await expect(
        pollScanStatus(scanId, undefined, undefined, signal),
      ).rejects.toThrow("Polling aborted");
    });
    it("should add a listener to the signal to stop polling when the signal is aborted", async () => {
      const scanId = 12345;
      const abortController = new AbortController();
      const signal = abortController.signal;

      const mockResponse = {
        data: { data: { status: "in_progress" } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const pollingPromise = pollScanStatus(
        scanId,
        undefined,
        undefined,
        signal,
      );

      abortController.abort();

      await expect(pollingPromise).rejects.toThrow("Polling aborted");
    });
    it("should call the callback function with the current scan status on each poll", async () => {
      const scanId = 12345;
      const callback = vi.fn();
      const statusObject = {
        id: scanId,
        status: "completed",
        progress: 100,
        current_file: "file1.js",
        files_scanned: 10,
        total_files: 10,
        findings_count: 3,
        error_message: null,
      };

      const mockResponse1 = {
        data: {
          data: statusObject,
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValueOnce(mockResponse1);

      const finalStatus = await pollScanStatus(scanId, callback);

      expect(callback).toHaveBeenCalledWith(statusObject);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(finalStatus).toEqual(statusObject);
    });
    it("should poll the scan status until it reaches a terminal state", async () => {
      const scanId = 12345;
      const callback = vi.fn();
      const abortController = new AbortController();
      const signal = abortController.signal;
      const statusObject = {
        id: scanId,
        status: "in_progress",
        progress: 50,
        current_file: "file1.js",
        files_scanned: 5,
        total_files: 10,
        findings_count: 3,
        error_message: null,
      };

      const mockResponse1 = {
        data: {
          data: statusObject,
        },
        status: 200,
        statusText: "OK",
      };
      const mockResponse2 = {
        data: {
          data: {
            ...statusObject,
            status: "completed",
            progress: 100,
          },
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get)
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      await pollScanStatus(scanId, callback, undefined, signal);

      expect(callback).toHaveBeenCalledWith(statusObject);
      expect(callback).toHaveBeenCalledWith({
        ...statusObject,
        status: "completed",
        progress: 100,
      });
      expect(callback).toHaveBeenCalledTimes(2);
    });
    it("should return the final scan status when a terminal state is reached", async () => {
      const scanId = 12345;
      const finalStatus = {
        id: scanId,
        status: "completed",
        progress: 100,
        current_file: "",
        files_scanned: 10,
        total_files: 10,
        findings_count: 3,
        error_message: null,
      };

      vi.mocked(apiServices.get).mockResolvedValueOnce({
        data: { data: finalStatus },
        status: 200,
        statusText: "OK",
      });

      const result = await pollScanStatus(scanId);

      expect(result).toEqual(finalStatus);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/scans/12345/status",
        { signal: undefined },
      );
    });

    it("should handle errors during polling appropriately", async () => {
      const scanId = 12345;

      vi.mocked(apiServices.get).mockRejectedValueOnce(new Error("API Error"));

      await expect(pollScanStatus(scanId)).rejects.toThrow("API Error");
      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/scans/12345/status",
        { signal: undefined },
      );
    });

    it("should return early on the next poll tick when signal is already aborted", async () => {
      vi.useFakeTimers();
      try {
        const scanId = 12345;
        const abortController = new AbortController();
        const signal = abortController.signal;

        const mockInProgressResponse = {
          data: {
            data: {
              id: scanId,
              status: "in_progress",
              progress: 50,
              current_file: "file1.js",
              files_scanned: 5,
              total_files: 10,
              findings_count: 3,
              error_message: null,
            },
          },
          status: 200,
          statusText: "OK",
        };

        vi.mocked(apiServices.get).mockResolvedValueOnce(
          mockInProgressResponse,
        );

        const pollingPromise = pollScanStatus(scanId, undefined, 1000, signal);
        const rejectionAssertion =
          expect(pollingPromise).rejects.toThrow("Polling aborted");

        await Promise.resolve();
        await Promise.resolve();
        abortController.abort();
        await vi.advanceTimersByTimeAsync(1000);

        await rejectionAssertion;
        expect(apiServices.get).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
    it("should return early when signal is aborted during poll execution (line 340-342 check)", async () => {
      vi.useFakeTimers();
      try {
        const scanId = 12345;
        const abortController = new AbortController();
        const signal = abortController.signal;

        const mockResponse = {
          data: {
            data: {
              id: scanId,
              status: "in_progress",
              progress: 50,
              current_file: "file1.js",
              files_scanned: 5,
              total_files: 10,
              findings_count: 3,
              error_message: null,
            },
          },
          status: 200,
          statusText: "OK",
        };

        vi.mocked(apiServices.get).mockResolvedValueOnce(mockResponse);

        const pollingPromise = pollScanStatus(scanId, undefined, 10000, signal);

        await Promise.resolve();
        abortController.abort();

        await expect(pollingPromise).rejects.toThrow("Polling aborted");
        expect(apiServices.get).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });
  describe("updateFindingGovernanceStatus", () => {
    it("should make a patch request to update the governance status of a scan finding with the correct parameters", async () => {
      const scanId = 12345;
      const findingId = 678;
      const governanceStatus = "approved";
      const mockData = {
        id: findingId,
        scan_id: scanId,
        governance_status: governanceStatus,
      };
      const mockResponse = {
        data: { data: mockData },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      await updateFindingGovernanceStatus(scanId, findingId, governanceStatus);

      expect(apiServices.patch).toHaveBeenCalledWith(
        "/ai-detection/scans/12345/findings/678/governance",
        { governance_status: "approved" },
        { signal: undefined },
      );
    });

    it("should return the correct updated finding data", async () => {
      const scanId = 12345;
      const findingId = 678;
      const governanceStatus = "flagged";
      const mockData = {
        id: findingId,
        scan_id: scanId,
        governance_status: governanceStatus,
      };
      const mockResponse = {
        data: { data: mockData },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const response = await updateFindingGovernanceStatus(
        scanId,
        findingId,
        governanceStatus,
      );

      expect(response).toEqual(mockData);
    });
  });
  describe("getGovernanceSummary", () => {
    it("should make a get request to retrieve the governance summary for a given scan", async () => {
      const scanId = 12345;
      const mockResponse = {
        data: { data: { total_findings: 10, approved: 4, flagged: 2 } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getGovernanceSummary(scanId);

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/scans/12345/governance-summary",
        { signal: undefined },
      );
    });

    it("should return the correct governance summary data", async () => {
      const scanId = 12345;
      const summary = { total_findings: 10, approved: 4, flagged: 2 };
      const mockResponse = {
        data: { data: summary },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getGovernanceSummary(scanId);

      expect(response).toEqual(summary);
    });
  });
  describe("getAIDetectionStats", () => {
    it("should make a get request to retrieve AI detection statistics for a given project", async () => {
      const mockResponse = {
        data: { data: { total_scans: 20 } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getAIDetectionStats();

      expect(apiServices.get).toHaveBeenCalledWith("/ai-detection/stats", {
        signal: undefined,
      });
    });

    it("should return the correct AI detection statistics data", async () => {
      const stats = { total_scans: 20, completed_scans: 15 };
      const mockResponse = {
        data: { data: stats },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getAIDetectionStats();

      expect(response).toEqual(stats);
    });
  });
  describe("exportAIBOM", () => {
    it("should make a get request to export the AI BOM for a given scan", async () => {
      const scanId = 12345;
      const mockResponse = {
        data: { data: { bom_version: "1.0" } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await exportAIBOM(scanId);

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/scans/12345/export/ai-bom",
        { signal: undefined },
      );
    });

    it("should return the correct export data", async () => {
      const scanId = 12345;
      const exportData = { bom_version: "1.0", components: [] };
      const mockResponse = {
        data: { data: exportData },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await exportAIBOM(scanId);

      expect(response).toEqual(exportData);
    });
  });
  describe("getDependencyGraph", () => {
    it("should make a get request to retrieve the dependency graph for a given scan", async () => {
      const scanId = 12345;
      const mockResponse = {
        data: { data: { nodes: [], edges: [] } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getDependencyGraph(scanId);

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/scans/12345/dependency-graph",
        { signal: undefined },
      );
    });

    it("should return the correct dependency graph data", async () => {
      const scanId = 12345;
      const graph = { nodes: [{ id: "pkg-a" }], edges: [] };
      const mockResponse = {
        data: { data: graph },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getDependencyGraph(scanId);

      expect(response).toEqual(graph);
    });
  });
  describe("getComplianceMapping", () => {
    it("should make a get request to retrieve the compliance mapping for a given scan", async () => {
      const scanId = 12345;
      const mockResponse = {
        data: { data: { summary: { total_findings: 5 } } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getComplianceMapping(scanId);

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/scans/12345/compliance",
        { signal: undefined },
      );
    });

    it("should return the correct compliance mapping data", async () => {
      const scanId = 12345;
      const compliance = { summary: { total_findings: 5 }, checklist: [] };
      const mockResponse = {
        data: { data: compliance },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getComplianceMapping(scanId);

      expect(response).toEqual(compliance);
    });
  });
  describe("getRiskScore", () => {
    it("should make a get request to retrieve risk score for a given scan", async () => {
      const scanId = 12345;
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        data: { data: { score: 72.4 } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getRiskScore(scanId, signal);

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/scans/12345/risk-score",
        { signal },
      );
      expect(response).toEqual(mockResponse.data.data);
    });
  });

  describe("recalculateRiskScore", () => {
    it("should make a post request to recalculate risk score for a given scan", async () => {
      const scanId = 12345;
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        data: { data: { score: 74.1 } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await recalculateRiskScore(scanId, signal);

      expect(apiServices.post).toHaveBeenCalledWith(
        "/ai-detection/scans/12345/risk-score/recalculate",
        {},
        { signal },
      );
      expect(response).toEqual(mockResponse.data.data);
    });
  });

  describe("getRiskScoringConfig", () => {
    it("should make a get request to retrieve risk scoring configuration", async () => {
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        data: {
          data: {
            llm_enabled: true,
            llm_key_id: 1,
            dimension_weights: {
              data_sovereignty: 0.25,
              transparency: 0.2,
              security: 0.2,
              autonomy: 0.15,
              supply_chain: 0.2,
            },
          },
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getRiskScoringConfig(signal);

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-detection/risk-scoring/config",
        { signal },
      );
      expect(response).toEqual(mockResponse.data.data);
    });
  });

  describe("updateRiskScoringConfig", () => {
    it("should make a patch request to update risk scoring configuration", async () => {
      const signal: AbortSignal = new AbortController().signal;
      const config: Partial<
        Pick<
          RiskScoringConfig,
          "llm_enabled" | "llm_key_id" | "dimension_weights"
        >
      > = {
        llm_enabled: true,
        llm_key_id: 7,
        dimension_weights: {
          data_sovereignty: 0.2,
          transparency: 0.2,
          security: 0.2,
          autonomy: 0.2,
          supply_chain: 0.2,
        },
      };
      const mockResponse = {
        data: { data: config },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const response = await updateRiskScoringConfig(config, signal);

      expect(apiServices.patch).toHaveBeenCalledWith(
        "/ai-detection/risk-scoring/config",
        config,
        { signal },
      );
      expect(response).toEqual(config);
    });

    it("should throw when api request fails", async () => {
      const signal: AbortSignal = new AbortController().signal;
      const config: Partial<
        Pick<
          RiskScoringConfig,
          "llm_enabled" | "llm_key_id" | "dimension_weights"
        >
      > = {
        llm_enabled: false,
      };

      vi.mocked(apiServices.patch).mockRejectedValueOnce(
        new Error("API Error"),
      );

      await expect(updateRiskScoringConfig(config, signal)).rejects.toThrow(
        "API Error",
      );
    });
  });
});
