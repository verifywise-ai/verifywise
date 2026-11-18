import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockCreateQuery = jest.fn<(...args: any[]) => Promise<any>>();
const mockUpdateQuery = jest.fn<(...args: any[]) => Promise<any>>();
const mockGetById = jest.fn<(...args: any[]) => Promise<any>>();
const mockLock = jest.fn<(...args: any[]) => Promise<boolean>>();
const mockDeleteQuery = jest.fn<(...args: any[]) => Promise<any>>();
const mockProjectIds = jest.fn<(...args: any[]) => Promise<number[]>>();
const mockInsertLinks = jest.fn<(...args: any[]) => Promise<void>>();
jest.mock("../../utils/modelInventory.utils", () => ({
  createNewModelInventoryQuery: (...a: any[]) => mockCreateQuery(...a),
  updateModelInventoryByIdQuery: (...a: any[]) => mockUpdateQuery(...a),
  getModelInventoryByIdQuery: (...a: any[]) => mockGetById(...a),
  lockModelInventoryQuery: (...a: any[]) => mockLock(...a),
  deleteModelInventoryByIdQuery: (...a: any[]) => mockDeleteQuery(...a),
  getModelInventoryProjectIdsQuery: (...a: any[]) => mockProjectIds(...a),
  insertModelProjectLinks: (...a: any[]) => mockInsertLinks(...a),
}));

const mockResolveTargets = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../../utils/modelReferences.utils", () => ({
  ...(jest.requireActual("../../utils/modelReferences.utils") as object),
  resolveModelLinkTargets: (...a: any[]) => mockResolveTargets(...a),
  assertUseCaseWriteAccess: jest.fn(async () => undefined),
}));

const mockRecordCreation = jest.fn<(...args: any[]) => Promise<void>>();
const mockRecordDeletion = jest.fn<(...args: any[]) => Promise<void>>();
const mockRecordChanges = jest.fn<(...args: any[]) => Promise<void>>();
const mockTrack = jest.fn<(...args: any[]) => Promise<any[]>>();
jest.mock("../../utils/changeHistory.base.utils", () => ({
  recordEntityCreation: (...a: any[]) => mockRecordCreation(...a),
  recordEntityDeletion: (...a: any[]) => mockRecordDeletion(...a),
  recordMultipleFieldChanges: (...a: any[]) => mockRecordChanges(...a),
  trackEntityChanges: (...a: any[]) => mockTrack(...a),
}));

const mockMrm = jest.fn<(...args: any[]) => Promise<boolean>>();
jest.mock("../../utils/mrm.utils", () => ({
  modelHasMrmHistoryQuery: (...a: any[]) => mockMrm(...a),
}));

const mockTrigger = jest.fn<(...args: any[]) => Promise<void>>();
jest.mock("../workflows/triggers", () => ({
  triggerModelDeployment: (...a: any[]) => mockTrigger(...a),
}));
const mockProactive = jest.fn<(...args: any[]) => Promise<void>>();
jest.mock("../proactiveNotify", () => ({
  notifyProactive: (...a: any[]) => mockProactive(...a),
}));
const mockAssigned = jest.fn<(...args: any[]) => Promise<void>>();
jest.mock("../inAppNotification.service", () => ({
  notifyUserAssigned: (...a: any[]) => mockAssigned(...a),
}));
jest.mock("../riskApproverNotification.service", () => ({
  getUserNameById: jest.fn(async () => "Ada Admin"),
}));
const mockCandidates = jest.fn<(...args: any[]) => Promise<void>>();
jest.mock("../riskLinks/modelCandidates", () => ({
  notifyModelRiskCandidates: (...a: any[]) => mockCandidates(...a),
}));

// A stand-in for the model class: the update helper changes the row in
// place, as the real one does.
jest.mock("../../domain.layer/models/modelInventory/modelInventory.model", () => ({
  ModelInventoryModel: {
    createNewModelInventory: (data: any) => ({ ...data }),
    updateModelInventory: (existing: any, data: any) => {
      for (const [k, v] of Object.entries(data)) if (v !== undefined) existing[k] = v;
      return existing;
    },
  },
}));

