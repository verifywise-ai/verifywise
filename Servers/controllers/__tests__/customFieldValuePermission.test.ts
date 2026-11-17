import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockGetDef = jest.fn(async (..._a: any[]): Promise<any> => null);
const mockSet = jest.fn(async (..._a: any[]): Promise<any> => ({
  definition_id: 1,
  entity_type: "ai_app",
  entity_id: 5,
}));
const mockDelete = jest.fn(async (..._a: any[]): Promise<any> => true);
const mockHasPermission = jest.fn(async (..._a: any[]): Promise<boolean> => true);
const mockCanEditTask = jest.fn(async (..._a: any[]): Promise<boolean> => false);
const mockTx = { commit: jest.fn(async () => undefined), rollback: jest.fn(async () => undefined) };

jest.mock("../../utils/customField.utils", () => ({
  ...(jest.requireActual("../../utils/customField.utils") as object),
  getCustomFieldDefinitionByIdQuery: (...a: any[]) => mockGetDef(...a),
  setCustomFieldValueQuery: (...a: any[]) => mockSet(...a),
  deleteCustomFieldValueQuery: (...a: any[]) => mockDelete(...a),
}));
jest.mock("../../utils/task.utils", () => ({
  canUserEditTaskQuery: (...a: any[]) => mockCanEditTask(...a),
}));
jest.mock("../../utils/rolePermissions.utils", () => ({
  requestHasPermission: (...a: any[]) => mockHasPermission(...a),
}));
jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn(async () => mockTx) },
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(async () => undefined),
  logFailure: jest.fn(async () => undefined),
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: (_r: unknown, e: Error) => e.message,
}));

import { logFailure } from "../../utils/logger/logHelper";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";
import { CUSTOM_FIELD_EDIT_PERMISSION, ENTITY_TYPE_TO_TABLE } from "../../utils/customField.utils";
import { deleteCustomFieldValue, setCustomFieldValue } from "../customField.ctrl";

const res = () => {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
};
const putReq = () =>
  ({
    body: { definition_id: 1, entity_id: 5, value: "x" },
    params: {},
    userId: 3,
    organizationId: 7,
    t: (k: string) => k,
  }) as any;
const delReq = () =>
  ({
    body: {},
    params: { definitionId: "1", entityId: "5" },
    userId: 3,
    organizationId: 7,
    t: (k: string) => k,
  }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockHasPermission.mockResolvedValue(true);
  mockCanEditTask.mockResolvedValue(false);
});

describe("CUSTOM_FIELD_EDIT_PERMISSION", () => {
  it("has an entry for every custom field entity type", () => {
    expect(Object.keys(CUSTOM_FIELD_EDIT_PERMISSION).sort()).toEqual(
      Object.keys(ENTITY_TYPE_TO_TABLE).sort(),
    );
  });
});

