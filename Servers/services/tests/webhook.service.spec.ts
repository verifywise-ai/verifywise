/**
 * @fileoverview Webhook Service Tests
 *
 * Tests for GitHub webhook signature verification, secret generation,
 * and event handlers (push and pull_request).
 *
 * @module tests/webhook.service
 */

// Mock dependencies BEFORE imports
jest.mock("../aiDetection.service", () => ({
  startScan: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  __esModule: true,
}));

import crypto from "crypto";
import {
  verifyGitHubSignature,
  generateWebhookSecret,
  handlePushEvent,
  handlePullRequestEvent,
} from "../webhook.service";
import { startScan } from "../aiDetection.service";

const mockStartScan = startScan as jest.MockedFunction<typeof startScan>;

describe("webhook.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // verifyGitHubSignature
  // ==========================================================================

  describe("verifyGitHubSignature", () => {
    const secret = "test-webhook-secret";
    const payload = Buffer.from('{"action":"push"}');

    function computeSignature(body: Buffer, key: string): string {
      return "sha256=" + crypto.createHmac("sha256", key).update(body).digest("hex");
    }

    it("should return true for a valid signature", () => {
      const sig = computeSignature(payload, secret);
      expect(verifyGitHubSignature(payload, sig, secret)).toBe(true);
    });

    it("should return false for a tampered payload", () => {
      const sig = computeSignature(payload, secret);
      const tampered = Buffer.from('{"action":"tampered"}');
      const tamperedSig = computeSignature(tampered, secret);
      // Verify original sig doesn't match tampered payload
      expect(verifyGitHubSignature(tampered, sig, secret)).toBe(false);
      // Verify tampered sig doesn't match original payload
      expect(verifyGitHubSignature(payload, tamperedSig, secret)).toBe(false);
    });

    it("should return false for wrong secret", () => {
      const sig = computeSignature(payload, "wrong-secret");
      expect(verifyGitHubSignature(payload, sig, secret)).toBe(false);
    });

    it("should return false when signature length differs", () => {
      expect(verifyGitHubSignature(payload, "sha256=short", secret)).toBe(false);
    });
  });

  // ==========================================================================
  // generateWebhookSecret
  // ==========================================================================

  describe("generateWebhookSecret", () => {
    it("should return a 64-character hex string", () => {
      const secret = generateWebhookSecret();
      expect(secret).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should generate unique secrets on successive calls", () => {
      const s1 = generateWebhookSecret();
      const s2 = generateWebhookSecret();
      expect(s1).not.toBe(s2);
    });
  });

  // ==========================================================================
  // handlePushEvent
  // ==========================================================================

  describe("handlePushEvent", () => {
    const baseRepo = {
      id: 1,
      organization_id: 10,
      created_by: 5,
      default_branch: "main",
    } as any;

    const basePushPayload = {
      ref: "refs/heads/main",
      before: "aaa",
      after: "bbb1234567890",
      repository: {
        owner: { login: "org" },
        name: "repo",
        default_branch: "main",
      },
      sender: { login: "user" },
    };

    it("should trigger a scan on push to default branch", async () => {
      mockStartScan.mockResolvedValue({ id: 42 } as any);

      const result = await handlePushEvent(basePushPayload, baseRepo);

      expect(result.triggered).toBe(true);
      expect(result.reason).toContain("42");
      expect(mockStartScan).toHaveBeenCalledWith(
        "https://github.com/org/repo",
        expect.objectContaining({ userId: 5, organizationId: 10 }),
        expect.objectContaining({ repositoryId: 1, triggeredByType: "webhook" }),
        undefined,
        expect.objectContaining({ trigger_type: "webhook", branch: "main" }),
      );
    });

    it("should skip push to non-default branch", async () => {
      const payload = { ...basePushPayload, ref: "refs/heads/feature-branch" };
      const result = await handlePushEvent(payload, baseRepo);

      expect(result.triggered).toBe(false);
      expect(result.reason).toContain("non-default branch");
      expect(mockStartScan).not.toHaveBeenCalled();
    });

    it("should skip branch deletion events (all-zero sha)", async () => {
      const payload = {
        ...basePushPayload,
        after: "0000000000000000000000000000000000000000",
      };
      const result = await handlePushEvent(payload, baseRepo);

      expect(result.triggered).toBe(false);
      expect(result.reason).toContain("Branch deletion");
      expect(mockStartScan).not.toHaveBeenCalled();
    });

    it("should use repo default_branch over payload default_branch", async () => {
      const repo = { ...baseRepo, default_branch: "develop" };
      const payload = { ...basePushPayload, ref: "refs/heads/develop" };
      mockStartScan.mockResolvedValue({ id: 99 } as any);

      const result = await handlePushEvent(payload, repo);
      expect(result.triggered).toBe(true);
    });
  });

  // ==========================================================================
  // handlePullRequestEvent
  // ==========================================================================

  describe("handlePullRequestEvent", () => {
    const baseRepo = {
      id: 2,
      organization_id: 10,
      created_by: 5,
      default_branch: "main",
    } as any;

    const basePRPayload = {
      action: "opened",
      number: 123,
      pull_request: {
        head: { sha: "headsha1234567", ref: "feature-branch" },
        base: { sha: "basesha1234567", ref: "main" },
      },
      repository: {
        owner: { login: "org" },
        name: "repo",
      },
      sender: { login: "user" },
    };

    it("should trigger an incremental scan on PR opened", async () => {
      mockStartScan.mockResolvedValue({ id: 55 } as any);

      const result = await handlePullRequestEvent(basePRPayload, baseRepo);

      expect(result.triggered).toBe(true);
      expect(result.reason).toContain("55");
      expect(result.reason).toContain("PR #123");
      expect(mockStartScan).toHaveBeenCalledWith(
        "https://github.com/org/repo",
        expect.objectContaining({ userId: 5, organizationId: 10 }),
        expect.objectContaining({ repositoryId: 2, triggeredByType: "webhook" }),
        expect.objectContaining({
          scan_mode: "incremental",
          base_commit_sha: "basesha1234567",
          head_commit_sha: "headsha1234567",
        }),
        expect.objectContaining({ trigger_type: "webhook", pr_number: 123 }),
      );
    });

    it("should trigger on synchronize action", async () => {
      mockStartScan.mockResolvedValue({ id: 56 } as any);
      const payload = { ...basePRPayload, action: "synchronize" };

      const result = await handlePullRequestEvent(payload, baseRepo);
      expect(result.triggered).toBe(true);
    });

    it("should trigger on reopened action", async () => {
      mockStartScan.mockResolvedValue({ id: 57 } as any);
      const payload = { ...basePRPayload, action: "reopened" };

      const result = await handlePullRequestEvent(payload, baseRepo);
      expect(result.triggered).toBe(true);
    });

    it("should skip closed PR action", async () => {
      const payload = { ...basePRPayload, action: "closed" };

      const result = await handlePullRequestEvent(payload, baseRepo);
      expect(result.triggered).toBe(false);
      expect(result.reason).toContain("Ignored PR action: closed");
      expect(mockStartScan).not.toHaveBeenCalled();
    });

    it("should skip labeled PR action", async () => {
      const payload = { ...basePRPayload, action: "labeled" };

      const result = await handlePullRequestEvent(payload, baseRepo);
      expect(result.triggered).toBe(false);
      expect(mockStartScan).not.toHaveBeenCalled();
    });
  });
});
