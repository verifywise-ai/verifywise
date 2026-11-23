/**
 * Parity for the frozen /api/reporting/scheduled-reports router (ADR 0001):
 * reportParameters and the quarterly frequency are v1 contracts
 * (/api/v1/scheduled-reports). The legacy create and update drop the answers
 * and refuse quarterly, and a pre-E-23 body behaves as before.
 */
import request from "supertest";
import express from "express";

jest.mock("../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ message: "Unauthorized" });
    req.userId = 9;
    req.organizationId = 42;
    req.role = req.headers["x-role"] ?? "Admin";
    req.t = (key: string) => key;
    next();
  },
}));
jest.mock("../../utils/roleMap", () => ({
  getRoleByName: jest.fn(async (_orgId: number | null, name: string) =>
    ["Admin", "Editor", "Reviewer", "Auditor"].includes(name)
      ? { id: 1, name, organizationId: null }
      : undefined,
  ),
}));
jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(async () => []) },
}));
// Template 7 and its general version 30 exist in organization 42.
jest.mock("../../utils/reportTemplate.utils", () => ({
  getTemplateByIdQuery: jest.fn(async (id: number) => (id === 7 ? { id: 7 } : null)),
  getVersionByIdQuery: jest.fn(async (id: number) =>
    id === 30 ? { id: 30, template_id: 7, parameters_config: {} } : null,
  ),
}));
jest.mock("../../utils/scheduledReport.utils", () => ({
  createScheduledReportQuery: jest.fn(async () => ({ id: 3, organization_id: 42 })),
  listScheduledReportsQuery: jest.fn(async () => []),
  getScheduledReportQuery: jest.fn(async (id: number) =>
    id === 3
      ? {
          id: 3,
          scope: "organization",
          project_id: null,
          template_version_id: 30,
          sections_config: { sections: [{ reportSectionKey: "projectRisks" }] },
          report_parameters: {},
        }
      : null,
  ),
  updateScheduledReportQuery: jest.fn(async (id: number, _org: number, input: any) =>
    id === 3 ? { id: 3, ...input } : null,
  ),
  setActiveQuery: jest.fn(),
  softDeleteQuery: jest.fn(),
  UPDATABLE_FIELDS: jest.requireActual("../../utils/scheduledReport.utils").UPDATABLE_FIELDS,
}));
jest.mock("../../services/reporting/reportRunOrchestrator", () => ({
  runScheduledReport: jest.fn(),
}));
jest.mock("../../services/reporting/reportAuthorization", () => ({
  assertReportScopeAllowed: jest.fn(async () => []),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));

import routes from "../scheduledReport.route";
import {
  createScheduledReportQuery,
  updateScheduledReportQuery,
} from "../../utils/scheduledReport.utils";

const app = express();
app.use(express.json());
app.use("/api/reporting/scheduled-reports", routes);

const BASE = "/api/reporting/scheduled-reports";
const auth = { Authorization: "Bearer t" };
const QUARTERLY_REFUSAL =
  "quarterly schedules are created and changed through /api/v1/scheduled-reports";

// A body as the legacy route took it before the E-23 report.
const preE23Body = {
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
const quarterly = { frequency: "quarterly", anchorMonth: 1, dayOfMonth: 15, hour: 9, minute: 0 };

describe("legacy /api/reporting/scheduled-reports contract", () => {
  beforeEach(() => jest.clearAllMocks());

  it("authenticates and authorizes before refusing quarterly", async () => {
    const body = { ...preE23Body, scheduleConfig: quarterly };
    expect((await request(app).post(BASE).send(body)).status).toBe(401);
    expect(
      (await request(app).post(BASE).set(auth).set("x-role", "Auditor").send(body)).status,
    ).toBe(403);
  });

  it("creates a schedule from a pre-E-23 body exactly as before", async () => {
    const res = await request(app).post(BASE).set(auth).send(preE23Body);
    expect(res.status).toBe(201);
    const [input, org, user] = (createScheduledReportQuery as jest.Mock).mock.calls[0];
    expect([org, user]).toEqual([42, 9]);
    expect(input).toEqual({ ...preE23Body, reportParameters: {} });
  });

  it("drops reportParameters on create", async () => {
    const res = await request(app)
      .post(BASE)
      .set(auth)
      .send({ ...preE23Body, reportParameters: { audience: "osfi" } });
    expect(res.status).toBe(201);
    expect((createScheduledReportQuery as jest.Mock).mock.calls[0][0]).toEqual({
      ...preE23Body,
      reportParameters: {},
    });
  });

  it("refuses a quarterly schedule on create, pointing at v1", async () => {
    const res = await request(app)
      .post(BASE)
      .set(auth)
      .send({ ...preE23Body, scheduleConfig: quarterly });
    expect(res.status).toBe(400);
    expect(res.body.data.errors).toEqual([QUARTERLY_REFUSAL]);
    expect(createScheduledReportQuery).not.toHaveBeenCalled();
  });

  it("refuses a change to quarterly on update", async () => {
    const res = await request(app).patch(`${BASE}/3`).set(auth).send({ scheduleConfig: quarterly });
    expect(res.status).toBe(400);
    expect(res.body.data.errors).toEqual([QUARTERLY_REFUSAL]);
    expect(updateScheduledReportQuery).not.toHaveBeenCalled();
  });

  it("updates a schedule from a pre-E-23 body exactly as before", async () => {
    const res = await request(app)
      .patch(`${BASE}/3`)
      .set(auth)
      .send({ name: "Renamed", scheduleConfig: preE23Body.scheduleConfig });
    expect(res.status).toBe(200);
    expect(updateScheduledReportQuery).toHaveBeenCalledWith(3, 42, {
      name: "Renamed",
      scheduleConfig: preE23Body.scheduleConfig,
    });
  });

  it("drops reportParameters on update", async () => {
    const res = await request(app)
      .patch(`${BASE}/3`)
      .set(auth)
      .send({ name: "Renamed", reportParameters: { audience: "osfi" } });
    expect(res.status).toBe(200);
    expect(updateScheduledReportQuery).toHaveBeenCalledWith(3, 42, { name: "Renamed" });
  });

  it("treats an update carrying only reportParameters as having no updatable fields", async () => {
    const res = await request(app)
      .patch(`${BASE}/3`)
      .set(auth)
      .send({ reportParameters: { audience: "osfi" } });
    expect(res.status).toBe(400);
    expect(res.body.data.errors).toEqual(["no updatable fields supplied"]);
    expect(updateScheduledReportQuery).not.toHaveBeenCalled();
  });

  it("still refuses a kind-limited section outside a kind template", async () => {
    const res = await request(app)
      .post(BASE)
      .set(auth)
      .send({
        ...preE23Body,
        sectionsConfig: { sections: [{ reportSectionKey: "mrmFleet", defaultEnabled: true }] },
      });
    expect(res.status).toBe(400);
    expect(createScheduledReportQuery).not.toHaveBeenCalled();
  });
});
