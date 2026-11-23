import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

// PATCH /vendorRisks/:id. Only leaf modules are mocked: the controller and the vendor risk service
// run for real. The update query is mocked but runs the real action owner guard first, as the real
// one does (assertVendorRiskOwnerInOrganization in utils/vendorRisk.utils), and the membership
// table behind it (the organization_members lookup) is answered here.
jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
// The model keeps the fields it is given, as the real one does.
jest.mock("../../domain.layer/models/vendorRisk/vendorRisk.model", () => ({
  VendorRiskModel: jest.fn().mockImplementation(() => {
    const model: Record<string, unknown> = {};
    model.updateVendorRisk = jest.fn(async (fields: object) => Object.assign(model, fields));
    return model;
  }),
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
    202: (d: unknown) => ({ message: "Accepted", data: d }),
    400: (d: unknown) => ({ message: "Bad Request", data: d }),
    404: (d: unknown) => ({ message: "Not Found", data: d }),
    500: (d: unknown) => ({ message: "Internal Server Error", data: d }),
  },
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: (_req: unknown, err: unknown) => (err as Error).message,
}));

import { sequelize } from "../../database/db";
import { getVendorRiskByIdQuery, updateVendorRiskByIdQuery } from "../../utils/vendorRisk.utils";
import { trackVendorRiskChanges } from "../../utils/vendorRiskChangeHistory.utils";
import { notifyUserAssigned } from "../../services/inAppNotification.service";
import { enqueueVendorRiskLinkRecompute } from "../../services/automations/automationProducer";
import { logFailure, logSuccess } from "../../utils/logger/logHelper";
import { updateVendorRiskById } from "../vendorRisk.ctrl";

type AnyMock = jest.Mock<(...args: any[]) => any>;
const asMock = (fn: unknown): AnyMock => fn as AnyMock;

/** The tenant guard the real update runs before writing. */
const { assertVendorRiskOwnerInOrganization } = jest.requireActual(
  "../../utils/vendorRisk.utils",
) as typeof import("../../utils/vendorRisk.utils");

const ORG_ID = 1;
const USER_ID = 7;
const OWN_USER = 12;
const OTHER_ORG_USER = 99;
const STORED_OWNER = 8;

const storedRisk = {
  id: 42,
  vendor_id: 5,
  risk_description: "Example Ltd stores customer data without encryption",
  impact_description: "Customer data could be exposed",
  action_owner: STORED_OWNER,
};

let transaction: { commit: AnyMock; rollback: AnyMock };
/** Users who are not members of the organization. */
let outsiders: number[];
/** Set to make the membership lookup fail. */
let lookupError: Error | null;

/** The membership lookups made, as [user ids, organization, transaction]. */
const memberLookups = () =>
  asMock(sequelize.query)
    .mock.calls.filter(([sql]) => String(sql).includes("user_id IN (:userIds)"))
    .map(([, options]: any[]) => [
      options.replacements.userIds,
      options.replacements.organizationId,
      options.transaction,
    ]);

const makeReq = (body: Record<string, unknown>): Request =>
  ({
    params: { id: "42" },
    body,
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

describe("updateVendorRiskById: the action owner", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    transaction = { commit: jest.fn(), rollback: jest.fn() };
    asMock(sequelize.transaction).mockResolvedValue(transaction);
    outsiders = [OTHER_ORG_USER];
    lookupError = null;
    asMock(sequelize.query).mockImplementation(async (sql: string, options: any) => {
      if (sql.includes("user_id IN (:userIds)")) {
        if (lookupError) throw lookupError;
        return (options.replacements.userIds as number[])
          .filter((id) => !outsiders.includes(id))
          .map((id) => ({ id }));
      }
      if (sql.includes("FROM users")) return [{ name: "Casey", surname: "Sample" }];
      if (sql.includes("FROM vendors")) return [{ vendor_name: "Example Ltd" }];
      return [];
    });
    asMock(getVendorRiskByIdQuery).mockResolvedValue(storedRisk);
    asMock(updateVendorRiskByIdQuery).mockImplementation(
      async (_id: number, vendorRisk: any, organizationId: number, tx: any) => {
        await assertVendorRiskOwnerInOrganization(
          vendorRisk.action_owner,
          organizationId,
          tx,
          storedRisk.action_owner,
        );
        return { ...storedRisk };
      },
    );
    asMock(trackVendorRiskChanges).mockResolvedValue([]);
    asMock(enqueueVendorRiskLinkRecompute).mockResolvedValue(undefined);
    asMock(notifyUserAssigned).mockResolvedValue(undefined);
    asMock(logSuccess).mockResolvedValue(undefined);
    asMock(logFailure).mockResolvedValue(undefined);
  });

  it("refuses with a 400 a new owner who is a user of another organization, and writes and sends nothing", async () => {
    const res = makeRes();

    await updateVendorRiskById(makeReq({ action_owner: OTHER_ORG_USER }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Bad Request",
      data: "The action owner must be a member of this organization",
    });
    expect(memberLookups()).toEqual([[[OTHER_ORG_USER], ORG_ID, transaction]]);
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(notifyUserAssigned).not.toHaveBeenCalled();
  });

  it.each([
    ["an id that cannot be a user's", "not-a-user"],
    ["a fraction", 1.5],
  ])("refuses %s with a 400", async (_name, owner) => {
    const res = makeRes();

    await updateVendorRiskById(makeReq({ action_owner: owner }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Bad Request",
      data: "The action owner is not a valid user id",
    });
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(notifyUserAssigned).not.toHaveBeenCalled();
  });

  it("accepts a new owner of the organization, as before, and tells them", async () => {
    // The row as saved, with the new owner: the notice goes by the saved value.
    asMock(updateVendorRiskByIdQuery).mockResolvedValueOnce({
      ...storedRisk,
      action_owner: OWN_USER,
    });
    const res = makeRes();

    await updateVendorRiskById(makeReq({ action_owner: OWN_USER }), res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(updateVendorRiskByIdQuery).toHaveBeenCalledTimes(1);
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(asMock(notifyUserAssigned).mock.calls[0][1]).toBe(OWN_USER);
  });

  it.each([
    ["the stored owner, sent again", STORED_OWNER],
    ["the stored owner, sent as text", String(STORED_OWNER)],
  ])(
    "does not check %s again, nor tell them again, so a risk whose owner has left can still be edited",
    async (_name, owner) => {
      // The stored owner has since left the organization.
      outsiders = [OTHER_ORG_USER, STORED_OWNER];
      const res = makeRes();

      await updateVendorRiskById(makeReq({ action_owner: owner, action_plan: "Encrypt" }), res);

      expect(res.status).toHaveBeenCalledWith(202);
      expect(memberLookups()).toEqual([]);
      expect(notifyUserAssigned).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["no owner in the request", {}],
    ["no owner (null)", { action_owner: null }],
  ])("makes no lookup for %s", async (_name, body) => {
    const res = makeRes();

    await updateVendorRiskById(makeReq({ ...body, action_plan: "Encrypt" }), res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(memberLookups()).toEqual([]);
  });

  it("answers 404 for a risk that is not in the organization, before any check", async () => {
    asMock(getVendorRiskByIdQuery).mockResolvedValue(null);
    const res = makeRes();

    await updateVendorRiskById(makeReq({ action_owner: OTHER_ORG_USER }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(memberLookups()).toEqual([]);
  });

  it("still answers 500 when the membership lookup fails", async () => {
    lookupError = new Error("connection lost");
    const res = makeRes();

    await updateVendorRiskById(makeReq({ action_owner: OWN_USER }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
  });
});
