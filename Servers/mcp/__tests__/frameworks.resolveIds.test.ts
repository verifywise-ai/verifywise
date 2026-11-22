jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from "../../database/db";
import { resolveUseCaseFrameworkIds } from "../frameworks";

const mockQuery = sequelize.query as unknown as jest.Mock;

describe("resolveUseCaseFrameworkIds", () => {
  beforeEach(() => {
    mockQuery.mockResolvedValue([
      { id: 1, name: "EU AI Act", is_organizational: false },
      { id: 2, name: "ISO 42001", is_organizational: true },
    ]);
  });

  it("links a repeated framework once", async () => {
    await expect(resolveUseCaseFrameworkIds([1, 1])).resolves.toEqual({
      ids: [1],
      isOrganizational: false,
    });
  });

  it("refuses an unknown id", async () => {
    await expect(resolveUseCaseFrameworkIds([9])).rejects.toThrow("No framework with id 9");
  });
});
