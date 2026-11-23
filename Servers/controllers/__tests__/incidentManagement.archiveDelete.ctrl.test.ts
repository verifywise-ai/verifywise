import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../services/incidentManagement.service", () => ({
  ...(jest.requireActual("../../services/incidentManagement.service") as object),
  setIncidentArchived: jest.fn(),
  deleteIncident: jest.fn(),
  updateIncident: jest.fn(),
}));
jest.mock("../../utils/rolePermissions.utils", () => ({
  requestHasPermission: jest.fn(async () => true),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  logStructured: jest.fn(),
}));

import {
  archiveIncidentById,
  deleteIncidentById,
  updateIncidentById,
} from "../incident-management.ctrl";
import {
  deleteIncident,
  IncidentArchivedError,
  IncidentUpdateValidationError,
  setIncidentArchived,
  updateIncident,
} from "../../services/incidentManagement.service";
import { ConflictException } from "../../domain.layer/exceptions/custom.exception";

const mockArchive = setIncidentArchived as unknown as jest.Mock<(...a: any[]) => any>;
const mockDelete = deleteIncident as unknown as jest.Mock<(...a: any[]) => any>;
const mockUpdate = updateIncident as unknown as jest.Mock<(...a: any[]) => any>;

const t = (key: string) => `T:${key}`;
const makeReq = (id: string, body?: unknown) =>
  ({ params: { id }, body, organizationId: 7, userId: 5, t }) as any;
const makeRes = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe("archiveIncidentById", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([[undefined], [{}], [{ archived: false }]])(
    "archives through the shared update path whatever the body (%j)",
    async (body) => {
      mockArchive.mockResolvedValue({ toSafeJSON: () => ({ id: 3, archived: true }) });
      const res = makeRes();

      await archiveIncidentById(makeReq("3", body), res);

      // The route stays archive-only; restore is PATCH /:id with { archived: false }.
      expect(mockArchive).toHaveBeenCalledWith(7, 3, true, 5);
      expect(res.status).toHaveBeenCalledWith(200);
    },
  );

  it("answers 404 for a missing incident", async () => {
    mockArchive.mockResolvedValue(null);
    const res = makeRes();

    await archiveIncidentById(makeReq("3"), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("answers 400 for a validation error from the write path", async () => {
    mockArchive.mockRejectedValue(
      new IncidentUpdateValidationError([
        { field: "project_id", message: "bad", code: "INVALID_REFERENCE" },
      ]),
    );
    const res = makeRes();

    await archiveIncidentById(makeReq("3"), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].data.errors[0]).toEqual(
      expect.objectContaining({ field: "project_id", code: "INVALID_REFERENCE" }),
    );
  });

  it("answers 409 for a conflict", async () => {
    mockArchive.mockRejectedValue(new ConflictException("changed", "incident", "updated_at"));
    const res = makeRes();

    await archiveIncidentById(makeReq("3"), res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("answers 400 for a malformed id", async () => {
    const res = makeRes();
    await archiveIncidentById(makeReq("abc"), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockArchive).not.toHaveBeenCalled();
  });
});

describe("updateIncidentById on an archived incident", () => {
  beforeEach(() => jest.clearAllMocks());

  it("answers 409 with the restore message", async () => {
    mockUpdate.mockRejectedValue(new IncidentArchivedError(["status"]));
    const res = makeRes();

    await updateIncidentById(makeReq("3", { status: "Closed" }), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        message: "T:Restore this incident before editing it.",
        code: "INCIDENT_ARCHIVED",
      }),
    );
  });
});

describe("deleteIncidentById", () => {
  beforeEach(() => jest.clearAllMocks());

  it("deletes through the service as the caller", async () => {
    mockDelete.mockResolvedValue({ id: 3 });
    const res = makeRes();

    await deleteIncidentById(makeReq("3"), res);

    expect(mockDelete).toHaveBeenCalledWith(7, 3, 5);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("answers 404 when nothing was deleted", async () => {
    mockDelete.mockResolvedValue(null);
    const res = makeRes();

    await deleteIncidentById(makeReq("3"), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("answers 500 when the delete fails", async () => {
    mockDelete.mockRejectedValue(new Error("db down"));
    const res = makeRes();

    await deleteIncidentById(makeReq("3"), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