jest.mock("../../database/db", () => ({ sequelize: { transaction: jest.fn() } }));

import {
  createModelInventoryService,
  deleteModelInventoryService,
  linkModelToUseCaseService,
  updateModelInventoryService,
} from "../modelInventory.service";
import { ModelApprovalForbiddenError } from "../../utils/modelApproval.utils";
import {
  NotFoundException,
  ConflictException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";

const EDITOR = 10;
const APPROVER = 20;

function fakeTx() {
  const hooks: Array<() => void> = [];
  return {
    afterCommit: (fn: () => void) => hooks.push(fn),
    commit: () => hooks.forEach((fn) => fn()),
    hooks,
  };
}

const ctx = { organizationId: 1, userId: EDITOR, callerIsAdmin: false };

function storedRow(values: Record<string, unknown>) {
  const row: any = { id: 7, model: "GPT", version: "1", ...values };
  // Like Sequelize without includes: get({ plain: true }) is the live dataValues.
  row.get = () => row;
  return row;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTrigger.mockResolvedValue(undefined);
  mockProactive.mockResolvedValue(undefined);
  mockAssigned.mockResolvedValue(undefined);
  mockCandidates.mockResolvedValue(undefined);
  mockTrack.mockResolvedValue([]);
});

describe("createModelInventoryService", () => {
  it("never stores is_demo from the input", async () => {
    const tx = fakeTx();
    mockCreateQuery.mockResolvedValue({ id: 7, status: "Pending", dataValues: { projects: [] } });
    await createModelInventoryService(
      { provider: "OpenAI", model: "GPT", version: "1", is_demo: true },
      ctx,
      tx as any,
    );
    expect(mockCreateQuery.mock.calls[0][0]).toMatchObject({ is_demo: false });
  });

  it("records the creation in the change history, in the transaction", async () => {
    const tx = fakeTx();
    mockCreateQuery.mockResolvedValue({ id: 7, status: "Pending", dataValues: { projects: [] } });
    await createModelInventoryService({ provider: "OpenAI", model: "GPT" }, ctx, tx as any);
    expect(mockRecordCreation).toHaveBeenCalledWith(
      "model_inventory",
      7,
      EDITOR,
      1,
      expect.objectContaining({ model: "GPT" }),
      tx,
    );
  });

  it("runs the deployment step for a model created as Approved, after commit", async () => {
    const tx = fakeTx();
    mockCreateQuery.mockResolvedValue({
      id: 7,
      model: "GPT",
      version: "4",
      status: "Approved",
      dataValues: { projects: [] },
    });
    await createModelInventoryService(
      { provider: "OpenAI", model: "GPT", status: "Approved" as any },
      ctx,
      tx as any,
    );
    expect(mockTrigger).not.toHaveBeenCalled();
    tx.commit();
    expect(mockTrigger).toHaveBeenCalledWith(1, 7, "GPT", "4");
    expect(mockProactive).toHaveBeenCalledTimes(1);
  });

  it("does not run the deployment step for a Pending model", async () => {
    const tx = fakeTx();
    mockCreateQuery.mockResolvedValue({ id: 7, status: "Pending", dataValues: { projects: [] } });
    await createModelInventoryService({ provider: "OpenAI", model: "GPT" }, ctx, tx as any);
    tx.commit();
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("refuses a non-Admin who names an approver and decides, before writing", async () => {
    await expect(
      createModelInventoryService(
        { provider: "OpenAI", model: "GPT", approver: APPROVER, status: "Approved" as any },
        ctx,
        fakeTx() as any,
      ),
    ).rejects.toBeInstanceOf(ModelApprovalForbiddenError);
    expect(mockCreateQuery).not.toHaveBeenCalled();
  });
});

describe("updateModelInventoryService", () => {
  it("returns null for a model the organization does not have", async () => {
    mockGetById.mockResolvedValue(null);
    expect(await updateModelInventoryService(7, { model: "x" }, ctx, fakeTx() as any)).toBeNull();
    expect(mockUpdateQuery).not.toHaveBeenCalled();
  });

  it("hands the locked row, as it was before the save, to the update query", async () => {
    const tx = fakeTx();
    mockGetById.mockResolvedValue(storedRow({ status: "Pending", approver: null }));
    mockUpdateQuery.mockImplementation(async (_id: number, row: any) => row);
    await updateModelInventoryService(7, { status: "Approved" as any }, ctx, tx as any);
    const previous = mockUpdateQuery.mock.calls[0][9];
    expect(previous).toMatchObject({ id: 7, status: "Pending" });
  });

  it("reads the row locked, in the transaction", async () => {
    const tx = fakeTx();
    mockGetById.mockResolvedValue(storedRow({ status: "Pending", approver: null }));
    mockUpdateQuery.mockImplementation(async (_id: number, row: any) => row);
    await updateModelInventoryService(7, { version: "2" }, ctx, tx as any);
    expect(mockGetById).toHaveBeenCalledWith(7, 1, { transaction: tx, forUpdate: true });
  });

  it("runs the deployment step when the status moves to Approved", async () => {
    const tx = fakeTx();
    mockGetById.mockResolvedValue(storedRow({ status: "Pending", approver: null }));
    mockUpdateQuery.mockImplementation(async (_id: number, row: any) => row);
    await updateModelInventoryService(7, { status: "Approved" as any }, ctx, tx as any);
    tx.commit();
    expect(mockTrigger).toHaveBeenCalledWith(1, 7, "GPT", "1");
  });

  it("does not run it again for a model already Approved", async () => {
    const tx = fakeTx();
    mockGetById.mockResolvedValue(storedRow({ status: "Approved", approver: null }));
    mockUpdateQuery.mockImplementation(async (_id: number, row: any) => row);
    await updateModelInventoryService(7, { status: "Approved" as any }, ctx, tx as any);
    tx.commit();
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("never passes is_demo to the update or the history", async () => {
    const tx = fakeTx();
    mockGetById.mockResolvedValue(storedRow({ status: "Pending", approver: null, is_demo: false }));
    mockUpdateQuery.mockImplementation(async (_id: number, row: any) => row);
    await updateModelInventoryService(7, { is_demo: true, version: "2" }, ctx, tx as any);
    expect(mockUpdateQuery.mock.calls[0][1].is_demo).toBe(false);
    expect(mockTrack.mock.calls[0][2]).not.toHaveProperty("is_demo");
  });

  it("refuses an Editor deciding on a model with a saved approver", async () => {
    mockGetById.mockResolvedValue(storedRow({ status: "Pending", approver: APPROVER }));
    await expect(
      updateModelInventoryService(7, { status: "Approved" as any }, ctx, fakeTx() as any),
    ).rejects.toBeInstanceOf(ModelApprovalForbiddenError);
    expect(mockUpdateQuery).not.toHaveBeenCalled();
  });

  it("tells a newly named approver, after commit", async () => {
    const tx = fakeTx();
    mockGetById.mockResolvedValue(storedRow({ status: "Pending", approver: null }));
    mockUpdateQuery.mockImplementation(async (_id: number, row: any) => row);
    await updateModelInventoryService(7, { approver: APPROVER }, ctx, tx as any);
    tx.commit();
    await new Promise((r) => setImmediate(r));
    expect(mockAssigned).toHaveBeenCalledWith(
      1,
      APPROVER,
      expect.objectContaining({ roleType: "Approver", entityId: 7 }),
      "Ada Admin",
      expect.any(String),
      expect.anything(),
    );
  });
});

describe("malformed status or approver", () => {
  it.each([[["Approved"]], [{}], [1]])(
    "refuses status %p with a ValidationException before anything is read or written",
    async (status) => {
      await expect(
        createModelInventoryService(
          { provider: "p", model: "m", status } as any,
          ctx,
          fakeTx() as any,
        ),
      ).rejects.toBeInstanceOf(ValidationException);
      await expect(
        updateModelInventoryService(7, { status } as any, ctx, fakeTx() as any),
      ).rejects.toBeInstanceOf(ValidationException);
      expect(mockGetById).not.toHaveBeenCalled();
      expect(mockCreateQuery).not.toHaveBeenCalled();
      expect(mockUpdateQuery).not.toHaveBeenCalled();
    },
  );

  it("refuses an approver sent as an array", async () => {
    await expect(
      updateModelInventoryService(7, { approver: [5] } as any, ctx, fakeTx() as any),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(mockUpdateQuery).not.toHaveBeenCalled();
  });
});

describe("deleteModelInventoryService", () => {
  it("throws NotFoundException for a model the organization does not have", async () => {
    mockGetById.mockResolvedValue(null);
    await expect(
      deleteModelInventoryService(7, { deleteRisks: false }, ctx, fakeTx() as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws ConflictException for a model with MRM history", async () => {
    mockGetById.mockResolvedValue(storedRow({ approver: null }));
    mockMrm.mockResolvedValue(true);
    await expect(
      deleteModelInventoryService(7, { deleteRisks: false }, ctx, fakeTx() as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mockDeleteQuery).not.toHaveBeenCalled();
  });

  it("reads the model locked, in the transaction, and records the deletion and deletes", async () => {
    const tx = fakeTx();
    mockGetById.mockResolvedValue(storedRow({ approver: null }));
    mockMrm.mockResolvedValue(false);
    await deleteModelInventoryService(7, { deleteRisks: true }, ctx, tx as any);
    expect(mockGetById).toHaveBeenCalledWith(7, 1, { transaction: tx, forUpdate: true });
    expect(mockRecordDeletion).toHaveBeenCalledWith("model_inventory", 7, EDITOR, 1, tx);
    expect(mockDeleteQuery).toHaveBeenCalledWith(7, true, 1, tx, EDITOR);
  });
});

describe("linkModelToUseCaseService", () => {
  it("adds a missing link and tells the use case about candidates after commit", async () => {
    const tx = fakeTx();
    mockLock.mockResolvedValue(true);
    mockResolveTargets.mockResolvedValue({ projectIds: [3], frameworkIds: [] });
    mockProjectIds.mockResolvedValue([]);
    mockGetById.mockResolvedValue(storedRow({}));
    expect(await linkModelToUseCaseService(7, 3, ctx, tx as any)).toBe(true);
    expect(mockInsertLinks).toHaveBeenCalledWith(7, [3], 1, tx);
    tx.commit();
    await new Promise((r) => setImmediate(r));
    expect(mockCandidates).toHaveBeenCalledWith(expect.objectContaining({ projectIds: [3] }));
  });

  it("does nothing for an existing link", async () => {
    mockLock.mockResolvedValue(true);
    mockResolveTargets.mockResolvedValue({ projectIds: [3], frameworkIds: [] });
    mockProjectIds.mockResolvedValue([3]);
    expect(await linkModelToUseCaseService(7, 3, ctx, fakeTx() as any)).toBe(false);
    expect(mockInsertLinks).not.toHaveBeenCalled();
  });

  // An Editor the approval rule refuses must not delete the model and add
  // it again, decided, with no approver.
  it("refuses a caller who is not the saved approver or an Admin, whatever the status", async () => {
    for (const status of ["Pending", "Approved"]) {
      mockGetById.mockResolvedValue(storedRow({ approver: APPROVER, status }));
      const refused = deleteModelInventoryService(7, { deleteRisks: true }, ctx, fakeTx() as any);
      await expect(refused).rejects.toBeInstanceOf(ModelApprovalForbiddenError);
      await expect(refused).rejects.toThrow(
        "Only the model's approver or an Admin can change its approval.",
      );
    }
    expect(mockRecordDeletion).not.toHaveBeenCalled();
    expect(mockDeleteQuery).not.toHaveBeenCalled();
  });

  it("lets the saved approver or an Admin delete a model with an approver", async () => {
    mockMrm.mockResolvedValue(false);
    mockGetById.mockResolvedValue(storedRow({ approver: APPROVER, status: "Approved" }));
    await deleteModelInventoryService(
      7,
      { deleteRisks: false },
      { ...ctx, userId: APPROVER },
      fakeTx() as any,
    );
    await deleteModelInventoryService(
      7,
      { deleteRisks: false },
      { ...ctx, callerIsAdmin: true },
      fakeTx() as any,
    );
    expect(mockDeleteQuery).toHaveBeenCalledTimes(2);
  });
});
