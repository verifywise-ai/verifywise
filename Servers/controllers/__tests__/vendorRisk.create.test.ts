import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

// Only leaf modules are mocked. The controller, and the create service it delegates to, run for
// real, so this file pins what POST /vendorRisks does regardless of where the logic lives.
jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../domain.layer/models/vendorRisk/vendorRisk.model", () => ({
  VendorRiskModel: { createNewVendorRisk: jest.fn() },
}));
jest.mock("../../utils/vendorRisk.utils", () => ({
  createNewVendorRiskQuery: jest.fn(),
  createVendorRiskFrameworkAssociations: jest.fn(),
  deleteVendorRiskByIdQuery: jest.fn(),
  deleteVendorRiskFrameworkAssociations: jest.fn(),
  getAllVendorRisksAllProjectsQuery: jest.fn(),
  getVendorRiskByIdQuery: jest.fn(),
  getVendorRisksByFrameworkIdQuery: jest.fn(),
  getVendorRisksByProjectIdQuery: jest.fn(),
  getVendorRisksByVendorIdQuery: jest.fn(),
  updateVendorRiskByIdQuery: jest.fn(),
}));
jest.mock("../../utils/vendorRiskChangeHistory.utils", () => ({
  recordVendorRiskCreation: jest.fn(),
  recordMultipleFieldChanges: jest.fn(),
  trackVendorRiskChanges: jest.fn(),
}));
jest.mock("../../services/inAppNotification.service", () => ({
  notifyUserAssigned: jest.fn(),
}));
jest.mock("../../services/riskLinks/vendorCandidates", () => ({
  notifyVendorRiskCandidates: jest.fn(),
}));
// The real module opens a BullMQ queue as soon as it is imported.
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueVendorRiskLinkRecompute: jest.fn(),
}));
jest.mock("../../utils/riskLink.utils", () => ({
  getVendorNoticeContextQuery: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: unknown) => ({ message: "OK", data: d }),
    201: (d: unknown) => ({ message: "Created", data: d }),
    500: (d: unknown) => ({ message: "Internal Server Error", data: d }),
    503: (d: unknown) => ({ message: "Service Unavailable", data: d }),
  },
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: (_req: unknown, err: unknown) => (err as Error).message,
}));

import { sequelize } from "../../database/db";
import { VendorRiskModel } from "../../domain.layer/models/vendorRisk/vendorRisk.model";
import {
  createNewVendorRiskQuery,
  createVendorRiskFrameworkAssociations,
} from "../../utils/vendorRisk.utils";
import { recordVendorRiskCreation } from "../../utils/vendorRiskChangeHistory.utils";
import { notifyUserAssigned } from "../../services/inAppNotification.service";
import { notifyVendorRiskCandidates } from "../../services/riskLinks/vendorCandidates";
import { enqueueVendorRiskLinkRecompute } from "../../services/automations/automationProducer";
import { getVendorNoticeContextQuery } from "../../utils/riskLink.utils";
import logger from "../../utils/logger/fileLogger";
import { logFailure, logSuccess } from "../../utils/logger/logHelper";
import { createVendorRisk } from "../vendorRisk.ctrl";

type AnyMock = jest.Mock<(...args: any[]) => any>;
const asMock = (fn: unknown): AnyMock => fn as AnyMock;

const ORG_ID = 1;
const USER_ID = 7;
const FRONTEND_URL = "https://app.example.test";

const requestBody = {
  vendor_id: 5,
  risk_description: "Vendor stores customer PII without encryption",
  impact_description: "Customer data could be exposed in a breach",
  likelihood: "Possible",
  risk_severity: "Major",
  action_plan: "Require encryption at rest",
  action_owner: null,
  risk_level: "High Risk",
};

// What the model factory returns and what the insert returns; the controller must pass them on as-is.
const builtModel = { builtBy: "VendorRiskModel.createNewVendorRisk" };
const insertedRisk = { id: 42, ...requestBody };

let transaction: { commit: AnyMock; rollback: AnyMock };
let consoleWarn: ReturnType<typeof jest.spyOn>;
let originalFrontendUrl: string | undefined;

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({
    body: { ...requestBody },
    userId: USER_ID,
    organizationId: ORG_ID,
    t: (key: string) => key,
    ...overrides,
  }) as unknown as Request;

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response & { status: AnyMock; json: AnyMock };
};

// The candidate notice runs in a .then chain after the handler has already answered.
const flush = () => new Promise((resolve) => setImmediate(resolve));

const callOrder = (fn: unknown): number => asMock(fn).mock.invocationCallOrder[0];

// Everything written to a warning channel: console.warn today, logger.warn once the logic is
// extracted. Either channel satisfies "the failure is reported".
const warnings = (): string[] =>
  [...consoleWarn.mock.calls, ...asMock(logger.warn).mock.calls].map((args) =>
    args.map(String).join(" "),
  );

