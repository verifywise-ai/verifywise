const mockQuery = jest.fn();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));

import { getUserLanguage } from "../userPreference.utils";

describe("getUserLanguage", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it.each(["de", "fr", "en"])("returns the saved language %s", async (language) => {
    mockQuery.mockResolvedValue([{ language }]);
    await expect(getUserLanguage(8)).resolves.toBe(language);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("FROM user_preferences WHERE user_id = :id"),
      expect.objectContaining({ replacements: { id: 8 } }),
    );
  });

  // The backend dictionaries cover en, de and fr. Spanish is a frontend language,
  // so a Spanish user is written to in English rather than in a half-key.
  it.each(["es", "ja", "", null])("falls back to English for %p", async (language) => {
    mockQuery.mockResolvedValue([{ language }]);
    await expect(getUserLanguage(8)).resolves.toBe("en");
  });

  it("falls back to English when the user has no preferences row", async () => {
    mockQuery.mockResolvedValue([]);
    await expect(getUserLanguage(8)).resolves.toBe("en");
  });

  it("never throws: a failed read must not cost the user a notification", async () => {
    mockQuery.mockRejectedValue(new Error("db down"));
    await expect(getUserLanguage(8)).resolves.toBe("en");
  });
});
