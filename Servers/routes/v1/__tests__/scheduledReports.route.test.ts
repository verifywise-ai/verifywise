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
// authorize("scheduledReport.edit") runs the real permission matrix for the
// built-in roles.
jest.mock("../../../utils/roleMap", () => ({
  getRoleByName: jest.fn(async (_orgId: number | null, name: string) =>
    ["Admin", "Editor", "Reviewer", "Auditor"].includes(name)
      ? { id: 1, name, organizationId: null }
      : undefined,
  ),
}));
jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn(async () => []) },
}));
// Template 7, its version 30 and schedule 3 exist in organization 42 only.
// The schedule validation runs for real against these.
jest.mock("../../../utils/reportTemplate.utils", () => ({
  getTemplateByIdQuery: jest.fn(async (id: number, org: number) =>
    id === 7 && org === 42 ? { id: 7 } : null,
  ),
  getVersionByIdQuery: jest.fn(async (id: number, org: number) =>
    id === 30 && org === 42 ? { id: 30, template_id: 7, parameters_config: {} } : null,
  ),
}));
jest.mock("../../../utils/scheduledReport.utils", () => ({
  createScheduledReportQuery: jest.fn(async (_input: any, org: number) => ({
    id: 3,
    organization_id: org,
  })),
  listScheduledReportsQuery: jest.fn(async () => []),
  getScheduledReportQuery: jest.fn(async (id: number, org: number) =>
    id === 3 && org === 42
      ? {
          id: 3,
          scope: "organization",
          project_id: null,
          template_version_id: 30,
          report_parameters: { isFinal: false },
          parameters_config: { kind: "osfi_e23", fields: [{ key: "isFinal", type: "boolean" }] },
        }
      : null,
  ),
  updateScheduledReportQuery: jest.fn(async (id: number, org: number, input: any) =>
    id === 3 && org === 42 ? { id: 3, ...input } : null,
  ),
  setActiveQuery: jest.fn(),
  softDeleteQuery: jest.fn(),
  UPDATABLE_FIELDS: jest.requireActual("../../../utils/scheduledReport.utils").UPDATABLE_FIELDS,
}));
jest.mock("../../../services/reporting/reportRunOrchestrator", () => ({
  runScheduledReport: jest.fn(),
}));
jest.mock("../../../services/reporting/reportAuthorization", () => ({
  assertReportScopeAllowed: jest.fn(async () => []),
}));
jest.mock("../../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));

import routes from "../scheduledReports.route";
import {
  createScheduledReportQuery,
  getScheduledReportQuery,
  updateScheduledReportQuery,
} from "../../../utils/scheduledReport.utils";

const app = express();
app.use(express.json());
app.use("/api/v1/scheduled-reports", routes);

const BASE = "/api/v1/scheduled-reports";
const auth = { Authorization: "Bearer t" };
const createBody = {
  templateId: 7,
  templateVersionId: 30,
  name: "Monthly risks",
  scope: "organization",
  sectionsConfig: { sections: [{ reportSectionKey: "projectRisks", defaultEnabled: true }] },
  aiBlocksConfig: {},
  format: "pdf",
  scheduleConfig: { frequency: "monthly", dayOfMonth: 1, hour: 9, minute: 0, timezone: "UTC" },
  deliveryConfig: { saveToStorage: true },
};

describe("/api/v1/scheduled-reports", () => {
  beforeEach(() => jest.clearAllMocks());

  it("answers 401 without a token", async () => {
    expect((await request(app).post(BASE).send(createBody)).status).toBe(401);
    expect((await request(app).patch(`${BASE}/3`).send({ name: "Renamed" })).status).toBe(401);
    expect((await request(app).get(`${BASE}/3`)).status).toBe(401);
    expect(createScheduledReportQuery).not.toHaveBeenCalled();
    expect(getScheduledReportQuery).not.toHaveBeenCalled();
    expect(updateScheduledReportQuery).not.toHaveBeenCalled();
  });

  it.each(["Reviewer", "Auditor"])("answers 403 when an %s schedules", async (role) => {
    const created = await request(app).post(BASE).set(auth).set("x-role", role).send(createBody);
    const patched = await request(app)
      .patch(`${BASE}/3`)
      .set(auth)
      .set("x-role", role)
      .send({ name: "Renamed" });
    expect(created.status).toBe(403);
    expect(patched.status).toBe(403);
    expect(createScheduledReportQuery).not.toHaveBeenCalled();
    expect(updateScheduledReportQuery).not.toHaveBeenCalled();
  });

  it("creates a schedule in the token's organization", async () => {
    const res = await request(app)
      .post(BASE)
      .set(auth)
      .set("x-role", "Editor")
      .send({ ...createBody, organization_id: 99 });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ id: 3, organization_id: 42 });
    const [, org, user] = (createScheduledReportQuery as jest.Mock).mock.calls[0];
    expect([org, user]).toEqual([42, 9]);
  });

  it("refuses a schedule of another organization's template", async () => {
    const res = await request(app).post(BASE).set(auth).set("x-org", "7").send(createBody);
    expect(res.status).toBe(400);
    expect(res.body.data.errors).toContain(
      "templateId does not exist or is not accessible to this organization",
    );
    expect(createScheduledReportQuery).not.toHaveBeenCalled();
  });

  it("updates a schedule in the token's organization", async () => {
    const res = await request(app).patch(`${BASE}/3`).set(auth).send({ name: "Renamed" });
    expect(res.status).toBe(200);
    expect(updateScheduledReportQuery).toHaveBeenCalledWith(3, 42, { name: "Renamed" });
  });

  it("answers 404 for another organization's schedule", async () => {
    const res = await request(app)
      .patch(`${BASE}/3`)
      .set(auth)
      .set("x-org", "7")
      .send({ name: "Renamed" });
    expect(res.status).toBe(404);
    // The schedule is looked up as the caller sees it, so nothing is written.
    expect(updateScheduledReportQuery).not.toHaveBeenCalled();
  });

  // A schedule the caller may not read (the query returns null for it) must
  // look exactly like a missing one on a write, so ids cannot be probed.
  it("answers 404 when the caller may not read the schedule they edit", async () => {
    (getScheduledReportQuery as jest.Mock).mockResolvedValueOnce(null);
    const res = await request(app)
      .patch(`${BASE}/3`)
      .set(auth)
      .set("x-role", "Editor")
      .send({ name: "Renamed" });
    expect(res.status).toBe(404);
    expect(getScheduledReportQuery).toHaveBeenCalledWith(3, 42, { userId: 9, role: "Editor" });
    expect(updateScheduledReportQuery).not.toHaveBeenCalled();
  });

  it("reads a schedule with its version's parameters_config", async () => {
    // Any signed-in role may ask; which schedules it sees is the query's
    // project-visibility rule, given the viewer from the token.
    const res = await request(app).get(`${BASE}/3`).set(auth).set("x-role", "Auditor");
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: 3,
      report_parameters: { isFinal: false },
      parameters_config: { kind: "osfi_e23", fields: [{ key: "isFinal", type: "boolean" }] },
    });
    expect(getScheduledReportQuery).toHaveBeenCalledWith(3, 42, { userId: 9, role: "Auditor" });
  });

  it("answers 404 when reading another organization's schedule", async () => {
    const res = await request(app).get(`${BASE}/3`).set(auth).set("x-org", "7");
    expect(res.status).toBe(404);
    expect(res.body.data).toBe("not found");
    expect(getScheduledReportQuery).toHaveBeenCalledWith(3, 7, { userId: 9, role: "Admin" });
  });

  // The query returns null for a schedule the viewer may not read, which the
  // endpoint must report exactly like a missing one.
  it("answers 404 when the viewer may not read the schedule", async () => {
    (getScheduledReportQuery as jest.Mock).mockResolvedValueOnce(null);
    const res = await request(app).get(`${BASE}/3`).set(auth).set("x-role", "Editor");
    expect(res.status).toBe(404);
    expect(res.body.data).toBe("not found");
  });

  it("answers 404 for a non-integer id without querying", async () => {
    const res = await request(app).get(`${BASE}/abc`).set(auth);
    expect(res.status).toBe(404);
    expect(getScheduledReportQuery).not.toHaveBeenCalled();
  });
});
