/**
 * @fileoverview GitHub Status Reporter Tests
 *
 * Tests for posting scan results to GitHub commit status and PR comments.
 *
 * @module tests/githubStatusReporter
 */

jest.mock("../../../utils/githubToken.utils", () => ({
  getDecryptedGitHubToken: jest.fn(),
}));

jest.mock("../../../utils/aiDetectionRepository.utils", () => ({
  getRepositoryByIdQuery: jest.fn(),
}));

jest.mock("../../../utils/aiDetection.utils", () => ({
  getFindingsSummaryQuery: jest.fn(),
  countCriticalFindingsQuery: jest.fn(),
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  __esModule: true,
}));

import https from "https";
import { evaluateThresholds, reportScanToGitHub } from "../githubStatusReporter";
import { getDecryptedGitHubToken } from "../../../utils/githubToken.utils";
import { getRepositoryByIdQuery } from "../../../utils/aiDetectionRepository.utils";
import {
  countCriticalFindingsQuery,
  getFindingsSummaryQuery,
} from "../../../utils/aiDetection.utils";

const mockGetToken = getDecryptedGitHubToken as jest.MockedFunction<typeof getDecryptedGitHubToken>;
const mockGetRepo = getRepositoryByIdQuery as jest.MockedFunction<typeof getRepositoryByIdQuery>;
const mockGetSummary = getFindingsSummaryQuery as jest.MockedFunction<
  typeof getFindingsSummaryQuery
>;
const mockCountCritical = countCriticalFindingsQuery as jest.MockedFunction<
  typeof countCriticalFindingsQuery
>;

