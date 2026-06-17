import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../../database/db", () => ({
  sequelize: {
    query: jest.fn<any>(),
  },
}));

import { buildLoginOrgContext } from "../userLoginContext.service";
import { sequelize } from "../../../database/db";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;

describe("buildLoginOrgContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns defaults when orgId is missing", async () => {
    const result = await buildLoginOrgContext(null, 1);
    expect(result).toEqual({ onboardingStatus: "completed", isOrgCreator: false });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns onboarding status from the org row", async () => {
    mockQuery.mockResolvedValueOnce([{ onboarding_status: "pending" }] as any);
    mockQuery.mockResolvedValueOnce([{ id: 999 }] as any);
    const result = await buildLoginOrgContext(7, 1);
    expect(result.onboardingStatus).toBe("pending");
    expect(result.isOrgCreator).toBe(false);
  });

  it("marks isOrgCreator true when the user is the first admin", async () => {
    mockQuery.mockResolvedValueOnce([{ onboarding_status: "completed" }] as any);
    mockQuery.mockResolvedValueOnce([{ id: 1 }] as any);
    const result = await buildLoginOrgContext(7, 1);
    expect(result.isOrgCreator).toBe(true);
  });

  it("returns sensible defaults when queries return empty rows", async () => {
    mockQuery.mockResolvedValueOnce([null] as any);
    mockQuery.mockResolvedValueOnce([null] as any);
    const result = await buildLoginOrgContext(7, 1);
    expect(result).toEqual({ onboardingStatus: "completed", isOrgCreator: false });
  });
});
