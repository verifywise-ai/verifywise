const mockQuery = jest.fn();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));

import {
  createNewUserPreferencesQuery,
  getPreferencesByUserQuery,
  updateUserPreferencesByIdQuery,
} from "../userPreference.utils";

const transaction = {} as never;

describe("user preference JSONB fields", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("reads parallel_agents from the preferences blob", async () => {
    mockQuery.mockResolvedValue([]);
    await getPreferencesByUserQuery(4);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("(preferences->>'parallel_agents')::boolean AS parallel_agents"),
      expect.objectContaining({ replacements: { id: 4 } }),
    );
  });

  it("stores parallel_agents beside date_format on insert", async () => {
    mockQuery.mockResolvedValue([{}]);
    await createNewUserPreferencesQuery(
      {
        user_id: 4,
        language: "en",
        date_format: "DD-MM-YYYY",
        parallel_agents: true,
      } as never,
      transaction,
    );

    const replacements = mockQuery.mock.calls[0][1].replacements as { preferences: string };
    expect(JSON.parse(replacements.preferences)).toEqual({
      date_format: "DD-MM-YYYY",
      parallel_agents: true,
    });
  });

  it("merges date_format and parallel_agents in a single preferences assignment", async () => {
    mockQuery.mockResolvedValue([{}]);
    await updateUserPreferencesByIdQuery(
      4,
      { language: "de", date_format: "MM-DD-YYYY" as never, parallel_agents: false },
      transaction,
    );

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql.match(/preferences =/g)).toHaveLength(1);
    expect(sql).toContain(
      "jsonb_build_object('date_format', :date_format::text, 'parallel_agents', :parallel_agents::boolean)",
    );
    expect(mockQuery.mock.calls[0][1].replacements).toEqual(
      expect.objectContaining({
        id: 4,
        language: "de",
        date_format: "MM-DD-YYYY",
        parallel_agents: false,
      }),
    );
  });

  it("does not write parallel_agents when the loaded value is missing", async () => {
    mockQuery.mockResolvedValue([{}]);
    await updateUserPreferencesByIdQuery(
      4,
      { date_format: "DD-MM-YYYY" as never, parallel_agents: undefined },
      transaction,
    );

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("jsonb_build_object('date_format', :date_format::text)");
    expect(sql).not.toContain("parallel_agents");
  });
});
