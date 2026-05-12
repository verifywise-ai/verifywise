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
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  __esModule: true,
}));

import https from "https";
import { reportScanToGitHub } from "../githubStatusReporter";
import { getDecryptedGitHubToken } from "../../../utils/githubToken.utils";
import { getRepositoryByIdQuery } from "../../../utils/aiDetectionRepository.utils";
import { getFindingsSummaryQuery } from "../../../utils/aiDetection.utils";

const mockGetToken = getDecryptedGitHubToken as jest.MockedFunction<typeof getDecryptedGitHubToken>;
const mockGetRepo = getRepositoryByIdQuery as jest.MockedFunction<typeof getRepositoryByIdQuery>;
const mockGetSummary = getFindingsSummaryQuery as jest.MockedFunction<
  typeof getFindingsSummaryQuery
>;

describe("githubStatusReporter", () => {
  let requestMock: any;
  let responseMock: any;

  beforeEach(() => {
    jest.clearAllMocks();

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
          risk_score: 50,
          findings_count: 2,
        } as any,
        1,
      );

      expect(https.request).toHaveBeenCalled();
      const options = (https.request as jest.MockedFunction<typeof https.request>).mock.calls[0][0];
      expect(options.path).toContain("/statuses/abc123");
    });

    it("should post failure status when risk score exceeds threshold", async () => {
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

      const postData = JSON.parse(requestMock.write.mock.calls[0][0]);
      expect(postData.state).toBe("failure");
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
});
