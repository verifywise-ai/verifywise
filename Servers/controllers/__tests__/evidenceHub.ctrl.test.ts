import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const transaction = { commit: jest.fn(), rollback: jest.fn() };
jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn(async () => transaction) },
}));
jest.mock("../../utils/evidenceHub.utils", () => ({
  getAllEvidencesQuery: jest.fn(),
  getEvidenceByIdQuery: jest.fn(),
  createNewEvidenceQuery: jest.fn(),
  updateEvidenceByIdQuery: jest.fn(),
  deleteEvidenceByIdQuery: jest.fn(),
}));
jest.mock("../../utils/modelInventoryChangeHistory.utils", () => ({
  recordEvidenceAddedToModel: jest.fn(),
  recordEvidenceRemovedFromModel: jest.fn(),
  recordEvidenceFieldChangeForModel: jest.fn(),
}));
jest.mock("../../utils/changeHistory.base.utils", () => ({
  trackEntityChanges: jest.fn(async () => []),
  recordMultipleFieldChanges: jest.fn(),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: new Proxy({}, { get: () => (data: unknown) => data }),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../utils/sanitization.utils", () => ({
  sanitizeUserHtml: (html: string) => html,
}));
jest.mock("../../utils/i18n.utils", () => ({ translateError: jest.fn() }));
jest.mock("../../services/automations/actions/evidenceFreshnessSweep", () => ({
  runEvidenceFreshnessSweep: jest.fn(),
}));
jest.mock("../../domain.layer/models/evidenceHub/evidenceHub.model", () => ({
  EvidenceHubModel: class {
    constructor(values: Record<string, unknown>) {
      Object.assign(this, values);
    }
  },
}));
const mockHasPermission = jest.fn<(...args: any[]) => Promise<boolean>>(async () => true);
jest.mock("../../utils/rolePermissions.utils", () => ({
  requestHasPermission: (...args: any[]) => mockHasPermission(...args),
}));

import { createNewEvidence, deleteEvidenceById, updateEvidenceById } from "../evidenceHub.ctrl";
import {
  createNewEvidenceQuery,
  deleteEvidenceByIdQuery,
  getEvidenceByIdQuery,
  updateEvidenceByIdQuery,
} from "../../utils/evidenceHub.utils";
import {
  recordEvidenceFieldChangeForModel,
  recordEvidenceRemovedFromModel,
} from "../../utils/modelInventoryChangeHistory.utils";

function createRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function existing(): any {
  return {
    id: 5,
    evidence_name: "Old name",
    evidence_type: "Policy",
    description: "Old text",
    mapped_model_ids: [1, 2],
  };
}

// Review: the handler copied the request onto the loaded row before reading
// its "old" values, so model history compared the new value with itself and
// a removed model was logged under the new name.
describe("updateEvidenceById model history", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (updateEvidenceByIdQuery as jest.Mock).mockImplementation(async (_id: any, row: any) => ({
      ...row,
      toSafeJSON: () => row,
    }));
  });

  it("records a renamed field for every model the evidence stays mapped to", async () => {
    (getEvidenceByIdQuery as jest.Mock).mockResolvedValue(existing() as never);
    const req: any = {
      params: { id: "5" },
      body: { evidence_name: "New name", mapped_model_ids: [1, 2] },
      userId: 3,
      organizationId: 9,
      t: (s: string) => s,
    };
    await updateEvidenceById(req, createRes());

    expect(recordEvidenceFieldChangeForModel).toHaveBeenCalledTimes(2);
    expect(recordEvidenceFieldChangeForModel).toHaveBeenCalledWith(
      1,
      3,
      9,
      "New name",
      "Name",
      "Old name",
      "New name",
      transaction,
    );
  });

  it("logs a removed model under the evidence's name before the edit", async () => {
    (getEvidenceByIdQuery as jest.Mock).mockResolvedValue(existing() as never);
    const req: any = {
      params: { id: "5" },
      body: { evidence_name: "New name", mapped_model_ids: [1] },
      userId: 3,
      organizationId: 9,
      t: (s: string) => s,
    };
    await updateEvidenceById(req, createRes());

    expect(recordEvidenceRemovedFromModel).toHaveBeenCalledWith(
      2,
      3,
      9,
      "Old name",
      "Policy",
      transaction,
    );
  });
});

// Training evidence is written under training.edit, so the evidence routes
// carry no permission; model.edit is needed only when models are involved.
describe("evidence writes and model.edit", () => {
  const req = (extra: Record<string, unknown>): any => ({
    params: { id: "5" },
    body: {},
    userId: 3,
    organizationId: 9,
    role: "Editor",
    t: (s: string) => s,
    ...extra,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockHasPermission.mockResolvedValue(false);
    (createNewEvidenceQuery as jest.Mock).mockImplementation(async (row: any) => ({
      ...row,
      toSafeJSON: () => row,
    }));
    (updateEvidenceByIdQuery as jest.Mock).mockImplementation(async (_id: any, row: any) => ({
      ...row,
      toSafeJSON: () => row,
    }));
  });

  it("creates evidence linked to no model without model.edit (training evidence)", async () => {
    const res = createRes();
    await createNewEvidence(req({ body: { evidence_name: "Certificate" } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockHasPermission).not.toHaveBeenCalled();
  });

  it("refuses evidence linked to a model without model.edit", async () => {
    const res = createRes();
    await createNewEvidence(req({ body: { mapped_model_ids: [1] } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockHasPermission).toHaveBeenCalledWith(expect.anything(), "model.edit");
    expect(createNewEvidenceQuery).not.toHaveBeenCalled();
  });

  it("creates evidence linked to a model with model.edit", async () => {
    mockHasPermission.mockResolvedValue(true);
    const res = createRes();
    await createNewEvidence(req({ body: { mapped_model_ids: [1] } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("updates unlinked evidence without model.edit", async () => {
    (getEvidenceByIdQuery as jest.Mock).mockResolvedValue({
      ...existing(),
      mapped_model_ids: [],
    } as never);
    const res = createRes();
    await updateEvidenceById(req({ body: { evidence_name: "New" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it.each([
    ["evidence already linked to models", [1, 2], {}],
    ["a write that adds a model link", [], { mapped_model_ids: [4] }],
  ])("refuses an update of %s without model.edit", async (_label, mapped, body) => {
    (getEvidenceByIdQuery as jest.Mock).mockResolvedValue({
      ...existing(),
      mapped_model_ids: mapped,
    } as never);
    const res = createRes();
    await updateEvidenceById(req({ body }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(updateEvidenceByIdQuery).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it("deletes unlinked evidence without model.edit, refuses linked evidence", async () => {
    (getEvidenceByIdQuery as jest.Mock).mockResolvedValueOnce({
      ...existing(),
      mapped_model_ids: null,
    } as never);
    const ok = createRes();
    await deleteEvidenceById(req({}), ok);
    expect(ok.status).toHaveBeenCalledWith(200);

    (getEvidenceByIdQuery as jest.Mock).mockResolvedValueOnce(existing() as never);
    const refused = createRes();
    await deleteEvidenceById(req({}), refused);
    expect(refused.status).toHaveBeenCalledWith(403);
    expect(deleteEvidenceByIdQuery).toHaveBeenCalledTimes(1);
  });
});
