import request from "supertest";
import express from "express";
import { BUILTIN_ROLE_PERMISSIONS } from "../../../config/rolePermissions.config";

// The token decides who and which organization: x-role / x-org stand in for
// its claims; no Authorization header is a 401, as with the real middleware.
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
// The real middleware answers 403 when the org has the extension off.
jest.mock("../../../middleware/requireExtensionEnabled.middleware", () => ({
  requireExtensionEnabled: jest.fn(
    (key: string) => (req: any, res: any, next: any) =>
      key === "framework-import" && req.headers["x-extension-off"]
        ? res.status(403).json({ message: "Extension disabled" })
        : next(),
  ),
}));
// Permissions resolve against the real built-in role matrix, so a route
// guarded by the wrong key fails the role tests.
jest.mock("../../../utils/rolePermissions.utils", () => {
  const roleHasPermission = async (_org: number | null, role: string, key: string) =>
    BUILTIN_ROLE_PERMISSIONS[role]?.has(key as never) ?? false;
  return {
    roleHasPermission,
    // authorize() resolves through the request (#5314); same answer here.
    requestHasPermission: async (req: any, key: string) =>
      roleHasPermission(req.organizationId ?? null, req.role, key),
  };
});
jest.mock("../../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(async () => undefined),
  logFailure: jest.fn(async () => undefined),
}));
// Use case access: x-no-access makes the caller unable to see any use case.
jest.mock("../../../utils/project.utils", () => {
  const access = jest.fn(async (_projectId: number, _viewer: unknown, _org: number) => "allowed");
  return { getProjectAccessQuery: access, getProjectReadAccessQuery: access };
});
jest.mock("../../../utils/approvalRequest.utils", () => ({
  hasPendingApprovalQuery: jest.fn(async () => false),
}));
jest.mock("../../../utils/fileUpload.utils", () => ({
  uploadFile: jest.fn(async () => ({ id: 70 })),
}));
jest.mock("../../../database/db", () => ({
  sequelize: {
    transaction: jest.fn(async () => ({
      commit: jest.fn(async () => undefined),
      rollback: jest.fn(async () => undefined),
    })),
  },
}));
jest.mock("../../../extensions/framework-import/importedAssessment.service", () => {
  const actual = jest.requireActual(
    "../../../extensions/framework-import/importedAssessment.service",
  );
  return {
    ...actual,
    getProjectForLinkQuery: jest.fn(async () => ({ id: 3, is_organizational: false })),
    listProjectLinksQuery: jest.fn(async () => []),
    attachImportedFrameworkQuery: jest.fn(),
    detachImportedFrameworkQuery: jest.fn(async () => undefined),
    getLinkContextQuery: jest.fn(),
    getLinkTreeQuery: jest.fn(async () => ({
      projects_frameworks_id: 12,
      framework: {},
      tree: [],
    })),
    getLinkDashboardQuery: jest.fn(async () => ({ progress: { total: 0, done: 0 } })),
    getImplQuery: jest.fn(async () => ({ id: 101 })),
    implBelongsToLinkQuery: jest.fn(async () => true),
    getImplLinkedRisksQuery: jest.fn(async () => []),
    updateImplQuery: jest.fn(async () => ({ id: 101, status: "Draft" })),
    replaceImplRisksQuery: jest.fn(async () => [{ id: 4 }]),
  };
});

import routes from "../importedFrameworkAssessment.route";
import * as service from "../../../extensions/framework-import/importedAssessment.service";
import { getProjectAccessQuery } from "../../../utils/project.utils";
import { hasPendingApprovalQuery } from "../../../utils/approvalRequest.utils";
import { uploadFile } from "../../../utils/fileUpload.utils";
import { ValidationException } from "../../../domain.layer/exceptions/custom.exception";

const app = express();
app.use(express.json());
app.use("/api/v1/imported-framework-assessments", routes);

const ROUTE = "/api/v1/imported-framework-assessments";
const mocked = service as jest.Mocked<typeof service>;
const access = getProjectAccessQuery as jest.Mock;

const LINK = {
  id: 12,
  project_id: 3,
  imported_framework_id: 5,
  name: "Acme policy",
  description: null,
  is_demo: false,
};

