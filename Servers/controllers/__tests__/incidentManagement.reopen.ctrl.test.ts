import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

const mockTransaction = {
  commit: jest.fn(),
  rollback: jest.fn(),
  afterCommit: jest.fn(),
};

jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn(async () => mockTransaction), query: jest.fn() },
}));
// Real diff (through the real shared service); the queries are stubbed.
jest.mock("../../utils/incidentManagement.utils", () => ({
  ...(jest.requireActual("../../utils/incidentManagement.utils") as object),
  getAllIncidentsQuery: jest.fn(),
  getIncidentByIdQuery: jest.fn(),
  createNewIncidentQuery: jest.fn(),
  updateIncidentByIdQuery: jest.fn(),
  deleteIncidentByIdQuery: jest.fn(),
  archiveIncidentByIdQuery: jest.fn(),
  validateIncidentReferences: jest.fn(async () => []),
  enqueueIncidentUpdatedAutomations: jest.fn(async () => undefined),
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
// Real change tracking; only the history write is stubbed.
jest.mock("../../utils/changeHistory.base.utils", () => ({
  ...(jest.requireActual("../../utils/changeHistory.base.utils") as object),
  recordMultipleFieldChanges: jest.fn(),
}));
jest.mock("../../services/workflows/triggers", () => ({ triggerIncidentResponse: jest.fn() }));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_req, err) => (typeof err === "string" ? err : (err as Error).message)),
}));

import { updateIncidentById } from "../incident-management.ctrl";
import {
  getIncidentByIdQuery,
  updateIncidentByIdQuery,
  validateIncidentReferences,
} from "../../utils/incidentManagement.utils";
import { recordMultipleFieldChanges } from "../../utils/changeHistory.base.utils";
import { drawerSave, storedIncident } from "../../services/__tests__/helpers/incidentFixtures";

const mockGet = getIncidentByIdQuery as jest.MockedFunction<any>;
const mockUpdate = updateIncidentByIdQuery as jest.MockedFunction<any>;
const mockRefs = validateIncidentReferences as jest.MockedFunction<any>;
const mockRecord = recordMultipleFieldChanges as jest.MockedFunction<any>;

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res) as any;
  res.json = jest.fn().mockReturnValue(res) as any;
  return res as Response;
}

function mockReq(body: Record<string, unknown>) {
  return {
    params: { id: "42" },
    body,
    organizationId: 1,
    userId: 7,
    t: (key: string) => key,
  } as unknown as Request;
}

describe("updateIncidentById — reopening a closed incident", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockImplementation(async () => storedIncident());
    mockUpdate.mockImplementation(async (_id: number, changed: any) => ({
      toSafeJSON: () => ({ id: 42, ...changed }),
    }));
    mockRefs.mockResolvedValue([]);
  });

  it("resets the approval for the exact payload the edit drawer sends", async () => {
    const res = mockRes();
    const body = drawerSave(storedIncident().toSafeJSON(), { status: "Investigating" });

    await updateIncidentById(mockReq(body), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect((res.json as jest.Mock).mock.calls[0][0]).toEqual({
      message: "OK",
      data: expect.objectContaining({ id: 42, status: "Investigating" }),
    });
    expect(mockUpdate.mock.calls[0][1]).toEqual({
      status: "Investigating",
      approval_status: "Pending",
      approved_by: null,
      approval_date: null,
      approval_notes: null,
    });

    const [entity, incidentId, userId, orgId, changes] = mockRecord.mock.calls[0];
    expect([entity, incidentId, userId, orgId]).toEqual(["incident", 42, 7, 1]);
    expect(changes).toEqual(
      expect.arrayContaining([
        { fieldName: "Status", oldValue: "Closed", newValue: "Investigating" },
        { fieldName: "Approval status", oldValue: "Approved", newValue: "Pending" },
      ]),
    );
    expect(mockTransaction.commit).toHaveBeenCalled();
  });

  it("keeps the approver the caller set in the same update", async () => {
    const res = mockRes();
    await updateIncidentById(
      mockReq({ status: "Open", approval_status: "Approved", approved_by: "Sam Lee" }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdate.mock.calls[0][1]).toEqual({ status: "Open", approved_by: "Sam Lee" });
  });

  it("returns 409 and writes nothing when the incident changed since the drawer loaded it", async () => {
    const res = mockRes();
    const body = {
      ...drawerSave(storedIncident().toSafeJSON(), { status: "Investigating" }),
      expected_updated_at: "2026-10-09T08:00:00.000Z",
    };

    await updateIncidentById(mockReq(body), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect((res.json as jest.Mock).mock.calls[0][0]).toEqual({
      message: "Conflict",
      data: {
        status: "error",
        message: "This incident was changed since you opened it. Reload to see the latest version.",
        code: "CONFLICT",
      },
    });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockTransaction.rollback).toHaveBeenCalled();
  });

  it("keeps the 400 body for references that fail validation against the locked row", async () => {
    mockRefs.mockResolvedValue(["project_id"]);
    const res = mockRes();

    await updateIncidentById(mockReq({ project_id: 999 }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect((res.json as jest.Mock).mock.calls[0][0]).toEqual({
      message: "Bad Request",
      data: {
        status: "error",
        message: "Incident update validation failed",
        errors: [
          {
            field: "project_id",
            message: "project_id does not reference an entity in your organization",
            code: "INVALID_REFERENCE",
          },
        ],
      },
    });
    expect(mockGet).toHaveBeenCalledTimes(1); // only the locked read
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 400, not 409, for a malformed expected_updated_at", async () => {
    const res = mockRes();
    await updateIncidentById(mockReq({ status: "Open", expected_updated_at: "not-a-date" }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect((res.json as jest.Mock).mock.calls[0][0]).toEqual({
      message: "Bad Request",
      data: {
        status: "error",
        message: "Incident update validation failed",
        errors: [
          {
            field: "expected_updated_at",
            message: "expected_updated_at must be a valid date-time",
            code: "INVALID_DATE",
          },
        ],
      },
    });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("rejects an empty expected_updated_at with 400 and treats null as no version check", async () => {
    const empty = mockRes();
    await updateIncidentById(mockReq({ status: "Open", expected_updated_at: "" }), empty);
    expect(empty.status).toHaveBeenCalledWith(400);

    const absent = mockRes();
    await updateIncidentById(mockReq({ status: "Open", expected_updated_at: null }), absent);
    expect(absent.status).toHaveBeenCalledWith(200);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when the incident does not exist", async () => {
    mockGet.mockResolvedValue(null);
    const res = mockRes();
    await updateIncidentById(mockReq({ status: "Open" }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
