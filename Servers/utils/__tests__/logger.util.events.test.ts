import { describe, it, expect, jest } from "@jest/globals";

const mockQuery = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));

import { getEventsQuery } from "../logger.util";

// Rows written before logEvent redacted (direct callers appending
// `${error.message}`) must not be served raw to the org's members.
describe("getEventsQuery", () => {
  it("redacts stored descriptions on the way out and keeps the other fields", async () => {
    mockQuery.mockResolvedValue([
      {
        id: 1,
        event_type: "Error",
        description: "Share link failed: client_secret=abc123",
        user_id: 5,
        organization_id: 7,
      },
      { id: 2, event_type: "Create", description: "Created vendor Acme", user_id: 5 },
      { id: 3, event_type: "Update", description: null, user_id: 5 },
    ]);

    const events = (await getEventsQuery(7)) as Array<Record<string, unknown>>;

    expect(events).toEqual([
      {
        id: 1,
        event_type: "Error",
        description: "Share link failed: client_secret=[REDACTED]",
        user_id: 5,
        organization_id: 7,
      },
      { id: 2, event_type: "Create", description: "Created vendor Acme", user_id: 5 },
      { id: 3, event_type: "Update", description: null, user_id: 5 },
    ]);
  });
});
