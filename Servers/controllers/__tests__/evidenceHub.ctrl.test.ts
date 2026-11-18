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
  assertEvidenceLinksInOrganization: jest.fn(),
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
const mockEffectivePermissions = jest.fn<(...args: any[]) => Promise<ReadonlySet<string>>>(
  async () => new Set(["model.edit", "training.edit", "risks.edit"]),
);
jest.mock("../../utils/rolePermissions.utils", () => ({
  requestEffectivePermissions: (...args: any[]) => mockEffectivePermissions(...args),
}));

import { createNewEvidence, deleteEvidenceById, updateEvidenceById } from "../evidenceHub.ctrl";
import {
  assertEvidenceLinksInOrganization,
  createNewEvidenceQuery,
  deleteEvidenceByIdQuery,
  getEvidenceByIdQuery,
  updateEvidenceByIdQuery,
} from "../../utils/evidenceHub.utils";
import {
  recordEvidenceAddedToModel,
  recordEvidenceFieldChangeForModel,
  recordEvidenceRemovedFromModel,
} from "../../utils/modelInventoryChangeHistory.utils";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

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

  // Review: a body without mapped_model_ids defaulted the new list to [],
  // so every model was logged as removed while the links stayed.
  it("records no added or removed model when the body leaves the links out", async () => {
    (getEvidenceByIdQuery as jest.Mock).mockResolvedValue(existing() as never);
    const req: any = {
      params: { id: "5" },
      body: { evidence_name: "New name" },
      userId: 3,
      organizationId: 9,
      t: (s: string) => s,
    };
    const res = createRes();
    await updateEvidenceById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(recordEvidenceRemovedFromModel).not.toHaveBeenCalled();
    expect(recordEvidenceAddedToModel).not.toHaveBeenCalled();
    // The models stay linked, so the rename is recorded for both.
    expect(recordEvidenceFieldChangeForModel).toHaveBeenCalledTimes(2);
    const row = (updateEvidenceByIdQuery as jest.Mock).mock.calls[0][1] as any;
    expect(row.mapped_model_ids).toEqual([1, 2]);
  });

  it("records every model as removed when the body clears the links with null", async () => {
    (getEvidenceByIdQuery as jest.Mock).mockResolvedValue(existing() as never);
    const req: any = {
      params: { id: "5" },
      body: { mapped_model_ids: null },
      userId: 3,
      organizationId: 9,
      t: (s: string) => s,
    };
    await updateEvidenceById(req, createRes());
    expect(recordEvidenceRemovedFromModel).toHaveBeenCalledTimes(2);
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

// Evidence has no edit permission of its own: a write needs at least one of
// model.edit, training.edit or risks.edit, and the permission of every link
// field set on the stored row or in the request.
describe("evidence write permissions", () => {
  const req = (extra: Record<string, unknown>): any => ({
    params: { id: "5" },
    body: {},
    userId: 3,
    organizationId: 9,
    role: "Custom",
    t: (s: string) => s,
    ...extra,
  });
  const grant = (...keys: string[]) =>
    mockEffectivePermissions.mockImplementation(async () => new Set(keys));
  const stored = (links: Record<string, number[] | null>) =>
    (getEvidenceByIdQuery as jest.Mock).mockResolvedValue({
      ...existing(),
      mapped_model_ids: null,
      mapped_training_ids: null,
      mapped_risk_ids: null,
      ...links,
    } as never);

  beforeEach(() => {
    jest.clearAllMocks();
    (createNewEvidenceQuery as jest.Mock).mockImplementation(async (row: any) => ({
      ...row,
      toSafeJSON: () => row,
    }));
    (updateEvidenceByIdQuery as jest.Mock).mockImplementation(async (_id: any, row: any) => ({
      ...row,
      toSafeJSON: () => row,
    }));
  });

  it("refuses a read-only role on unlinked evidence: create, update, delete", async () => {
    grant();
    const created = createRes();
    await createNewEvidence(req({ body: { evidence_name: "Note" } }), created);
    expect(created.status).toHaveBeenCalledWith(403);
    expect(createNewEvidenceQuery).not.toHaveBeenCalled();

    stored({});
    const updated = createRes();
    await updateEvidenceById(req({ body: { evidence_name: "New" } }), updated);
    expect(updated.status).toHaveBeenCalledWith(403);
    expect(updateEvidenceByIdQuery).not.toHaveBeenCalled();

    const deleted = createRes();
    await deleteEvidenceById(req({}), deleted);
    expect(deleted.status).toHaveBeenCalledWith(403);
    expect(deleteEvidenceByIdQuery).not.toHaveBeenCalled();
  });

  it("lets training.edit alone write training-linked evidence", async () => {
    grant("training.edit");
    const created = createRes();
    await createNewEvidence(req({ body: { mapped_training_ids: [4] } }), created);
    expect(created.status).toHaveBeenCalledWith(201);

    stored({ mapped_training_ids: [4] });
    const deleted = createRes();
    await deleteEvidenceById(req({}), deleted);
    expect(deleted.status).toHaveBeenCalledWith(200);
  });

  it.each([
    ["model", "mapped_model_ids", "training.edit"],
    ["risk", "mapped_risk_ids", "training.edit"],
    ["training", "mapped_training_ids", "model.edit"],
  ])("refuses %s links without that permission", async (_label, field, held) => {
    grant(held);
    const res = createRes();
    await createNewEvidence(req({ body: { [field]: [1] } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("checks the stored row too: an update of model-linked evidence needs model.edit", async () => {
    grant("training.edit");
    stored({ mapped_model_ids: [1] });
    const refused = createRes();
    await updateEvidenceById(req({ body: { evidence_name: "x" } }), refused);
    expect(refused.status).toHaveBeenCalledWith(403);
    expect(transaction.rollback).toHaveBeenCalled();

    grant("training.edit", "model.edit");
    const ok = createRes();
    await updateEvidenceById(req({ body: { evidence_name: "x" } }), ok);
    expect(ok.status).toHaveBeenCalledWith(200);
  });

  it("refuses adding a model link to training evidence without model.edit", async () => {
    grant("training.edit");
    stored({ mapped_training_ids: [4] });
    const res = createRes();
    await updateEvidenceById(req({ body: { mapped_model_ids: [7] } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("writes only the whitelisted fields of the body", async () => {
    grant("model.edit");
    stored({});
    await updateEvidenceById(
      req({ body: { evidence_name: "New", id: 999, organization_id: 2, created_at: "x" } }),
      createRes(),
    );
    const row = (updateEvidenceByIdQuery as jest.Mock).mock.calls[0][1] as any;
    expect(row.evidence_name).toBe("New");
    expect(row.id).toBe(5);
    expect(row).not.toHaveProperty("organization_id");
    expect(row.created_at).not.toBe("x");
  });
});

describe("evidence write checks (review round 2)", () => {
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
    mockEffectivePermissions.mockImplementation(
      async () => new Set(["model.edit", "training.edit", "risks.edit"]),
    );
    (assertEvidenceLinksInOrganization as jest.Mock).mockResolvedValue(undefined as never);
    (getEvidenceByIdQuery as jest.Mock).mockResolvedValue(existing() as never);
    (createNewEvidenceQuery as jest.Mock).mockImplementation(async (row: any) => ({
      ...row,
      toSafeJSON: () => row,
    }));
    (updateEvidenceByIdQuery as jest.Mock).mockImplementation(async (_id: any, row: any) => ({
      ...row,
      toSafeJSON: () => row,
    }));
  });

  it.each([
    ["mapped_model_ids", "7"],
    ["mapped_model_ids", ["7"]],
    ["mapped_risk_ids", [0]],
    ["mapped_risk_ids", [-3]],
    ["mapped_training_ids", [1.5]],
    ["mapped_training_ids", { 0: 1 }],
    ["mapped_model_ids", [1, null]],
    ["mapped_model_ids", [2147483648]],
    ["deleteFiles", ["1; drop"]],
  ])("answers 400 to %s = %j before any permission check", async (field, value) => {
    const created = createRes();
    await createNewEvidence(req({ body: { [field]: value } }), created);
    expect(created.status).toHaveBeenCalledWith(400);
    expect(created.json.mock.calls[0][0]).toBe("{field} must be a list of ids");

    const updated = createRes();
    await updateEvidenceById(req({ body: { [field]: value } }), updated);
    expect(updated.status).toHaveBeenCalledWith(400);

    expect(mockEffectivePermissions).not.toHaveBeenCalled();
    expect(createNewEvidenceQuery).not.toHaveBeenCalled();
    expect(updateEvidenceByIdQuery).not.toHaveBeenCalled();
  });

  it("accepts null and absent link fields, and dedupes an id list", async () => {
    const res = createRes();
    await createNewEvidence(
      req({ body: { evidence_name: "x", mapped_model_ids: [4, 4], mapped_risk_ids: null } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(201);
    const row = (createNewEvidenceQuery as jest.Mock).mock.calls[0][0] as any;
    expect(row.mapped_model_ids).toEqual([4]);
    expect(row.mapped_risk_ids).toBeNull();
  });

  it("resolves the caller's permissions once per write", async () => {
    await createNewEvidence(req({ body: { mapped_model_ids: [1] } }), createRes());
    expect(mockEffectivePermissions).toHaveBeenCalledTimes(1);
  });

  it("answers 500, not an unhandled rejection, when the role lookup fails on create", async () => {
    mockEffectivePermissions.mockRejectedValueOnce(new Error("db down") as never);
    const res = createRes();
    // Rejects (and fails the test) if the lookup escapes the try/catch.
    await createNewEvidence(req({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(createNewEvidenceQuery).not.toHaveBeenCalled();
  });

  it("checks link ids against the organization in the write transaction", async () => {
    await createNewEvidence(req({ body: { mapped_model_ids: [1] } }), createRes());
    expect(assertEvidenceLinksInOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ mapped_model_ids: [1] }),
      9,
      transaction,
    );

    // The stored row is updated in place after the check: read it at call time.
    let storedLinks: unknown;
    (assertEvidenceLinksInOrganization as jest.Mock).mockImplementationOnce(
      async (_links: any, _org: any, _tx: any, stored: any) => {
        storedLinks = [...stored.mapped_model_ids];
      },
    );
    await updateEvidenceById(req({ body: { mapped_model_ids: [1, 3] } }), createRes());
    expect(assertEvidenceLinksInOrganization).toHaveBeenLastCalledWith(
      expect.objectContaining({ mapped_model_ids: [1, 3] }),
      9,
      transaction,
      expect.anything(),
    );
    expect(storedLinks).toEqual([1, 2]);
  });

  it("answers 400 and rolls back when a link is another organization's", async () => {
    (assertEvidenceLinksInOrganization as jest.Mock).mockRejectedValue(
      new ValidationException("A linked model was not found in this organization.") as never,
    );
    const created = createRes();
    await createNewEvidence(req({ body: { mapped_model_ids: [77] } }), created);
    expect(created.status).toHaveBeenCalledWith(400);
    expect(createNewEvidenceQuery).not.toHaveBeenCalled();

    const updated = createRes();
    await updateEvidenceById(req({ body: { mapped_model_ids: [77] } }), updated);
    expect(updated.status).toHaveBeenCalledWith(400);
    expect(updateEvidenceByIdQuery).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalledTimes(2);
    expect(transaction.commit).not.toHaveBeenCalled();
  });
});
