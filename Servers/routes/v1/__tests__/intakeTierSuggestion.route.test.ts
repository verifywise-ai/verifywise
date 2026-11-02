import request from "supertest";
import express from "express";

// No Authorization header is a 401, as with the real middleware; x-org stands in for the token's org.
jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ message: "Unauthorized" });
    req.organizationId = Number(req.headers["x-org"] ?? 42);
    req.t = (key: string) => key;
    next();
  },
}));
jest.mock("../../../middleware/rateLimit.middleware", () => ({
  generalApiLimiter: (_req: any, _res: any, next: any) => next(),
  intakeTierSuggestionVisitorLimiter: (_req: any, _res: any, next: any) => next(),
}));
// Records which form reference the route resolved.
jest.mock("../../../middleware/intakePublicForm.middleware", () => ({
  resolvePublicIntakeForm: (req: any, res: any, next: any) => {
    res.locals.resolvedBy = req.params.publicId !== undefined ? "publicId" : "slug";
    next();
  },
}));
jest.mock("../../../controllers/intakeTierSuggestion.ctrl", () => ({
  postPublicTierSuggestion: jest.fn((_req: any, res: any) =>
    res.status(200).json({ handler: "suggest", resolvedBy: res.locals.resolvedBy }),
  ),
  postPublicTierExplanation: jest.fn((_req: any, res: any) =>
    res.status(200).json({ handler: "explain", resolvedBy: res.locals.resolvedBy }),
  ),
  takeTierSuggestionResponse: jest.fn((_req: any, res: any, next: any) => {
    res.locals.adapter = true;
    next();
  }),
  getSubmissionTierSuggestionResponse: jest.fn((req: any, res: any) =>
    res.status(200).json({ organizationId: req.organizationId, id: req.params.id }),
  ),
}));
jest.mock("../../../controllers/intakeForm.ctrl", () => ({
  submitPublicFormByPublicId: jest.fn((_req: any, res: any) =>
    res.status(201).json({ handler: "submitById", adapter: res.locals.adapter === true }),
  ),
  submitPublicForm: jest.fn((_req: any, res: any) =>
    res.status(201).json({ handler: "submitBySlug", adapter: res.locals.adapter === true }),
  ),
}));

import routes from "../intakeTierSuggestion.route";

const app = express();
app.use(express.json());
app.use("/api/v1/intake-tier-suggestion", routes);
const BASE = "/api/v1/intake-tier-suggestion";

describe("/api/v1/intake-tier-suggestion", () => {
  it("answers 401 for the reviewer read without a token", async () => {
    expect((await request(app).get(`${BASE}/submissions/12`)).status).toBe(401);
  });

  it("reads the response in the token's organization", async () => {
    const res = await request(app)
      .get(`${BASE}/submissions/12`)
      .set("Authorization", "Bearer t")
      .set("x-org", "7");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ organizationId: 7, id: "12" });
  });

  it("matches the by-id routes before the slug routes", async () => {
    const suggest = await request(app).post(`${BASE}/public/by-id/abc`).send({});
    expect(suggest.body).toEqual({ handler: "suggest", resolvedBy: "publicId" });
    const explain = await request(app).post(`${BASE}/public/by-id/abc/explain`).send({});
    expect(explain.body).toEqual({ handler: "explain", resolvedBy: "publicId" });
    const slug = await request(app).post(`${BASE}/public/acme/request`).send({});
    expect(slug.body).toEqual({ handler: "suggest", resolvedBy: "slug" });
  });

  it("runs the response adapter before the legacy submit handlers", async () => {
    const byId = await request(app).post(`${BASE}/public/by-id/abc/submit`).send({});
    expect(byId.status).toBe(201);
    expect(byId.body).toEqual({ handler: "submitById", adapter: true });
    const bySlug = await request(app).post(`${BASE}/public/acme/request/submit`).send({});
    expect(bySlug.body).toEqual({ handler: "submitBySlug", adapter: true });
  });
});
