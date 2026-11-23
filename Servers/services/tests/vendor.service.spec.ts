/**
 * The vendor write service shared by the console and the Advisor: one
 * transaction per write, history only for a known user, use case links
 * limited to what the user can see, and side effects only after commit.
 */
const mockTransaction = { commit: jest.fn(), rollback: jest.fn() };
jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(async () => [{ name: "Ada", surname: "Lovelace" }]),
    transaction: jest.fn(async () => mockTransaction),
  },
}));
jest.mock("../../utils/vendor.utils");
jest.mock("../../utils/vendorChangeHistory.utils");
jest.mock("../../utils/changeHistory.base.utils", () => ({
  trackEntityChanges: jest.fn(async () => []),
}));
jest.mock("../../domain.layer/models/vendor/vendor.model");
jest.mock("../inAppNotification.service", () => ({
  notifyUserAssigned: jest.fn(async () => undefined),
}));
jest.mock("../workflows/triggers", () => ({
  triggerVendorOnboarding: jest.fn(async () => undefined),
}));
jest.mock("../riskLinks/vendorCandidates", () => ({
  notifyVendorRiskCandidates: jest.fn(async () => undefined),
}));
jest.mock("../automations/automationProducer", () => ({
  enqueueVendorRiskLinkRecomputeBatch: jest.fn(async () => undefined),
}));
jest.mock("../../utils/vendorRiskLink.utils", () => ({
  getActiveVendorRiskIdsQuery: jest.fn(async () => [31, 32]),
}));

import { createVendor, deleteVendor, updateVendor } from "../vendor.service";
import { VendorModel } from "../../domain.layer/models/vendor/vendor.model";
import {
  createNewVendorQuery,
  deleteVendorByIdQuery,
  getVendorByIdQuery,
  updateVendorByIdQuery,
  visibleVendorProjectIds,
} from "../../utils/vendor.utils";
import {
  recordMultipleFieldChanges,
  recordVendorCreation,
} from "../../utils/vendorChangeHistory.utils";
import { trackEntityChanges } from "../../utils/changeHistory.base.utils";
import { notifyUserAssigned } from "../inAppNotification.service";
import { triggerVendorOnboarding } from "../workflows/triggers";
import { enqueueVendorRiskLinkRecomputeBatch } from "../automations/automationProducer";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

const ORG = 10;
const USER = 1;
const actor = { userId: USER, role: "Editor", organizationId: ORG };

const mockCreateModel = VendorModel.createNewVendor as jest.Mock;
const mockCreateQuery = createNewVendorQuery as jest.Mock;
const mockGetById = getVendorByIdQuery as jest.Mock;
const mockUpdateQuery = updateVendorByIdQuery as jest.Mock;
const mockDeleteQuery = deleteVendorByIdQuery as jest.Mock;
const mockVisible = visibleVendorProjectIds as jest.Mock;
const mockTrack = trackEntityChanges as jest.Mock;
const mockNotify = notifyUserAssigned as jest.Mock;

const model = {
  validateVendorData: jest.fn(async () => undefined),
  canBeModified: jest.fn(),
};
const created = {
  id: 5,
  vendor_name: "Model host",
  vendor_provides: "Hosted models",
  assignee: 7,
  reviewer: null,
  projects: [3],
  risk_score: 40,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateModel.mockResolvedValue(model);
  mockCreateQuery.mockResolvedValue(created);
  mockVisible.mockResolvedValue([3]);
  (VendorModel as unknown as jest.Mock).mockImplementation(() => ({
    updateVendor: jest.fn(async () => undefined),
  }));
});

