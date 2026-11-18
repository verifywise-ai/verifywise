import { describe, it, expect } from "vitest";
import { modelApprovalLocks } from "../modelApproval";

const EDITOR = 10;
const APPROVER = 20;
const base = { userId: EDITOR, isAdmin: false };

describe("modelApprovalLocks", () => {
  it("lets anyone decide a model with no approver", () => {
    const locks = modelApprovalLocks({
      ...base,
      savedApprover: null,
      savedStatus: "Pending",
      approver: "",
    });
    expect(locks.canPickStatus("Approved")).toBe(true);
    expect(locks.approverLocked).toBe(false);
  });

  it("keeps decisions and the approver from an Editor who is not the saved approver", () => {
    const locks = modelApprovalLocks({
      ...base,
      savedApprover: APPROVER,
      savedStatus: "Pending",
      approver: APPROVER,
    });
    expect(locks.canPickStatus("Approved")).toBe(false);
    expect(locks.canPickStatus("Blocked")).toBe(false);
    expect(locks.canPickStatus("Retired")).toBe(true);
    expect(locks.canPickStatus("Pending")).toBe(true);
    expect(locks.approverLocked).toBe(true);
  });

  it("lets the saved approver decide and re-assign", () => {
    const locks = modelApprovalLocks({
      ...base,
      userId: APPROVER,
      savedApprover: APPROVER,
      savedStatus: "Pending",
      approver: APPROVER,
    });
    expect(locks.canPickStatus("Approved")).toBe(true);
    expect(locks.approverLocked).toBe(false);
  });

  it("lets an Admin decide anything", () => {
    const locks = modelApprovalLocks({
      ...base,
      isAdmin: true,
      savedApprover: APPROVER,
      savedStatus: "Approved",
      approver: 30,
    });
    expect(locks.canPickStatus("Rejected")).toBe(true);
    expect(locks.approverLocked).toBe(false);
  });

  it("keeps a non-Admin from deciding in the save that names an approver", () => {
    const locks = modelApprovalLocks({
      ...base,
      savedApprover: null,
      savedStatus: null,
      approver: 30,
    });
    expect(locks.canPickStatus("Approved")).toBe(false);
    expect(locks.canPickStatus("Pending")).toBe(true);
  });

  it("keeps a non-Admin from picking themself, but not the saved approver", () => {
    expect(
      modelApprovalLocks({
        ...base,
        savedApprover: null,
        savedStatus: null,
        approver: "",
      }).canPickApprover(EDITOR),
    ).toBe(false);
    expect(
      modelApprovalLocks({
        ...base,
        savedApprover: EDITOR,
        savedStatus: "Pending",
        approver: EDITOR,
      }).canPickApprover(EDITOR),
    ).toBe(true);
    expect(
      modelApprovalLocks({
        ...base,
        isAdmin: true,
        savedApprover: null,
        savedStatus: null,
        approver: "",
      }).canPickApprover(EDITOR),
    ).toBe(true);
  });

  it("leaves the approver of a decided model with none open to an editor", () => {
    const locks = modelApprovalLocks({
      ...base,
      savedApprover: null,
      savedStatus: "Approved",
      approver: "",
    });
    expect(locks.approverLocked).toBe(false);
  });
});