describe("createVendorRisk", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    transaction = { commit: jest.fn(), rollback: jest.fn() };
    asMock(sequelize.transaction).mockResolvedValue(transaction);
    asMock(sequelize.query).mockImplementation(async (sql: string) => {
      if (sql.includes("FROM users")) return [{ name: "Ada", surname: "Lovelace" }];
      if (sql.includes("FROM vendors")) return [{ vendor_name: "Acme Corp" }];
      return [];
    });
    asMock(VendorRiskModel.createNewVendorRisk).mockResolvedValue(builtModel);
    asMock(createNewVendorRiskQuery).mockResolvedValue(insertedRisk);
    asMock(createVendorRiskFrameworkAssociations).mockResolvedValue(undefined);
    asMock(recordVendorRiskCreation).mockResolvedValue(undefined);
    asMock(enqueueVendorRiskLinkRecompute).mockResolvedValue(undefined);
    asMock(getVendorNoticeContextQuery).mockResolvedValue({ name: "Acme Corp", projectIds: [] });
    asMock(notifyVendorRiskCandidates).mockResolvedValue(undefined);
    asMock(notifyUserAssigned).mockResolvedValue(undefined);
    asMock(logSuccess).mockResolvedValue(undefined);
    asMock(logFailure).mockResolvedValue(undefined);
    consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    originalFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = FRONTEND_URL;
  });

  afterEach(() => {
    consoleWarn.mockRestore();
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
  });

  it("answers 201 with the created risk and commits the transaction", async () => {
    const req = makeReq();
    const res = makeRes();

    await createVendorRisk(req, res);

    expect(VendorRiskModel.createNewVendorRisk).toHaveBeenCalledWith(req.body);
    expect(asMock(createNewVendorRiskQuery)).toHaveBeenCalledWith(builtModel, ORG_ID, transaction);
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(transaction.rollback).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ message: "Created", data: insertedRisk });
    expect(logSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "Create",
        description: "Created new vendor risk",
        functionName: "createVendorRisk",
        userId: USER_ID,
        organizationId: ORG_ID,
      }),
    );
    expect(createVendorRiskFrameworkAssociations).not.toHaveBeenCalled();
  });

  it("links the requested frameworks inside the transaction, before the commit", async () => {
    const req = makeReq({ body: { ...requestBody, frameworks: [3, 4] } });

    await createVendorRisk(req, makeRes());

    expect(asMock(createVendorRiskFrameworkAssociations)).toHaveBeenCalledWith(
      [3, 4],
      insertedRisk.id,
      ORG_ID,
      transaction,
    );
    expect(callOrder(createVendorRiskFrameworkAssociations)).toBeLessThan(
      callOrder(transaction.commit),
    );
  });

  it("logs a framework association failure and still answers 201", async () => {
    asMock(createVendorRiskFrameworkAssociations).mockRejectedValue(
      new Error('relation "frameworks_vendorrisks" does not exist'),
    );
    const res = makeRes();

    await createVendorRisk(makeReq({ body: { ...requestBody, frameworks: [3] } }), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(transaction.rollback).not.toHaveBeenCalled();
    // The steps after the failed one still run.
    expect(recordVendorRiskCreation).toHaveBeenCalledTimes(1);
    const reported = warnings();
    expect(reported).toHaveLength(1);
    expect(reported[0]).toContain("Could not create framework associations");
    expect(reported[0]).toContain('relation "frameworks_vendorrisks" does not exist');
  });

  it("records the creation in the change history inside the transaction when a user is known", async () => {
    await createVendorRisk(makeReq(), makeRes());

    expect(asMock(recordVendorRiskCreation)).toHaveBeenCalledWith(
      insertedRisk.id,
      USER_ID,
      ORG_ID,
      insertedRisk,
      transaction,
    );
    expect(callOrder(recordVendorRiskCreation)).toBeLessThan(callOrder(transaction.commit));
  });

  it("skips the change history when the request carries no user id", async () => {
    const res = makeRes();

    await createVendorRisk(makeReq({ userId: undefined }), res);

    expect(recordVendorRiskCreation).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("enqueues the related-risk recompute after the commit", async () => {
    await createVendorRisk(makeReq(), makeRes());

    expect(enqueueVendorRiskLinkRecompute).toHaveBeenCalledWith(ORG_ID, insertedRisk.id);
    expect(callOrder(enqueueVendorRiskLinkRecompute)).toBeGreaterThan(
      callOrder(transaction.commit),
    );
  });

  it("announces the new risk to the owners of project risks in the vendor's use cases, after the commit", async () => {
    asMock(getVendorNoticeContextQuery).mockResolvedValue({
      name: "Acme Corp",
      projectIds: [11, 12],
    });

    await createVendorRisk(makeReq(), makeRes());
    await flush();

    expect(getVendorNoticeContextQuery).toHaveBeenCalledWith(ORG_ID, insertedRisk.vendor_id);
    expect(notifyVendorRiskCandidates).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      vendorId: insertedRisk.vendor_id,
      vendorName: "Acme Corp",
      projectIds: [11, 12],
      vendorRiskIds: [insertedRisk.id],
    });
    expect(callOrder(getVendorNoticeContextQuery)).toBeGreaterThan(callOrder(transaction.commit));
    expect(callOrder(notifyVendorRiskCandidates)).toBeGreaterThan(callOrder(transaction.commit));
  });

  it("sends no candidate notice when the vendor has no use cases", async () => {
    await createVendorRisk(makeReq(), makeRes());
    await flush();

    expect(getVendorNoticeContextQuery).toHaveBeenCalledTimes(1);
    expect(notifyVendorRiskCandidates).not.toHaveBeenCalled();
  });

  it("notifies the action owner after the commit when action_owner is set", async () => {
    asMock(createNewVendorRiskQuery).mockResolvedValue({ ...insertedRisk, action_owner: 9 });

    await createVendorRisk(makeReq(), makeRes());
    await flush();

    expect(sequelize.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM users"),
      expect.objectContaining({ replacements: { userId: USER_ID } }),
    );
    expect(sequelize.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM vendors"),
      expect.objectContaining({
        replacements: { organizationId: ORG_ID, vendorId: insertedRisk.vendor_id },
      }),
    );
    expect(notifyUserAssigned).toHaveBeenCalledWith(
      ORG_ID,
      9,
      {
        entityType: "Vendor Risk",
        entityId: insertedRisk.id,
        entityName: insertedRisk.risk_description,
        roleType: "Action Owner",
        entityUrl: `${FRONTEND_URL}/vendors?vendorRiskId=${insertedRisk.id}`,
      },
      "Ada Lovelace",
      FRONTEND_URL,
      {
        parentType: "Vendor",
        parentName: "Acme Corp",
        description: insertedRisk.impact_description,
      },
    );
    expect(callOrder(notifyUserAssigned)).toBeGreaterThan(callOrder(transaction.commit));
  });

  it("sends no action owner notification, and looks nothing up, when no action owner is set", async () => {
    await createVendorRisk(makeReq(), makeRes());
    await flush();

    expect(notifyUserAssigned).not.toHaveBeenCalled();
    expect(sequelize.query).not.toHaveBeenCalled();
  });

  it("answers 500 and rolls back when the insert throws", async () => {
    asMock(createNewVendorRiskQuery).mockRejectedValue(new Error("insert failed"));
    const res = makeRes();

    await createVendorRisk(makeReq(), res);
    await flush();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Internal Server Error",
      data: "insert failed",
    });
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(logFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "Create",
        description: "Failed to create vendor risk",
        functionName: "createVendorRisk",
        error: expect.objectContaining({ message: "insert failed" }),
      }),
    );
    expect(enqueueVendorRiskLinkRecompute).not.toHaveBeenCalled();
    expect(notifyUserAssigned).not.toHaveBeenCalled();
  });

  it("answers 500 and rolls back when recording the change history fails", async () => {
    asMock(recordVendorRiskCreation).mockRejectedValue(new Error("history failed"));
    const res = makeRes();

    await createVendorRisk(makeReq(), res);
    await flush();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(enqueueVendorRiskLinkRecompute).not.toHaveBeenCalled();
  });

  it("answers 503, commits nothing and runs no side effects when the insert returns nothing", async () => {
    asMock(createNewVendorRiskQuery).mockResolvedValue(null);
    const res = makeRes();

    await createVendorRisk(makeReq({ body: { ...requestBody, frameworks: [3] } }), res);
    await flush();

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ message: "Service Unavailable", data: {} });
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(createVendorRiskFrameworkAssociations).not.toHaveBeenCalled();
    expect(recordVendorRiskCreation).not.toHaveBeenCalled();
    expect(enqueueVendorRiskLinkRecompute).not.toHaveBeenCalled();
    expect(getVendorNoticeContextQuery).not.toHaveBeenCalled();
    expect(notifyUserAssigned).not.toHaveBeenCalled();
    expect(logSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "Create",
        description: "Vendor risk creation returned null",
      }),
    );
  });

  // The one deliberate behaviour change of the extraction: the original left the transaction open.
  it("rolls back the transaction when the insert returns nothing", async () => {
    asMock(createNewVendorRiskQuery).mockResolvedValue(null);

    await createVendorRisk(makeReq(), makeRes());

    expect(transaction.rollback).toHaveBeenCalledTimes(1);
  });
});
