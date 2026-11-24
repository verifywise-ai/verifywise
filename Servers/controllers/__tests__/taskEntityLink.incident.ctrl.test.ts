/**
 * POST /tasks/:id/entities with an incident: linked while the incident is
 * not archived; an archived one answers 409 with a restore message, and
 * nothing is written.
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
  isIncidentLinkableQuery: jest.fn(),
  canLinkTaskToEntityQuery: jest.fn(),
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

import { addTaskEntityLink } from "../taskEntityLink.ctrl";
import { getTaskByIdQuery } from "../../utils/task.utils";
import {
  canLinkTaskToEntityQuery,
  createTaskEntityLinkQuery,
  entityExistsQuery,
  isIncidentLinkableQuery,
  linkExistsQuery,
} from "../../utils/taskEntityLink.utils";

const mockGetTask = getTaskByIdQuery as jest.MockedFunction<any>;
const mockExists = entityExistsQuery as jest.MockedFunction<any>;
const mockLinkable = isIncidentLinkableQuery as jest.MockedFunction<any>;
const mockCanLink = canLinkTaskToEntityQuery as jest.MockedFunction<any>;
const mockLinkExists = linkExistsQuery as jest.MockedFunction<any>;
const mockCreateLink = createTaskEntityLinkQuery as jest.MockedFunction<any>;

const req = (body: Record<string, unknown>): any => ({
  params: { id: "5" },
  body,
  userId: 7,
  role: "Editor",
  organizationId: 3,
  t: (key: string) => key,
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
  mockCanLink.mockResolvedValue(true);
  mockLinkExists.mockResolvedValue(false);
  mockCreateLink.mockResolvedValue({ id: 1, task_id: 5, entity_id: 12, entity_type: "incident" });
});

describe("addTaskEntityLink with an incident", () => {
  it("links an incident that is not archived", async () => {
    mockLinkable.mockResolvedValue(true);
    const r = res();

    await addTaskEntityLink(req({ entity_id: 12, entity_type: "incident" }), r);

    expect(r.status).toHaveBeenCalledWith(201);
    expect(mockLinkable).toHaveBeenCalledWith(12, 3, transaction);
    expect(mockCreateLink).toHaveBeenCalledWith(
      expect.objectContaining({ task_id: 5, entity_id: 12, entity_type: "incident" }),
      3,
      transaction,
    );
    expect(transaction.commit).toHaveBeenCalled();
  });

  it("answers 409 for an archived incident and writes nothing", async () => {
    mockLinkable.mockResolvedValue(false);
    const r = res();

    await addTaskEntityLink(req({ entity_id: 12, entity_type: "incident" }), r);

    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json.mock.calls[0][0].data).toBe("Restore this incident before linking it to a task.");
    expect(mockCreateLink).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it("answers 404 for an incident that is not in the organization", async () => {
    mockExists.mockResolvedValue(false);
    const r = res();

    await addTaskEntityLink(req({ entity_id: 12, entity_type: "incident" }), r);

    expect(r.status).toHaveBeenCalledWith(404);
    expect(mockLinkable).not.toHaveBeenCalled();
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it("does not run the incident check for other link types", async () => {
    const r = res();

    await addTaskEntityLink(req({ entity_id: 4, entity_type: "vendor" }), r);

    expect(r.status).toHaveBeenCalledWith(201);
    expect(mockLinkable).not.toHaveBeenCalled();
  });
});
