import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// Holds both incident keys (an Admin); incidentManagement.approval.ctrl.test.ts covers the rest.
jest.mock("../../utils/rolePermissions.utils", () => ({
  requestHasPermission: jest.fn(async () => true),
}));
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn(async () => ({
      commit: jest.fn(),
      rollback: jest.fn(),
      afterCommit: jest.fn(),
    })),
  },
}));
jest.mock("../../domain.layer/models/incidentManagement/incidemtManagement.model", () => ({
  AIIncidentManagementModel: jest.fn().mockImplementation((data: unknown) => data),
}));
// Real validation and diff helpers (the shared write path uses them); the queries are stubbed.
jest.mock("../../utils/incidentManagement.utils", () => ({
  ...(jest.requireActual("../../utils/incidentManagement.utils") as object),
  getIncidentByIdQuery: jest.fn(),
  createNewIncidentQuery: jest.fn(),
  updateIncidentByIdQuery: jest.fn(),
  validateIncidentReferences: jest.fn(async () => []),
  getIncidentApproverName: jest.fn(async () => "Rita Reviewer"),
}));
jest.mock("../../utils/incidentChangeHistory.utils", () => ({
  recordIncidentCreation: jest.fn(),
  getIncidentChangeHistory: jest.fn(async () => ({ data: [], hasMore: false, total: 0 })),
}));
jest.mock("../../utils/changeHistory.base.utils", () => ({
  formatEntityFieldChanges: jest.fn(async () => []),
  recordMultipleFieldChanges: jest.fn(),
}));
jest.mock("../../services/workflows/triggers", () => ({
  triggerIncidentResponse: jest.fn(async () => undefined),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  logStructured: jest.fn(),
}));

import {
  createNewIncident,
  getIncidentById,
  updateIncidentById,
} from "../incident-management.ctrl";
import { getIncidentHistory } from "../incidentChangeHistory.ctrl";
import {
  createNewIncidentQuery,
  getIncidentByIdQuery,
  updateIncidentByIdQuery,
} from "../../utils/incidentManagement.utils";
import {
  getIncidentChangeHistory,
  recordIncidentCreation,
} from "../../utils/incidentChangeHistory.utils";

const mockCreate = createNewIncidentQuery as unknown as jest.Mock<(...a: any[]) => any>;
const mockUpdate = updateIncidentByIdQuery as unknown as jest.Mock<(...a: any[]) => any>;
const mockGetById = getIncidentByIdQuery as unknown as jest.Mock<(...a: any[]) => any>;
const mockHistory = recordIncidentCreation as unknown as jest.Mock<(...a: any[]) => any>;
const mockGetHistory = getIncidentChangeHistory as unknown as jest.Mock<(...a: any[]) => any>;

const VALID_CREATE = {
  ai_project: "Support chatbot",
  type: "Malfunction",
  severity: "Serious",
  occurred_date: "2026-06-20",
  date_detected: "2026-06-23",
  reporter: "Ada Lovelace",
  description: "The chatbot gave unsafe advice.",
};

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const t = (key: string, vars?: Record<string, string | number>) =>
  `t:${key.replace(/\{(\w+)\}/g, (_, name) => String(vars?.[name] ?? `{${name}}`))}`;

const makeReq = (
  body: Record<string, unknown>,
  params: Record<string, string> = {},
  query: Record<string, unknown> = {},
) => ({ body, params, query, organizationId: 7, userId: 5, t }) as any;

const sentErrors = (res: any) => (res.json.mock.calls[0][0] as any).data.errors as any[];

