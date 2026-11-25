/**
 * POST /tasks/:id/entities and DELETE /tasks/:id/entities/:linkId:
 *  - an incident is linked while it is not archived; an archived one answers
 *    409 with a restore message, from one access check, and nothing is written;
 *  - no access answers 403;
 *  - a 401 never opens a transaction.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const transaction = { commit: jest.fn(), rollback: jest.fn() };

jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn(async () => transaction) },
}));
jest.mock("../../utils/task.utils", () => ({ getTaskByIdQuery: jest.fn() }));
jest.mock("../../utils/taskEntityLink.utils", () => ({
  isValidEntityType: jest.fn((type: string) => ["vendor", "incident"].includes(type)),
  entityExistsQuery: jest.fn(),
  taskLinkRefusalQuery: jest.fn(),
  linkExistsQuery: jest.fn(),
  createTaskEntityLinkQuery: jest.fn(),
  getTaskEntityLinksQuery: jest.fn(),
  deleteTaskEntityLinkQuery: jest.fn(),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_req, err) => (err as Error).message),
}));

import { addTaskEntityLink, removeTaskEntityLink } from "../taskEntityLink.ctrl";
import { sequelize } from "../../database/db";
import { getTaskByIdQuery } from "../../utils/task.utils";
import {
  createTaskEntityLinkQuery,
  entityExistsQuery,
  linkExistsQuery,
  taskLinkRefusalQuery,
} from "../../utils/taskEntityLink.utils";

const mockTransaction = sequelize.transaction as unknown as jest.Mock<any>;
const mockGetTask = getTaskByIdQuery as jest.MockedFunction<any>;
const mockExists = entityExistsQuery as jest.MockedFunction<any>;
const mockRefusal = taskLinkRefusalQuery as jest.MockedFunction<any>;
const mockLinkExists = linkExistsQuery as jest.MockedFunction<any>;
const mockCreateLink = createTaskEntityLinkQuery as jest.MockedFunction<any>;

const req = (body: Record<string, unknown>, overrides: Record<string, unknown> = {}): any => ({
  params: { id: "5", linkId: "1" },
  body,
  userId: 7,
  role: "Editor",
  organizationId: 3,
  t: (key: string) => key,
  ...overrides,
});
const res = (): any => {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetTask.mockResolvedValue({ id: 5 });
  mockExists.mockResolvedValue(true);
  mockRefusal.mockResolvedValue(null);
  mockLinkExists.mockResolvedValue(false);
  mockCreateLink.mockResolvedValue({ id: 1, task_id: 5, entity_id: 12, entity_type: "incident" });
});

describe("addTaskEntityLink with an incident", () => {
  it("links an incident that is not archived", async () => {
    const r = res();

    await addTaskEntityLink(req({ entity_id: 12, entity_type: "incident" }), r);

    expect(r.status).toHaveBeenCalledWith(201);
    expect(mockRefusal).toHaveBeenCalledTimes(1);
    expect(mockRefusal).toHaveBeenCalledWith(
      12,
      "incident",
      { userId: 7, role: "Editor" },
      3,
      transaction,
    );
    expect(mockCreateLink).toHaveBeenCalledWith(
      expect.objectContaining({ task_id: 5, entity_id: 12, entity_type: "incident" }),
      3,
      transaction,
    );
    expect(transaction.commit).toHaveBeenCalled();
  });

  it("answers 409 for an archived incident and writes nothing", async () => {
    mockRefusal.mockResolvedValue("archived_incident");
    const r = res();

    await addTaskEntityLink(req({ entity_id: 12, entity_type: "incident" }), r);

    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json.mock.calls[0][0].data).toBe("Restore this incident before linking it to a task.");
    expect(mockRefusal).toHaveBeenCalledTimes(1);
    expect(mockCreateLink).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it("answers 403 when the user may not link the entity", async () => {
    mockRefusal.mockResolvedValue("forbidden");
    const r = res();

    await addTaskEntityLink(req({ entity_id: 4, entity_type: "vendor" }), r);

    expect(r.status).toHaveBeenCalledWith(403);
    expect(mockCreateLink).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it("answers 404 for an incident that is not in the organization", async () => {
    mockExists.mockResolvedValue(false);
    const r = res();

    await addTaskEntityLink(req({ entity_id: 12, entity_type: "incident" }), r);

    expect(r.status).toHaveBeenCalledWith(404);
    expect(mockRefusal).not.toHaveBeenCalled();
    expect(mockCreateLink).not.toHaveBeenCalled();
  });
});

describe("401 never opens a transaction", () => {
  it("on add", async () => {
    const r = res();
    await addTaskEntityLink(
      req({ entity_id: 12, entity_type: "incident" }, { userId: undefined }),
      r,
    );
    expect(r.status).toHaveBeenCalledWith(401);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("on remove", async () => {
    const r = res();
    await removeTaskEntityLink(req({}, { role: undefined }), r);
    expect(r.status).toHaveBeenCalledWith(401);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
