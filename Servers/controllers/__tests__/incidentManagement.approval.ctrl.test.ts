import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

// Incident approval is its own key (incident.approve): details need
// incident.edit, approval_status / approval_notes need incident.approve, and
// the server records who approved and when.

const mockTransaction = {
  commit: jest.fn(),
  rollback: jest.fn(),
  afterCommit: jest.fn(),
};

jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn(async () => mockTransaction), query: jest.fn() },
}));
jest.mock("../../utils/rolePermissions.utils", () => ({ requestHasPermission: jest.fn() }));
// Real diff (through the real shared service); the queries are stubbed.
jest.mock("../../utils/incidentManagement.utils", () => ({
  ...(jest.requireActual("../../utils/incidentManagement.utils") as object),
  getIncidentByIdQuery: jest.fn(),
  createNewIncidentQuery: jest.fn(),
  updateIncidentByIdQuery: jest.fn(),
  validateIncidentReferences: jest.fn(async () => []),
  enqueueIncidentUpdatedAutomations: jest.fn(async () => undefined),
  getIncidentApproverName: jest.fn(async () => "Rita Reviewer"),
}));
jest.mock("../../utils/incidentChangeHistory.utils", () => ({
  recordIncidentCreation: jest.fn(),
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../../utils/changeHistory.base.utils", () => ({
  ...(jest.requireActual("../../utils/changeHistory.base.utils") as object),
  recordMultipleFieldChanges: jest.fn(),
}));
jest.mock("../../services/workflows/triggers", () => ({ triggerIncidentResponse: jest.fn() }));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  logStructured: jest.fn(),
}));

import { createNewIncident, updateIncidentById } from "../incident-management.ctrl";
import {
  createNewIncidentQuery,
  getIncidentByIdQuery,
  getIncidentApproverName,
  updateIncidentByIdQuery,
} from "../../utils/incidentManagement.utils";
import { recordIncidentCreation } from "../../utils/incidentChangeHistory.utils";
import { requestHasPermission } from "../../utils/rolePermissions.utils";
import { storedIncident } from "../../services/__tests__/helpers/incidentFixtures";

const mockGet = getIncidentByIdQuery as jest.MockedFunction<any>;
const mockUpdate = updateIncidentByIdQuery as jest.MockedFunction<any>;
const mockCreate = createNewIncidentQuery as jest.MockedFunction<any>;
const mockHistory = recordIncidentCreation as jest.MockedFunction<any>;
const mockApprover = getIncidentApproverName as jest.MockedFunction<any>;
const mockCan = requestHasPermission as jest.MockedFunction<any>;

/** The role holds exactly `keys`. */
const holds = (...keys: string[]) =>
  mockCan.mockImplementation(async (_req: unknown, key: string) => keys.includes(key));

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res) as any;
  res.json = jest.fn().mockReturnValue(res) as any;
  return res as Response;
}

const t = (key: string) => `T:${key}`;
const mockReq = (body: Record<string, unknown>, params: Record<string, string> = { id: "42" }) =>
  ({ params, body, organizationId: 1, userId: 9, role: "Reviewer", t }) as unknown as Request;

/** A stored Open incident with a Pending approval. */
const openPending = () => {
  const incident = storedIncident();
  incident.dataValues.status = "Open";
  incident.dataValues.approval_status = "Pending";
  incident.dataValues.approved_by = null as any;
  incident.dataValues.approval_date = null as any;
  incident.dataValues.approval_notes = null as any;
  return incident;
};

