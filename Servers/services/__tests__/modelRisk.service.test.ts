import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockCreate = jest.fn<(...args: any[]) => Promise<any>>();
const mockUpdate = jest.fn<(...args: any[]) => Promise<any>>();
const mockGet = jest.fn<(...args: any[]) => Promise<any>>();
const mockDelete = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../../utils/modelRisk.utils", () => ({
  createNewModelRiskQuery: (...a: any[]) => mockCreate(...a),
  updateModelRiskByIdQuery: (...a: any[]) => mockUpdate(...a),
  getModelRiskByIdQuery: (...a: any[]) => mockGet(...a),
  deleteModelRiskByIdQuery: (...a: any[]) => mockDelete(...a),
}));
jest.mock("../../utils/modelInventory.utils", () => ({
  getModelInventoryProjectIdsQuery: jest.fn(async () => []),
  getModelInventoryNameQuery: jest.fn(async () => null),
}));
const mockRecordCreation = jest.fn<(...args: any[]) => Promise<void>>();
const mockRecordDeletion = jest.fn<(...args: any[]) => Promise<void>>();
jest.mock("../../utils/changeHistory.base.utils", () => ({
  recordEntityCreation: (...a: any[]) => mockRecordCreation(...a),
  recordEntityDeletion: (...a: any[]) => mockRecordDeletion(...a),
  recordMultipleFieldChanges: jest.fn(async () => undefined),
  trackEntityChanges: jest.fn(async () => []),
  writtenValues: (_row: unknown, values: unknown) => values,
}));
const mockAssigned = jest.fn<(...args: any[]) => Promise<void>>();
jest.mock("../inAppNotification.service", () => ({
  notifyUserAssigned: (...a: any[]) => mockAssigned(...a),
}));
jest.mock("../riskApproverNotification.service", () => ({
  getUserNameById: jest.fn(async () => "Ada Admin"),
}));
jest.mock("../riskLinks/modelCandidates", () => ({
  notifyModelRiskCandidates: jest.fn(async () => undefined),
}));
jest.mock("../../database/db", () => ({ sequelize: { transaction: jest.fn() } }));

import {
  createModelRiskService,
  deleteModelRiskService,
  updateModelRiskService,
} from "../modelRisk.service";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

const EDITOR = 10;
const OWNER = 20;
const ctx = { organizationId: 1, userId: EDITOR };

function fakeTx() {
  const hooks: Array<() => void> = [];
  return {
    afterCommit: (fn: () => void) => hooks.push(fn),
    commit: () => hooks.forEach((f) => f()),
  };
}
const row = (values: Record<string, unknown>) => {
  const r: any = { id: 5, risk_name: "Drift", ...values };
  r.get = () => ({ ...r });
  return r;
};
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.clearAllMocks();
  mockAssigned.mockResolvedValue(undefined);
});

describe("createModelRiskService", () => {
  it("tells the owner of a new model risk, after commit", async () => {
    const tx = fakeTx();
    mockCreate.mockResolvedValue(row({ owner: OWNER }));
    await createModelRiskService(
      { risk_name: "Drift", owner: String(OWNER) } as any,
      ctx,
      tx as any,
    );
    expect(mockAssigned).not.toHaveBeenCalled();
    tx.commit();
    await flush();
    expect(mockAssigned).toHaveBeenCalledTimes(1);
    expect(mockAssigned).toHaveBeenCalledWith(
      1,
      OWNER,
      expect.objectContaining({
        entityType: "model_risk",
        entityId: 5,
        roleType: "Risk Owner",
        entityUrl: "/model-inventory/model-risks?modelRiskId=5",
      }),
      "Ada Admin",
      expect.any(String),
      expect.anything(),
    );
  });

  // The notice links to the app, as the model approver notice does, never to
  // the backend's port.
  it("links the owner notice to the frontend when FRONTEND_URL is not set", async () => {
    const saved = process.env.FRONTEND_URL;
    delete process.env.FRONTEND_URL;
    try {
      const tx = fakeTx();
      mockCreate.mockResolvedValue(row({ owner: OWNER }));
      await createModelRiskService({ risk_name: "Drift", owner: OWNER } as any, ctx, tx as any);
      tx.commit();
      await flush();
      expect(mockAssigned.mock.calls[0][4]).toBe("http://localhost:5173");
    } finally {
      if (saved !== undefined) process.env.FRONTEND_URL = saved;
    }
  });

  it("sends nothing for a risk with no owner", async () => {
    const tx = fakeTx();
    mockCreate.mockResolvedValue(row({ owner: null }));
    await createModelRiskService({ risk_name: "Drift" } as any, ctx, tx as any);
    tx.commit();
    await flush();
    expect(mockAssigned).not.toHaveBeenCalled();
  });

  it("never takes is_demo from the input and records the creation", async () => {
    const tx = fakeTx();
    mockCreate.mockResolvedValue(row({ owner: null }));
    await createModelRiskService({ risk_name: "Drift", is_demo: true } as any, ctx, tx as any);
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ is_demo: false });
    expect(mockRecordCreation.mock.calls[0][4]).not.toHaveProperty("is_demo");
  });
});