describe("incident controller field validation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockImplementation(async (incident: any) => {
      const row = { ...incident, id: 3 };
      return { ...row, dataValues: row, toSafeJSON: () => row };
    });
    const stored = {
      id: 42,
      ...VALID_CREATE,
      occurred_date: new Date(2026, 5, 20),
      date_detected: new Date(2026, 5, 23),
      status: "Open",
      approval_status: "Pending",
      categories_of_harm: ["Safety"],
    };
    mockGetById.mockResolvedValue({ ...stored, dataValues: stored, toSafeJSON: () => stored });
  });

  describe("create", () => {
    it("answers 400 with a translated error per missing required field, writing nothing", async () => {
      const res = makeRes();
      await createNewIncident(makeReq({ description: VALID_CREATE.description }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      const errors = sentErrors(res);
      expect(errors.map((e) => e.field).sort()).toEqual(
        ["ai_project", "date_detected", "occurred_date", "reporter", "severity", "type"].sort(),
      );
      expect(errors.find((e) => e.field === "type")).toEqual({
        field: "type",
        message: "t:type is required",
        code: "REQUIRED_FIELD",
      });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it.each([
      ["severity", "High"],
      ["status", "Banana"],
      ["type", "Banana"],
      ["model_system_version", "v".repeat(256)],
      ["ai_project", "p".repeat(256)],
      ["categories_of_harm", 42],
      ["categories_of_harm", { a: 1 }],
    ])("answers 400 for %s %p", async (field, value) => {
      const res = makeRes();
      await createNewIncident(makeReq({ ...VALID_CREATE, [field]: value }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(sentErrors(res).map((e) => e.field)).toEqual([field]);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("answers 400 when detected is before occurred", async () => {
      const res = makeRes();
      await createNewIncident(
        makeReq({ ...VALID_CREATE, occurred_date: "2026-06-23", date_detected: "2026-06-20" }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(sentErrors(res)).toEqual([
        {
          field: "date_detected",
          message: "t:date_detected cannot be earlier than occurred_date",
          code: "INVALID_DATE_ORDER",
        },
      ]);
    });

    it("defaults an omitted status to Open and approval status to Pending", async () => {
      const res = makeRes();
      await createNewIncident(makeReq(VALID_CREATE), res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockCreate.mock.calls[0][0]).toMatchObject({
        status: "Open",
        approval_status: "Pending",
      });
    });

    it("parses the comma-separated harm category form", async () => {
      const res = makeRes();
      await createNewIncident(
        makeReq({ ...VALID_CREATE, categories_of_harm: "Health, Rights" }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockCreate.mock.calls[0][0].categories_of_harm).toEqual(["Health", "Rights"]);
    });

    it("records the saved row in change history, not the request body", async () => {
      const res = makeRes();
      await createNewIncident(
        makeReq({ ...VALID_CREATE, approved_by: "Mallory", unknown_field: "x" }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(201);
      const recorded = mockHistory.mock.calls[0][3] as Record<string, unknown>;
      expect(recorded).toMatchObject({ id: 3, status: "Open", approval_status: "Pending" });
      expect(recorded.unknown_field).toBeUndefined();
      expect(recorded.approved_by ?? null).toBeNull();
    });
  });

  describe("update (shared write path)", () => {
    it.each([
      ["status", null],
      ["severity", null],
      ["severity", ""],
      ["type", "Banana"],
      ["reporter", "r".repeat(256)],
      ["categories_of_harm", { a: 1 }],
    ])("answers 400 for %s %p, writing nothing", async (field, value) => {
      const res = makeRes();
      await updateIncidentById(makeReq({ [field]: value }, { id: "42" }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(sentErrors(res).map((e) => e.field)).toEqual([field]);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("compares the date order against the stored row", async () => {
      const res = makeRes();
      await updateIncidentById(makeReq({ date_detected: "2026-06-19" }, { id: "42" }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(sentErrors(res)[0]).toMatchObject({
        field: "date_detected",
        code: "INVALID_DATE_ORDER",
      });
    });
  });

  describe("get by id", () => {
    it("answers 404 for an incident that is missing or in another organization", async () => {
      mockGetById.mockResolvedValue(null);
      const res = makeRes();
      await getIncidentById(makeReq({}, { id: "999" }), res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Not Found",
        data: "t:Incident not found",
      });
    });
  });

  describe("change history paging", () => {
    it.each(["-5", "0", "12abc", "101", "1.5"])("answers 400 for limit %p", async (limit) => {
      const res = makeRes();
      await getIncidentHistory(makeReq({}, { incidentId: "42" }, { limit }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Bad Request",
        data: "t:limit must be an integer from 1 to 100",
      });
      expect(mockGetHistory).not.toHaveBeenCalled();
    });

    it("answers 400 for a negative offset", async () => {
      const res = makeRes();
      await getIncidentHistory(makeReq({}, { incidentId: "42" }, { offset: "-1" }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("defaults to 100 and accepts the cap", async () => {
      for (const [query, limit] of [
        [{}, 100],
        [{ limit: "100", offset: "200" }, 100],
        [{ limit: "5" }, 5],
      ] as const) {
        mockGetHistory.mockClear();
        const res = makeRes();
        await getIncidentHistory(makeReq({}, { incidentId: "42" }, query), res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(mockGetHistory.mock.calls[0][2]).toBe(limit);
      }
    });
  });
});
