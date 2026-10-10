import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

// Only leaf modules are mocked. The controller runs for real, so this file pins when POST /vendors
// starts the research of the new vendor: after the commit, once, and without waiting for it.
jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../domain.layer/models/vendor/vendor.model", () => ({
  VendorModel: { createNewVendor: jest.fn() },
}));
jest.mock("../../utils/vendor.utils", () => ({
  createNewVendorQuery: jest.fn(),
  deleteVendorByIdQuery: jest.fn(),
  getAllVendorsQuery: jest.fn(),
  getVendorByIdQuery: jest.fn(),
  getVendorByProjectIdQuery: jest.fn(),
  updateVendorByIdQuery: jest.fn(),
}));
jest.mock("../../utils/vendorChangeHistory.utils", () => ({
  recordVendorCreation: jest.fn(),
  trackVendorChanges: jest.fn(),
  recordMultipleFieldChanges: jest.fn(),
}));
jest.mock("../../utils/vendorRiskLink.utils", () => ({ getActiveVendorRiskIdsQuery: jest.fn() }));
jest.mock("../../services/inAppNotification.service", () => ({ notifyUserAssigned: jest.fn() }));
jest.mock("../../services/vendors/riskSuggestions", () => ({
  getVendorRiskSuggestions: jest.fn(),
}));
jest.mock("../../services/workflows/triggers", () => ({ triggerVendorOnboarding: jest.fn() }));
jest.mock("../../services/riskLinks/vendorCandidates", () => ({
  notifyVendorRiskCandidates: jest.fn(),
}));
// The real module opens a BullMQ queue as soon as it is imported.
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueVendorRiskLinkRecomputeBatch: jest.fn(),
}));
jest.mock("../../services/vendorResearch/trigger", () => ({ triggerAutoResearch: jest.fn() }));
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
    400: (d: unknown) => ({ message: "Bad Request", data: d }),
    403: (d: unknown) => ({ message: "Forbidden", data: d }),
    500: (d: unknown) => ({ message: "Internal Server Error", data: d }),
    503: (d: unknown) => ({ message: "Service Unavailable", data: d }),
  },
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: (_req: unknown, err: unknown) => (err as Error).message,
}));

import { sequelize } from "../../database/db";
import { VendorModel } from "../../domain.layer/models/vendor/vendor.model";
import { notifyUserAssigned } from "../../services/inAppNotification.service";
import { notifyVendorRiskCandidates } from "../../services/riskLinks/vendorCandidates";
import { triggerVendorOnboarding } from "../../services/workflows/triggers";
import { triggerAutoResearch } from "../../services/vendorResearch/trigger";
import { recordVendorCreation } from "../../utils/vendorChangeHistory.utils";
import { createNewVendorQuery } from "../../utils/vendor.utils";
import { createVendor } from "../vendor.ctrl";

type AnyMock = jest.Mock<(...args: any[]) => any>;
const asMock = (fn: unknown): AnyMock => fn as AnyMock;

const ORG_ID = 4;
const USER_ID = 9;

const requestBody = {
  vendor_name: "Acme",
  vendor_provides: "Payroll software",
  assignee: 2,
  website: "acme.com",
  vendor_contact_person: "Jo Doe",
  projects: [],
};

// What the model factory and the insert return; the controller passes them on as they are.
const builtModel = {
  validateVendorData: jest.fn(),
  canBeModified: jest.fn(),
};
const createdVendor = { id: 21, vendor_name: "Acme", assignee: null, reviewer: null };

let transaction: { commit: AnyMock; rollback: AnyMock };

const makeReq = (): Request =>
  ({
    body: { ...requestBody },
    userId: USER_ID,
    organizationId: ORG_ID,
    t: (key: string) => key,
  }) as unknown as Request;

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response & { status: AnyMock; json: AnyMock };
};

const callOrder = (fn: unknown): number => asMock(fn).mock.invocationCallOrder[0];

describe("createVendor: automatic research", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    transaction = { commit: jest.fn(), rollback: jest.fn() };
    asMock(sequelize.transaction).mockResolvedValue(transaction);
    asMock(sequelize.query).mockResolvedValue([{ name: "Ada", surname: "Lovelace" }]);
    asMock(VendorModel.createNewVendor).mockResolvedValue(builtModel);
    asMock(builtModel.validateVendorData).mockResolvedValue(undefined);
    asMock(builtModel.canBeModified).mockReturnValue(true);
    asMock(createNewVendorQuery).mockResolvedValue({ ...createdVendor });
    asMock(recordVendorCreation).mockResolvedValue(undefined);
    asMock(triggerVendorOnboarding).mockResolvedValue(undefined);
    asMock(notifyVendorRiskCandidates).mockResolvedValue(undefined);
    asMock(notifyUserAssigned).mockResolvedValue(undefined);
    asMock(triggerAutoResearch).mockResolvedValue(undefined);
  });

  it("starts the research of the created vendor once, after the commit, and does not wait for it", async () => {
    // A trigger that never settles: if the controller waited for it, this call would never return.
    asMock(triggerAutoResearch).mockReturnValue(new Promise(() => undefined));
    const res = makeRes();

    await createVendor(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(triggerAutoResearch).toHaveBeenCalledTimes(1);
    expect(triggerAutoResearch).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      vendorId: 21,
      isDemo: false,
    });
    expect(callOrder(triggerAutoResearch)).toBeGreaterThan(callOrder(transaction.commit));
  });

  it.each<[boolean | undefined, boolean]>([
    [undefined, false],
    [false, false],
    [true, true],
  ])("passes is_demo %p on as isDemo %p", async (isDemo, expected) => {
    asMock(createNewVendorQuery).mockResolvedValue({ ...createdVendor, is_demo: isDemo });

    await createVendor(makeReq(), makeRes());

    expect(triggerAutoResearch).toHaveBeenCalledWith(expect.objectContaining({ isDemo: expected }));
  });

  it("does not start research when the vendor could not be created", async () => {
    asMock(createNewVendorQuery).mockRejectedValue(new Error("insert failed"));
    const res = makeRes();

    await createVendor(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(transaction.rollback).toHaveBeenCalled();
    expect(triggerAutoResearch).not.toHaveBeenCalled();
  });

  it("does not start research when the insert returns nothing", async () => {
    asMock(createNewVendorQuery).mockResolvedValue(null);
    const res = makeRes();

    await createVendor(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(triggerAutoResearch).not.toHaveBeenCalled();
  });
});
