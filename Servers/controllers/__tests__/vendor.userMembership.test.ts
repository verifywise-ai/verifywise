import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

// The assignee and the reviewer of a vendor are told of the assignment by email, with the vendor's
// name and what it provides. Nothing in the database ties them to the vendor's organization, so the
// create and the update refuse a user of another organization (SEC-1), on the /api/v1 routes and on
// the legacy ones, which share the code. The update of /api/v1 also reads its id strictly.
//
// The membership lookup (utils/user.utils) is replaced by a table of members per organization; the
// check that reads it (services/vendorResearch/assignee) and the controller run for real.
jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../domain.layer/models/vendor/vendor.model", () => {
  const VendorModel: any = jest.fn();
  VendorModel.createNewVendor = jest.fn();
  return { VendorModel };
});
jest.mock("../../utils/vendor.utils", () => ({
  createNewVendorQuery: jest.fn(),
  deleteVendorByIdQuery: jest.fn(),
  getAllVendorsQuery: jest.fn(),
  getVendorByIdQuery: jest.fn(),
  getVendorByProjectIdQuery: jest.fn(),
  updateVendorByIdQuery: jest.fn(),
  visibleVendorProjectIds: jest.fn(),
}));
// The diffs the change history records: the controller decides what goes into them.
jest.mock("../../utils/changeHistory.base.utils", () => ({
  ...(jest.requireActual("../../utils/changeHistory.base.utils") as object),
  trackEntityChanges: jest.fn(),
}));
jest.mock("../../utils/user.utils", () => ({ findUsersNotInOrganization: jest.fn() }));
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
    201: (d: unknown) => ({ message: "Created", data: d }),
    202: (d: unknown) => ({ message: "Accepted", data: d }),
    400: (d: unknown) => ({ message: "Bad Request", data: d }),
    401: (d: unknown) => ({ message: "Unauthorized", data: d }),
    403: (d: unknown) => ({ message: "Forbidden", data: d }),
    404: (d: unknown) => ({ message: "Not Found", data: d }),
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
import { triggerAutoResearch } from "../../services/vendorResearch/trigger";
import { triggerVendorOnboarding } from "../../services/workflows/triggers";
import { findUsersNotInOrganization } from "../../utils/user.utils";
import { recordVendorCreation } from "../../utils/vendorChangeHistory.utils";
import { trackEntityChanges } from "../../utils/changeHistory.base.utils";
import {
  createNewVendorQuery,
  getVendorByIdQuery,
  updateVendorByIdQuery,
  visibleVendorProjectIds,
} from "../../utils/vendor.utils";
import { createVendor, createVendorV1, updateVendorById, updateVendorByIdV1 } from "../vendor.ctrl";

type AnyMock = jest.Mock<(...args: any[]) => any>;
const asMock = (fn: unknown): AnyMock => fn as AnyMock;

const ORG = 4;
const OTHER_ORG = 8;
const EDITOR = 9;
const COLLEAGUE = 2;
const OTHER_COLLEAGUE = 3;
/** A user of another organization only. */
const STRANGER = 77;
const VENDOR_ID = 21;

const MEMBERS: Record<number, number[]> = {
  [ORG]: [EDITOR, COLLEAGUE, OTHER_COLLEAGUE],
  [OTHER_ORG]: [STRANGER],
};

const CREATE_BODY = {
  vendor_name: "Example Ltd",
  vendor_provides: "Payroll software",
  assignee: COLLEAGUE,
  website: "example.com",
  vendor_contact_person: "Casey Sample",
  projects: [],
};

const storedVendor = {
  id: VENDOR_ID,
  vendor_name: "Example Ltd",
  vendor_provides: "Payroll software",
  assignee: COLLEAGUE,
  reviewer: null as number | null,
  projects: [],
};

let transaction: { commit: AnyMock; rollback: AnyMock };

const makeReq = (body: Record<string, unknown>, params: Record<string, string> = {}) =>
  ({
    body: { ...body },
    params,
    userId: EDITOR,
    role: "Editor",
    organizationId: ORG,
    t: (key: string) => key,
  }) as unknown as Request;

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response & { status: AnyMock; json: AnyMock };
};

