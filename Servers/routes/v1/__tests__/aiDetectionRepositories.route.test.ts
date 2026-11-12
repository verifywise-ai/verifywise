import request from "supertest";
import express from "express";

// No Authorization header is a 401, as with the real middleware.
jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ message: "Unauthorized" });
    req.organizationId = 42;
    req.role = req.headers["x-role"] ?? "Admin";
    next();
  },
}));
// A role header stands in for the permission check: "None" has no read access.
jest.mock("../../../middleware/accessControl.middleware", () => ({
  __esModule: true,
  default: (permission: string) => (req: any, res: any, next: any) => {
    if (req.role === "None") return res.status(403).json({ message: "Forbidden", permission });
    next();
  },
}));
jest.mock("../../../controllers/aiDetectionRepository.ctrl", () => ({
  getWebhookConfigController: jest.fn((_req: any, res: any) =>
    res.status(200).json({ webhook_url: "https://vw.example.com/api/webhooks/github" }),
  ),
}));

import routes from "../aiDetectionRepositories.route";

const app = express();
app.use("/api/v1/ai-detection-repositories", routes);
const URL = "/api/v1/ai-detection-repositories/webhook-config";

describe("/api/v1/ai-detection-repositories", () => {
  it("answers 401 without a token", async () => {
    expect((await request(app).get(URL)).status).toBe(401);
  });

  it("answers 403 without the read permission", async () => {
    const res = await request(app).get(URL).set("Authorization", "Bearer t").set("x-role", "None");
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("aiDetectionRepository.read");
  });

  it("returns the webhook config", async () => {
    const res = await request(app).get(URL).set("Authorization", "Bearer t");
    expect(res.status).toBe(200);
    expect(res.body.webhook_url).toBe("https://vw.example.com/api/webhooks/github");
  });
});
