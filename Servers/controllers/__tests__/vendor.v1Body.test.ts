import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

// ADR 0001 (sections 1, 2 and 5): the other names and the identifiers are request fields that the
// frozen legacy POST /vendors and PATCH /vendors/:id never had. The /api/v1 routes take them, as thin
// adapters over the same controller code; the legacy routes drop them at the entry, so they neither
// validate, write nor record them. This file pins which body each entry point hands on.
//
// Only leaf modules are mocked (the same ones as vendor.autoResearch.test.ts). The controller and
// the validation module run for real.
jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
// A constructor, because an update builds the model of the stored vendor with `new`; the create goes
// through the static factory.
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
import {
  BusinessLogicException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";
import { triggerVendorOnboarding } from "../../services/workflows/triggers";
import { triggerAutoResearch } from "../../services/vendorResearch/trigger";
import { notifyVendorRiskCandidates } from "../../services/riskLinks/vendorCandidates";
import { notifyUserAssigned } from "../../services/inAppNotification.service";
import { recordVendorCreation, trackVendorChanges } from "../../utils/vendorChangeHistory.utils";
import {
  createNewVendorQuery,
  getVendorByIdQuery,
  updateVendorByIdQuery,
} from "../../utils/vendor.utils";
import { createVendor, createVendorV1, updateVendorById, updateVendorByIdV1 } from "../vendor.ctrl";

type AnyMock = jest.Mock<(...args: any[]) => any>;
const asMock = (fn: unknown): AnyMock => fn as AnyMock;

const ORG_ID = 4;
const USER_ID = 9;
const VENDOR_ID = 21;

/** The five fields that only the /api/v1 routes take, written out here and not read from the code. */
const V1_ONLY_FIELDS = ["other_names", "country", "registration_number", "lei", "sec_cik"] as const;

/** What a person types: not yet in the form it is stored in. */
const FIVE = {
  other_names: "Acme Analytics",
  country: "de",
  registration_number: "  HRB   12345 B ",
  lei: "test00acme analyt0143",
  sec_cik: "320193",
};
/** The same, as the change history records it. */
const FIVE_AS_STORED = {
  other_names: "Acme Analytics",
  country: "DE",
  registration_number: "HRB 12345 B",
  lei: "TEST00ACMEANALYT0143",
  sec_cik: "0000320193",
};

const CREATE_BODY = {
  vendor_name: "Acme",
  vendor_provides: "Payroll software",
  assignee: 2,
  website: "acme.com",
  vendor_contact_person: "Jo Doe",
  projects: [],
};

// What the model factory and the model of the stored vendor are: the controller calls them and
// passes them on as they are.
const model = {
  updateVendor: jest.fn(),
  validateVendorData: jest.fn(),
  canBeModified: jest.fn(),
};
const createdVendor = { id: VENDOR_ID, vendor_name: "Acme", assignee: null, reviewer: null };
const storedVendor = {
  id: VENDOR_ID,
  vendor_name: "Acme",
  assignee: 2,
  reviewer: null,
  projects: [],
};

let transaction: { commit: AnyMock; rollback: AnyMock };

const makeReq = (body: Record<string, unknown>, params: Record<string, string> = {}) =>
  ({
    body: { ...body },
    params,
    userId: USER_ID,
    role: "Admin",
    organizationId: ORG_ID,
    t: (key: string) => key,
  }) as unknown as Request;

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response & { status: AnyMock; json: AnyMock };
};

/** The arguments of the one call of `fn`. */
const onlyCall = (fn: unknown): any[] => {
  expect(asMock(fn)).toHaveBeenCalledTimes(1);
  return asMock(fn).mock.calls[0];
};

const keysOf = (value: unknown): string[] => Object.keys(value as object);

