/**
 * The detectors compare tolerantly (rich text by its text, due dates within
 * a day), so a save judged "unchanged" can still carry other bytes. These
 * tests run the real middleware and detectors and, where the controller
 * passes the body straight on, the real update query: for a field class the
 * caller lacks, what gets written must be the stored value, not the request.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { BUILTIN_ROLE_PERMISSIONS } from "../../config/rolePermissions.config";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../utils/frameworkImpl.utils", () => ({ getImplByIdQuery: jest.fn() }));
jest.mock("../../extensions/framework-import/importedAssessment.service", () => ({
  getImplQuery: jest.fn(),
  parseLevel: (raw: unknown) => (raw === "l2" || raw === "l3" ? raw : null),
}));
jest.mock("../../utils/changeHistory.base.utils", () => ({
  ...(jest.requireActual("../../utils/changeHistory.base.utils") as object),
  recordUpdateChanges: jest.fn(),
}));
jest.mock("../../utils/rolePermissions.utils", () => ({
  requestHasPermission: jest.fn(async (req: any, key: string) => {
    const role: string = req.role;
    if (role.startsWith("Custom:")) {
      return role
        .slice("Custom:".length)
        .split(",")
        .map((k) => k.trim())
        .includes(key);
    }
    return BUILTIN_ROLE_PERMISSIONS[role]?.has(key as never) ?? false;
  }),
}));

import { sequelize } from "../../database/db";
import { requireFrameworkWriteAccess } from "../frameworkWriteAccess.middleware";
import {
  euAnswerChanges,
  euControlChanges,
  frameworkImplChanges,
  iso42001SubclauseChanges,
} from "../../utils/frameworkWriteAccess.utils";
import { getImplByIdQuery } from "../../utils/frameworkImpl.utils";
import { updateSubClauseQuery } from "../../utils/iso42001.utils";
import { updateControlEUByIdQuery, updateSubcontrolEUByIdQuery } from "../../utils/eu.utils";

const mockQuery = sequelize.query as unknown as jest.Mock<(...args: any[]) => Promise<unknown>>;
const transaction = {} as any;

/** Route sequelize.query by SQL text; SELECTs with a type get rows, others [rows, n]. */
const routeQueries = (routes: Array<[RegExp, unknown[]]>) =>
  mockQuery.mockImplementation(async (sql: string, options?: any) => {
    const rows = routes.find(([re]) => re.test(sql))?.[1] ?? [];
    return options?.type ? rows : [rows, rows.length];
  });

const runMiddleware = async (detector: any, role: string, params: any, body: any) => {
  const req: any = { role, organizationId: 1, params, body, t: (k: string) => k };
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  const next = jest.fn();
  await requireFrameworkWriteAccess(detector)(req, res, next);
  return { req, next, status: (res.status as jest.Mock).mock.calls[0]?.[0] };
};

const updateCall = () => {
  const call = mockQuery.mock.calls.find(([sql]) => /^\s*UPDATE/.test(String(sql)));
  return call ? { sql: String(call[0]), replacements: (call[1] as any).replacements } : null;
};

// ── ISO 42001 subclause: the update query skips absent fields ───────────────

const storedSubclause = {
  implementation_description: "<p>We review the model monthly.</p>",
  status: "In progress",
  owner: 3,
  reviewer: null,
  approver: 5,
  due_date: new Date("2026-03-10T00:00:00.000Z"),
  auditor_feedback: "<p>Looks fine.</p>",
};

const subclauseRoutes = (): Array<[RegExp, unknown[]]> => [
  [/FROM subclauses_iso__risks/, []],
  [/FROM subclauses_iso\b/, [storedSubclause]],
  [/^UPDATE subclauses_iso/, [{ id: 21 }]],
];

/** The drawer's save: same visible text, other HTML (a link), a day-shifted date. */
const tamperedSubclauseSave = () => ({
  implementation_description:
    '<p>We review the <a href="https://evil.example">model</a> monthly.</p>',
  status: " In progress ",
  owner: "3",
  reviewer: "",
  approver: "5",
  due_date: "2026-03-11",
  auditor_feedback: "<p>Checked: <strong>evidence attached</strong>.</p>",
  user_id: "7",
  project_id: "1",
  delete: "[]",
  risksMitigated: "[]",
  risksDelete: "[]",
});

const EDIT_FIELDS = ["implementation_description", "status", "owner", "reviewer", "approver"];