describe("updateModelRiskService", () => {
  it("tells a new owner", async () => {
    const tx = fakeTx();
    mockGet.mockResolvedValue(row({ owner: 30 }));
    mockUpdate.mockResolvedValue(row({ owner: OWNER }));
    await updateModelRiskService(5, { owner: OWNER } as any, ctx, tx as any);
    tx.commit();
    await flush();
    expect(mockAssigned).toHaveBeenCalledTimes(1);
    expect(mockAssigned.mock.calls[0][1]).toBe(OWNER);
  });

  it("does not tell an unchanged owner", async () => {
    const tx = fakeTx();
    mockGet.mockResolvedValue(row({ owner: OWNER }));
    mockUpdate.mockResolvedValue(row({ owner: OWNER, risk_name: "New" }));
    await updateModelRiskService(
      5,
      { owner: String(OWNER), risk_name: "New" } as any,
      ctx,
      tx as any,
    );
    tx.commit();
    await flush();
    expect(mockAssigned).not.toHaveBeenCalled();
  });

  it("returns null for a risk the organization does not have", async () => {
    mockGet.mockResolvedValue(null);
    expect(await updateModelRiskService(5, {} as any, ctx, fakeTx() as any)).toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("model risk level from the formula (decision 10)", () => {
  const written = () => mockCreate.mock.calls[0][0];
  const updated = () => mockUpdate.mock.calls[0][1];

  it("computes the level on create and ignores a sent one", async () => {
    mockCreate.mockResolvedValue(row({ owner: null }));
    await createModelRiskService(
      { risk_name: "Drift", likelihood: "Likely", severity: "Major", risk_level: "Low" } as any,
      ctx,
      fakeTx() as any,
    );
    expect(written()).toMatchObject({
      likelihood: "Likely",
      severity: "Major",
      risk_level: "High",
    });
  });

  it("keeps a sent level when the severity is missing", async () => {
    mockCreate.mockResolvedValue(row({ owner: null }));
    await createModelRiskService(
      { risk_name: "Drift", likelihood: "Likely", risk_level: "Low" } as any,
      ctx,
      fakeTx() as any,
    );
    expect(written()).toMatchObject({ likelihood: "Likely", risk_level: "Low" });
  });

  it("stores the label's spelling and a blank value as null", async () => {
    mockCreate.mockResolvedValue(row({ owner: null }));
    await createModelRiskService(
      { risk_name: "Drift", likelihood: " almost certain", severity: "" } as any,
      ctx,
      fakeTx() as any,
    );
    expect(written()).toMatchObject({ likelihood: "Almost Certain", severity: null });
  });

  it("refuses a likelihood or severity that is not on the list, naming the field", async () => {
    await expect(
      createModelRiskService(
        { risk_name: "Drift", likelihood: "Confirmed" } as any,
        ctx,
        fakeTx() as any,
      ),
    ).rejects.toThrow(
      new ValidationException(
        "Likelihood must be one of: Rare, Unlikely, Possible, Likely, Almost Certain.",
      ),
    );
    mockGet.mockResolvedValue(row({ likelihood: "Rare" }));
    await expect(
      updateModelRiskService(5, { severity: "Critical" } as any, ctx, fakeTx() as any),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("recomputes on update from the stored likelihood when only the severity is sent", async () => {
    mockGet.mockResolvedValue(row({ likelihood: "Rare", severity: "Minor", risk_level: "Low" }));
    mockUpdate.mockResolvedValue(row({}));
    await updateModelRiskService(5, { severity: "Catastrophic" } as any, ctx, fakeTx() as any);
    expect(updated()).toEqual({ severity: "Catastrophic", risk_level: "High" });
  });

  it("ignores a sent level on update when the merged row has both inputs", async () => {
    mockGet.mockResolvedValue(row({ likelihood: "Rare", severity: "Minor", risk_level: "Low" }));
    mockUpdate.mockResolvedValue(row({}));
    await updateModelRiskService(5, { risk_level: "Critical" } as any, ctx, fakeTx() as any);
    expect(updated()).toEqual({ risk_level: "Low" });
  });

  it("keeps a sent level on update when the stored row has no severity", async () => {
    mockGet.mockResolvedValue(row({ likelihood: "Rare", severity: null, risk_level: "Low" }));
    mockUpdate.mockResolvedValue(row({}));
    await updateModelRiskService(5, { risk_level: "Critical" } as any, ctx, fakeTx() as any);
    expect(updated()).toEqual({ risk_level: "Critical" });
  });

  it("keeps the stored level when a save clears the likelihood", async () => {
    mockGet.mockResolvedValue(row({ likelihood: "Rare", severity: "Minor", risk_level: "Low" }));
    mockUpdate.mockResolvedValue(row({}));
    await updateModelRiskService(5, { likelihood: null } as any, ctx, fakeTx() as any);
    expect(updated()).toEqual({ likelihood: null });
  });
});

describe("deleteModelRiskService", () => {
  it("records the deletion only when a risk was archived", async () => {
    mockDelete.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await deleteModelRiskService(5, ctx, fakeTx() as any)).toBe(false);
    expect(mockRecordDeletion).not.toHaveBeenCalled();
    expect(await deleteModelRiskService(5, ctx, fakeTx() as any)).toBe(true);
    expect(mockRecordDeletion).toHaveBeenCalledTimes(1);
  });
});
