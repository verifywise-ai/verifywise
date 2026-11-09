/**
 * Authentication tests for the GitHub webhook router (webhook.route.ts).
 *
 * The endpoint is PUBLIC (no JWT); security is HMAC-SHA256 verification of the
 * X-Hub-Signature-256 header over the raw body against the per-repository
 * webhook_secret. The verifier (`verifyGitHubSignature`) lives in
 * services/webhook.service.ts in the SAME module as the event handlers, so this
 * file partial-mocks that module with jest.requireActual — the real HMAC
 * verification runs unmocked (these tests fail if it is removed or neutered)
 * while only the scan-triggering handlers and the DB-bound repository lookup
 * are replaced.
 *
 * Real signatures are computed in-test with crypto.createHmac.
 *
 * Note on check order in webhook.ctrl.ts: the repository lookup precedes
 * signature verification, and an unknown repository returns 200 by design (to
 * stop GitHub retrying), so most 401 tests need the repo mock to return a repo.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import crypto from "crypto";
import express, { NextFunction, Request, Response } from "express";
import request from "supertest";

const WEBHOOK_SECRET = "test-webhook-secret-0123456789abcdef";

const REPO_ROW = {
  id: 10,
  organization_id: 1,
  created_by: 5,
  default_branch: "main",
  webhook_secret: WEBHOOK_SECRET,
};

const getRepositoryByOwnerNameForWebhook = jest.fn(async () => REPO_ROW as any);
jest.mock("../../utils/aiDetectionRepository.utils", () => ({
  __esModule: true,
  getRepositoryByOwnerNameForWebhook: (...args: unknown[]) =>
    getRepositoryByOwnerNameForWebhook(...(args as [])),
}));

// DB/service boundary behind the handlers; avoids loading the DB layer at all.
jest.mock("../../services/aiDetection.service", () => ({
  __esModule: true,
  startScan: jest.fn(),
}));

const handlePushEvent = jest.fn(async () => ({ triggered: true, reason: "scan started" }));
const handlePullRequestEvent = jest.fn(async () => ({ triggered: true, reason: "scan started" }));

// Partial mock: keep the REAL verifyGitHubSignature, replace only the handlers.
jest.mock("../../services/webhook.service", () => {
  const actual = jest.requireActual("../../services/webhook.service") as Record<string, unknown>;
  return {
    __esModule: true,
    ...actual,
    handlePushEvent: (...args: unknown[]) => handlePushEvent(...(args as [])),
    handlePullRequestEvent: (...args: unknown[]) => handlePullRequestEvent(...(args as [])),
  };
});

import webhookRouter from "../webhook.route";

const app = () => {
  const a = express();
  // The controller builds error bodies via req.t!; on a bare app there is no
  // i18n, so install the identity stub (its catch-all would mask 401s as 200).
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).t = (s: string) => s;
    next();
  });
  a.use("/webhooks", webhookRouter);
  return a;
};

const PAYLOAD = JSON.stringify({
  ref: "refs/heads/main",
  before: "1111111111111111111111111111111111111111",
  after: "2222222222222222222222222222222222222222",
  repository: {
    owner: { login: "acme" },
    name: "widget-repo",
    default_branch: "main",
  },
  sender: { login: "octocat" },
});

const sign = (body: string, secret: string = WEBHOOK_SECRET) =>
  "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");

const postGithub = (body: string, headers: Record<string, string> = {}, signature?: string) => {
  let r = request(app())
    .post("/webhooks/github")
    .set("Content-Type", "application/json")
    .set("X-GitHub-Event", "push");
  if (signature !== undefined) {
    r = r.set("X-Hub-Signature-256", signature);
  }
  for (const [k, v] of Object.entries(headers)) {
    r = r.set(k, v);
  }
  return r.send(body);
};

beforeEach(() => {
  jest.clearAllMocks();
  getRepositoryByOwnerNameForWebhook.mockResolvedValue(REPO_ROW as any);
});

describe("POST /webhooks/github — HMAC signature guard", () => {
  it("rejects a request with no X-Hub-Signature-256 header with 401", async () => {
    const res = await postGithub(PAYLOAD);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      message: "Unauthorized",
      data: "Missing X-Hub-Signature-256 header",
    });
    expect(handlePushEvent).not.toHaveBeenCalled();
  });

  it("rejects a malformed signature (no sha256= prefix) with 401", async () => {
    const res = await postGithub(PAYLOAD, {}, "deadbeef".repeat(8));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: "Unauthorized", data: "Invalid signature" });
  });

  it("rejects a malformed signature (bad hex, wrong length) with 401", async () => {
    const res = await postGithub(PAYLOAD, {}, "sha256=zz");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: "Unauthorized", data: "Invalid signature" });
  });

  it("rejects a well-formed signature made with the wrong secret with 401", async () => {
    const res = await postGithub(PAYLOAD, {}, sign(PAYLOAD, "a-different-secret"));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: "Unauthorized", data: "Invalid signature" });
    expect(handlePushEvent).not.toHaveBeenCalled();
  });

  it("rejects a body tampered with after signing with 401", async () => {
    const tampered = PAYLOAD.replace("widget-repo", "other-repo");
    // Repo lookup must still match, so tamper with a non-lookup field instead:
    const tamperedRef = PAYLOAD.replace("refs/heads/main", "refs/heads/evil");
    const res = await postGithub(tamperedRef, {}, sign(PAYLOAD));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: "Unauthorized", data: "Invalid signature" });
    expect(tampered).not.toBe(PAYLOAD);
  });

  it("answers 200 {message:'pong'} for a validly signed ping event", async () => {
    const res = await postGithub(PAYLOAD, { "X-GitHub-Event": "ping" }, sign(PAYLOAD));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "pong" });
  });

  it("answers 200 by design when the repository is not registered (no GitHub retry)", async () => {
    getRepositoryByOwnerNameForWebhook.mockResolvedValue(null as any);

    const res = await postGithub(PAYLOAD, {}, sign(PAYLOAD));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Repository not registered or CI not enabled" });
    expect(handlePushEvent).not.toHaveBeenCalled();
  });

  it("dispatches a validly signed push with the repository's tenant context, never the payload's", async () => {
    // The payload carries no organization_id; the handler must receive the
    // repo row (organization_id: 1) that the secret lookup resolved.
    const res = await postGithub(PAYLOAD, {}, sign(PAYLOAD));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ triggered: true, reason: "scan started" });
    expect(handlePushEvent).toHaveBeenCalledTimes(1);
    const [payloadArg, repoArg] = handlePushEvent.mock.calls[0] as any[];
    expect(repoArg.organization_id).toBe(1);
    expect(repoArg.id).toBe(REPO_ROW.id);
    expect(payloadArg.repository.name).toBe("widget-repo");
  });

  it("rejects a request with no X-GitHub-Event header with 400", async () => {
    let r = request(app())
      .post("/webhooks/github")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", sign(PAYLOAD));

    const res = await r.send(PAYLOAD);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: "Bad Request",
      data: "Missing X-GitHub-Event header",
    });
  });

  it("rejects an invalid JSON body with 400", async () => {
    const res = await postGithub("this is not json", {}, "sha256=whatever");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Bad Request", data: "Invalid JSON payload" });
  });
});
