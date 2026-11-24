import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockTransaction = {
  commit: jest.fn(async () => undefined),
  rollback: jest.fn(async () => undefined),
  afterCommit: jest.fn(),
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
// Members of organization 1: user 7 (Alex Kim) and 8 (Alex Moreau). User 99
// belongs to another organization.
jest.mock("../../utils/incidentManagement.utils", () => ({
  ...(jest.requireActual("../../utils/incidentManagement.utils") as object),
  getIncidentByIdQuery: jest.fn(),
  updateIncidentByIdQuery: jest.fn(),
  createNewIncidentQuery: jest.fn(),
  getIncidentMemberName: jest.fn(
    async (userId: number) => ({ 7: "Alex Kim", 8: "Alex Moreau" })[userId] ?? null,
  ),
  getIncidentApproverName: jest.fn(async () => "Ada Admin"),
  validateIncidentReferences: jest.fn(async () => []),
  enqueueIncidentUpdatedAutomations: jest.fn(async () => undefined),
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../../utils/changeHistory.base.utils", () => ({
  ...(jest.requireActual("../../utils/changeHistory.base.utils") as object),
  formatEntityFieldChanges: jest.fn(async () => []),
  recordMultipleFieldChanges: jest.fn(),
  recordEntityCreation: jest.fn(),
}));
jest.mock("../../utils/incidentChangeHistory.utils", () => ({
  recordIncidentCreation: jest.fn(),
}));
jest.mock("../workflows/triggers", () => ({
  triggerIncidentResponse: jest.fn(async () => undefined),
}));

import {
  createIncident,
  IncidentCreateValidationError,
  IncidentUpdateValidationError,
  updateIncident,
} from "../incidentManagement.service";
import {
  createNewIncidentQuery,
  getIncidentByIdQuery,
  updateIncidentByIdQuery,
} from "../../utils/incidentManagement.utils";
import { storedIncident } from "./helpers/incidentFixtures";
import { AIIncidentManagementApprovalStatus as Approval } from "../../domain.layer/enums/ai-incident-management.enum";

type Mock = jest.MockedFunction<any>;
const mockCreate = createNewIncidentQuery as Mock;
const mockGet = getIncidentByIdQuery as Mock;
const mockUpdate = updateIncidentByIdQuery as Mock;

const FULL_ACCESS = { canEdit: true, canApprove: true };

const input = (extra: Record<string, unknown>) => ({
  ai_project: "Support chatbot",
  type: "Malfunction",
  severity: "Serious",
  occurred_date: "2026-06-23",
  date_detected: "2026-06-23",
  categories_of_harm: ["Safety"],
  description: "The chatbot gave unsafe advice",
  ...extra,
});

const createdModel = () => mockCreate.mock.calls[0][0] as Record<string, any>;
const writtenColumns = () => mockUpdate.mock.calls[0][1] as Record<string, unknown>;

const validationErrors = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return (error as IncidentCreateValidationError | IncidentUpdateValidationError).errors;
  }
  throw new Error("expected a validation error");
};

