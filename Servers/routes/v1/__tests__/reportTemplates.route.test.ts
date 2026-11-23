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
// authorize("reportTemplate.edit") runs the real permission matrix for the
// built-in roles.
jest.mock("../../../utils/roleMap", () => ({
  getRoleByName: jest.fn(async (_orgId: number | null, name: string) =>
    ["Admin", "Editor", "Reviewer", "Auditor"].includes(name)
      ? { id: 1, name, organizationId: null }
      : undefined,
  ),
}));
jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn(async () => []), transaction: jest.fn(async (cb: any) => cb("TX")) },
}));
// Template 7 and its version 30 exist in organization 42 only.
jest.mock("../../../utils/reportTemplate.utils", () => ({
  getTemplateByIdQuery: jest.fn(async (id: number, org: number) =>
    id === 7 && org === 42 ? { id: 7, name: "Board pack", llm_key_id: null } : null,
  ),
  getVersionByIdQuery: jest.fn(async (id: number, org: number) =>
    id === 30 && org === 42 ? { id: 30, template_id: 7, parameters_config: {} } : null,
  ),
}));
jest.mock("../../../utils/reportRun.utils", () => ({
  getLastParametersQuery: jest.fn(async () => ({ parameters: { audience: "osfi" } })),
}));
jest.mock("../../../services/reporting/reportRunOrchestrator", () => ({
  runScheduledReport: jest.fn(async () => ({ runId: 5, status: "success" })),
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

import routes from "../reportTemplates.route";
import { getLastParametersQuery } from "../../../utils/reportRun.utils";
import { runScheduledReport } from "../../../services/reporting/reportRunOrchestrator";

const app = express();
app.use(express.json());
app.use("/api/v1/report-templates", routes);

const BASE = "/api/v1/report-templates";
const auth = { Authorization: "Bearer t" };
const runBody = {
  templateVersionId: 30,
  scope: "organization",
  sectionsConfig: { sections: [{ reportSectionKey: "projectRisks", defaultEnabled: true }] },
};

describe("/api/v1/report-templates", () => {
  beforeEach(() => jest.clearAllMocks());

  it("answers 401 without a token", async () => {
    expect((await request(app).post(`${BASE}/7/run`).send(runBody)).status).toBe(401);
    expect((await request(app).get(`${BASE}/7/last-parameters`)).status).toBe(401);
    expect(runScheduledReport).not.toHaveBeenCalled();
    expect(getLastParametersQuery).not.toHaveBeenCalled();
  });

  it.each(["Reviewer", "Auditor"])("answers 403 when an %s runs or prefills", async (role) => {
    const run = await request(app)
      .post(`${BASE}/7/run`)
      .set(auth)
      .set("x-role", role)
      .send(runBody);
    const last = await request(app).get(`${BASE}/7/last-parameters`).set(auth).set("x-role", role);
    expect(run.status).toBe(403);
    expect(last.status).toBe(403);
    expect(runScheduledReport).not.toHaveBeenCalled();
    expect(getLastParametersQuery).not.toHaveBeenCalled();
  });

  it("runs a template now in the token's organization", async () => {
    const res = await request(app)
      .post(`${BASE}/7/run`)
      .set(auth)
      .set("x-role", "Editor")
      // A body cannot point the run at another organization.
      .send({ ...runBody, organization_id: 99 });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ started: true, runId: 5, status: "success" });
    expect((runScheduledReport as jest.Mock).mock.calls[0][0]).toMatchObject({
      organization_id: 42,
      template_id: 7,
      template_version_id: 30,
    });
  });

  it("answers 404 for another organization's template, running nothing", async () => {
    const res = await request(app).post(`${BASE}/7/run`).set(auth).set("x-org", "7").send(runBody);
    expect(res.status).toBe(404);
    expect(runScheduledReport).not.toHaveBeenCalled();
  });

  it("returns the last parameters of a template in the token's organization", async () => {
    const res = await request(app).get(`${BASE}/7/last-parameters`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ parameters: { audience: "osfi" } });
    expect(getLastParametersQuery).toHaveBeenCalledWith(7, 42, { userId: 9, role: "Admin" });
  });

  it("answers 404 for another organization's last parameters, reading no run", async () => {
    const res = await request(app).get(`${BASE}/7/last-parameters`).set(auth).set("x-org", "7");
    expect(res.status).toBe(404);
    expect(getLastParametersQuery).not.toHaveBeenCalled();
  });
});
