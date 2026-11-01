import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../utils/useCaseOrgSettings.utils", () => ({
  USE_CASE_GEOGRAPHY_IDS: [1, 2, 3, 4, 5, 6],
  getUseCaseOrgSettings: jest.fn<any>(),
  upsertUseCaseOrgSettings: jest.fn<any>(),
  projectLevelFrameworkIdsQuery: jest.fn<any>(),
}));
jest.mock("../../utils/i18n.utils", () => ({ translateError: jest.fn(() => "err") }));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));

import { updateUseCaseOrgSettingsHandler } from "../useCaseOrgSettings.ctrl";
import {
  projectLevelFrameworkIdsQuery,
  upsertUseCaseOrgSettings,
} from "../../utils/useCaseOrgSettings.utils";

const m = (fn: unknown) => fn as jest.MockedFunction<any>;

function createReq(body: unknown): any {
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
  m(upsertUseCaseOrgSettings).mockImplementation(async (_org: number, update: any) => ({
    organization_id: 2,
    default_geography: null,
    default_framework_ids: [],
    ...update,
  }));
  m(projectLevelFrameworkIdsQuery).mockImplementation(async (ids: number[]) =>
    ids.filter((id) => id === 1 || id === 12),
  );
});

describe("updateUseCaseOrgSettingsHandler", () => {
  it("refuses an empty body", async () => {
    const res = createRes();
    await updateUseCaseOrgSettingsHandler(createReq({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(upsertUseCaseOrgSettings).not.toHaveBeenCalled();
  });

  it.each([0, 7, "2", 2.5])("refuses region %p", async (geography) => {
    const res = createRes();
    await updateUseCaseOrgSettingsHandler(createReq({ default_geography: geography }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(upsertUseCaseOrgSettings).not.toHaveBeenCalled();
  });

  it("accepts a region and null to clear it", async () => {
    const res = createRes();
    await updateUseCaseOrgSettingsHandler(createReq({ default_geography: 2 }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    await updateUseCaseOrgSettingsHandler(createReq({ default_geography: null }), createRes());
    expect(m(upsertUseCaseOrgSettings).mock.calls.map((c: any[]) => c[1])).toEqual([
      { default_geography: 2 },
      { default_geography: null },
    ]);
  });

  it.each([[["1"]], [[0]], ["1"], [[1.5]], [Array.from({ length: 51 }, (_, i) => i + 1)]])(
    "refuses framework ids %p",
    async (ids) => {
      const res = createRes();
      await updateUseCaseOrgSettingsHandler(createReq({ default_framework_ids: ids }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(upsertUseCaseOrgSettings).not.toHaveBeenCalled();
    },
  );

  it("refuses an organization-wide or unknown framework", async () => {
    const res = createRes();
    // 2 (ISO 42001) is organization-wide, so the check returns only [1].
    await updateUseCaseOrgSettingsHandler(createReq({ default_framework_ids: [1, 2] }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(upsertUseCaseOrgSettings).not.toHaveBeenCalled();
  });

  it("stores project-level frameworks once each, in order", async () => {
    const res = createRes();
    await updateUseCaseOrgSettingsHandler(
      createReq({ default_framework_ids: [12, 1, 12], default_geography: 3 }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(upsertUseCaseOrgSettings).toHaveBeenCalledWith(2, {
      default_geography: 3,
      default_framework_ids: [12, 1],
    });
  });
});
