import { Request, Response } from "express";

jest.mock("../modelLifecycle.service", () => ({
  reorderPhases: jest.fn(async () => undefined),
  reorderItems: jest.fn(async () => undefined),
  detachFile: jest.fn(),
  updateApprovalStatus: jest.fn(),
  modelInOrganization: jest.fn(),
  itemInOrganization: jest.fn(),
}));

import * as svc from "../modelLifecycle.service";
import { ForbiddenException } from "../../../domain.layer/exceptions/custom.exception";
import {
  detachFileCtrl,
  orderedIdsFrom,
  reorderItemsCtrl,
  reorderPhasesCtrl,
  requireItemInOrganization,
  requireModelInOrganization,
  updateApprovalStatusCtrl,
} from "../modelLifecycle.ctrl";

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

describe("model lifecycle detach file", () => {
  beforeEach(() => jest.clearAllMocks());

  const detachRequest = () =>
    ({
      params: { id: "10", itemId: "20", fileId: "99" },
      organizationId: 1,
      userId: 7,
      t: (key: string) => key,
    }) as unknown as Request;

  it("answers 404 when the item has no link to the file", async () => {
    (svc.detachFile as jest.Mock).mockResolvedValueOnce(false);
    const res = response();

    await detachFileCtrl(detachRequest(), res);

    expect(svc.detachFile).toHaveBeenCalledWith(1, 10, 20, 99, 7);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("answers 200 when the link was removed", async () => {
    (svc.detachFile as jest.Mock).mockResolvedValueOnce(true);
    const res = response();

    await detachFileCtrl(detachRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("model lifecycle approval decision", () => {
  beforeEach(() => jest.clearAllMocks());

  const decisionRequest = (approverUserId: string, callerId = 7, status = "approved") =>
    ({
      params: { id: "10", itemId: "20", userId: approverUserId },
      body: { status },
      organizationId: 1,
      userId: callerId,
      role: "Admin",
      t: (key: string) => key,
    }) as unknown as Request;

  it("answers 403 when the caller is not the named approver, even as an Admin", async () => {
    const res = response();

    await updateApprovalStatusCtrl(decisionRequest("8"), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: "Only the assigned approver can record this decision",
      }),
    );
    expect(svc.updateApprovalStatus).not.toHaveBeenCalled();
  });

  it("records the decision when the caller is the named approver", async () => {
    (svc.updateApprovalStatus as jest.Mock).mockResolvedValueOnce({ id: 3, status: "approved" });
    const res = response();

    await updateApprovalStatusCtrl(decisionRequest("7"), res);

    expect(svc.updateApprovalStatus).toHaveBeenCalledWith(1, 10, 20, 7, "approved", 7);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("answers 404 when the caller holds no approval row on the item", async () => {
    (svc.updateApprovalStatus as jest.Mock).mockResolvedValueOnce(null);
    const res = response();

    await updateApprovalStatusCtrl(decisionRequest("7"), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("answers 403 when the service refuses the decision", async () => {
    (svc.updateApprovalStatus as jest.Mock).mockRejectedValueOnce(
      new ForbiddenException("Only the assigned approver can record this decision"),
    );
    const res = response();

    await updateApprovalStatusCtrl(decisionRequest("7"), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: "Only the assigned approver can record this decision",
      }),
    );
  });
});

describe("model lifecycle organization scope", () => {
  beforeEach(() => jest.clearAllMocks());

  const scopedRequest = () =>
    ({
      params: { id: "10", itemId: "20" },
      organizationId: 1,
      userId: 7,
      t: (key: string) => key,
    }) as unknown as Request;

  it("answers 404 for a model outside the organization and stops there", async () => {
    (svc.modelInOrganization as jest.Mock).mockResolvedValueOnce(false);
    const res = response();
    const next = jest.fn();

    await requireModelInOrganization(scopedRequest(), res, next);

    expect(svc.modelInOrganization).toHaveBeenCalledWith(1, 10);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: "Model not found" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("passes a model of the organization on", async () => {
    (svc.modelInOrganization as jest.Mock).mockResolvedValueOnce(true);
    const res = response();
    const next = jest.fn();

    await requireModelInOrganization(scopedRequest(), res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("answers 404 for an item outside the organization and stops there", async () => {
    (svc.itemInOrganization as jest.Mock).mockResolvedValueOnce(false);
    const res = response();
    const next = jest.fn();

    await requireItemInOrganization(scopedRequest(), res, next);

    expect(svc.itemInOrganization).toHaveBeenCalledWith(1, 20);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: "Lifecycle item not found" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("passes an item of the organization on", async () => {
    (svc.itemInOrganization as jest.Mock).mockResolvedValueOnce(true);
    const res = response();
    const next = jest.fn();

    await requireItemInOrganization(scopedRequest(), res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("answers 500 when the lookup fails, without calling next", async () => {
    (svc.modelInOrganization as jest.Mock).mockRejectedValueOnce(new Error("db down"));
    const res = response();
    const next = jest.fn();

    await requireModelInOrganization(scopedRequest(), res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});