describe("updateIncidentById — approval is its own permission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockImplementation(async () => openPending());
    mockUpdate.mockImplementation(async (_id: number, changed: any) => ({
      toSafeJSON: () => ({ id: 42, ...changed }),
    }));
  });

  it("answers 403, translated, when an approver changes a detail", async () => {
    holds("incident.approve");
    const res = mockRes();

    await updateIncidentById(mockReq({ description: "Rewritten by a reviewer" }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect((res.json as jest.Mock).mock.calls[0][0]).toEqual({
      message: "Forbidden",
      data: "T:Your role does not allow editing this incident's details.",
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("answers 403 when an editor changes the approval", async () => {
    holds("incident.edit");
    const res = mockRes();

    await updateIncidentById(mockReq({ approval_status: "Approved" }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect((res.json as jest.Mock).mock.calls[0][0]).toMatchObject({
      data: "T:Your role does not allow approving or rejecting incidents.",
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("lets an approver record a decision; the server sets approver and date", async () => {
    holds("incident.approve");
    const res = mockRes();

    await updateIncidentById(
      mockReq({ approval_status: "Approved", approved_by: "Mallory", approval_date: "2020-01-01" }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    const changed = mockUpdate.mock.calls[0][1];
    expect(changed.approved_by).toBe("Rita Reviewer");
    expect(changed.approval_date).toBeInstanceOf(Date);
    expect(mockApprover).toHaveBeenCalledWith(9, 1, mockTransaction);
  });
});

describe("createNewIncident — approval on create", () => {
  const body = {
    ai_project: "Support chatbot",
    type: "Malfunction",
    severity: "Serious",
    status: "Open",
    occurred_date: "2026-06-23",
    date_detected: "2026-06-23",
    reporter: "Ada Lovelace",
    categories_of_harm: ["Safety"],
    description: "The chatbot gave unsafe advice",
    relationship_causality: "Direct cause",
    approval_status: "Approved",
    approved_by: "Mallory",
    approval_date: "2020-01-01",
    approval_notes: "Self-approved",
  };

  // Registers the real model's attributes (no database), so the controller
  // can build the incident it saves.
  beforeAll(() => storedIncident());

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockImplementation(async () => ({
      id: 5,
      severity: "Serious",
      toSafeJSON: () => ({ id: 5 }),
    }));
  });

  it("starts Pending, without approver, date or notes, for a creator without incident.approve", async () => {
    holds("incident.create", "incident.edit");
    const res = mockRes();

    await createNewIncident(mockReq(body, {}), res);

    expect(res.status).toHaveBeenCalledWith(201);
    const saved = mockCreate.mock.calls[0][0];
    // Absent values are written as NULL by createNewIncidentQuery.
    expect(saved.approval_status).toBe("Pending");
    expect(saved.approved_by ?? null).toBeNull();
    expect(saved.approval_date ?? null).toBeNull();
    expect(saved.approval_notes ?? null).toBeNull();
    expect(mockApprover).not.toHaveBeenCalled();
    // History records what was stored, not what was asked for.
    const history = mockHistory.mock.calls[0][3];
    expect(history.approval_status).toBe("Pending");
    expect(history.approved_by ?? null).toBeNull();
    expect(history.approval_notes ?? null).toBeNull();
  });

  it("names the creator as approver, dated now, for a creator with incident.approve", async () => {
    holds("incident.create", "incident.approve");
    const res = mockRes();

    await createNewIncident(mockReq(body, {}), res);

    expect(res.status).toHaveBeenCalledWith(201);
    const saved = mockCreate.mock.calls[0][0];
    expect(saved).toMatchObject({
      approval_status: "Approved",
      approved_by: "Rita Reviewer",
      approval_notes: "Self-approved",
    });
    expect(saved.approval_date).toBeInstanceOf(Date);
    expect(mockApprover).toHaveBeenCalledWith(9, 1, mockTransaction);
  });

  it("leaves approver and date empty for a Pending incident even with incident.approve", async () => {
    holds("incident.create", "incident.approve");
    const res = mockRes();

    await createNewIncident(mockReq({ ...body, approval_status: "Pending" }, {}), res);

    const saved = mockCreate.mock.calls[0][0];
    expect(saved.approval_status).toBe("Pending");
    expect(saved.approved_by ?? null).toBeNull();
    expect(saved.approval_date ?? null).toBeNull();
  });
});
