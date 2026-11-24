import request from "supertest";
import express from "express";

// x-user / x-org / x-role stand in for the token's claims; no Authorization
// header is a 401, as with the real middleware.
jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ message: "Unauthorized" });
    req.userId = Number(req.headers["x-user"] ?? 9);
    req.organizationId = Number(req.headers["x-org"] ?? 42);
    req.role = req.headers["x-role"] ?? "Editor";
    req.t = (key: string) => key;
    next();
  },
}));
jest.mock("../../../utils/task.utils", () => ({
  getTasksQuery: jest.fn(async () => []),
}));
jest.mock("../../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(async () => undefined),
  logFailure: jest.fn(async () => undefined),
}));

import routes from "../tasks.route";
import { getTasksQuery } from "../../../utils/task.utils";

const app = express();
app.use("/api/v1/tasks", routes);

const ROUTE = "/api/v1/tasks/linked/incident/12";
const mockGetTasks = getTasksQuery as jest.Mock;

describe("GET /api/v1/tasks/linked/:entityType/:entityId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("answers 401 without a token", async () => {
    expect((await request(app).get(ROUTE)).status).toBe(401);
    expect(mockGetTasks).not.toHaveBeenCalled();
  });

  it("serves every role; read-only roles see the tasks visible to them", async () => {
    const res = await request(app)
      .get(ROUTE)
      .set("Authorization", "Bearer t")
      .set("x-role", "Auditor");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(mockGetTasks.mock.calls[0][0]).toEqual({ userId: 9, role: "Auditor" });
  });

  it("returns the linked tasks with their assignees", async () => {
    mockGetTasks.mockResolvedValueOnce([
      {
        toJSON: () => ({ id: 700, title: "Contain the harm", status: "Open" }),
        dataValues: { assignees: [5], entity_links: [] },
      },
    ]);
    const res = await request(app).get(ROUTE).set("Authorization", "Bearer t");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { id: 700, title: "Contain the harm", status: "Open", assignees: [5], entity_links: [] },
    ]);
  });

  it("scopes to the token's organization and user, whatever the query string says", async () => {
    const res = await request(app)
      .get(`${ROUTE}?organizationId=99&organization_id=99&userId=99`)
      .set("Authorization", "Bearer t")
      .set("x-user", "5")
      .set("x-org", "7");
    expect(res.status).toBe(200);
    const [viewer, organizationId, filters] = mockGetTasks.mock.calls[0];
    expect(viewer.userId).toBe(5);
    expect(organizationId).toBe(7);
    expect(filters).toEqual({
      organization_id: 7,
      linked_entity: { entity_type: "incident", entity_id: 12 },
    });
  });

  it.each(["/api/v1/tasks/linked/spaceship/12", "/api/v1/tasks/linked/incident/abc"])(
    "answers 400 for %s",
    async (url) => {
      const res = await request(app).get(url).set("Authorization", "Bearer t");
      expect(res.status).toBe(400);
      expect(mockGetTasks).not.toHaveBeenCalled();
    },
  );
});
