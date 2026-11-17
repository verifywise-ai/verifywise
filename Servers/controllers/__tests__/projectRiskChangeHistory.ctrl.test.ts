import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../utils/projectRiskChangeHistory.utils", () => ({
  getProjectRiskChangeHistory: jest.fn(),
}));
jest.mock("../../utils/riskVisibility.utils", () => ({
  ...(jest.requireActual("../../utils/riskVisibility.utils") as object),
  isRiskVisibleQuery: jest.fn(),
}));
jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: new Proxy({}, { get: () => (data: unknown) => data }),
}));
jest.mock("../../utils/i18n.utils", () => ({ translateError: jest.fn() }));

import { getProjectRiskChangeHistoryByRiskId } from "../projectRiskChangeHistory.ctrl";
import { getProjectRiskChangeHistory } from "../../utils/projectRiskChangeHistory.utils";
import { isRiskVisibleQuery } from "../../utils/riskVisibility.utils";

const mockHistory = getProjectRiskChangeHistory as jest.Mock<any>;
const mockVisible = isRiskVisibleQuery as jest.Mock<any>;

function createRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const req = (): any => ({
  params: { projectRiskId: "7" },
  query: {},
  organizationId: 1,
  userId: 9,
  role: "Editor",
  t: (s: string) => s,
});

describe("getProjectRiskChangeHistoryByRiskId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the history of a risk the viewer can see", async () => {
    const payload = { data: [{ id: 1 }], hasMore: false, total: 1 };
    mockVisible.mockResolvedValue(true);
    mockHistory.mockResolvedValue(payload);
    const res = createRes();

    await getProjectRiskChangeHistoryByRiskId(req(), res);

    expect(mockVisible).toHaveBeenCalledWith(7, 1, { userId: 9, role: "Editor" });
    expect(mockHistory).toHaveBeenCalledWith(7, 1, 100, 0);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(payload);
  });

  it("answers a hidden risk like a missing one: 200 with no history", async () => {
    mockVisible.mockResolvedValue(false);
    const res = createRes();

    await getProjectRiskChangeHistoryByRiskId(req(), res);

    expect(mockHistory).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: [], hasMore: false, total: 0 });
  });
});
