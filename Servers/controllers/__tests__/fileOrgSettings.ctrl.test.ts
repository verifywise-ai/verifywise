import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../utils/fileOrgSettings.utils", () => ({
  getFileOrgSettings: jest.fn<any>(),
  upsertFileOrgSettings: jest.fn<any>(),
}));
jest.mock("../../utils/retentionAudit.utils", () => ({
  appendRetentionChangeToLedger: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/i18n.utils", () => ({ translateError: jest.fn(() => "err") }));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));

import { updateFileOrgSettingsHandler } from "../fileOrgSettings.ctrl";
import { getFileOrgSettings, upsertFileOrgSettings } from "../../utils/fileOrgSettings.utils";
import { appendRetentionChangeToLedger } from "../../utils/retentionAudit.utils";

const m = (fn: unknown) => fn as jest.MockedFunction<any>;

function createReq(body: Record<string, any>): any {
  return { userId: 5, organizationId: 2, role: "Admin", body, t: (k: string) => k };
}
function createRes(): any {
  const res: any = {};
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("updateFileOrgSettingsHandler retention audit", () => {
  it("records a changed default retention policy", async () => {
    m(getFileOrgSettings).mockResolvedValue({ organization_id: 2, default_retention_policy: null });
    m(upsertFileOrgSettings).mockResolvedValue({
      organization_id: 2,
      default_retention_policy: "1_year",
    });
    const res = createRes();

    await updateFileOrgSettingsHandler(createReq({ default_retention_policy: "1_year" }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(appendRetentionChangeToLedger).toHaveBeenCalledWith({
      organizationId: 2,
      userId: 5,
      description: "Default evidence retention policy changed from none to 1 year",
      functionName: "updateFileOrgSettingsHandler",
      fileName: "fileOrgSettings.ctrl.ts",
    });
  });

  it("records nothing when the policy is unchanged", async () => {
    const same = { organization_id: 2, default_retention_policy: "90_days" };
    m(getFileOrgSettings).mockResolvedValue(same);
    m(upsertFileOrgSettings).mockResolvedValue(same);

    await updateFileOrgSettingsHandler(
      createReq({ default_retention_policy: "90_days" }),
      createRes(),
    );

    expect(appendRetentionChangeToLedger).not.toHaveBeenCalled();
  });

  it("still saves and records 'set to' when reading the old policy fails", async () => {
    m(getFileOrgSettings).mockRejectedValue(new Error("read failed"));
    m(upsertFileOrgSettings).mockResolvedValue({
      organization_id: 2,
      default_retention_policy: null,
    });
    const res = createRes();

    await updateFileOrgSettingsHandler(createReq({ default_retention_policy: null }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(appendRetentionChangeToLedger).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Default evidence retention policy set to none" }),
    );
  });

  it("records nothing for an invalid policy", async () => {
    const res = createRes();
    await updateFileOrgSettingsHandler(createReq({ default_retention_policy: "2_days" }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(upsertFileOrgSettings).not.toHaveBeenCalled();
    expect(appendRetentionChangeToLedger).not.toHaveBeenCalled();
  });
});
