import request from "supertest";
import express from "express";

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
jest.mock("../../../utils/useCaseOrgSettings.utils", () => ({
  USE_CASE_GEOGRAPHY_IDS: [1, 2, 3, 4, 5, 6],
  getUseCaseOrgSettings: jest.fn(async (organizationId: number) => ({
    organization_id: organizationId,
    default_geography: null,
    default_framework_ids: [],
  })),
  upsertUseCaseOrgSettings: jest.fn(async (organizationId: number, update: object) => ({
    organization_id: organizationId,
    default_geography: null,
    default_framework_ids: [],
    ...update,
  })),
  projectLevelFrameworkIdsQuery: jest.fn(async (ids: number[]) => ids),
}));
// authorize("organization.admin") runs the real permission matrix: built-in
// roles from the static matrix, the custom role below from its (mocked) rows.
const CUSTOM_ROLE = { id: 50, name: "Settings lead", organizationId: 42 };
let mockCustomRows: Array<{ permission_key: string; allowed: boolean }> = [];
jest.mock("../../../utils/roleMap", () => ({
  getRoleByName: jest.fn(async (_orgId: number | null, name: string) =>
    name === "Settings lead"
      ? { id: 50, name: "Settings lead", organizationId: 42 }
      : ["Admin", "Editor", "Reviewer", "Auditor"].includes(name)
        ? { id: 1, name, organizationId: null }
        : undefined,
  ),
}));
jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn(async () => mockCustomRows) },
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));

import routes from "../useCaseOrgSettings.route";
import { invalidateRolePermissionsCache } from "../../../utils/rolePermissions.utils";
import {
  getUseCaseOrgSettings,
  upsertUseCaseOrgSettings,
} from "../../../utils/useCaseOrgSettings.utils";

const app = express();
app.use(express.json());
app.use("/api/v1/use-case-org-settings", routes);

const ROUTE = "/api/v1/use-case-org-settings";

describe("/api/v1/use-case-org-settings", () => {
  beforeEach(() => jest.clearAllMocks());

  it("answers 401 without a token", async () => {
    expect((await request(app).get(ROUTE)).status).toBe(401);
    expect((await request(app).put(ROUTE).send({ default_geography: 2 })).status).toBe(401);
    expect(upsertUseCaseOrgSettings).not.toHaveBeenCalled();
  });

  it("lets every member read the defaults", async () => {
    const res = await request(app)
      .get(ROUTE)
      .set("Authorization", "Bearer t")
      .set("x-role", "Auditor");
    expect(res.status).toBe(200);
    expect(getUseCaseOrgSettings).toHaveBeenCalledWith(42);
  });

  it.each(["Editor", "Reviewer", "Auditor"])(
    "answers 403 when an %s changes them",
    async (role) => {
      const res = await request(app)
        .put(ROUTE)
        .set("Authorization", "Bearer t")
        .set("x-role", role)
        .send({ default_geography: 2 });
      expect(res.status).toBe(403);
      expect(upsertUseCaseOrgSettings).not.toHaveBeenCalled();
    },
  );

  it("lets an Admin change them, only in the organization of the token", async () => {
    const res = await request(app)
      .put(ROUTE)
      .set("Authorization", "Bearer t")
      .set("x-org", "7")
      // A body cannot point the write at another organization.
      .send({ default_geography: 2, organization_id: 99 });
    expect(res.status).toBe(200);
    expect(upsertUseCaseOrgSettings).toHaveBeenCalledWith(7, { default_geography: 2 });
    expect(res.body.data.organization_id).toBe(7);
  });

  // Issue #5314: this route used authorize(["Admin"]), which refused every
  // custom role. It now follows the organization.admin permission.
  it("lets a custom role with organization.admin change them", async () => {
    invalidateRolePermissionsCache(42, CUSTOM_ROLE.id);
    mockCustomRows = [{ permission_key: "organization.admin", allowed: true }];
    const res = await request(app)
      .put(ROUTE)
      .set("Authorization", "Bearer t")
      .set("x-role", CUSTOM_ROLE.name)
      .send({ default_geography: 2 });
    expect(res.status).toBe(200);
    expect(upsertUseCaseOrgSettings).toHaveBeenCalledWith(42, { default_geography: 2 });
  });

  it("refuses a custom role without organization.admin", async () => {
    invalidateRolePermissionsCache(42, CUSTOM_ROLE.id);
    mockCustomRows = [{ permission_key: "useCase.edit", allowed: true }];
    const res = await request(app)
      .put(ROUTE)
      .set("Authorization", "Bearer t")
      .set("x-role", CUSTOM_ROLE.name)
      .send({ default_geography: 2 });
    expect(res.status).toBe(403);
    expect(upsertUseCaseOrgSettings).not.toHaveBeenCalled();
  });
});
