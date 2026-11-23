/**
 * updateIncident starts the incident response workflow when an update raises
 * severity into the critical tier (Decision 8 / I-L9), after commit, and
 * never for any other severity change. The once-per-incident guard itself
 * lives in triggerIncidentResponse (incidentResponseTrigger.test.ts).
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const afterCommitCallbacks: Array<() => void> = [];
const mockTransaction = {
  commit: jest.fn(),
  rollback: jest.fn(),
  afterCommit: jest.fn((cb: () => void) => afterCommitCallbacks.push(cb)),
};

jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn(async () => mockTransaction),
    query: jest.fn(),
  },
}));
jest.mock("../../utils/incidentManagement.utils", () => ({
  ...(jest.requireActual("../../utils/incidentManagement.utils") as object),
  getIncidentByIdQuery: jest.fn(),
  updateIncidentByIdQuery: jest.fn(),
  validateIncidentReferences: jest.fn(async () => []),
  enqueueIncidentUpdatedAutomations: jest.fn(async () => undefined),
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../../utils/changeHistory.base.utils", () => ({
  ...(jest.requireActual("../../utils/changeHistory.base.utils") as object),
  recordMultipleFieldChanges: jest.fn(),
}));
jest.mock("../workflows/triggers", () => ({
  triggerIncidentResponse: jest.fn(async () => undefined),
}));

import { isCriticalEscalation, updateIncident } from "../incidentManagement.service";
import {
  getIncidentByIdQuery,
  updateIncidentByIdQuery,
} from "../../utils/incidentManagement.utils";
import { triggerIncidentResponse } from "../workflows/triggers";
import { Severity } from "../../domain.layer/enums/ai-incident-management.enum";
import { storedIncident } from "./helpers/incidentFixtures";

const mockGet = getIncidentByIdQuery as jest.MockedFunction<any>;
const mockUpdate = updateIncidentByIdQuery as jest.MockedFunction<any>;
const mockTrigger = triggerIncidentResponse as jest.MockedFunction<any>;

const FULL_ACCESS = { canEdit: true, canApprove: true };

/** A stored incident (fixture) at `severity`. */
const storedAt = (severity: string) => {
  const stored = storedIncident();
  stored.severity = severity as Severity;
  (stored.dataValues as any).severity = severity;
  return stored;
};

const runAfterCommit = () => afterCommitCallbacks.forEach((cb) => cb());

describe("isCriticalEscalation", () => {
  it("is true only for a change from below the critical tier into it", () => {
    expect(isCriticalEscalation(Severity.SERIOUS, Severity.VERY_SERIOUS)).toBe(true);
    expect(isCriticalEscalation(Severity.MINOR, Severity.VERY_SERIOUS)).toBe(true);
    expect(isCriticalEscalation(null, Severity.VERY_SERIOUS)).toBe(true);
  });

  it("is false when severity is unchanged, stays critical, drops or stays below", () => {
    expect(isCriticalEscalation(Severity.SERIOUS, undefined)).toBe(false);
    expect(isCriticalEscalation(Severity.VERY_SERIOUS, Severity.VERY_SERIOUS)).toBe(false);
    expect(isCriticalEscalation(Severity.VERY_SERIOUS, Severity.MINOR)).toBe(false);
    expect(isCriticalEscalation(Severity.MINOR, Severity.SERIOUS)).toBe(false);
  });
});

describe("updateIncident: raising severity to the critical tier", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    afterCommitCallbacks.length = 0;
    mockUpdate.mockImplementation(async (_id: number, changed: any) => ({ id: 42, ...changed }));
  });

  it("starts the workflow after commit when Serious becomes Very serious", async () => {
    mockGet.mockResolvedValue(storedAt(Severity.SERIOUS));

    await updateIncident(1, 42, { severity: Severity.VERY_SERIOUS }, 7, { access: FULL_ACCESS });

    // Registered for after commit, not run inline.
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1);
    runAfterCommit();
    expect(mockTrigger).toHaveBeenCalledTimes(1);
    expect(mockTrigger).toHaveBeenCalledWith(1, 42, Severity.VERY_SERIOUS);
  });

  it("starts it for a system writer too (Jira status sync, background jobs)", async () => {
    mockGet.mockResolvedValue(storedAt(Severity.MINOR));

    await updateIncident(1, 42, { severity: Severity.VERY_SERIOUS }, null, {
      changedBySystem: true,
    });
    runAfterCommit();

    expect(mockTrigger).toHaveBeenCalledWith(1, 42, Severity.VERY_SERIOUS);
  });

  it("registers on the caller's transaction when one is passed", async () => {
    mockGet.mockResolvedValue(storedAt(Severity.SERIOUS));
    const callerCallbacks: Array<() => void> = [];
    const callerTx = {
      commit: jest.fn(),
      rollback: jest.fn(),
      afterCommit: jest.fn((cb: () => void) => callerCallbacks.push(cb)),
    };

    await updateIncident(1, 42, { severity: Severity.VERY_SERIOUS }, 7, {
      access: FULL_ACCESS,
      transaction: callerTx as any,
    });

    expect(callerTx.commit).not.toHaveBeenCalled();
    expect(mockTrigger).not.toHaveBeenCalled();
    callerCallbacks.forEach((cb) => cb());
    expect(mockTrigger).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Very serious stays Very serious", Severity.VERY_SERIOUS, Severity.VERY_SERIOUS],
    ["Very serious drops to Minor", Severity.VERY_SERIOUS, Severity.MINOR],
    ["Minor rises to Serious", Severity.MINOR, Severity.SERIOUS],
  ])("does not start it when %s", async (_label, from, to) => {
    mockGet.mockResolvedValue(storedAt(from));

    await updateIncident(1, 42, { severity: to }, 7, { access: FULL_ACCESS });
    runAfterCommit();

    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("does not start it when the update changes something other than severity", async () => {
    mockGet.mockResolvedValue(storedAt(Severity.VERY_SERIOUS));

    await updateIncident(1, 42, { reporter: "Someone else" }, 7, { access: FULL_ACCESS });
    runAfterCommit();

    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("does not start it when the update is rolled back", async () => {
    mockGet.mockResolvedValue(storedAt(Severity.SERIOUS));
    mockUpdate.mockRejectedValueOnce(new Error("write failed"));

    await expect(
      updateIncident(1, 42, { severity: Severity.VERY_SERIOUS }, 7, { access: FULL_ACCESS }),
    ).rejects.toThrow("write failed");

    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(afterCommitCallbacks).toHaveLength(0);
    expect(mockTrigger).not.toHaveBeenCalled();
  });
});