/** A model as the real one holds the people: as given, with no reviewer as null. */
const modelOf = (people: { assignee?: unknown; reviewer?: unknown }) => {
  const model: any = {
    assignee: people.assignee,
    reviewer: people.reviewer ?? null,
    validateVendorData: jest.fn(async () => undefined),
    canBeModified: jest.fn(() => true),
    updateVendor: jest.fn(async (update: { assignee?: unknown; reviewer?: unknown }) => {
      if (update.assignee !== undefined) model.assignee = update.assignee;
      if (update.reviewer !== undefined) model.reviewer = update.reviewer;
    }),
  };
  return model;
};

/** Nothing was written and nobody was told. */
const expectNothingWritten = () => {
  expect(createNewVendorQuery).not.toHaveBeenCalled();
  expect(updateVendorByIdQuery).not.toHaveBeenCalled();
  expect(recordVendorCreation).not.toHaveBeenCalled();
  expect(transaction.commit).not.toHaveBeenCalled();
  expect(notifyUserAssigned).not.toHaveBeenCalled();
};

beforeEach(() => {
  jest.resetAllMocks();
  // Every use case sent is one the user can see.
  asMock(visibleVendorProjectIds).mockImplementation(async (ids: unknown[]) => ids.map(Number));
  asMock(trackEntityChanges).mockResolvedValue([]);
  transaction = { commit: jest.fn(), rollback: jest.fn() };
  asMock(sequelize.transaction).mockResolvedValue(transaction);
  asMock(sequelize.query).mockResolvedValue([{ name: "Casey", surname: "Sample" }]);
  asMock(findUsersNotInOrganization).mockImplementation(
    async (ids: number[], organizationId: number) =>
      ids.filter((id) => !(MEMBERS[organizationId] ?? []).includes(id)),
  );
  // The factory takes the assignee third and the reviewer eighth, as the controller passes them.
  asMock((VendorModel as any).createNewVendor).mockImplementation(async (...args: unknown[]) =>
    modelOf({ assignee: args[2], reviewer: args[7] }),
  );
  asMock(VendorModel).mockImplementation((stored: typeof storedVendor) => modelOf(stored));
  asMock(createNewVendorQuery).mockImplementation(async (model: any) => ({
    id: VENDOR_ID,
    vendor_name: "Example Ltd",
    assignee: model.assignee,
    reviewer: model.reviewer,
  }));
  asMock(getVendorByIdQuery).mockResolvedValue({ ...storedVendor });
  // The database stores the people as numbers, whatever form the request gave them in.
  asMock(updateVendorByIdQuery).mockImplementation(async ({ vendor }: any) => ({
    ...storedVendor,
    assignee: Number(vendor.assignee),
    reviewer: vendor.reviewer === null ? null : Number(vendor.reviewer),
  }));
  asMock(notifyUserAssigned).mockResolvedValue(undefined);
  asMock(triggerVendorOnboarding).mockResolvedValue(undefined);
  asMock(notifyVendorRiskCandidates).mockResolvedValue(undefined);
  asMock(triggerAutoResearch).mockResolvedValue(undefined);
});