beforeEach(() => {
  jest.resetAllMocks();
  transaction = { commit: jest.fn(), rollback: jest.fn() };
  asMock(sequelize.transaction).mockResolvedValue(transaction);
  asMock(sequelize.query).mockResolvedValue([{ name: "Ada", surname: "Lovelace" }]);
  // `new VendorModel(stored vendor)` gives the model, and so does the static factory.
  asMock(VendorModel).mockImplementation(() => model);
  asMock((VendorModel as any).createNewVendor).mockResolvedValue(model);
  asMock(model.updateVendor).mockResolvedValue(undefined);
  asMock(model.validateVendorData).mockResolvedValue(undefined);
  asMock(model.canBeModified).mockReturnValue(true);
  asMock(createNewVendorQuery).mockResolvedValue({ ...createdVendor });
  asMock(getVendorByIdQuery).mockResolvedValue({ ...storedVendor });
  asMock(updateVendorByIdQuery).mockResolvedValue({ ...storedVendor, vendor_provides: "Changed" });
  asMock(recordVendorCreation).mockResolvedValue(undefined);
  asMock(trackVendorChanges).mockResolvedValue([]);
  asMock(triggerVendorOnboarding).mockResolvedValue(undefined);
  asMock(notifyVendorRiskCandidates).mockResolvedValue(undefined);
  asMock(notifyUserAssigned).mockResolvedValue(undefined);
  asMock(triggerAutoResearch).mockResolvedValue(undefined);
});

describe("POST /vendors, the legacy create", () => {
  it("answers 201 and hands the model, and the change history, none of the five fields", async () => {
    const res = makeRes();

    await createVendor(makeReq({ ...CREATE_BODY, ...FIVE }), res);

    expect(res.status).toHaveBeenCalledWith(201);
    const args = onlyCall((VendorModel as any).createNewVendor);
    // The rest of the body goes on as it always did.
    expect(args.slice(0, 5)).toEqual(["Acme", "Payroll software", 2, "acme.com", "Jo Doe"]);
    // Argument 17 is the other names and argument 18 the identifiers.
    expect(args[17]).toBeUndefined();
    expect(args[18]).toEqual({
      country: undefined,
      registration_number: undefined,
      lei: undefined,
      sec_cik: undefined,
    });
    const recorded = onlyCall(recordVendorCreation)[3];
    expect(recorded).toMatchObject({ vendor_name: "Acme", assignee: 2 });
    for (const field of V1_ONLY_FIELDS) expect(keysOf(recorded)).not.toContain(field);
  });

  it("drops them when they are empty too, since an empty one would clear a stored value", async () => {
    const empty = { other_names: "", country: "", registration_number: "", lei: null, sec_cik: "" };

    await createVendor(makeReq({ ...CREATE_BODY, ...empty }), makeRes());

    const args = onlyCall((VendorModel as any).createNewVendor);
    expect(args[17]).toBeUndefined();
    expect(args[18]).toEqual({});
    for (const field of V1_ONLY_FIELDS) {
      expect(keysOf(onlyCall(recordVendorCreation)[3])).not.toContain(field);
    }
  });
});

describe("POST /v1/vendors, the versioned create", () => {
  it("answers 201 and hands the model the fields as they were sent, and the change history their stored form", async () => {
    const res = makeRes();

    await createVendorV1(makeReq({ ...CREATE_BODY, ...FIVE }), res);

    expect(res.status).toHaveBeenCalledWith(201);
    const args = onlyCall((VendorModel as any).createNewVendor);
    expect(args.slice(0, 5)).toEqual(["Acme", "Payroll software", 2, "acme.com", "Jo Doe"]);
    expect(args[17]).toBe("Acme Analytics");
    expect(args[18]).toEqual({
      country: "de",
      registration_number: "  HRB   12345 B ",
      lei: "test00acme analyt0143",
      sec_cik: "320193",
    });
    expect(onlyCall(recordVendorCreation)[3]).toMatchObject(FIVE_AS_STORED);
  });
});

