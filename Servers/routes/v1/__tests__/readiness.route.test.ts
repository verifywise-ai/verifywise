import request from "supertest";
import express from "express";

jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ message: "Unauthorized" });
    req.userId = Number(req.headers["x-user"] ?? 9);
    req.organizationId = Number(req.headers["x-org"] ?? 42);
    req.role = String(req.headers["x-role"] ?? "Editor");
    req.t = (key: string) => key;
    next();
  },
}));
jest.mock("../../../database/db", () => ({ sequelize: {} }));
jest.mock("../../../middleware/aiContentTracker.middleware", () => ({
  trackAIContent: jest.fn(async () => undefined),
}));
jest.mock("../../../utils/readiness.utils", () => ({
  getReadinessCalculationQuery: jest.fn(),
  deleteReadinessCalculationQuery: jest.fn(async () => undefined),
}));
jest.mock("../../../utils/rolePermissions.utils", () => ({
  roleHasPermission: jest.fn(async (_org: number, role: string) => role === "Admin"),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));

import routes from "../readiness.route";
import {
  deleteReadinessCalculationQuery,
  getReadinessCalculationQuery,
} from "../../../utils/readiness.utils";
import { roleHasPermission } from "../../../utils/rolePermissions.utils";

const app = express();
app.use(express.json());
app.use("/api/v1/readiness", routes);

const BASE = "/api/v1/readiness/scores";
const auth = { Authorization: "Bearer t" };

const calc = (overrides: Record<string, unknown> = {}) => ({
  id: 5,
  framework_type: "eu_ai_act",
  project_id: 49,
  created_by: 9,
  visibility: "public",
  ...overrides,
});

// Rows exist only in organization 42; any other organization sees nothing.
const stored = (row: ReturnType<typeof calc>) =>
  (getReadinessCalculationQuery as jest.Mock).mockImplementation(async (id: number, org: number) =>
    id === row.id && org === 42 ? row : null,
  );

describe("DELETE /api/v1/readiness/scores/:id", () => {
  beforeEach(() => jest.clearAllMocks());

  it("answers 401 without a token", async () => {
    expect((await request(app).delete(`${BASE}/5`)).status).toBe(401);
    expect(getReadinessCalculationQuery).not.toHaveBeenCalled();
  });

  it("answers 400 for an invalid id", async () => {
    expect((await request(app).delete(`${BASE}/abc`).set(auth)).status).toBe(400);
    expect((await request(app).delete(`${BASE}/0`).set(auth)).status).toBe(400);
    expect(getReadinessCalculationQuery).not.toHaveBeenCalled();
  });

  it("answers 404 for a calculation of another organization and deletes nothing", async () => {
    stored(calc());
    const res = await request(app).delete(`${BASE}/5`).set(auth).set("x-org", "7");
    expect(res.status).toBe(404);
    expect((getReadinessCalculationQuery as jest.Mock).mock.calls[0]).toEqual([5, 7]);
    expect(deleteReadinessCalculationQuery).not.toHaveBeenCalled();
  });

  it("lets the person who ran it delete it, public or private", async () => {
    for (const visibility of ["public", "private"]) {
      jest.clearAllMocks();
      stored(calc({ visibility }));
      const res = await request(app).delete(`${BASE}/5`).set(auth);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ id: 5 });
      expect(deleteReadinessCalculationQuery).toHaveBeenCalledWith(calc({ visibility }), 42, {
        ownPrivateRows: true,
      });
      expect(roleHasPermission).not.toHaveBeenCalled();
    }
  });

  it("answers 403 to someone else without readiness.admin", async () => {
    stored(calc({ created_by: 3 }));
    const res = await request(app).delete(`${BASE}/5`).set(auth).set("x-role", "Editor");
    expect(res.status).toBe(403);
    expect(roleHasPermission).toHaveBeenCalledWith(42, "Editor", "readiness.admin");
    expect(deleteReadinessCalculationQuery).not.toHaveBeenCalled();
  });

  it("lets a readiness.admin holder delete someone else's public calculation", async () => {
    stored(calc({ created_by: 3 }));
    const res = await request(app).delete(`${BASE}/5`).set(auth).set("x-role", "Admin");
    expect(res.status).toBe(200);
    // Only public rows: the admin never touches the other person's private ones.
    expect(deleteReadinessCalculationQuery).toHaveBeenCalledWith(calc({ created_by: 3 }), 42, {
      ownPrivateRows: false,
    });
  });

  it("answers 404 for someone else's private calculation, even to an admin", async () => {
    stored(calc({ created_by: 3, visibility: "private" }));
    const res = await request(app).delete(`${BASE}/5`).set(auth).set("x-role", "Admin");
    expect(res.status).toBe(404);
    expect(deleteReadinessCalculationQuery).not.toHaveBeenCalled();
  });

  it("answers 500 when the delete fails", async () => {
    stored(calc());
    (deleteReadinessCalculationQuery as jest.Mock).mockRejectedValueOnce(new Error("db down"));
    expect((await request(app).delete(`${BASE}/5`).set(auth)).status).toBe(500);
  });
});
