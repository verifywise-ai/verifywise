import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockTransaction = { commit: jest.fn<any>(), rollback: jest.fn<any>() };
jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn<any>(() => Promise.resolve(mockTransaction)) },
}));
jest.mock("../../utils/rolePermissions.utils", () => ({
  roleHasPermission: jest.fn<any>(),
}));
jest.mock("../../utils/lifecycle.utils", () => {
  const actual = jest.requireActual<any>("../../utils/lifecycle.utils");
  return {
    ...actual,
    getLifecycleRow: jest.fn<any>(),
    applyLifecycleAction: jest.fn<any>(),
    getLifecycleOrgSettings: jest.fn<any>(),
    upsertLifecycleOrgSettings: jest.fn<any>(),
    updateDepartment: jest.fn<any>(),
  };
});
jest.mock("../../utils/changeHistory.base.utils", () => ({
  recordMultipleFieldChanges: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));

import {
  canManageLifecycle,
  goLiveHandler,
  parseIsoDate,
  confirmStillLiveHandler,
  updateLifecycleSettingsHandler,
} from "../useCaseLifecycle.ctrl";
import { roleHasPermission } from "../../utils/rolePermissions.utils";
import {
  applyLifecycleAction,
  getLifecycleRow,
  upsertLifecycleOrgSettings,
} from "../../utils/lifecycle.utils";
import { recordMultipleFieldChanges } from "../../utils/changeHistory.base.utils";

const m = (fn: unknown) => fn as jest.MockedFunction<any>;

function req(overrides: Record<string, any> = {}): any {
  return {
    userId: 5,
    organizationId: 2,
    role: "Editor",
    params: { id: "9" },
    body: {},
    t: (k: string) => k,
    ...overrides,
  };
}
function res(): any {
  const r: any = {};
  r.status = jest.fn<any>().mockReturnValue(r);
  r.json = jest.fn<any>().mockReturnValue(r);
  return r;
}

const row = (stage: string, owner = 1) => ({
  id: 9,
  owner,
  lifecycle_stage: stage,
  go_live_date: null,
  retired_at: null,
  last_confirmed_at: null,
  last_confirmed_by: null,
  department: null,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("canManageLifecycle", () => {
  it("lets the owner act without useCase.edit, but never an Auditor", async () => {
    m(roleHasPermission).mockResolvedValue(false);
    expect(await canManageLifecycle(req({ role: "Reviewer", userId: 1 }), 1)).toBe(true);
    expect(await canManageLifecycle(req({ role: "Reviewer", userId: 2 }), 1)).toBe(false);
    expect(await canManageLifecycle(req({ role: "Auditor", userId: 1 }), 1)).toBe(false);
    expect(roleHasPermission).toHaveBeenCalledTimes(1);
  });

  it("defers to useCase.edit for non-owners", async () => {
    m(roleHasPermission).mockResolvedValue(true);
    expect(await canManageLifecycle(req({ role: "Editor", userId: 2 }), 1)).toBe(true);
    expect(roleHasPermission).toHaveBeenCalledWith(2, "Editor", "useCase.edit");
  });
});

describe("parseIsoDate", () => {
  it("accepts real calendar dates only", () => {
    expect(parseIsoDate("2026-02-28")).toBe("2026-02-28");
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("2026-2-3")).toBeNull();
    expect(parseIsoDate(20260228)).toBeNull();
    expect(parseIsoDate("2026-02-28T00:00:00Z")).toBeNull();
  });
});

describe("lifecycle action handlers", () => {
  it("rejects a non-integer id before touching the database", async () => {
    const r = res();
    await goLiveHandler(req({ params: { id: "9abc" } }), r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(getLifecycleRow).not.toHaveBeenCalled();
  });

  it("returns 404 for a use case outside the org", async () => {
    m(getLifecycleRow).mockResolvedValue(null);
    const r = res();
    await goLiveHandler(req(), r);
    expect(r.status).toHaveBeenCalledWith(404);
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(applyLifecycleAction).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller may not manage the use case", async () => {
    m(getLifecycleRow).mockResolvedValue(row("planned", 1));
    m(roleHasPermission).mockResolvedValue(false);
    const r = res();
    await goLiveHandler(req({ role: "Reviewer", userId: 3 }), r);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(applyLifecycleAction).not.toHaveBeenCalled();
  });

  it("returns 409 when the stage guard rejects the transition", async () => {
    m(getLifecycleRow).mockResolvedValue(row("in_review"));
    m(roleHasPermission).mockResolvedValue(true);
    m(applyLifecycleAction).mockResolvedValue(null);
    const r = res();
    await goLiveHandler(req({ body: { go_live_date: "2026-01-01" } }), r);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(mockTransaction.commit).not.toHaveBeenCalled();
  });

  it("records the stage change and go-live date in change history", async () => {
    m(getLifecycleRow).mockResolvedValue(row("planned"));
    m(roleHasPermission).mockResolvedValue(true);
    m(applyLifecycleAction).mockResolvedValue({
      ...row("live"),
      go_live_date: "2026-01-01",
    });
    const r = res();
    await goLiveHandler(req({ body: { go_live_date: "2026-01-01" } }), r);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(m(applyLifecycleAction).mock.calls[0][3]).toBe("go_live");
    expect(m(applyLifecycleAction).mock.calls[0][4]).toEqual({
      userId: 5,
      goLiveDate: "2026-01-01",
    });
    const changes = m(recordMultipleFieldChanges).mock.calls[0][4];
    expect(changes).toEqual([
      { fieldName: "lifecycle_stage", oldValue: "Planned", newValue: "Live" },
      { fieldName: "go_live_date", oldValue: "", newValue: "2026-01-01" },
    ]);
    expect(mockTransaction.commit).toHaveBeenCalled();
  });

  it("refuses a go-live date in the future", async () => {
    const r = res();
    await goLiveHandler(req({ body: { go_live_date: "2999-01-01" } }), r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(getLifecycleRow).not.toHaveBeenCalled();
  });

  it("confirm passes the caller as the confirmer", async () => {
    m(getLifecycleRow).mockResolvedValue(row("live", 5));
    m(applyLifecycleAction).mockResolvedValue({
      ...row("live", 5),
      last_confirmed_at: new Date("2026-10-31T00:00:00Z"),
      last_confirmed_by: 5,
    });
    const r = res();
    await confirmStillLiveHandler(req({ role: "Reviewer" }), r);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(m(applyLifecycleAction).mock.calls[0][4]).toMatchObject({ userId: 5 });
  });
});

describe("updateLifecycleSettingsHandler", () => {
  it.each([[45], ["90"], [null], [undefined]])("rejects %p", async (value) => {
    const r = res();
    await updateLifecycleSettingsHandler(req({ body: { confirmation_interval_days: value } }), r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(upsertLifecycleOrgSettings).not.toHaveBeenCalled();
  });

  it("stores an allowed interval for the caller's org", async () => {
    m(upsertLifecycleOrgSettings).mockResolvedValue({
      organization_id: 2,
      confirmation_interval_days: 30,
    });
    const r = res();
    await updateLifecycleSettingsHandler(req({ body: { confirmation_interval_days: 30 } }), r);
    expect(upsertLifecycleOrgSettings).toHaveBeenCalledWith(2, 30);
    expect(r.status).toHaveBeenCalledWith(200);
  });
});

describe("canManageLifecycle for AI apps (#5193)", () => {
  it("checks the entity's own permission for non-owners", async () => {
    m(roleHasPermission).mockResolvedValue(true);
    expect(await canManageLifecycle(req({ role: "Editor", userId: 2 }), 1, "aiApp.edit")).toBe(
      true,
    );
    expect(roleHasPermission).toHaveBeenCalledWith(2, "Editor", "aiApp.edit");
  });
});
