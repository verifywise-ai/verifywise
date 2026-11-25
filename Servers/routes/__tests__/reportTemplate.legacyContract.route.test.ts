/**
 * Parity for the frozen /api/reporting/templates router (ADR 0001): the
 * OSFI E-23 inputs (parameters_config, reportParameters) are v1 contracts, and
 * the legacy create, update and run routes behave as they did before them.
 *
 * The controllers and the insert utils run for real; only the database is
 * mocked, so the assertions read what would reach the SQL.
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
// Every INSERT returns one row; the call records what reached the SQL.
jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(async () => [{ id: 100, template_id: 7 }]),
    transaction: jest.fn(async (cb: any) => cb("TX")),
  },
}));
// The inserts run for real; the reads and the metadata update are stubbed.
// Version 30 belongs to a general template, version 31 to an E-23 one.
jest.mock("../../utils/reportTemplate.utils", () => {
  const { E23_KIND, E23_PARAMETER_FIELDS } = jest.requireActual(
    "../../services/reporting/e23/e23Parameters",
  );
  return {
    ...jest.requireActual("../../utils/reportTemplate.utils"),
    getTemplateByIdQuery: jest.fn(async (id: number) =>
      id === 7 ? { id: 7, name: "Board pack", llm_key_id: null } : null,
    ),
    getVersionByIdQuery: jest.fn(async (id: number) => {
      if (id === 30) return { id: 30, template_id: 7, parameters_config: {} };
      if (id === 31) {
        return {
          id: 31,
          template_id: 7,
          parameters_config: { kind: E23_KIND, fields: E23_PARAMETER_FIELDS },
        };
      }
      return null;
    }),
    updateTemplateQuery: jest.fn(async (id: number, _org: number, input: any) => ({
      id,
      ...input,
    })),
  };
});
jest.mock("../../services/reporting/reportRunOrchestrator", () => ({
  runScheduledReport: jest.fn(async () => ({ runId: 5, status: "success" })),
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

import routes from "../reportTemplate.route";
import { sequelize } from "../../database/db";
import { runScheduledReport } from "../../services/reporting/reportRunOrchestrator";

const app = express();
app.use(express.json());
app.use("/api/reporting/templates", routes);

const BASE = "/api/reporting/templates";
const auth = { Authorization: "Bearer t" };

const queryMock = sequelize.query as unknown as jest.Mock;
const versionInserts = () =>
  queryMock.mock.calls.filter(([sql]) =>
    String(sql).includes("INSERT INTO report_template_versions"),
  );

// A body as the legacy route took it before the E-23 report.
const preE23Create = {
  name: "Board pack",
  category: "governance",
  default_scope: "organization",
  sections_config: { sections: [{ reportSectionKey: "projectRisks", defaultEnabled: true }] },
};
const generalRun = {
  templateVersionId: 30,
  scope: "organization",
  sectionsConfig: { sections: [{ reportSectionKey: "projectRisks", defaultEnabled: true }] },
};

describe("legacy /api/reporting/templates contract", () => {
  beforeEach(() => jest.clearAllMocks());

  it("still authenticates before the adapter", async () => {
    const res = await request(app)
      .post(BASE)
      .send({ ...preE23Create, parameters_config: { kind: "osfi_e23" } });
    expect(res.status).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("creates a template from a pre-E-23 body exactly as before", async () => {
    const res = await request(app).post(BASE).set(auth).send(preE23Create);
    expect(res.status).toBe(201);
    const [[, opts]] = versionInserts();
    // No kind: the version gets the column default through the COALESCE.
    expect(opts.replacements.parameters_config).toBeNull();
  });

  it("ignores parameters_config on create, writing what a pre-E-23 body writes", async () => {
    await request(app).post(BASE).set(auth).send(preE23Create);
    const without = queryMock.mock.calls.map(([sql, opts]) => [sql, opts.replacements]);
    jest.clearAllMocks();

    // Even a kind the server would refuse on v1 is ignored, as unknown fields were.
    const res = await request(app)
      .post(BASE)
      .set(auth)
      .send({ ...preE23Create, parameters_config: { kind: "made_up" } });
    expect(res.status).toBe(201);
    expect(queryMock.mock.calls.map(([sql, opts]) => [sql, opts.replacements])).toEqual(without);
  });

  it("keeps the stored kind when a legacy update edits the sections", async () => {
    const res = await request(app)
      .patch(`${BASE}/7`)
      .set(auth)
      .send({
        sections_config: preE23Create.sections_config,
        parameters_config: { kind: "made_up" },
      });
    expect(res.status).toBe(200);
    const [[sql, opts]] = versionInserts();
    // parameters_config is bound as NULL, so the INSERT falls back to the
    // previous version's value: the template keeps its kind.
    expect(opts.replacements.parameters_config).toBeNull();
    expect(sql).toContain("COALESCE(CAST(:parameters_config AS JSONB), prev.parameters_config,");
  });

  it("treats an update carrying only parameters_config as having no updatable fields", async () => {
    const res = await request(app)
      .patch(`${BASE}/7`)
      .set(auth)
      .send({ parameters_config: { kind: "osfi_e23" } });
    expect(res.status).toBe(400);
    expect(res.body.data).toBe("no updatable fields supplied");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("runs a general template from a pre-E-23 body exactly as before", async () => {
    const res = await request(app).post(`${BASE}/7/run`).set(auth).send(generalRun);
    expect(res.status).toBe(200);
    expect((runScheduledReport as jest.Mock).mock.calls[0][0].report_parameters).toEqual({});
  });

  it("drops reportParameters from a legacy run", async () => {
    const res = await request(app)
      .post(`${BASE}/7/run`)
      .set(auth)
      .send({ ...generalRun, reportParameters: { audience: "osfi" } });
    expect(res.status).toBe(200);
    expect((runScheduledReport as jest.Mock).mock.calls[0][0].report_parameters).toEqual({});
  });

  it("cannot run a kind template, whose answers are a v1 input", async () => {
    const res = await request(app)
      .post(`${BASE}/7/run`)
      .set(auth)
      .send({
        templateVersionId: 31,
        scope: "organization",
        sectionsConfig: { sections: [{ reportSectionKey: "mrmFleet", defaultEnabled: true }] },
        reportParameters: {
          periodStart: "2026-08-01",
          periodEnd: "2026-10-31",
          institutionName: "Northern Bank",
          accountableExecutiveName: "Ada Park",
          accountableExecutiveTitle: "Chief risk officer",
          preparedByName: "Sam Lee",
          preparedByTitle: "Model risk lead",
          audience: "osfi",
        },
      });
    expect(res.status).toBe(400);
    // The answers were dropped, so the required fields are missing.
    expect(res.body.data.errors).toContain("{label} is required");
    expect(runScheduledReport).not.toHaveBeenCalled();
  });

  it("still refuses a kind-limited section outside a kind template", async () => {
    const res = await request(app)
      .post(`${BASE}/7/run`)
      .set(auth)
      .send({
        ...generalRun,
        sectionsConfig: { sections: [{ reportSectionKey: "mrmFleet", defaultEnabled: true }] },
      });
    expect(res.status).toBe(400);
    expect(runScheduledReport).not.toHaveBeenCalled();
  });
});
