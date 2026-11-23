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
// Template 7 and its version 30 exist in organization 42 only; template 8 is a
// system template every organization can read (and copy) but not change. The
// writes honour the same tenant guards as the real queries: an update or a new
// version of a template outside the caller's organization matches nothing.
jest.mock("../../../utils/reportTemplate.utils", () => {
  const templates: Record<number, any> = {
    7: {
      id: 7,
      organization_id: 42,
      name: "Board pack",
      description: "Quarterly board pack",
      category: "governance",
      default_scope: "organization",
      supported_scopes: ["organization"],
      recommended_frequency: "quarterly",
      is_system_template: false,
      llm_key_id: null,
    },
    8: {
      id: 8,
      organization_id: null,
      name: "OSFI E-23 report",
      description: "Model risk completeness",
      category: "compliance",
      default_scope: "organization",
      supported_scopes: ["organization"],
      recommended_frequency: "quarterly",
      is_system_template: true,
      llm_key_id: null,
    },
  };
  const visible = (id: number, org: number) =>
    templates[id] &&
    (templates[id].organization_id === null || templates[id].organization_id === org)
      ? templates[id]
      : null;
  const owned = (id: number, org: number) =>
    templates[id] && templates[id].organization_id === org ? templates[id] : null;
  const actual = jest.requireActual("../../../utils/reportTemplate.utils");
  return {
    // The copy-name choice runs for real against the slugs the org holds.
    slugify: actual.slugify,
    copyName: actual.copyName,
    freeCopyName: actual.freeCopyName,
    getOrganizationTemplateSlugsQuery: jest.fn(async () => new Set<string>()),
    getTemplateByIdQuery: jest.fn(async (id: number, org: number) => visible(id, org)),
    getVersionByIdQuery: jest.fn(async (id: number, org: number) =>
      id === 30 && org === 42 ? { id: 30, template_id: 7, parameters_config: {} } : null,
    ),
    getLatestVersionQuery: jest.fn(async (templateId: number, org: number) =>
      visible(templateId, org)
        ? {
            id: templateId * 10,
            template_id: templateId,
            sections_config: { sections: [{ reportSectionKey: "mrmFleet", defaultEnabled: true }] },
            ai_blocks_config: { blocks: [] },
            framework_config: { frameworkIds: ["native:2"] },
            parameters_config: { kind: "osfi_e23" },
            format_config: { theme: "dark" },
            branding_config: { logo: "seal.png" },
            schedule_defaults: { frequency: "quarterly" },
            delivery_defaults: { saveToStorage: true },
          }
        : null,
    ),
    createTemplateQuery: jest.fn(async (input: any, org: number) => ({
      id: 100,
      organization_id: org,
      name: input.name,
      description: input.description ?? null,
      category: input.category,
      default_scope: input.default_scope,
      supported_scopes: input.supported_scopes,
      recommended_frequency: input.recommended_frequency ?? null,
      is_system_template: false,
    })),
    updateTemplateQuery: jest.fn(async (id: number, org: number, input: any) =>
      owned(id, org) && !owned(id, org).is_system_template ? { ...owned(id, org), ...input } : null,
    ),
    createTemplateVersionQuery: jest.fn(async (templateId: number, org: number, config: any) =>
      templateId === 100 || (owned(templateId, org) && !owned(templateId, org).is_system_template)
        ? {
            id: 500,
            template_id: templateId,
            sections_config: config.sections_config,
            ai_blocks_config: config.ai_blocks_config,
            framework_config: config.framework_config,
            parameters_config: config.parameters_config ?? {},
          }
        : undefined,
    ),
  };
});
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
import {
  createTemplateQuery,
  createTemplateVersionQuery,
  updateTemplateQuery,
} from "../../../utils/reportTemplate.utils";
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

  describe("template writes", () => {
    const createBody = {
      name: "E-23 copy",
      category: "compliance",
      default_scope: "organization",
      sections_config: { sections: [{ reportSectionKey: "mrmFleet", defaultEnabled: true }] },
      parameters_config: { kind: "osfi_e23" },
    };

    it("answers 401 without a token", async () => {
      expect((await request(app).post(BASE).send(createBody)).status).toBe(401);
      expect((await request(app).patch(`${BASE}/7`).send({ name: "x" })).status).toBe(401);
      expect((await request(app).post(`${BASE}/8/duplicate`)).status).toBe(401);
      expect(createTemplateQuery).not.toHaveBeenCalled();
      expect(updateTemplateQuery).not.toHaveBeenCalled();
    });

    it.each(["Reviewer", "Auditor"])("answers 403 when an %s writes", async (role) => {
      const create = await request(app).post(BASE).set(auth).set("x-role", role).send(createBody);
      const update = await request(app)
        .patch(`${BASE}/7`)
        .set(auth)
        .set("x-role", role)
        .send({ name: "x" });
      const copy = await request(app).post(`${BASE}/8/duplicate`).set(auth).set("x-role", role);
      expect([create.status, update.status, copy.status]).toEqual([403, 403, 403]);
      expect(createTemplateQuery).not.toHaveBeenCalled();
      expect(updateTemplateQuery).not.toHaveBeenCalled();
    });

    it("creates a template that keeps its parameters_config", async () => {
      const res = await request(app).post(BASE).set(auth).set("x-role", "Editor").send(createBody);
      expect(res.status).toBe(201);
      expect(res.body.data.latestVersion.parameters_config).toEqual({ kind: "osfi_e23" });
      const [templateId, org, config] = (createTemplateVersionQuery as jest.Mock).mock.calls[0];
      expect([templateId, org]).toEqual([100, 42]);
      expect(config.parameters_config).toEqual({ kind: "osfi_e23" });
    });

    it("refuses an unknown report kind on create", async () => {
      const res = await request(app)
        .post(BASE)
        .set(auth)
        .send({ ...createBody, parameters_config: { kind: "made_up" } });
      expect(res.status).toBe(400);
      expect(createTemplateQuery).not.toHaveBeenCalled();
    });

    it("updates a template's parameters_config with a new version", async () => {
      const res = await request(app)
        .patch(`${BASE}/7`)
        .set(auth)
        .send({ parameters_config: { kind: "osfi_e23" } });
      expect(res.status).toBe(200);
      expect(res.body.data.latestVersion.parameters_config).toEqual({ kind: "osfi_e23" });
      expect((createTemplateVersionQuery as jest.Mock).mock.calls[0][2].parameters_config).toEqual({
        kind: "osfi_e23",
      });
    });

    // framework_config is a version field: alone it appends a version, and a
    // config PATCH without it sends nothing, so the version query inherits the
    // previous selection instead of widening to every framework.
    it("appends a version for a framework selection sent alone", async () => {
      const res = await request(app)
        .patch(`${BASE}/7`)
        .set(auth)
        .send({ framework_config: { frameworkIds: ["native:3"] } });
      expect(res.status).toBe(200);
      expect((createTemplateVersionQuery as jest.Mock).mock.calls[0][2]).toEqual({
        framework_config: { frameworkIds: ["native:3"] },
      });
    });

    it("leaves the framework selection out of a sections-only update", async () => {
      const res = await request(app)
        .patch(`${BASE}/7`)
        .set(auth)
        .send({ sections_config: { sections: [{ reportSectionKey: "projectRisks" }] } });
      expect(res.status).toBe(200);
      expect((createTemplateVersionQuery as jest.Mock).mock.calls[0][2]).not.toHaveProperty(
        "framework_config",
      );
    });

    it("answers 404 when another organization's template is updated", async () => {
      const res = await request(app)
        .patch(`${BASE}/7`)
        .set(auth)
        .set("x-org", "43")
        .send({ name: "Hijacked", parameters_config: { kind: "osfi_e23" } });
      expect(res.status).toBe(404);
    });

    it("duplicates a system template into the caller's organization", async () => {
      const res = await request(app)
        .post(`${BASE}/8/duplicate`)
        .set(auth)
        .set("x-role", "Editor")
        // A body cannot rename the copy or move it to another organization.
        .send({ name: "Other", organization_id: 99 });
      expect(res.status).toBe(201);
      const [input, org] = (createTemplateQuery as jest.Mock).mock.calls[0];
      expect(org).toBe(42);
      expect(input).toMatchObject({
        name: "OSFI E-23 report (copy)",
        description: "Model risk completeness",
        category: "compliance",
        default_scope: "organization",
        supported_scopes: ["organization"],
        recommended_frequency: "quarterly",
      });
      const [templateId, versionOrg, config] = (createTemplateVersionQuery as jest.Mock).mock
        .calls[0];
      expect([templateId, versionOrg]).toEqual([100, 42]);
      expect(config).toMatchObject({
        sections_config: { sections: [{ reportSectionKey: "mrmFleet", defaultEnabled: true }] },
        ai_blocks_config: { blocks: [] },
        framework_config: { frameworkIds: ["native:2"] },
        parameters_config: { kind: "osfi_e23" },
        format_config: { theme: "dark" },
        branding_config: { logo: "seal.png" },
        schedule_defaults: { frequency: "quarterly" },
        delivery_defaults: { saveToStorage: true },
      });
      expect(res.body.data).toMatchObject({
        id: 100,
        organization_id: 42,
        name: "OSFI E-23 report (copy)",
        latestVersion: { parameters_config: { kind: "osfi_e23" } },
      });
    });

    it("duplicates the organization's own template", async () => {
      const res = await request(app).post(`${BASE}/7/duplicate`).set(auth);
      expect(res.status).toBe(201);
      expect((createTemplateQuery as jest.Mock).mock.calls[0][0].name).toBe("Board pack (copy)");
    });

    it("answers 404 when another organization's template is duplicated", async () => {
      const res = await request(app).post(`${BASE}/7/duplicate`).set(auth).set("x-org", "43");
      expect(res.status).toBe(404);
      expect(createTemplateQuery).not.toHaveBeenCalled();
    });

    it("keeps a long name within the column and its slug when copying", async () => {
      const { getTemplateByIdQuery } = jest.requireMock("../../../utils/reportTemplate.utils");
      (getTemplateByIdQuery as jest.Mock).mockResolvedValueOnce({
        id: 7,
        organization_id: 42,
        name: "x".repeat(255),
        category: "governance",
        default_scope: "project",
      });
      const res = await request(app).post(`${BASE}/7/duplicate`).set(auth);
      expect(res.status).toBe(201);
      const name = (createTemplateQuery as jest.Mock).mock.calls[0][0].name;
      expect(name.length).toBeLessThanOrEqual(255);
      expect(name.endsWith("x (copy)")).toBe(true);
    });

    // uq_report_templates_org_slug covers archived rows, so a copy whose slug
    // an earlier (even deleted) copy holds would 409 on every click.
    it("numbers the copy when earlier copies hold the name", async () => {
      const { getOrganizationTemplateSlugsQuery } = jest.requireMock(
        "../../../utils/reportTemplate.utils",
      );
      (getOrganizationTemplateSlugsQuery as jest.Mock).mockResolvedValueOnce(
        new Set(["board-pack", "board-pack-copy", "board-pack-copy-2"]),
      );
      const res = await request(app).post(`${BASE}/7/duplicate`).set(auth);
      expect(res.status).toBe(201);
      expect((createTemplateQuery as jest.Mock).mock.calls[0][0].name).toBe("Board pack (copy 3)");
      expect(getOrganizationTemplateSlugsQuery).toHaveBeenCalledWith(42);
    });

    it("retries with a fresh name when a concurrent copy takes the slug", async () => {
      const { getOrganizationTemplateSlugsQuery } = jest.requireMock(
        "../../../utils/reportTemplate.utils",
      );
      (getOrganizationTemplateSlugsQuery as jest.Mock)
        .mockResolvedValueOnce(new Set())
        .mockResolvedValueOnce(new Set(["board-pack-copy"]));
      (createTemplateQuery as jest.Mock).mockRejectedValueOnce(
        Object.assign(new Error("duplicate key"), {
          parent: { code: "23505", constraint: "uq_report_templates_org_slug" },
        }),
      );
      const res = await request(app).post(`${BASE}/7/duplicate`).set(auth);
      expect(res.status).toBe(201);
      const names = (createTemplateQuery as jest.Mock).mock.calls.map(([input]) => input.name);
      expect(names).toEqual(["Board pack (copy)", "Board pack (copy 2)"]);
    });

    it("gives up after a few slug races", async () => {
      const race = Object.assign(new Error("duplicate key"), {
        parent: { code: "23505", constraint: "uq_report_templates_org_slug" },
      });
      (createTemplateQuery as jest.Mock)
        .mockRejectedValueOnce(race)
        .mockRejectedValueOnce(race)
        .mockRejectedValueOnce(race);
      const res = await request(app).post(`${BASE}/7/duplicate`).set(auth);
      expect(res.status).toBe(409);
      expect(createTemplateQuery).toHaveBeenCalledTimes(3);
    });

    it("answers 404 for an archived template, copying nothing", async () => {
      const { getTemplateByIdQuery } = jest.requireMock("../../../utils/reportTemplate.utils");
      (getTemplateByIdQuery as jest.Mock).mockResolvedValueOnce({
        id: 7,
        organization_id: 42,
        name: "Board pack",
        category: "governance",
        default_scope: "project",
        is_active: false,
      });
      const res = await request(app).post(`${BASE}/7/duplicate`).set(auth);
      expect(res.status).toBe(404);
      expect(createTemplateQuery).not.toHaveBeenCalled();
    });
  });
});
