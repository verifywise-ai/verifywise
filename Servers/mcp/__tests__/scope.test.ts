import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../utils/superAdmin.utils", () => ({
  organizationExists: jest.fn(),
}));

import { organizationExists } from "../../utils/superAdmin.utils";
import { requireOrganization } from "../scope";

const mockExists = organizationExists as unknown as jest.Mock;

describe("mcp/scope", () => {
  beforeEach(() => jest.clearAllMocks());

  it("passes for an organization that exists", async () => {
    mockExists.mockResolvedValue(true as never);
    await expect(requireOrganization(3)).resolves.toBeUndefined();
  });

  /**
   * Without this the governance queries return an empty list for an id that
   * does not exist, which reads as "this organization has no risks" rather
   * than "there is no such organization".
   */
  it("refuses an organization that does not exist, naming the id", async () => {
    mockExists.mockResolvedValue(false as never);
    await expect(requireOrganization(999)).rejects.toThrow(
      "No organization with id 999 on this deployment.",
    );
  });
});
