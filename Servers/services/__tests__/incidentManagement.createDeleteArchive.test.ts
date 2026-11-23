import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

const afterCommitCallbacks: Array<() => void> = [];
const mockTransaction = {
  commit: jest.fn(async () => undefined),
  rollback: jest.fn(async () => undefined),
  afterCommit: jest.fn((cb: () => void) => afterCommitCallbacks.push(cb)),
};

jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn(async (options?: any, callback?: any) =>
      typeof callback === "function"
        ? callback({ savepointOf: options?.transaction })
        : mockTransaction,
    ),
    query: jest.fn(),
  },
}));
jest.mock("../../utils/incidentManagement.utils", () => ({
  ...(jest.requireActual("../../utils/incidentManagement.utils") as object),
  getIncidentByIdQuery: jest.fn(),
  updateIncidentByIdQuery: jest.fn(),
  createNewIncidentQuery: jest.fn(),
  deleteIncidentByIdQuery: jest.fn(),
  getIncidentApproverName: jest.fn(async () => "Ada Admin"),
  validateIncidentReferences: jest.fn(async () => []),
  enqueueIncidentUpdatedAutomations: jest.fn(async () => undefined),
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../../utils/changeHistory.base.utils", () => ({
  ...(jest.requireActual("../../utils/changeHistory.base.utils") as object),
  recordMultipleFieldChanges: jest.fn(),
  recordEntityCreation: jest.fn(),
  recordEntityDeletion: jest.fn(),
}));
jest.mock("../../utils/incidentChangeHistory.utils", () => ({
  recordIncidentCreation: jest.fn(),
}));
jest.mock("../workflows/triggers", () => ({
  triggerIncidentResponse: jest.fn(async () => undefined),
}));

import {
  createIncident,
  deleteIncident,
  IncidentCreateValidationError,
  setIncidentArchived,
} from "../incidentManagement.service";
import {
  createNewIncidentQuery,
  deleteIncidentByIdQuery,
  enqueueIncidentUpdatedAutomations,
  getIncidentByIdQuery,
  updateIncidentByIdQuery,
  validateIncidentReferences,
} from "../../utils/incidentManagement.utils";
import {
  recordEntityCreation,
  recordEntityDeletion,
  recordMultipleFieldChanges,
} from "../../utils/changeHistory.base.utils";
import { recordIncidentCreation } from "../../utils/incidentChangeHistory.utils";
import { triggerIncidentResponse } from "../workflows/triggers";
import { storedIncident } from "./helpers/incidentFixtures";

type Mock = jest.MockedFunction<any>;
const mockCreate = createNewIncidentQuery as Mock;
const mockDelete = deleteIncidentByIdQuery as Mock;
const mockGet = getIncidentByIdQuery as Mock;
const mockUpdate = updateIncidentByIdQuery as Mock;
const mockRefs = validateIncidentReferences as Mock;

const validInput = {
  ai_project: "Support chatbot",
  type: "Malfunction",
  severity: "Serious",
  occurred_date: "2026-06-23",
  date_detected: "2026-06-23",
  reporter: "Ada Lovelace",
  description: "The chatbot gave unsafe advice",
};

const runAfterCommit = () => afterCommitCallbacks.forEach((cb) => cb());

beforeEach(() => {
  jest.clearAllMocks();
  afterCommitCallbacks.length = 0;
  mockRefs.mockResolvedValue([]);
  // The row as the insert returns it: the built model's values plus the id.
  mockCreate.mockImplementation(async (incident: any) => {
    const values = { ...incident.dataValues, id: 77, incident_id: "INC-77" };
    return { ...values, dataValues: values };
  });
});

// Registers the real model with a (never connected) Sequelize instance, so
// createIncident can build it as in production.
beforeAll(() => {
  storedIncident();
});

/** The values createIncident built the row from. */
const built = () => mockCreate.mock.calls[0][0].dataValues;