describe("createVendor", () => {
  const input = {
    vendor_name: "Model host",
    vendor_provides: "Hosted models",
    website: "https://example.com",
    vendor_contact_person: "Ada",
    assignee: 7,
    projects: [3, 4],
  };

  it("links only the use cases the user can see, on the write's transaction", async () => {
    await createVendor(input, actor);
    expect(mockVisible).toHaveBeenCalledWith(
      [3, 4],
      { userId: USER, role: "Editor", transaction: mockTransaction },
      ORG,
    );
    expect(mockCreateModel.mock.calls[0][11]).toEqual([3]);
  });

  it("records history, commits, then starts onboarding and notifies the assignee", async () => {
    await expect(createVendor(input, actor)).resolves.toBe(created);
    expect(recordVendorCreation).toHaveBeenCalledWith(
      5,
      USER,
      ORG,
      expect.objectContaining({ risk_score: 40, projects: [3] }),
      mockTransaction,
    );
    expect(mockTransaction.commit).toHaveBeenCalled();
    expect(triggerVendorOnboarding).toHaveBeenCalledWith(ORG, 5);
    expect(mockNotify).toHaveBeenCalledWith(
      ORG,
      7,
      expect.objectContaining({ roleType: "Assignee", entityId: 5 }),
      "Ada Lovelace",
      expect.any(String),
      expect.anything(),
    );
  });

  it("does not notify the user who assigned the new vendor to themselves", async () => {
    mockCreateQuery.mockResolvedValue({ ...created, assignee: USER });
    await createVendor({ ...input, assignee: USER }, actor);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("records no history for an unknown user", async () => {
    await createVendor(input, { role: "Admin", organizationId: ORG });
    expect(recordVendorCreation).not.toHaveBeenCalled();
    expect(mockTransaction.commit).toHaveBeenCalled();
  });

  it("rolls back and starts nothing when validation fails", async () => {
    model.validateVendorData.mockRejectedValueOnce(new ValidationException("bad"));
    await expect(createVendor(input, actor)).rejects.toBeInstanceOf(ValidationException);
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockTransaction.commit).not.toHaveBeenCalled();
    expect(triggerVendorOnboarding).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("answers null when the insert returns nothing", async () => {
    mockCreateQuery.mockResolvedValue(null);
    await expect(createVendor(input, actor)).resolves.toBeNull();
    expect(mockTransaction.rollback).toHaveBeenCalled();
  });
});

describe("updateVendor", () => {
  const existing = { id: 5, vendor_name: "Model host", assignee: 7, reviewer: null, projects: [3] };

  beforeEach(() => {
    mockGetById.mockResolvedValue(existing);
    mockUpdateQuery.mockResolvedValue({ ...existing, reviewer: 8, projects: [3, 4] });
    mockTrack.mockResolvedValueOnce([{ fieldName: "reviewer" }]);
  });

  it("answers null and rolls back for an unknown vendor", async () => {
    mockGetById.mockResolvedValue(null);
    await expect(updateVendor(5, { website: "https://a.b" }, actor)).resolves.toBeNull();
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockUpdateQuery).not.toHaveBeenCalled();
  });

  it("locks the row it diffs and writes as the user, with their role", async () => {
    await updateVendor(5, { reviewer: 8 }, actor);
    expect(mockGetById).toHaveBeenCalledWith(5, ORG, {
      transaction: mockTransaction,
      forUpdate: true,
    });
    expect(mockUpdateQuery).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5, userId: USER, role: "Editor" }),
      ORG,
    );
  });

  it("records the field changes and the use case links as stored before and after", async () => {
    await updateVendor(5, { reviewer: 8 }, actor);
    expect(mockTrack).toHaveBeenLastCalledWith(
      "vendor",
      { projects: [3] },
      { projects: [3, 4] },
      { organizationId: ORG, transaction: mockTransaction },
    );
    expect(recordMultipleFieldChanges).toHaveBeenCalledWith(
      5,
      USER,
      ORG,
      [{ fieldName: "reviewer" }],
      mockTransaction,
    );
  });

  it("rescores the vendor's risks when its use cases change", async () => {
    await updateVendor(5, { projects: [3, 4] }, actor);
    await new Promise((resolve) => setImmediate(resolve));
    expect(enqueueVendorRiskLinkRecomputeBatch).toHaveBeenCalledWith(ORG, [31, 32], "vendor-5");
  });

  it("notifies only a newly assigned user", async () => {
    await updateVendor(5, { reviewer: 8 }, actor);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify.mock.calls[0][1]).toBe(8);
    expect(mockNotify.mock.calls[0][2]).toMatchObject({ roleType: "Reviewer" });
  });

  it("does not notify the user who assigned themselves", async () => {
    mockUpdateQuery.mockResolvedValue({ ...existing, reviewer: USER });
    await updateVendor(5, { reviewer: USER }, actor);
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe("deleteVendor", () => {
  it("deletes as the user and commits", async () => {
    mockDeleteQuery.mockResolvedValue(true);
    await expect(deleteVendor(5, actor)).resolves.toBe(true);
    expect(mockDeleteQuery).toHaveBeenCalledWith(5, ORG, mockTransaction, USER);
    expect(mockTransaction.commit).toHaveBeenCalled();
  });

  it("answers false and rolls back for an unknown vendor", async () => {
    mockDeleteQuery.mockResolvedValue(false);
    await expect(deleteVendor(5, actor)).resolves.toBe(false);
    expect(mockTransaction.rollback).toHaveBeenCalled();
  });
});
