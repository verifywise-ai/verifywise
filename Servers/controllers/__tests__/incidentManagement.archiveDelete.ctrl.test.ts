import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../services/incidentManagement.service", () => ({
  ...(jest.requireActual("../../services/incidentManagement.service") as object),
  setIncidentArchived: jest.fn(),
  deleteIncident: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  logStructured: jest.fn(),
}));

import { archiveIncidentById, deleteIncidentById } from "../incident-management.ctrl";
import { deleteIncident, setIncidentArchived } from "../../services/incidentManagement.service";

const mockArchive = setIncidentArchived as unknown as jest.Mock<(...a: any[]) => any>;
const mockDelete = deleteIncident as unknown as jest.Mock<(...a: any[]) => any>;

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

  it.each([
    [undefined, true],
    [{}, true],
    [{ archived: true }, true],
    [{ archived: false }, false],
  ])("body %j sets archived to %s through the shared update path", async (body, archived) => {
    mockArchive.mockResolvedValue({ toSafeJSON: () => ({ id: 3, archived }) });
    const res = makeRes();

    await archiveIncidentById(makeReq("3", body), res);

    expect(mockArchive).toHaveBeenCalledWith(7, 3, archived, 5);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toEqual(
      expect.objectContaining({ data: { id: 3, archived } }),
    );
  });

  it.each([{ archived: "false" }, { archived: 0 }, { archived: null }])(
    "refuses a non-boolean archived (%j) with 400",
    async (body) => {
      const res = makeRes();

      await archiveIncidentById(makeReq("3", body), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockArchive).not.toHaveBeenCalled();
    },
  );

  it("answers 404 for a missing incident", async () => {
    mockArchive.mockResolvedValue(null);
    const res = makeRes();

    await archiveIncidentById(makeReq("3", { archived: false }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("answers 400 for a malformed id", async () => {
    const res = makeRes();
    await archiveIncidentById(makeReq("abc"), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockArchive).not.toHaveBeenCalled();
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