describe("createIncident", () => {
  it("validates fields before opening a transaction", async () => {
    await expect(
      createIncident(4, { ...validInput, severity: "Catastrophic" }, { canApprove: false }),
    ).rejects.toBeInstanceOf(IncidentCreateValidationError);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockTransaction.commit).not.toHaveBeenCalled();
  });

  it("refuses a use case outside the organization and rolls back", async () => {
    mockRefs.mockResolvedValue(["project_id"]);

    const error = await createIncident(
      4,
      { ...validInput, project_id: 999 },
      {
        userId: 5,
        canApprove: false,
      },
    ).catch((e) => e);

    expect(error).toBeInstanceOf(IncidentCreateValidationError);
    expect(error.errors[0]).toEqual(
      expect.objectContaining({ field: "project_id", code: "INVALID_REFERENCE" }),
    );
    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("keeps project_id and records creation history as the user", async () => {
    const saved = await createIncident(
      4,
      { ...validInput, project_id: 12 },
      {
        userId: 5,
        canApprove: false,
      },
    );

    expect(saved.id).toBe(77);
    expect(built().project_id).toBe(12);
    expect(recordIncidentCreation).toHaveBeenCalledWith(
      77,
      5,
      4,
      expect.objectContaining({ project_id: 12, ai_project: "Support chatbot" }),
      mockTransaction,
    );
    expect(recordEntityCreation).not.toHaveBeenCalled();
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1);
  });

  it("records history as the system when there is no user", async () => {
    await createIncident(4, validInput, { userId: null, canApprove: false, changedBySystem: true });

    expect(recordIncidentCreation).not.toHaveBeenCalled();
    expect(recordEntityCreation).toHaveBeenCalledWith(
      "incident",
      77,
      null,
      4,
      expect.any(Object),
      mockTransaction,
      true,
    );
  });

  it("starts Pending for an actor without incident.approve", async () => {
    await createIncident(
      4,
      { ...validInput, approval_status: "Approved", approval_notes: "ok" },
      { userId: 5, canApprove: false },
    );

    expect(built().approval_status).toBe("Pending");
    expect(built().approval_notes ?? null).toBeNull();
  });

  it("starts the incident response workflow for a critical incident only after commit", async () => {
    await createIncident(
      4,
      { ...validInput, severity: "Very serious" },
      {
        userId: 5,
        canApprove: false,
      },
    );

    expect(triggerIncidentResponse).not.toHaveBeenCalled();
    runAfterCommit();
    expect(triggerIncidentResponse).toHaveBeenCalledWith(4, 77, "Very serious");
  });

  it("does not start the workflow for a non-critical incident", async () => {
    await createIncident(4, validInput, { userId: 5, canApprove: false });
    runAfterCommit();
    expect(triggerIncidentResponse).not.toHaveBeenCalled();
  });

  it("maps a reference deleted after the check (FK violation) to the same validation error", async () => {
    mockCreate.mockRejectedValue(
      Object.assign(new Error("fk"), {
        parent: {
          code: "23503",
          table: "ai_incident_managements",
          constraint: "ai_incident_managements_project_id_fkey",
        },
      }),
    );

    const error = await createIncident(
      4,
      { ...validInput, project_id: 12 },
      {
        userId: 5,
        canApprove: false,
      },
    ).catch((e) => e);

    expect(error).toBeInstanceOf(IncidentCreateValidationError);
    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
  });
});

describe("deleteIncident", () => {
  it("deletes, records a deletion entry and commits", async () => {
    mockDelete.mockResolvedValue({ id: 42, ai_project: "Chatbot" });

    const deleted = await deleteIncident(4, 42, 9);

    expect(deleted).toEqual({ id: 42, ai_project: "Chatbot" });
    expect(mockDelete).toHaveBeenCalledWith(42, 4, mockTransaction);
    expect(recordEntityDeletion).toHaveBeenCalledWith("incident", 42, 9, 4, mockTransaction, false);
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1);
  });

  it("records the deletion as the system without a user", async () => {
    mockDelete.mockResolvedValue({ id: 42 });

    await deleteIncident(4, 42, null, { changedBySystem: true });

    expect(recordEntityDeletion).toHaveBeenCalledWith(
      "incident",
      42,
      null,
      4,
      mockTransaction,
      true,
    );
  });

  it("returns null for a missing incident and writes nothing", async () => {
    mockDelete.mockResolvedValue(null);

    expect(await deleteIncident(4, 404, 9)).toBeNull();
    expect(recordEntityDeletion).not.toHaveBeenCalled();
    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
    expect(mockTransaction.commit).not.toHaveBeenCalled();
  });

  it("rolls back when the history write fails", async () => {
    mockDelete.mockResolvedValue({ id: 42 });
    (recordEntityDeletion as Mock).mockRejectedValueOnce(new Error("history down"));

    await expect(deleteIncident(4, 42, 9)).rejects.toThrow("history down");
    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
    expect(mockTransaction.commit).not.toHaveBeenCalled();
  });
});

describe("setIncidentArchived", () => {
  beforeEach(() => {
    mockUpdate.mockImplementation(async (_id: number, changed: any) => ({ id: 42, ...changed }));
  });

  it.each([
    [true, false],
    [false, true],
  ])(
    "archived=%s locks the row, writes the flag, records history and sends incident_updated after commit",
    async (archived, stored) => {
      const incident = storedIncident();
      incident.dataValues.archived = stored;
      mockGet.mockResolvedValue(incident);

      await setIncidentArchived(4, 42, archived, 9);

      expect(mockGet).toHaveBeenCalledWith(42, 4, { transaction: mockTransaction, lock: true });
      expect(mockUpdate.mock.calls[0][1]).toEqual({ archived });
      expect(recordMultipleFieldChanges).toHaveBeenCalledWith(
        "incident",
        42,
        9,
        4,
        [expect.objectContaining({ fieldName: "Archived" })],
        mockTransaction,
        false,
      );
      expect(enqueueIncidentUpdatedAutomations).not.toHaveBeenCalled();
      runAfterCommit();
      expect(enqueueIncidentUpdatedAutomations).toHaveBeenCalledTimes(1);
    },
  );

  it("does nothing when the incident is already in that state", async () => {
    const incident = storedIncident();
    incident.dataValues.archived = true;
    mockGet.mockResolvedValue(incident);

    await setIncidentArchived(4, 42, true, 9);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(recordMultipleFieldChanges).not.toHaveBeenCalled();
  });

  it("returns null for a missing incident", async () => {
    mockGet.mockResolvedValue(null);
    expect(await setIncidentArchived(4, 404, true, 9)).toBeNull();
  });
});