const auth = (r: request.Test, role = "Admin", org = "42") =>
  r.set("Authorization", "Bearer t").set("x-role", role).set("x-org", org);

describe("/api/v1/imported-framework-assessments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    access.mockResolvedValue("allowed");
    (hasPendingApprovalQuery as jest.Mock).mockResolvedValue(false);
    mocked.getLinkContextQuery.mockResolvedValue(LINK);
    mocked.getImplQuery.mockResolvedValue({ id: 101 });
    mocked.implBelongsToLinkQuery.mockResolvedValue(true);
    mocked.updateImplQuery.mockResolvedValue({ id: 101, status: "Draft" });
    mocked.attachImportedFrameworkQuery.mockResolvedValue({
      id: 12,
      imported_framework_id: 5,
      name: "Acme policy",
      description: null,
      created_at: new Date(0),
    });
  });

  it("answers 401 without a token on every route", async () => {
    const calls = [
      request(app).get(`${ROUTE}/projects/3`),
      request(app).post(`${ROUTE}/projects/3`).send({ imported_framework_id: 5 }),
      request(app).delete(`${ROUTE}/projects/3/12`),
      request(app).get(`${ROUTE}/links/12/tree`),
      request(app).get(`${ROUTE}/links/12/dashboard`),
      request(app).get(`${ROUTE}/links/12/impl/l2/101`),
      request(app).patch(`${ROUTE}/links/12/impl/l2/101`).send({ status: "Draft" }),
      request(app).get(`${ROUTE}/links/12/impl/l2/101/risks`),
      request(app).put(`${ROUTE}/links/12/impl/l2/101/risks`).send({ risk_ids: [] }),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
    expect(mocked.getLinkContextQuery).not.toHaveBeenCalled();
    expect(mocked.attachImportedFrameworkQuery).not.toHaveBeenCalled();
  });

  it.each(["Reviewer", "Auditor"])("answers 403 when an %s attaches or detaches", async (role) => {
    expect(
      (
        await auth(request(app).post(`${ROUTE}/projects/3`), role).send({
          imported_framework_id: 5,
        })
      ).status,
    ).toBe(403);
    expect((await auth(request(app).delete(`${ROUTE}/projects/3/12`), role)).status).toBe(403);
    expect(mocked.attachImportedFrameworkQuery).not.toHaveBeenCalled();
    expect(mocked.detachImportedFrameworkQuery).not.toHaveBeenCalled();
  });

  it("answers 403 to a caller who cannot see the use case", async () => {
    access.mockResolvedValue("denied");
    const routesToTry = [
      auth(request(app).get(`${ROUTE}/projects/3`)),
      auth(request(app).post(`${ROUTE}/projects/3`)).send({ imported_framework_id: 5 }),
      auth(request(app).get(`${ROUTE}/links/12/tree`)),
      auth(request(app).get(`${ROUTE}/links/12/dashboard`)),
      auth(request(app).get(`${ROUTE}/links/12/impl/l3/101`)),
      auth(request(app).patch(`${ROUTE}/links/12/impl/l3/101`)).send({ status: "Draft" }),
      auth(request(app).put(`${ROUTE}/links/12/impl/l3/101/risks`)).send({ risk_ids: [1] }),
    ];
    for (const res of await Promise.all(routesToTry)) expect(res.status).toBe(403);
    expect(mocked.attachImportedFrameworkQuery).not.toHaveBeenCalled();
    expect(mocked.getLinkTreeQuery).not.toHaveBeenCalled();
    expect(mocked.updateImplQuery).not.toHaveBeenCalled();
    expect(mocked.replaceImplRisksQuery).not.toHaveBeenCalled();
  });

  it("treats another organization's link as not found, looked up in the token's org", async () => {
    mocked.getLinkContextQuery.mockResolvedValue(null);
    const tree = await auth(request(app).get(`${ROUTE}/links/12/tree`), "Admin", "8");
    expect(tree.status).toBe(404);
    expect(mocked.getLinkContextQuery).toHaveBeenCalledWith(12, 8);
    const patch = await auth(
      request(app).patch(`${ROUTE}/links/12/impl/l2/101`),
      "Admin",
      "8",
    ).send({ status: "Draft" });
    expect(patch.status).toBe(404);
    expect(mocked.getLinkTreeQuery).not.toHaveBeenCalled();
    expect(mocked.updateImplQuery).not.toHaveBeenCalled();
  });

  it("answers 404 for an impl row of another link", async () => {
    mocked.getImplQuery.mockResolvedValue(null);
    mocked.implBelongsToLinkQuery.mockResolvedValue(false);
    expect((await auth(request(app).get(`${ROUTE}/links/12/impl/l2/999`))).status).toBe(404);
    expect((await auth(request(app).get(`${ROUTE}/links/12/impl/l2/999/risks`))).status).toBe(404);
    expect(
      (await auth(request(app).patch(`${ROUTE}/links/12/impl/l2/999`)).send({ status: "Draft" }))
        .status,
    ).toBe(404);
    expect(mocked.getImplQuery).toHaveBeenCalledWith(12, "l2", 999, 42);
    expect(mocked.updateImplQuery).not.toHaveBeenCalled();
  });

  it.each(["abc", "0", "-1", "1.5", "99999999999999999999"])(
    "answers 400 for the id %s before reaching the database",
    async (id) => {
      expect((await auth(request(app).get(`${ROUTE}/links/${id}/tree`))).status).toBe(400);
      expect((await auth(request(app).get(`${ROUTE}/links/12/impl/l2/${id}`))).status).toBe(400);
      expect((await auth(request(app).get(`${ROUTE}/projects/${id}`))).status).toBe(400);
      expect((await auth(request(app).delete(`${ROUTE}/projects/3/${id}`))).status).toBe(400);
      expect(
        (await auth(request(app).post(`${ROUTE}/projects/3`)).send({ imported_framework_id: id }))
          .status,
      ).toBe(400);
      expect(mocked.getLinkContextQuery).not.toHaveBeenCalled();
      expect(mocked.getImplQuery).not.toHaveBeenCalled();
      expect(mocked.detachImportedFrameworkQuery).not.toHaveBeenCalled();
      expect(mocked.attachImportedFrameworkQuery).not.toHaveBeenCalled();
    },
  );

  it("answers 400 for an unknown level", async () => {
    expect((await auth(request(app).get(`${ROUTE}/links/12/impl/l4/101`))).status).toBe(400);
    expect((await auth(request(app).get(`${ROUTE}/links/12/impl/2/101`))).status).toBe(400);
  });

  it("attaches into the token's organization and answers 201", async () => {
    const res = await auth(request(app).post(`${ROUTE}/projects/3`), "Editor", "7").send({
      imported_framework_id: 5,
      organization_id: 99,
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id: 12, imported_framework_id: 5, name: "Acme policy" });
    expect(mocked.attachImportedFrameworkQuery).toHaveBeenCalledWith(3, 5, 7);
    expect(access).toHaveBeenCalledWith(3, { userId: 9, role: "Editor" }, 7);
  });

  it("needs the extension to attach, but not to read or assess", async () => {
    const attach = await auth(request(app).post(`${ROUTE}/projects/3`))
      .set("x-extension-off", "1")
      .send({ imported_framework_id: 5 });
    expect(attach.status).toBe(403);
    expect(mocked.attachImportedFrameworkQuery).not.toHaveBeenCalled();

    const tree = await auth(request(app).get(`${ROUTE}/links/12/tree`)).set("x-extension-off", "1");
    expect(tree.status).toBe(200);
    const patch = await auth(request(app).patch(`${ROUTE}/links/12/impl/l2/101`))
      .set("x-extension-off", "1")
      .send({ status: "Draft" });
    expect(patch.status).toBe(200);
  });

  it("refuses attach and detach while the use case awaits approval", async () => {
    (hasPendingApprovalQuery as jest.Mock).mockResolvedValue(true);
    const attach = await auth(request(app).post(`${ROUTE}/projects/3`)).send({
      imported_framework_id: 5,
    });
    const detach = await auth(request(app).delete(`${ROUTE}/projects/3/12`));
    expect(attach.status).toBe(403);
    expect(detach.status).toBe(403);
    expect(mocked.attachImportedFrameworkQuery).not.toHaveBeenCalled();
    expect(mocked.detachImportedFrameworkQuery).not.toHaveBeenCalled();
    (hasPendingApprovalQuery as jest.Mock).mockResolvedValue(false);
  });

  it("maps service errors to their status (organizational project = 400)", async () => {
    mocked.attachImportedFrameworkQuery.mockRejectedValue(
      new ValidationException("Imported frameworks can only be added to use cases"),
    );
    const res = await auth(request(app).post(`${ROUTE}/projects/3`)).send({
      imported_framework_id: 5,
    });
    expect(res.status).toBe(400);
  });

  it("lists, detaches and reads the tree and dashboard in the token's organization", async () => {
    expect((await auth(request(app).get(`${ROUTE}/projects/3`), "Auditor")).status).toBe(200);
    expect(mocked.listProjectLinksQuery).toHaveBeenCalledWith(3, 42);

    const del = await auth(request(app).delete(`${ROUTE}/projects/3/12`));
    expect(del.status).toBe(200);
    expect(mocked.detachImportedFrameworkQuery).toHaveBeenCalledWith(3, 12, 42);

    const tree = await auth(request(app).get(`${ROUTE}/links/12/tree`), "Auditor");
    expect(tree.status).toBe(200);
    expect(tree.body.data.projects_frameworks_id).toBe(12);
    expect(mocked.getLinkTreeQuery).toHaveBeenCalledWith(LINK, 42);

    const dash = await auth(request(app).get(`${ROUTE}/links/12/dashboard`));
    expect(dash.status).toBe(200);
    expect(mocked.getLinkDashboardQuery).toHaveBeenCalledWith(LINK, 42);
  });

  it("saves a multipart PATCH with evidence, uploaded as the caller", async () => {
    const res = await auth(request(app).patch(`${ROUTE}/links/12/impl/l3/101`))
      .field("status", "Draft")
      .field("owner", "9")
      .field("risksMitigated", "[4]")
      .field("delete", "[71]")
      .field("user_id", "555")
      .attach("files", Buffer.from("evidence"), {
        filename: "e.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(200);
    expect(uploadFile).toHaveBeenCalledWith(
      expect.anything(),
      9,
      3,
      "Imported framework items",
      42,
      expect.anything(),
    );
    const [link, level, implId, org, input, uploaded, deleted] =
      mocked.updateImplQuery.mock.calls[0];
    expect([link, level, implId, org]).toEqual([LINK, "l3", 101, 42]);
    expect(input).toMatchObject({ status: "Draft", owner: "9", risksMitigated: "[4]" });
    expect(uploaded).toEqual([70]);
    expect(deleted).toEqual([71]);
  });

  it("answers 400, not 500, for a bad PATCH value", async () => {
    mocked.updateImplQuery.mockRejectedValue(new ValidationException("Invalid status"));
    const res = await auth(request(app).patch(`${ROUTE}/links/12/impl/l2/101`)).send({
      status: "Done",
    });
    expect(res.status).toBe(400);
    const badList = await auth(request(app).patch(`${ROUTE}/links/12/impl/l2/101`)).send({
      delete: "not json",
    });
    expect(badList.status).toBe(400);
  });

  it("reads and replaces linked risks", async () => {
    const get = await auth(request(app).get(`${ROUTE}/links/12/impl/l2/101/risks`), "Auditor");
    expect(get.status).toBe(200);
    expect(mocked.getImplLinkedRisksQuery).toHaveBeenCalledWith("l2", 101, 42);

    const put = await auth(request(app).put(`${ROUTE}/links/12/impl/l2/101/risks`)).send({
      risk_ids: [4, "4"],
    });
    expect(put.status).toBe(200);
    expect(put.body.data).toEqual([{ id: 4 }]);
    expect(mocked.replaceImplRisksQuery.mock.calls[0].slice(0, 5)).toEqual([
      LINK,
      "l2",
      101,
      42,
      [4],
    ]);

    const bad = await auth(request(app).put(`${ROUTE}/links/12/impl/l2/101/risks`)).send({
      risk_ids: "4",
    });
    expect(bad.status).toBe(400);
  });
});