describe.each([
  ["POST /vendors", createVendor],
  ["POST /v1/vendors", createVendorV1],
])("%s", (_route, create) => {
  it("refuses with a 400 an assignee who is a user of another organization, and emails nobody", async () => {
    const res = makeRes();

    await create(makeReq({ ...CREATE_BODY, assignee: STRANGER }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Bad Request",
      data: "The assignee must be a user of your organization",
    });
    expect(asMock(findUsersNotInOrganization)).toHaveBeenCalledWith([STRANGER], ORG, transaction);
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
    expectNothingWritten();
  });

  it("refuses with a 400 a reviewer who is a user of another organization", async () => {
    const res = makeRes();

    await create(makeReq({ ...CREATE_BODY, reviewer: STRANGER }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Bad Request",
      data: "The reviewer must be a user of your organization",
    });
    expectNothingWritten();
  });

  it("refuses a user id that belongs to no organization at all", async () => {
    const res = makeRes();

    await create(makeReq({ ...CREATE_BODY, assignee: 4040 }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expectNothingWritten();
  });

  it("creates the vendor and tells the assignee and the reviewer when both belong to the organization", async () => {
    const res = makeRes();

    await create(makeReq({ ...CREATE_BODY, reviewer: OTHER_COLLEAGUE }), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    const told = asMock(notifyUserAssigned).mock.calls.map((call) => [call[0], call[1]]);
    expect(told).toEqual([
      [ORG, COLLEAGUE],
      [ORG, OTHER_COLLEAGUE],
    ]);
  });

  it("takes an assignee written as digits, as the model does", async () => {
    const res = makeRes();

    await create(makeReq({ ...CREATE_BODY, assignee: String(COLLEAGUE) }), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(asMock(findUsersNotInOrganization)).toHaveBeenCalledWith([COLLEAGUE], ORG, transaction);
  });

  it.each([[null], [0], [undefined]])(
    "looks nobody up for a reviewer of %p, which is no reviewer",
    async (reviewer) => {
      const res = makeRes();

      await create(makeReq({ ...CREATE_BODY, reviewer }), res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(findUsersNotInOrganization).toHaveBeenCalledTimes(1);
      expect(asMock(findUsersNotInOrganization)).toHaveBeenCalledWith(
        [COLLEAGUE],
        ORG,
        transaction,
      );
    },
  );
});

describe.each([
  ["PATCH /vendors/:id", updateVendorById],
  ["PATCH /v1/vendors/:id", updateVendorByIdV1],
])("%s", (_route, update) => {
  const params = { id: String(VENDOR_ID) };

  it("refuses with a 400 a new assignee who is a user of another organization, and emails nobody", async () => {
    const res = makeRes();

    await update(makeReq({ assignee: STRANGER }, params), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Bad Request",
      data: "The assignee must be a user of your organization",
    });
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
    expectNothingWritten();
  });

  it("refuses with a 400 a new reviewer who is a user of another organization", async () => {
    const res = makeRes();

    await update(makeReq({ reviewer: STRANGER }, params), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Bad Request",
      data: "The reviewer must be a user of your organization",
    });
    expectNothingWritten();
  });

  it("takes a new assignee of the organization and tells them", async () => {
    const res = makeRes();

    await update(makeReq({ assignee: OTHER_COLLEAGUE }, params), res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(asMock(findUsersNotInOrganization)).toHaveBeenCalledWith(
      [OTHER_COLLEAGUE],
      ORG,
      transaction,
    );
    expect(asMock(notifyUserAssigned).mock.calls[0].slice(0, 2)).toEqual([ORG, OTHER_COLLEAGUE]);
  });

  it("does not check again the people the vendor already has, which the form sends back", async () => {
    // A vendor stored before the check could hold a user who has since left the organization:
    // editing another field of it must still work, and that user is not told again.
    asMock(getVendorByIdQuery).mockResolvedValue({
      ...storedVendor,
      assignee: STRANGER,
      reviewer: STRANGER,
    });
    const res = makeRes();

    await update(
      makeReq(
        { vendor_provides: "Changed", assignee: STRANGER, reviewer: String(STRANGER) },
        params,
      ),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(202);
    expect(findUsersNotInOrganization).not.toHaveBeenCalled();
    expect(notifyUserAssigned).not.toHaveBeenCalled();
  });
});

describe("PATCH /v1/vendors/:id reads the id strictly", () => {
  it.each([["abc"], ["12abc"], ["0"], ["-3"], ["1.5"], ["9007199254740993"], [""]])(
    "answers 400 for the id %p, before anything is read or a transaction is opened",
    async (id) => {
      const res = makeRes();

      await updateVendorByIdV1(makeReq({ vendor_provides: "Changed" }, { id }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Bad Request", data: "Invalid vendor ID" });
      expect(sequelize.transaction).not.toHaveBeenCalled();
      expect(getVendorByIdQuery).not.toHaveBeenCalled();
      expect(updateVendorByIdQuery).not.toHaveBeenCalled();
    },
  );

  it("takes an id of digits", async () => {
    const res = makeRes();

    await updateVendorByIdV1(makeReq({ vendor_provides: "Changed" }, { id: "21" }), res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(getVendorByIdQuery).toHaveBeenCalledWith(
      VENDOR_ID,
      ORG,
      expect.objectContaining({ forUpdate: true }),
    );
  });

  // The legacy route used to read "21abc" as vendor 21; it refuses such an id too now.
  it("refuses an id that is not one on the legacy route as well", async () => {
    const res = makeRes();

    await updateVendorById(makeReq({ vendor_provides: "Changed" }, { id: "21abc" }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(sequelize.transaction).not.toHaveBeenCalled();
    expect(getVendorByIdQuery).not.toHaveBeenCalled();
  });
});
