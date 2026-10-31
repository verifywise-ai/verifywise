import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn<any>().mockResolvedValue({
      commit: jest.fn<any>(),
      rollback: jest.fn<any>(),
    }),
  },
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../utils/i18n.utils", () => ({ translateError: jest.fn(() => "err") }));
jest.mock("../../utils/mrmSettings.utils", () => ({
  MIN_RETENTION_MONTHS: 13,
  getMrmOrgSettings: jest.fn<any>(),
  lockMrmOrgSettings: jest.fn<any>(),
  upsertMrmOrgSettings: jest.fn<any>(),
}));
jest.mock("../../utils/auditLedger.utils", () => ({
  appendToAuditLedger: jest.fn<any>(),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logFailure: jest.fn<any>(),
}));
// Built-in Admin holds organization.admin; "Compliance lead" is a custom role
// granted it, "Risk analyst" a custom role without it.
jest.mock("../../utils/rolePermissions.utils", () => ({
  roleHasPermission: jest.fn(
    async (_orgId: number | null, role: string, key: string) =>
      key === "organization.admin" && (role === "Admin" || role === "Compliance lead"),
  ),
}));
jest.mock("../../utils/mrmAlerts.utils", () => ({
  getAlertExtraRecipientsQuery: jest.fn<any>().mockResolvedValue([]),
  getOrgMemberIdsQuery: jest.fn<any>(),
  replaceAlertRecipientsQuery: jest.fn<any>(),
}));

import { updateMrmSettingsHandler } from "../mrmSettings.ctrl";
import { lockMrmOrgSettings, upsertMrmOrgSettings } from "../../utils/mrmSettings.utils";
import { sequelize } from "../../database/db";
import { appendToAuditLedger } from "../../utils/auditLedger.utils";
import { logFailure } from "../../utils/logger/logHelper";

const upsert = upsertMrmOrgSettings as jest.MockedFunction<any>;
const getSettings = lockMrmOrgSettings as jest.MockedFunction<any>;
const append = appendToAuditLedger as jest.MockedFunction<any>;
const failureLog = logFailure as jest.MockedFunction<any>;

function createReq(role: string, body: Record<string, any>): any {
  return { userId: 1, organizationId: 1, role, body, t: (k: string) => k };
}
function createRes(): any {
  const res: any = {};
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  return res;
}

describe("updateMrmSettingsHandler retention permission", () => {
  beforeEach(() => {
    upsert.mockReset();
    upsert.mockResolvedValue({ organization_id: 1, retention_months: 36 });
    getSettings.mockReset();
    getSettings.mockResolvedValue({ organization_id: 1, retention_months: 24 });
    append.mockReset();
    failureLog.mockReset();
  });

  it("rejects an Editor changing retention_months", async () => {
    const res = createRes();
    await updateMrmSettingsHandler(createReq("Editor", { retention_months: 36 }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].data).toBe("Only admins can change retention periods");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("still lets an Editor change alert settings", async () => {
    const res = createRes();
    await updateMrmSettingsHandler(createReq("Editor", { alert_email_enabled: true }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(upsert).toHaveBeenCalled();
  });

  it("lets an Admin change retention_months", async () => {
    const res = createRes();
    await updateMrmSettingsHandler(createReq("Admin", { retention_months: 36 }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(upsert).toHaveBeenCalled();
  });

  it("lets a custom role granted organization.admin change retention_months", async () => {
    const res = createRes();
    await updateMrmSettingsHandler(createReq("Compliance lead", { retention_months: 36 }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(upsert).toHaveBeenCalled();
  });

  it("rejects a custom role without organization.admin", async () => {
    const res = createRes();
    await updateMrmSettingsHandler(createReq("Risk analyst", { retention_months: 36 }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses an elected SuperAdmin whose org role is Editor", async () => {
    // SuperAdmin is a cross-tenant grant; inside an org the org role decides.
    const res = createRes();
    await updateMrmSettingsHandler(
      { ...createReq("Editor", { retention_months: 36 }), isSuperAdmin: true },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("keeps letting a SuperAdmin change retention_months", async () => {
    const res = createRes();
    await updateMrmSettingsHandler(createReq("SuperAdmin", { retention_months: 36 }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(upsert).toHaveBeenCalled();
  });
});

describe("updateMrmSettingsHandler retention audit trail", () => {
  beforeEach(() => {
    upsert.mockReset();
    upsert.mockResolvedValue({ organization_id: 1, retention_months: 36 });
    getSettings.mockReset();
    getSettings.mockResolvedValue({ organization_id: 1, retention_months: 24 });
    append.mockReset();
    failureLog.mockReset();
  });

  it("appends a ledger entry when retention_months changes", async () => {
    const res = createRes();
    await updateMrmSettingsHandler(createReq("Admin", { retention_months: 36 }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(append).toHaveBeenCalledWith({
      organizationId: 1,
      entryType: "event_log",
      userId: 1,
      eventType: "Update",
      entityType: "data_retention",
      description: "Model risk metric retention changed from 24 to 36 months",
    });
  });

  it("appends nothing when retention_months is unchanged or absent", async () => {
    getSettings.mockResolvedValue({ organization_id: 1, retention_months: 36 });
    await updateMrmSettingsHandler(createReq("Admin", { retention_months: 36 }), createRes());
    await updateMrmSettingsHandler(createReq("Admin", { alert_email_enabled: true }), createRes());

    expect(append).not.toHaveBeenCalled();
  });

  it("reads the previous period under a lock in the update's transaction", async () => {
    const tx = { commit: jest.fn<any>(), rollback: jest.fn<any>() };
    (sequelize.transaction as jest.MockedFunction<any>).mockResolvedValueOnce(tx);
    const order: string[] = [];
    getSettings.mockImplementation(async () => {
      order.push("lock");
      return { organization_id: 1, retention_months: 24 };
    });
    upsert.mockImplementation(async () => {
      order.push("upsert");
      return { organization_id: 1, retention_months: 36 };
    });

    await updateMrmSettingsHandler(createReq("Admin", { retention_months: 36 }), createRes());

    expect(getSettings).toHaveBeenCalledWith(1, tx);
    expect(upsert).toHaveBeenCalledWith(1, expect.anything(), tx);
    expect(order).toEqual(["lock", "upsert"]);
    expect(tx.commit).toHaveBeenCalled();
  });

  it("does not lock the row when retention_months is absent", async () => {
    await updateMrmSettingsHandler(createReq("Admin", { alert_email_enabled: true }), createRes());

    expect(getSettings).not.toHaveBeenCalled();
  });

  it("logs a failed append and still succeeds", async () => {
    append.mockRejectedValue(new Error("ledger down"));
    const res = createRes();
    await updateMrmSettingsHandler(createReq("Admin", { retention_months: 36 }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(failureLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "Update", organizationId: 1 }),
    );
  });
});