describe("PATCH /vendors/:id, the legacy update", () => {
  it("answers 202 and hands the model, and the change history, none of the five fields", async () => {
    const res = makeRes();
    // An empty one would clear the stored value, and an invalid one would be a 400, if they were read.
    const body = {
      vendor_provides: "Changed",
      other_names: "",
      country: "fr",
      registration_number: "x".repeat(65),
      lei: "wrong",
      sec_cik: "",
    };

    await updateVendorById(makeReq(body, { id: String(VENDOR_ID) }), res);

    expect(res.status).toHaveBeenCalledWith(202);
    const update = onlyCall(model.updateVendor)[0];
    expect(update.vendor_provides).toBe("Changed");
    for (const field of V1_ONLY_FIELDS) expect(update[field]).toBeUndefined();
    // The second argument is the body in the form the history records; the strip happened before it.
    expect(onlyCall(trackVendorChanges)[1]).toStrictEqual({ vendor_provides: "Changed" });
  });
});

describe("PATCH /v1/vendors/:id, the versioned update", () => {
  it("answers 202 and hands the model the fields as they were sent, and the change history their stored form", async () => {
    const res = makeRes();

    await updateVendorByIdV1(makeReq({ ...FIVE, country: "fr" }, { id: String(VENDOR_ID) }), res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(onlyCall(model.updateVendor)[0]).toMatchObject({ ...FIVE, country: "fr" });
    expect(onlyCall(trackVendorChanges)[1]).toMatchObject({ ...FIVE_AS_STORED, country: "FR" });
  });
});

// The two entry points are one controller flow with two bodies: whatever else happens, happens alike.
describe.each([
  ["createVendor", createVendor],
  ["createVendorV1", createVendorV1],
])("%s: the rest of the create is the same", (_name, create) => {
  it("commits once, starts the onboarding and the research of the new vendor, and answers 201", async () => {
    const res = makeRes();

    await create(makeReq(CREATE_BODY), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ message: "Created", data: createdVendor });
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(transaction.rollback).not.toHaveBeenCalled();
    expect(triggerVendorOnboarding).toHaveBeenCalledWith(ORG_ID, VENDOR_ID);
    expect(triggerAutoResearch).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      vendorId: VENDOR_ID,
      isDemo: false,
    });
  });

  it.each([
    ["a field the model refuses is a 400", new ValidationException("Bad", "website", "x"), 400],
    ["a demo vendor that cannot change is a 403", new BusinessLogicException("Demo"), 403],
    ["any other failure is a 500", new Error("insert failed"), 500],
  ])("%s, with the transaction rolled back", async (_label, failure, status) => {
    asMock((VendorModel as any).createNewVendor).mockRejectedValue(failure);
    const res = makeRes();

    await create(makeReq(CREATE_BODY), res);

    expect(res.status).toHaveBeenCalledWith(status);
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(triggerAutoResearch).not.toHaveBeenCalled();
  });
});

describe.each([
  ["updateVendorById", updateVendorById],
  ["updateVendorByIdV1", updateVendorByIdV1],
])("%s: the rest of the update is the same", (_name, update) => {
  const params = { id: String(VENDOR_ID) };

  it("commits once and answers 202 with the updated vendor", async () => {
    const res = makeRes();

    await update(makeReq({ vendor_provides: "Changed" }, params), res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({
      message: "Accepted",
      data: { ...storedVendor, vendor_provides: "Changed" },
    });
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(transaction.rollback).not.toHaveBeenCalled();
    expect(getVendorByIdQuery).toHaveBeenCalledWith(VENDOR_ID, ORG_ID);
  });

  it("answers 404 for a vendor that is not stored in the organization, and writes nothing", async () => {
    asMock(getVendorByIdQuery).mockResolvedValue(null);
    const res = makeRes();

    await update(makeReq({ vendor_provides: "Changed" }, params), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
    expect(updateVendorByIdQuery).not.toHaveBeenCalled();
  });

  it("answers 400 for a field the model refuses, and rolls back", async () => {
    asMock(model.updateVendor).mockRejectedValue(new ValidationException("Bad", "website", "x"));
    const res = makeRes();

    await update(makeReq({ website: "x" }, params), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
    expect(updateVendorByIdQuery).not.toHaveBeenCalled();
  });
});