describe("incident reporter and approver users", () => {
  // Registers the model with a (never connected) Sequelize instance, so the
  // create path can build it.
  beforeAll(() => {
    storedIncident();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockImplementation(async (incident: any) => ({
      id: 1,
      ...incident.dataValues,
      dataValues: incident.dataValues,
    }));
    mockGet.mockImplementation(async () => storedIncident());
    mockUpdate.mockImplementation(async (_id: number, changed: any) => ({ id: 42, ...changed }));
  });

  describe("on create", () => {
    it("takes a member's reporter_id and writes their full name, ignoring the text sent", async () => {
      await createIncident(1, input({ reporter_id: 8, reporter: "Alex" }), {
        userId: 7,
        canApprove: false,
      });
      expect(createdModel().reporter_id).toBe(8);
      expect(createdModel().reporter).toBe("Alex Moreau");
    });

    it("accepts a reporter_id sent as a string of digits", async () => {
      await createIncident(1, input({ reporter_id: "7" }), { userId: 7, canApprove: false });
      expect(createdModel().reporter_id).toBe(7);
      expect(createdModel().reporter).toBe("Alex Kim");
    });

    it("refuses a reporter_id outside the organization with INVALID_REFERENCE", async () => {
      const errors = await validationErrors(
        createIncident(1, input({ reporter_id: 99, reporter: "Alex" }), {
          userId: 7,
          canApprove: false,
        }),
      );
      expect(errors).toEqual([
        expect.objectContaining({ field: "reporter_id", code: "INVALID_REFERENCE" }),
      ]);
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });

    it("refuses a reporter_id that is not an id before any lookup", async () => {
      const errors = await validationErrors(
        createIncident(1, input({ reporter_id: "abc" }), { userId: 7, canApprove: false }),
      );
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "reporter_id", code: "INVALID_TYPE" }),
        ]),
      );
    });

    it("takes a reporter text alone (Jira, Advisor, API) with no user", async () => {
      await createIncident(1, input({ reporter: "Grace Hopper" }), {
        userId: 7,
        canApprove: false,
      });
      expect(createdModel().reporter).toBe("Grace Hopper");
      expect(createdModel().reporter_id).toBeNull();
    });

    it("requires a reporter_id or a reporter text", async () => {
      const errors = await validationErrors(
        createIncident(1, input({ reporter: "  " }), { userId: 7, canApprove: false }),
      );
      expect(errors).toEqual([
        expect.objectContaining({ field: "reporter", code: "REQUIRED_FIELD" }),
      ]);
    });

    it("never takes approved_by_id or approval_date from the request", async () => {
      await createIncident(
        1,
        input({ reporter: "Ada", approved_by_id: 8, approval_date: "2020-01-01" }),
        { userId: 7, canApprove: false },
      );
      expect(createdModel().approved_by_id).toBeNull();
      expect(createdModel().approval_date).toBeFalsy();
    });

    it("stamps the approver's id and today's UTC date when an approver creates it Approved", async () => {
      await createIncident(1, input({ reporter: "Ada", approval_status: Approval.APPROVED }), {
        userId: 7,
        canApprove: true,
      });
      expect(createdModel().approved_by).toBe("Ada Admin");
      expect(createdModel().approved_by_id).toBe(7);
      expect(createdModel().approval_date).toBe(new Date().toISOString().slice(0, 10));
    });

    it("stores the dates as YYYY-MM-DD, an ISO date-time's date part", async () => {
      await createIncident(
        1,
        input({
          reporter: "Ada",
          occurred_date: "2026-06-22T23:30:00-07:00",
          date_detected: "2026-06-23",
        }),
        { userId: 7, canApprove: false },
      );
      expect(createdModel().occurred_date).toBe("2026-06-22");
      expect(createdModel().date_detected).toBe("2026-06-23");
    });
  });

  describe("on update", () => {
    it("changes the reporter by id and rewrites the reporter text", async () => {
      await updateIncident(1, 42, { reporter_id: 8 }, 7, { access: FULL_ACCESS });
      expect(writtenColumns()).toEqual({ reporter_id: 8, reporter: "Alex Moreau" });
    });

    it("refuses a reporter_id outside the organization and writes nothing", async () => {
      const errors = await validationErrors(
        updateIncident(1, 42, { reporter_id: 99 }, 7, { access: FULL_ACCESS }),
      );
      expect(errors).toEqual([
        expect.objectContaining({ field: "reporter_id", code: "INVALID_REFERENCE" }),
      ]);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("does not re-check an unchanged reporter_id (a reporter who has since left)", async () => {
      const stored = storedIncident();
      stored.setDataValue("reporter_id", 99);
      mockGet.mockImplementation(async () => stored);
      await updateIncident(1, 42, { reporter_id: 99, severity: "Minor" }, 7, {
        access: FULL_ACCESS,
      });
      expect(writtenColumns()).toEqual({ severity: "Minor" });
    });

    it("a new reporter text without an id clears the stored reporter_id", async () => {
      const stored = storedIncident();
      stored.setDataValue("reporter_id", 7);
      mockGet.mockImplementation(async () => stored);
      await updateIncident(1, 42, { reporter: "Someone else" }, 7, { access: FULL_ACCESS });
      expect(writtenColumns()).toEqual({ reporter: "Someone else", reporter_id: null });
    });

    it("needs incident.edit to change the reporter", async () => {
      await expect(
        updateIncident(1, 42, { reporter_id: 8 }, 7, {
          access: { canEdit: false, canApprove: true },
        }),
      ).rejects.toThrow("Your role does not allow editing");
    });

    it("stamps approved_by_id and today's UTC date on a decision, ignoring what the caller sent", async () => {
      const stored = storedIncident();
      stored.setDataValue("approval_status", Approval.PENDING);
      stored.setDataValue("approved_by", null as any);
      stored.setDataValue("approved_by_id", null);
      stored.setDataValue("approval_date", null);
      mockGet.mockImplementation(async () => stored);
      await updateIncident(
        1,
        42,
        { approval_status: Approval.REJECTED, approved_by_id: 8, approval_date: "2020-01-01" },
        7,
        { access: FULL_ACCESS },
      );
      expect(writtenColumns()).toEqual({
        approval_status: Approval.REJECTED,
        approved_by: "Ada Admin",
        approved_by_id: 7,
        approval_date: new Date().toISOString().slice(0, 10),
      });
    });

    it("clears approved_by_id with the approver and date on Pending", async () => {
      await updateIncident(1, 42, { approval_status: Approval.PENDING }, 7, {
        access: FULL_ACCESS,
      });
      expect(writtenColumns()).toEqual({
        approval_status: Approval.PENDING,
        approved_by: null,
        approved_by_id: null,
        approval_date: null,
      });
    });

    it("the reopen reset clears approved_by_id too", async () => {
      await updateIncident(1, 42, { status: "Open" }, 7, { access: FULL_ACCESS });
      expect(writtenColumns()).toMatchObject({
        status: "Open",
        approval_status: Approval.PENDING,
        approved_by: null,
        approved_by_id: null,
        approval_date: null,
      });
    });

    it("treats a date sent back as the stored day (string or ISO date-time) as unchanged", async () => {
      await updateIncident(
        1,
        42,
        {
          occurred_date: "2026-09-20",
          date_detected: "2026-09-21T00:00:00.000Z",
          severity: "Minor",
        },
        7,
        { access: FULL_ACCESS },
      );
      expect(writtenColumns()).toEqual({ severity: "Minor" });
    });
  });
});
