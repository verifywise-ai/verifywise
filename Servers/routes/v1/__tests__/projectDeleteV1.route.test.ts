import request from "supertest";
import express from "express";

// x-role / x-org stand in for the token's claims; no Authorization header is a
// 401, as with the real middleware.
jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ message: "Unauthorized" });
    req.userId = 9;
    req.organizationId = Number(req.headers["x-org"] ?? 42);
    req.role = req.headers["x-role"] ?? "Admin";
    req.t = (key: string) => key;
    next();
  },
}));
// x-deny lists the permission keys the caller's role lacks, so a role with
// useCase.edit but without risks.edit (only a custom role can be one) is
// expressible.
jest.mock("../../../utils/rolePermissions.utils", () => ({
  requestHasPermission: jest.fn(
    async (req: any, key: string) =>
      !String(req.headers["x-deny"] ?? "")
        .split(",")
        .includes(key),
  ),
}));
jest.mock("../../../utils/project.utils", () => ({
  ...jest.requireActual("../../../utils/project.utils"),
  getProjectAccessQuery: jest.fn(async () => "allowed"),
  getProjectReadAccessQuery: jest.fn(async () => "allowed"),
}));
jest.mock("../../../utils/projectDeletion.utils", () => ({
  deleteProjectWithSideEffects: jest.fn(),
}));
jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));
jest.mock("../../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(async () => undefined),
  logFailure: jest.fn(async () => undefined),
}));

import routes from "../projects.route";
import { getProjectAccessQuery } from "../../../utils/project.utils";
import { deleteProjectWithSideEffects } from "../../../utils/projectDeletion.utils";
import { sequelize } from "../../../database/db";

const accessQuery = getProjectAccessQuery as jest.Mock;
const deleteWithSideEffects = deleteProjectWithSideEffects as jest.Mock;
const transaction = sequelize.transaction as unknown as jest.Mock;

const app = express();
app.use(express.json());
app.use("/api/v1/projects", routes);

const route = (flag?: string) =>
  `/api/v1/projects/12${flag === undefined ? "" : `?archive_risks_linked_only_here=${flag}`}`;

describe("DELETE /api/v1/projects/:id", () => {
  let tx: { commit: jest.Mock; rollback: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    tx = { commit: jest.fn(), rollback: jest.fn() };
    transaction.mockResolvedValue(tx);
    accessQuery.mockResolvedValue("allowed");
    deleteWithSideEffects.mockResolvedValue({
      deleted: true,
      withdrawnApprovalId: null,
      archivedRiskIds: [3, 5],
    });
  });

  it("answers 401 without a token", async () => {
    expect((await request(app).delete(route("true"))).status).toBe(401);
    expect(deleteWithSideEffects).not.toHaveBeenCalled();
  });

  it("refuses a role without useCase.edit", async () => {
    const res = await request(app)
      .delete(route("false"))
      .set("Authorization", "Bearer t")
      .set("x-deny", "useCase.edit");
    expect(res.status).toBe(403);
    expect(deleteWithSideEffects).not.toHaveBeenCalled();
  });

  it("applies the write rule to the use case, like the legacy delete", async () => {
    accessQuery.mockResolvedValue("denied");
    const res = await request(app)
      .delete(route("false"))
      .set("Authorization", "Bearer t")
      .set("x-role", "Editor");
    expect(res.status).toBe(403);
    expect(accessQuery).toHaveBeenCalledWith(12, { userId: 9, role: "Editor" }, 42);
    expect(deleteWithSideEffects).not.toHaveBeenCalled();
  });

  it.each([undefined, "yes", "1", ""])(
    "requires the archive choice as true or false (got %p)",
    async (flag) => {
      const res = await request(app).delete(route(flag)).set("Authorization", "Bearer t");
      expect(res.status).toBe(400);
      expect(deleteWithSideEffects).not.toHaveBeenCalled();
    },
  );

  it("refuses a repeated archive choice", async () => {
    const res = await request(app)
      .delete(`${route("true")}&archive_risks_linked_only_here=false`)
      .set("Authorization", "Bearer t");
    expect(res.status).toBe(400);
  });

  it("refuses an id that is not a positive integer", async () => {
    const res = await request(app)
      .delete("/api/v1/projects/abc?archive_risks_linked_only_here=true")
      .set("Authorization", "Bearer t");
    expect(res.status).toBe(400);
    expect(deleteWithSideEffects).not.toHaveBeenCalled();
  });

  it("refuses to archive without risks.edit, and deletes nothing", async () => {
    const res = await request(app)
      .delete(route("true"))
      .set("Authorization", "Bearer t")
      .set("x-deny", "risks.edit");
    expect(res.status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
    expect(deleteWithSideEffects).not.toHaveBeenCalled();
  });

  it("lets a role without risks.edit delete and keep the risks", async () => {
    deleteWithSideEffects.mockResolvedValue({
      deleted: true,
      withdrawnApprovalId: null,
      archivedRiskIds: [],
    });
    const res = await request(app)
      .delete(route("false"))
      .set("Authorization", "Bearer t")
      .set("x-deny", "risks.edit");
    expect(res.status).toBe(202);
    expect(res.body.data).toEqual({ deleted: true, archived_risk_ids: [] });
    expect(deleteWithSideEffects).toHaveBeenCalledWith(12, 42, tx, {
      userId: 9,
      archiveRisksLinkedOnlyHere: false,
    });
  });

  it("archives and deletes in one transaction and lists the archived risks", async () => {
    const res = await request(app)
      .delete(route("true"))
      .set("Authorization", "Bearer t")
      .set("x-org", "7");
    expect(res.status).toBe(202);
    expect(res.body.data).toEqual({ deleted: true, archived_risk_ids: [3, 5] });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(deleteWithSideEffects).toHaveBeenCalledWith(12, 7, tx, {
      userId: 9,
      archiveRisksLinkedOnlyHere: true,
    });
    expect(tx.commit).toHaveBeenCalledTimes(1);
    expect(tx.rollback).not.toHaveBeenCalled();
  });

  it("rolls the archive and the delete back together when anything fails", async () => {
    deleteWithSideEffects.mockRejectedValue(new Error("db down"));
    const res = await request(app).delete(route("true")).set("Authorization", "Bearer t");
    expect(res.status).toBe(500);
    expect(tx.rollback).toHaveBeenCalledTimes(1);
    expect(tx.commit).not.toHaveBeenCalled();
  });

  it("answers 404 for a use case outside the organization and rolls back", async () => {
    deleteWithSideEffects.mockResolvedValue({
      deleted: false,
      withdrawnApprovalId: null,
      archivedRiskIds: [],
    });
    const res = await request(app).delete(route("true")).set("Authorization", "Bearer t");
    expect(res.status).toBe(404);
    expect(tx.rollback).toHaveBeenCalledTimes(1);
  });
});
