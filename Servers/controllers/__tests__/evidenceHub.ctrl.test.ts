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

import { updateEvidenceById } from "../evidenceHub.ctrl";
import { getEvidenceByIdQuery, updateEvidenceByIdQuery } from "../../utils/evidenceHub.utils";
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
