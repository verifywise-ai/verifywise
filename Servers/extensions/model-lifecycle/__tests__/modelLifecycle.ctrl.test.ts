import { Request, Response } from "express";

jest.mock("../modelLifecycle.service", () => ({
  reorderPhases: jest.fn(async () => undefined),
  reorderItems: jest.fn(async () => undefined),
}));

import * as svc from "../modelLifecycle.service";
import { orderedIdsFrom, reorderItemsCtrl, reorderPhasesCtrl } from "../modelLifecycle.ctrl";

const request = (orderedIds: unknown) =>
  ({ body: { orderedIds }, params: { phaseId: "3" }, organizationId: 1 }) as unknown as Request;

function response() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock };
}

describe("model lifecycle reorder", () => {
  beforeEach(() => jest.clearAllMocks());

  it("accepts an array of integer ids", () => {
    expect(orderedIdsFrom(request([3, 1, 2]))).toEqual([3, 1, 2]);
  });

  it("treats a missing list as empty", () => {
    expect(orderedIdsFrom({ body: {} } as Request)).toEqual([]);
  });

  it.each([
    ["an object with a large length", { length: 1_000_000_000 }],
    ["a string", "1,2,3"],
    ["non-integer ids", [1, "2", 3.5]],
    ["more ids than any list holds", Array.from({ length: 1001 }, (_, i) => i)],
  ])("rejects %s", (_label, orderedIds) => {
    expect(orderedIdsFrom(request(orderedIds))).toBeUndefined();
  });

  it("answers a malformed phase reorder with 400 and never loops over it", async () => {
    const res = response();

    await reorderPhasesCtrl(request({ length: 1_000_000_000 }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(svc.reorderPhases).not.toHaveBeenCalled();
  });

  it("answers a malformed item reorder with 400 and never loops over it", async () => {
    const res = response();

    await reorderItemsCtrl(request({ length: 1_000_000_000 }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(svc.reorderItems).not.toHaveBeenCalled();
  });

  it("reorders a valid list", async () => {
    const res = response();

    await reorderItemsCtrl(request([2, 1]), res);

    expect(svc.reorderItems).toHaveBeenCalledWith(1, 3, [2, 1]);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
