import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

import { sequelize } from "../../database/db";
import { listFrameworkRefs, resolveFrameworkIds, resolveUseCaseFrameworks } from "../frameworks";

const mockQuery = sequelize.query as unknown as jest.Mock;

/** The shape the frameworks table returns, trimmed to the columns in play. */
const FRAMEWORKS = [
  { id: 1, name: "EU AI Act", is_organizational: false },
  { id: 2, name: "ISO 42001", is_organizational: true },
  { id: 3, name: "ISO 27001", is_organizational: true },
  { id: 7, name: "PCI-DSS Lite Framework", is_organizational: false },
];

describe("mcp/frameworks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue(FRAMEWORKS as never);
  });

  describe("listFrameworkRefs", () => {
    it("reads the table rather than a list in the file", async () => {
      mockQuery.mockResolvedValue([
        { id: 99, name: "Some New Framework", is_organizational: true },
      ] as never);

      await expect(listFrameworkRefs()).resolves.toEqual([
        { id: 99, name: "Some New Framework", isOrganizational: true },
      ]);
    });
  });

  describe("resolveFrameworkIds", () => {
    it("resolves names to ids", async () => {
      await expect(resolveFrameworkIds(["EU AI Act", "ISO 27001"])).resolves.toEqual([1, 3]);
    });

    it("ignores case and surrounding whitespace", async () => {
      await expect(resolveFrameworkIds(["  iso 42001 "])).resolves.toEqual([2]);
    });

    it("does not apply the use case scope rule, so a risk may map across both", async () => {
      await expect(resolveFrameworkIds(["EU AI Act", "ISO 42001"])).resolves.toEqual([1, 2]);
    });

    it("names the available frameworks when one is not found", async () => {
      await expect(resolveFrameworkIds(["ISO 9001"])).rejects.toThrow(
        /No framework named "ISO 9001".*Available: EU AI Act, ISO 42001, ISO 27001, PCI-DSS Lite Framework/s,
      );
    });
  });

  describe("resolveUseCaseFrameworks", () => {
    it("reports an organization-wide set as organization-wide", async () => {
      await expect(resolveUseCaseFrameworks(["ISO 42001", "ISO 27001"])).resolves.toEqual({
        ids: [2, 3],
        isOrganizational: true,
      });
    });

    it("reports a use-case scoped set as use-case scoped", async () => {
      await expect(
        resolveUseCaseFrameworks(["EU AI Act", "PCI-DSS Lite Framework"]),
      ).resolves.toEqual({ ids: [1, 7], isOrganizational: false });
    });

    it("treats no frameworks as use-case scoped, matching the column default", async () => {
      await expect(resolveUseCaseFrameworks([])).resolves.toEqual({
        ids: [],
        isOrganizational: false,
      });
    });

    it("reads nothing when there are no names to resolve", async () => {
      await resolveUseCaseFrameworks([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    /**
     * The bug this rule exists for: createNewProjectQuery refuses a framework
     * whose scope disagrees with the use case, and the caller cannot know the
     * scope without being told.
     */
    it("refuses a mix of scopes, naming which frameworks fall on each side", async () => {
      await expect(resolveUseCaseFrameworks(["EU AI Act", "ISO 42001"])).rejects.toThrow(
        /ISO 42001 is organization-wide, EU AI Act is use-case scoped/,
      );
    });

    it("pluralises both sides of the refusal", async () => {
      await expect(
        resolveUseCaseFrameworks(["EU AI Act", "PCI-DSS Lite Framework", "ISO 42001", "ISO 27001"]),
      ).rejects.toThrow(
        /ISO 42001, ISO 27001 are organization-wide, EU AI Act, PCI-DSS Lite Framework are use-case scoped/,
      );
    });

    it("rejects an unknown name before considering scope", async () => {
      await expect(resolveUseCaseFrameworks(["ISO 42001", "Nope"])).rejects.toThrow(
        /No framework named "Nope"/,
      );
    });
  });
});
