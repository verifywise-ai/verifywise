import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockTransaction = {
  commit: jest.fn<() => Promise<void>>(),
  rollback: jest.fn<() => Promise<void>>(),
  afterCommit: jest.fn(),
};
jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn(async () => mockTransaction) },
}));
jest.mock("../../domain.layer/models/incidentManagement/incidemtManagement.model", () => ({
  AIIncidentManagementModel: jest.fn().mockImplementation((data: unknown) => data),
}));
// Real error helpers; the queries and the reference check are stubbed.
jest.mock("../../utils/incidentManagement.utils", () => ({
  ...(jest.requireActual("../../utils/incidentManagement.utils") as object),
  createNewIncidentQuery: jest.fn(),
  validateIncidentReferences: jest.fn(async () => []),
}));
jest.mock("../../utils/incidentChangeHistory.utils", () => ({
  recordIncidentCreation: jest.fn(),
}));
jest.mock("../../services/workflows/triggers", () => ({
  triggerIncidentResponse: jest.fn(async () => undefined),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn() },
  logStructured: jest.fn(),
}));

import { createNewIncident } from "../incident-management.ctrl";
import {
  createNewIncidentQuery,
  validateIncidentReferences,
} from "../../utils/incidentManagement.utils";

const mockCreate = createNewIncidentQuery as unknown as jest.Mock<(...a: any[]) => any>;
const mockCheck = validateIncidentReferences as unknown as jest.Mock<(...a: any[]) => any>;

const body = {
  ai_project: "Support chatbot",
  type: "Malfunction",
  severity: "Serious",
  status: "Open",
  occurred_date: "2026-06-23",
  date_detected: "2026-06-23",
  reporter: "Ada Lovelace",
  approval_status: "Pending",
  categories_of_harm: ["Safety"],
  description: "The chatbot gave unsafe advice",
  relationship_causality: "Direct cause",
};

// A translator that marks what it translated, so the test sees every message go through it.
const t = (key: string, vars?: Record<string, string | number>) =>
  `T:${key.replace(/\{(\w+)\}/g, (_, name) => String(vars?.[name] ?? `{${name}}`))}`;
const makeReq = () => ({ body, organizationId: 7, userId: 5, t }) as any;
const makeRes = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const referenceBody = (field: string) => ({
  message: "Bad Request",
  data: {
    status: "error",
    message: "T:Incident creation validation failed",
    errors: [
      {
        field,
        message: `T:${field} does not reference an entity in your organization`,
        code: "INVALID_REFERENCE",
      },
    ],
  },
});

describe("createNewIncident transaction handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransaction.commit.mockResolvedValue(undefined);
    mockTransaction.rollback.mockResolvedValue(undefined);
    mockCheck.mockResolvedValue([]);
  });

  it("answers a reference the check rejects with a translated 400 and rolls back once", async () => {
    mockCheck.mockResolvedValue(["project_id"]);
    const res = makeRes();

    await createNewIncident(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(referenceBody("project_id"));
    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("does not roll back a committed transaction when the response fails afterwards", async () => {
    mockCreate.mockResolvedValue({
      id: 1,
      severity: "Minor",
      toSafeJSON: () => {
        throw new Error("serialisation failed");
      },
    });
    const res = makeRes();

    await createNewIncident(makeReq(), res);

    expect(mockTransaction.commit).toHaveBeenCalledTimes(1);
    expect(mockTransaction.rollback).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("still answers when the rollback itself fails", async () => {
    mockCreate.mockRejectedValue(new Error("connection lost"));
    mockTransaction.rollback.mockRejectedValue(new Error("rollback failed"));
    const res = makeRes();

    await createNewIncident(makeReq(), res);

    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("maps an FK violation with a non-English detail to a translated 400 for that field", async () => {
    mockCreate.mockRejectedValue({
      name: "SequelizeForeignKeyConstraintError",
      parent: {
        code: "23503",
        table: "ai_incident_managements",
        constraint: "ai_incident_managements_assignee_id_fkey",
        detail: "Schlüssel (assignee_id)=(9) ist nicht in Tabelle »users« vorhanden.",
      },
    });
    const res = makeRes();

    await createNewIncident(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(referenceBody("assignee_id"));
    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
  });
});
