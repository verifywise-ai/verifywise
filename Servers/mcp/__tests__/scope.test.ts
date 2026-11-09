import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../utils/superAdmin.utils", () => ({
  organizationExists: jest.fn(),
}));

import { organizationExists } from "../../utils/superAdmin.utils";
import { z } from "zod";
import { requireOrganization, scopeToOrganization } from "../scope";
import type { ToolDef } from "../tool";

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

  describe("scopeToOrganization", () => {
    const CALLER = { userId: 7, organizationId: 3, role: "Admin", isSuperAdmin: false };

    const handler = jest.fn<ToolDef["handler"]>();
    const listRisks: ToolDef = {
      name: "list_risks",
      title: "List risks",
      description: "",
      inputSchema: { organizationId: z.number(), useCaseId: z.number().optional() },
      handler,
    };

    beforeEach(() => handler.mockResolvedValue({ content: [] }));

    it("takes organizationId out of the schema the model sees", () => {
      expect(Object.keys(scopeToOrganization(listRisks, 3).inputSchema)).toEqual(["useCaseId"]);
    });

    it("leaves the original tool untouched", () => {
      scopeToOrganization(listRisks, 3);
      expect(Object.keys(listRisks.inputSchema)).toEqual(["organizationId", "useCaseId"]);
    });

    it("supplies the fixed organization to the handler", async () => {
      await scopeToOrganization(listRisks, 3).handler({ useCaseId: 5 }, CALLER);
      expect(handler).toHaveBeenCalledWith({ useCaseId: 5, organizationId: 3 }, CALLER);
    });

    /** The schema already drops it; this holds even if something passed it through. */
    it("overrides an organizationId that arrives anyway", async () => {
      await scopeToOrganization(listRisks, 3).handler({ organizationId: 99 }, CALLER);
      expect(handler).toHaveBeenCalledWith({ organizationId: 3 }, CALLER);
    });

    it("returns a tool without an organizationId unchanged", () => {
      const listFrameworks: ToolDef = { ...listRisks, name: "list_frameworks", inputSchema: {} };
      expect(scopeToOrganization(listFrameworks, 3)).toBe(listFrameworks);
    });
  });
});