describe("setCustomFieldValue permission", () => {
  it("returns 403 and does not write when the edit permission is missing", async () => {
    mockGetDef.mockResolvedValueOnce({ id: 1, entity_type: "ai_app" });
    mockHasPermission.mockResolvedValueOnce(false);
    const r = res();
    await setCustomFieldValue(putReq(), r);
    expect(mockHasPermission).toHaveBeenCalledWith(expect.anything(), "aiApp.edit");
    expect(r.status).toHaveBeenCalledWith(403);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("writes when the edit permission is held", async () => {
    mockGetDef.mockResolvedValueOnce({ id: 1, entity_type: "model_inventory" });
    const r = res();
    await setCustomFieldValue(putReq(), r);
    expect(mockHasPermission).toHaveBeenCalledWith(expect.anything(), "model.edit");
    expect(mockSet).toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(200);
  });

  it("returns 404 without checking permission when the definition is missing", async () => {
    mockGetDef.mockResolvedValueOnce(null);
    const r = res();
    await setCustomFieldValue(putReq(), r);
    expect(r.status).toHaveBeenCalledWith(404);
    expect(mockHasPermission).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });
});

describe("deleteCustomFieldValue permission", () => {
  it("returns 403 and does not delete when the edit permission is missing", async () => {
    mockGetDef.mockResolvedValueOnce({ id: 1, entity_type: "model_inventory" });
    mockHasPermission.mockResolvedValueOnce(false);
    const r = res();
    await deleteCustomFieldValue(delReq(), r);
    expect(mockHasPermission).toHaveBeenCalledWith(expect.anything(), "model.edit");
    expect(r.status).toHaveBeenCalledWith(403);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes when the edit permission is held", async () => {
    mockGetDef.mockResolvedValueOnce({ id: 1, entity_type: "ai_app" });
    const r = res();
    await deleteCustomFieldValue(delReq(), r);
    expect(mockHasPermission).toHaveBeenCalledWith(expect.anything(), "aiApp.edit");
    expect(mockDelete).toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(202);
  });

  it("returns 404 without checking permission when the definition is missing", async () => {
    mockGetDef.mockResolvedValueOnce(null);
    const r = res();
    await deleteCustomFieldValue(delReq(), r);
    expect(r.status).toHaveBeenCalledWith(404);
    expect(mockHasPermission).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe("denial logging and malformed ids", () => {
  it("logs a 403 denial", async () => {
    mockGetDef.mockResolvedValueOnce({ id: 1, entity_type: "ai_app" });
    mockHasPermission.mockResolvedValueOnce(false);
    await setCustomFieldValue(putReq(), res());
    expect(logFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "Update",
        functionName: "setCustomFieldValue",
        description: expect.stringContaining("Denied custom field value write"),
      }),
    );
  });

  it("answers 400 for a malformed definition id without logging a permission denial", async () => {
    mockGetDef.mockRejectedValueOnce(
      new ValidationException("id must be a positive integer", "id", "abc"),
    );
    const r = res();
    await deleteCustomFieldValue(
      { ...delReq(), params: { definitionId: "abc", entityId: "5" } },
      r,
    );
    expect(r.status).toHaveBeenCalledWith(400);
    expect(logFailure).not.toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining("Denied custom field value write"),
      }),
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe("task custom fields follow the task edit rule", () => {
  const taskReq = () => ({ ...putReq(), role: "Reviewer" });

  beforeEach(() => {
    mockGetDef.mockResolvedValue({ id: 1, entity_type: "task" });
  });

  it("allows a Reviewer who is the creator or an assignee", async () => {
    mockHasPermission.mockResolvedValue(false);
    mockCanEditTask.mockResolvedValue(true);
    const r = res();
    await setCustomFieldValue(taskReq(), r);
    expect(mockCanEditTask).toHaveBeenCalledWith(5, { userId: 3, role: "Reviewer" }, 7);
    expect(mockSet).toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(200);
  });

  it("allows delete for the creator or an assignee", async () => {
    mockHasPermission.mockResolvedValue(false);
    mockCanEditTask.mockResolvedValue(true);
    const r = res();
    await deleteCustomFieldValue({ ...delReq(), role: "Reviewer" }, r);
    expect(mockDelete).toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(202);
  });

  it("returns 403 for a Reviewer who is not involved in the task", async () => {
    mockHasPermission.mockResolvedValue(false);
    const r = res();
    await setCustomFieldValue(taskReq(), r);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("returns 403 for an Auditor who is not involved in the task", async () => {
    mockHasPermission.mockResolvedValue(false);
    const r = res();
    await setCustomFieldValue({ ...taskReq(), role: "Auditor" }, r);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("allows an Editor with task.edit without looking at the assignment", async () => {
    const r = res();
    await setCustomFieldValue({ ...taskReq(), role: "Editor" }, r);
    expect(mockHasPermission).toHaveBeenCalledWith(expect.anything(), "task.edit");
    expect(mockCanEditTask).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(200);
  });

  it("does not apply the task rule to other entity types", async () => {
    mockGetDef.mockResolvedValue({ id: 1, entity_type: "vendor" });
    mockHasPermission.mockResolvedValue(false);
    mockCanEditTask.mockResolvedValue(true);
    const r = res();
    await setCustomFieldValue(taskReq(), r);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(mockCanEditTask).not.toHaveBeenCalled();
  });
});
