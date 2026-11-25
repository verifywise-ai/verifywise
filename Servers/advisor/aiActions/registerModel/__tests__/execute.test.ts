import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../../../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));
const mockCreate = jest.fn<(...args: any[]) => Promise<any>>();
const mockLink = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../../../../services/modelInventory.service", () => ({
  createModelInventoryService: (...args: any[]) => mockCreate(...args),
  linkModelToUseCaseService: (...args: any[]) => mockLink(...args),
}));
const mockWriter = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../../../functions/modelWriteScope", () => ({
  ...(jest.requireActual("../../../functions/modelWriteScope") as object),
  modelWriteContextForUser: (...args: any[]) => mockWriter(...args),
}));

import { executeRegisterModel } from "../execute";
import { MODEL_WRITE_REFUSED } from "../../../functions/modelWriteScope";
import {
  ForbiddenException,
  ValidationException,
} from "../../../../domain.layer/exceptions/custom.exception";

const REQUESTER = 5;
const tx = { id: "tx" };
const writer = {
  organizationId: 1,
  userId: REQUESTER,
  callerIsAdmin: false,
  useCaseViewer: { userId: REQUESTER, role: "Editor" },
};
const ctx = (input: Record<string, unknown>) =>
  ({
    inputParams: { name: "GPT-4o", ...input },
    organizationId: 1,
    requesterId: REQUESTER,
    transaction: tx,
  }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockWriter.mockResolvedValue(writer);
  mockQuery.mockResolvedValue([[], 0]); // no model with this name yet
  mockCreate.mockResolvedValue({ id: 40 });
  mockLink.mockResolvedValue(true);
});

describe("executeRegisterModel", () => {
  // Item 2: no raw INSERT; the model service writes history and notices.
  it("creates the model through the model service as the requester, in the approval transaction", async () => {
    await expect(
      executeRegisterModel(
        ctx({ model_type: "OpenAI", version: "1", description: "Chat", project_id: 3 }),
      ),
    ).resolves.toEqual({ entityId: 40 });
    expect(mockWriter).toHaveBeenCalledWith(1, REQUESTER);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_model: "OpenAI / GPT-4o",
        provider: "OpenAI",
        model: "GPT-4o",
        version: "1",
        capabilities: "Chat",
        status: "Pending",
        projects: [3],
      }),
      writer,
      tx,
    );
    // Only the duplicate lookup reads the database directly.
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(String(mockQuery.mock.calls[0][0])).not.toMatch(/INSERT/);
  });

  it("refuses a requester without model.edit and writes nothing", async () => {
    mockWriter.mockResolvedValue({ success: false, message: MODEL_WRITE_REFUSED });
    await expect(executeRegisterModel(ctx({}))).rejects.toThrow(MODEL_WRITE_REFUSED);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("says so when the use case is gone or not the requester's to write to", async () => {
    mockCreate.mockRejectedValueOnce(new ValidationException("gone", "projects", 3));
    await expect(executeRegisterModel(ctx({ project_id: 3 }))).rejects.toThrow(
      "Project #3 no longer exists in this organization",
    );
    mockCreate.mockRejectedValueOnce(new ForbiddenException("Access denied", "project", "link"));
    await expect(executeRegisterModel(ctx({ project_id: 3 }))).rejects.toThrow(
      "You do not have access to use case #3.",
    );
  });

  it("keeps the message of a failure that is not about the use case", async () => {
    mockCreate.mockRejectedValueOnce(new ValidationException("Bad framework", "frameworks", [9]));
    await expect(executeRegisterModel(ctx({ project_id: 3 }))).rejects.toThrow("Bad framework");
  });

  it("reuses an existing model and links it through the service", async () => {
    mockQuery.mockResolvedValue([[{ id: 22 }], 1]);
    await expect(executeRegisterModel(ctx({ project_id: 3 }))).resolves.toEqual({ entityId: 22 });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockLink).toHaveBeenCalledWith(22, 3, writer, tx);
  });

  it("skips a use case that is gone when reusing a model, but refuses one without access", async () => {
    mockQuery.mockResolvedValue([[{ id: 22 }], 1]);
    mockLink.mockRejectedValueOnce(new ValidationException("gone", "projects", 3));
    await expect(executeRegisterModel(ctx({ project_id: 3 }))).resolves.toEqual({ entityId: 22 });
    mockLink.mockRejectedValueOnce(new ForbiddenException("Access denied", "project", "link"));
    await expect(executeRegisterModel(ctx({ project_id: 3 }))).rejects.toThrow(
      "You do not have access to use case #3.",
    );
  });
});