describe("githubStatusReporter", () => {
  let requestMock: any;
  let responseMock: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCountCritical.mockResolvedValue(0);

    responseMock = {
      on: jest.fn().mockImplementation((event: string, handler: any) => {
        if (event === "data") {
          setTimeout(() => handler('{"id":1}'), 0);
        }
        if (event === "end") {
          setTimeout(() => handler(), 10);
        }
      }),
      statusCode: 201,
    };

    requestMock = {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    };

    jest.spyOn(https, "request").mockImplementation((_options: any, callback: any) => {
      if (callback) setTimeout(() => callback(responseMock), 0);
      return requestMock as any;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("reportScanToGitHub", () => {
    it("should skip non-webhook scans", async () => {
      await reportScanToGitHub({ trigger_type: "manual" } as any, 1);
      expect(mockGetToken).not.toHaveBeenCalled();
    });

    it("should skip when commit_sha is missing", async () => {
      await reportScanToGitHub({ trigger_type: "webhook", repository_id: 1 } as any, 1);
      expect(mockGetToken).not.toHaveBeenCalled();
    });

    it("should skip when repository_id is missing", async () => {
      await reportScanToGitHub({ trigger_type: "webhook", commit_sha: "abc" } as any, 1);
      expect(mockGetToken).not.toHaveBeenCalled();
    });

    it("should skip when repository not found", async () => {
      mockGetRepo.mockResolvedValue(null);
      await reportScanToGitHub(
        { trigger_type: "webhook", commit_sha: "abc", repository_id: 1 } as any,
        1,
      );
      expect(mockGetToken).not.toHaveBeenCalled();
    });

    it("should skip when no GitHub token exists", async () => {
      mockGetRepo.mockResolvedValue({ id: 1 } as any);
      mockGetToken.mockResolvedValue(null);
      await reportScanToGitHub(
        { trigger_type: "webhook", commit_sha: "abc", repository_id: 1 } as any,
        1,
      );
      expect(https.request).not.toHaveBeenCalled();
    });

    it("should post success status when thresholds pass", async () => {
      mockGetRepo.mockResolvedValue({
        id: 1,
        ci_status_checks: true,
        ci_post_comments: false,
        ci_min_score: 80,
        ci_max_critical: 5,
      } as any);
      mockGetToken.mockResolvedValue("ghp_token");

      await reportScanToGitHub(
        {
          id: 1,
          trigger_type: "webhook",
          commit_sha: "abc123",
          repository_id: 1,
          repository_owner: "owner",
          repository_name: "repo",
          status: "completed",
          risk_score: 90,
          findings_count: 2,
        } as any,
        1,
      );

      expect(https.request).toHaveBeenCalled();
      const options = (https.request as jest.MockedFunction<typeof https.request>).mock.calls[0][0];
      expect(options.path).toContain("/statuses/abc123");
      const postData = JSON.parse(requestMock.write.mock.calls[0][0]);
      expect(postData.state).toBe("success");
      expect(mockCountCritical).toHaveBeenCalledWith(1, 1);
    });

    it("should post failure status when the governance score is below the minimum", async () => {
      mockGetRepo.mockResolvedValue({
        id: 1,
        ci_status_checks: true,
        ci_post_comments: false,
        ci_min_score: 80,
        ci_max_critical: 5,
      } as any);
      mockGetToken.mockResolvedValue("ghp_token");

      await reportScanToGitHub(
        {
          id: 1,
          trigger_type: "webhook",
          commit_sha: "abc123",
          repository_id: 1,
          repository_owner: "owner",
          repository_name: "repo",
          status: "completed",
          risk_score: "62.00",
          findings_count: 2,
        } as any,
        1,
      );

      const postData = JSON.parse(requestMock.write.mock.calls[0][0]);
      expect(postData.state).toBe("failure");
      expect(postData.description).toBe("Governance score 62 is below the minimum of 80");
    });

    it("should post error status when scan failed", async () => {
      mockGetRepo.mockResolvedValue({
        id: 1,
        ci_status_checks: true,
        ci_post_comments: false,
        ci_min_score: 80,
        ci_max_critical: 5,
      } as any);
      mockGetToken.mockResolvedValue("ghp_token");

      await reportScanToGitHub(
        {
          id: 1,
          trigger_type: "webhook",
          commit_sha: "abc123",
          repository_id: 1,
          repository_owner: "owner",
          repository_name: "repo",
          status: "failed",
          risk_score: 50,
          findings_count: 2,
        } as any,
        1,
      );

      const postData = JSON.parse(requestMock.write.mock.calls[0][0]);
      expect(postData.state).toBe("error");
    });

    it("should post PR comment when enabled and pr_number exists", async () => {
      mockGetRepo.mockResolvedValue({
        id: 1,
        ci_status_checks: false,
        ci_post_comments: true,
        ci_min_score: 80,
        ci_max_critical: 5,
      } as any);
      mockGetToken.mockResolvedValue("ghp_token");
      mockGetSummary.mockResolvedValue({
        by_finding_type: { secret: 2, vulnerability: 1 },
      } as any);

      await reportScanToGitHub(
        {
          id: 1,
          trigger_type: "webhook",
          commit_sha: "abc123",
          repository_id: 1,
          repository_owner: "owner",
          repository_name: "repo",
          pr_number: 42,
          status: "completed",
          risk_score: 50,
          findings_count: 2,
          files_scanned: 10,
          scan_mode: "full",
          duration_ms: 5000,
          risk_score_grade: "B",
        } as any,
        1,
      );

      const calls = (https.request as jest.MockedFunction<typeof https.request>).mock.calls;
      const prCall = calls.find((c) => (c[0] as any).path?.includes("/issues/42/comments"));
      expect(prCall).toBeDefined();
    });

    it("should not post PR comment when pr_number is missing", async () => {
      mockGetRepo.mockResolvedValue({
        id: 1,
        ci_status_checks: true,
        ci_post_comments: true,
        ci_min_score: 80,
        ci_max_critical: 5,
      } as any);
      mockGetToken.mockResolvedValue("ghp_token");

      await reportScanToGitHub(
        {
          id: 1,
          trigger_type: "webhook",
          commit_sha: "abc123",
          repository_id: 1,
          repository_owner: "owner",
          repository_name: "repo",
          status: "completed",
          risk_score: 50,
          findings_count: 2,
        } as any,
        1,
      );

      const calls = (https.request as jest.MockedFunction<typeof https.request>).mock.calls;
      const paths = calls.map((c) => (c[0] as any).path);
      expect(paths.some((p) => p?.includes("/issues/"))).toBe(false);
    });

    it("should handle GitHub API errors gracefully", async () => {
      responseMock.statusCode = 422;
      mockGetRepo.mockResolvedValue({
        id: 1,
        ci_status_checks: true,
        ci_post_comments: false,
        ci_min_score: 80,
        ci_max_critical: 5,
      } as any);
      mockGetToken.mockResolvedValue("ghp_token");

      await reportScanToGitHub(
        {
          id: 1,
          trigger_type: "webhook",
          commit_sha: "abc123",
          repository_id: 1,
          repository_owner: "owner",
          repository_name: "repo",
          status: "completed",
          risk_score: 50,
          findings_count: 2,
        } as any,
        1,
      );

      // Should not throw; error is logged
      expect(https.request).toHaveBeenCalled();
    });

    it("should handle getFindingsSummary error gracefully", async () => {
      mockGetRepo.mockResolvedValue({
        id: 1,
        ci_status_checks: false,
        ci_post_comments: true,
        ci_min_score: 80,
        ci_max_critical: 5,
      } as any);
      mockGetToken.mockResolvedValue("ghp_token");
      mockGetSummary.mockRejectedValue(new Error("DB error"));

      await reportScanToGitHub(
        {
          id: 1,
          trigger_type: "webhook",
          commit_sha: "abc123",
          repository_id: 1,
          repository_owner: "owner",
          repository_name: "repo",
          pr_number: 42,
          status: "completed",
          risk_score: 50,
          findings_count: 2,
        } as any,
        1,
      );

      const prCall = (https.request as jest.MockedFunction<typeof https.request>).mock.calls.find(
        (c) => (c[0] as any).path?.includes("/issues/42/comments"),
      );
      expect(prCall).toBeDefined();
    });
  });

  describe("reportScanToGitHub without a governance score", () => {
    it("should post error, not success, when the scan has no score", async () => {
      mockGetRepo.mockResolvedValue({
        id: 1,
        ci_status_checks: true,
        ci_post_comments: false,
        ci_min_score: 70,
        ci_max_critical: 0,
      } as any);
      mockGetToken.mockResolvedValue("ghp_token");

      await reportScanToGitHub(
        {
          id: 1,
          trigger_type: "webhook",
          commit_sha: "abc123",
          repository_id: 1,
          repository_owner: "owner",
          repository_name: "repo",
          status: "completed",
          risk_score: null,
          findings_count: 0,
        } as any,
        1,
      );

      const postData = JSON.parse(requestMock.write.mock.calls[0][0]);
      expect(postData.state).toBe("error");
    });

    it("should fail on critical findings even when the total findings count is low", async () => {
      mockGetRepo.mockResolvedValue({
        id: 1,
        ci_status_checks: true,
        ci_post_comments: false,
        ci_min_score: 70,
        ci_max_critical: 0,
      } as any);
      mockGetToken.mockResolvedValue("ghp_token");
      mockCountCritical.mockResolvedValue(1);

      await reportScanToGitHub(
        {
          id: 7,
          trigger_type: "webhook",
          commit_sha: "abc123",
          repository_id: 1,
          repository_owner: "owner",
          repository_name: "repo",
          status: "completed",
          risk_score: 95,
          findings_count: 1,
        } as any,
        3,
      );

      expect(mockCountCritical).toHaveBeenCalledWith(7, 3);
      const postData = JSON.parse(requestMock.write.mock.calls[0][0]);
      expect(postData.state).toBe("failure");
      expect(postData.description).toBe("1 critical finding exceeds the limit of 0");
    });
  });

  describe("evaluateThresholds", () => {
    const repo = { ci_min_score: 70, ci_max_critical: 2 };
    const scan = (risk_score: unknown, status = "completed") => ({ status, risk_score }) as any;

    it("passes when the score is above the minimum and critical findings are within the limit", () => {
      const result = evaluateThresholds(scan(85), repo, 1);
      expect(result).toEqual({
        state: "success",
        passed: true,
        description: "Governance score 85 (minimum 70), 1 critical finding (limit 2)",
      });
    });

    it("passes when the score equals the minimum and critical findings equal the limit", () => {
      expect(evaluateThresholds(scan(70), repo, 2).state).toBe("success");
    });

    it("fails when the score is below the minimum", () => {
      const result = evaluateThresholds(scan(62), repo, 0);
      expect(result.state).toBe("failure");
      expect(result.passed).toBe(false);
      expect(result.description).toBe("Governance score 62 is below the minimum of 70");
    });

    it("does not fail a high (safe) score, which the old comparison did", () => {
      expect(evaluateThresholds(scan(99), repo, 0).state).toBe("success");
    });

    it("fails when critical findings exceed the limit", () => {
      const result = evaluateThresholds(scan(90), repo, 3);
      expect(result.state).toBe("failure");
      expect(result.description).toBe("3 critical findings exceed the limit of 2");
    });

    it("reports both reasons when both thresholds fail", () => {
      expect(evaluateThresholds(scan(40), repo, 5).description).toBe(
        "Governance score 40 is below the minimum of 70 and 5 critical findings exceed the limit of 2",
      );
    });

    it("parses NUMERIC scores returned as strings", () => {
      expect(evaluateThresholds(scan("69.60"), repo, 0).state).toBe("failure");
      expect(evaluateThresholds(scan("70.00"), repo, 0).state).toBe("success");
    });

    it("reports error when the score is missing", () => {
      expect(evaluateThresholds(scan(null), repo, 0).state).toBe("error");
      expect(evaluateThresholds(scan(undefined), repo, 0).passed).toBe(false);
    });

    it("reports error when critical findings could not be counted", () => {
      expect(evaluateThresholds(scan(90), repo, null).state).toBe("error");
    });

    it("reports error for a scan that did not complete", () => {
      const result = evaluateThresholds(scan(90, "failed"), repo, 0);
      expect(result.state).toBe("error");
      expect(result.passed).toBe(false);
    });
  });
});