describe("restoring unchanged fields: ISO 42001 subclause", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    routeQueries(subclauseRoutes());
  });

  it("an Auditor's text-equal HTML and 1-day date shift pass, but are not written", async () => {
    const { req, next, status } = await runMiddleware(
      iso42001SubclauseChanges,
      "Auditor",
      { id: "21" },
      tamperedSubclauseSave(),
    );
    expect(status).toBeUndefined();
    expect(next).toHaveBeenCalled();

    for (const field of [...EDIT_FIELDS, "due_date"]) expect(req.body).not.toHaveProperty(field);
    // The Auditor holds framework.audit: its feedback is kept.
    expect(req.body.auditor_feedback).toBe("<p>Checked: <strong>evidence attached</strong>.</p>");

    mockQuery.mockClear();
    await updateSubClauseQuery(21, req.body, [], [], 1, transaction);
    const update = updateCall();
    expect(update).not.toBeNull();
    expect(update!.sql).toContain("auditor_feedback = :auditor_feedback");
    for (const field of [...EDIT_FIELDS, "due_date"]) {
      expect(update!.sql).not.toContain(`${field} =`);
      expect(update!.replacements).not.toHaveProperty(field);
    }
  });

  it("a Reviewer's unchanged save writes no field at all", async () => {
    const body = { ...tamperedSubclauseSave(), auditor_feedback: "Looks   fine." };
    const { req, next } = await runMiddleware(
      iso42001SubclauseChanges,
      "Reviewer",
      { id: "21" },
      body,
    );
    expect(next).toHaveBeenCalled();
    expect(req.body).not.toHaveProperty("auditor_feedback");

    mockQuery.mockClear();
    await updateSubClauseQuery(21, req.body, [], [], 1, transaction);
    expect(updateCall()).toBeNull();
  });

  it("framework.edit only: edit fields are kept, unchanged audit feedback is not written", async () => {
    const body = {
      ...tamperedSubclauseSave(),
      implementation_description: "Rewritten",
      auditor_feedback: '<p><a href="https://evil.example">Looks</a> fine.</p>',
    };
    const { req, next } = await runMiddleware(
      iso42001SubclauseChanges,
      "Custom: framework.edit",
      { id: "21" },
      body,
    );
    expect(next).toHaveBeenCalled();
    expect(req.body.implementation_description).toBe("Rewritten");
    expect(req.body.due_date).toBe("2026-03-11");
    expect(req.body).not.toHaveProperty("auditor_feedback");
  });

  it.each(["Admin", "Editor"])("%s's body is untouched", async (role) => {
    const body = tamperedSubclauseSave();
    const { req, next } = await runMiddleware(iso42001SubclauseChanges, role, { id: "21" }, body);
    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual(tamperedSubclauseSave());
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

// ── Bundled framework impl rows ─────────────────────────────────────────────

describe("restoring unchanged fields: bundled framework impl", () => {
  beforeEach(() => jest.clearAllMocks());

  it("an Auditor's 1-day due date shift is dropped from the save", async () => {
    (getImplByIdQuery as jest.Mock<any>).mockResolvedValue({
      ...storedSubclause,
      due_date: "2026-03-10",
      risks: [],
    });
    const { req, next } = await runMiddleware(
      frameworkImplChanges,
      "Auditor",
      { frameworkId: "5", level: "l2", id: "9" },
      { ...tamperedSubclauseSave(), due_date: "2026-03-09" },
    );
    expect(next).toHaveBeenCalled();
    for (const field of [...EDIT_FIELDS, "due_date"]) expect(req.body).not.toHaveProperty(field);
    expect(req.body).toHaveProperty("auditor_feedback");
  });
});

// ── EU AI Act controls: control fields are always written ───────────────────

const storedControl = {
  owner: 3,
  reviewer: null,
  approver: 5,
  due_date: "2026-03-10",
  risk_review: "Acceptable risk",
};
const storedSubcontrol = {
  id: 41,
  status: "In progress",
  implementation_details: "<p>Model cards are kept.</p>",
  evidence_description: "Cards",
  feedback_description: null,
};

const euRoutes = (): Array<[RegExp, unknown[]]> => [
  [/FROM controls_eu/, [storedControl]],
  [/FROM subcontrols_eu__risks/, []],
  [/FROM subcontrols_eu\b/, [storedSubcontrol]],
  [/FROM file_entity_links/, []],
  [/^UPDATE controls_eu/, [{ id: 7 }]],
  [/^UPDATE subcontrols_eu/, [{ id: 41 }]],
];

const tamperedControlSave = () => ({
  owner: "3",
  reviewer: "",
  approver: "5",
  due_date: "2026-03-11T00:00:00.000Z",
  risk_review: "Acceptable risk",
  user_id: "7",
  project_id: "",
  delete: "[]",
  subControls: JSON.stringify([
    {
      id: 41,
      status: "In progress",
      implementation_details: '<p><a href="https://evil.example">Model cards</a> are kept.</p>',
      evidence_description: "<p>Cards</p>",
      feedback_description: "<p>Reviewed.</p>",
    },
  ]),
});

describe("restoring unchanged fields: EU AI Act control", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    routeQueries(euRoutes());
  });

  it("reads the stored due date as a calendar day", async () => {
    await runMiddleware(euControlChanges, "Auditor", { id: "7" }, tamperedControlSave());
    const select = mockQuery.mock.calls.find(([sql]) => /FROM controls_eu/.test(String(sql)));
    expect(String(select![0])).toContain("to_char(due_date, 'YYYY-MM-DD') AS due_date");
  });

  it("an Auditor's save writes the stored control fields and keeps subcontrol text", async () => {
    const { req, next } = await runMiddleware(
      euControlChanges,
      "Auditor",
      { id: "7" },
      tamperedControlSave(),
    );
    expect(next).toHaveBeenCalled();
    expect(req.body).toMatchObject({
      owner: 3,
      reviewer: null,
      approver: 5,
      due_date: "2026-03-10",
      risk_review: "Acceptable risk",
    });
    const [sc] = JSON.parse(req.body.subControls);
    expect(sc).toEqual({ id: 41, feedback_description: "<p>Reviewed.</p>" });

    // What saveControls hands the queries for this body.
    mockQuery.mockClear();
    await updateSubcontrolEUByIdQuery(
      sc.id,
      {
        status: sc.status || undefined,
        implementation_details: sc.implementation_details,
        evidence_description: sc.evidence_description,
        feedback_description: sc.feedback_description,
      },
      [],
      [],
      [],
      1,
      transaction,
    );
    const subUpdate = updateCall();
    expect(subUpdate!.sql).toContain("feedback_description = :feedback_description");
    expect(subUpdate!.sql).not.toMatch(/implementation_details|evidence_description|status =/);

    mockQuery.mockClear();
    await updateControlEUByIdQuery(
      7,
      {
        owner: req.body.owner,
        reviewer: req.body.reviewer,
        approver: req.body.approver,
        due_date: req.body.due_date,
        risk_review: req.body.risk_review,
      },
      1,
      transaction,
    );
    expect(updateCall()!.replacements).toMatchObject({
      owner: 3,
      reviewer: null,
      approver: 5,
      due_date: "2026-03-10",
      risk_review: "Acceptable risk",
    });
  });

  it("a Reviewer's save drops the unchanged feedback too", async () => {
    const body = tamperedControlSave();
    body.subControls = JSON.stringify([
      { ...JSON.parse(body.subControls)[0], feedback_description: "" },
    ]);
    const { req, next } = await runMiddleware(euControlChanges, "Reviewer", { id: "7" }, body);
    expect(next).toHaveBeenCalled();
    expect(JSON.parse(req.body.subControls)).toEqual([{ id: 41 }]);
  });

  it.each(["Admin", "Editor"])("%s's body is untouched", async (role) => {
    const { req } = await runMiddleware(euControlChanges, role, { id: "7" }, tamperedControlSave());
    expect(req.body).toEqual(tamperedControlSave());
  });
});

// ── EU AI Act answers ───────────────────────────────────────────────────────

describe("restoring unchanged fields: EU AI Act answer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    routeQueries([
      [/FROM answers_eu__risks/, []],
      [/FROM answers_eu\b/, [{ answer: "<p>Yes, documented</p>" }]],
    ]);
  });

  it("an Auditor's text-equal answer is not written; the status still is", async () => {
    const { req, next } = await runMiddleware(
      euAnswerChanges,
      "Auditor",
      { id: "12" },
      { answer: '<p>Yes, <a href="https://evil.example">documented</a> </p>', status: "Done" },
    );
    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual({ status: "Done" });
  });

  it("Editor's body is untouched", async () => {
    const body = { answer: "<p>Yes</p>", status: "Done" };
    const { req } = await runMiddleware(euAnswerChanges, "Editor", { id: "12" }, { ...body });
    expect(req.body).toEqual(body);
  });
});
