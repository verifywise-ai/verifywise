/**
 * Slack delivery query: which connections an event may reach. The SQL is
 * checked clause by clause; the database behaviour is covered by the
 * slack-webhooks tenant-isolation integration test.
 */
jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(),
    transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn({ id: "txn" })),
  },
}));

jest.mock("../../domain.layer/models/slackNotification/slackWebhook.model", () => ({
  SlackWebhookModel: { name: "SlackWebhookModel" },
}));

import { sequelize } from "../../database/db";
import {
  deactivateSlackWebhookQuery,
  getDeliverableSlackWebhooksQuery,
} from "../slackWebhook.utils";

const mockQuery = sequelize.query as jest.Mock;
const mockTransaction = sequelize.transaction as unknown as jest.Mock;

const squash = (sql: string) => sql.replace(/\s+/g, " ").trim();

/** The delivery SELECT (second call; the first binds the organization). */
const deliveryCall = () => {
  const [sql, options] = mockQuery.mock.calls[1];
  return { sql: squash(sql), options };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockReset();
  mockQuery.mockResolvedValue([]);
});

describe("getDeliverableSlackWebhooksQuery", () => {
  const params = { organizationId: 7, userId: 3, routingType: "Membership and roles" };

  it("binds the organization for row-level security before reading", async () => {
    await getDeliverableSlackWebhooksQuery(params);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toBe(`SELECT set_config('app.current_org', :org, true)`);
    expect(options).toMatchObject({ replacements: { org: "7" }, transaction: { id: "txn" } });
    expect(deliveryCall().options.transaction).toEqual({ id: "txn" });
  });

  it("only reads the event's organization", async () => {
    await getDeliverableSlackWebhooksQuery(params);
    const { sql, options } = deliveryCall();
    expect(sql).toContain("organization_id = :organizationId");
    expect(options.replacements.organizationId).toBe(7);
  });

  it("only reads active connections", async () => {
    await getDeliverableSlackWebhooksQuery(params);
    expect(deliveryCall().sql).toContain("is_active = true");
  });

  it("only reads connections routed for the type", async () => {
    await getDeliverableSlackWebhooksQuery(params);
    const { sql, options } = deliveryCall();
    expect(sql).toContain("routing_type && ARRAY[:routingType]::text[]");
    expect(options.replacements.routingType).toBe("Membership and roles");
  });

  it("reads organization-wide connections and the triggering user's own", async () => {
    await getDeliverableSlackWebhooksQuery(params);
    const { sql, options } = deliveryCall();
    expect(sql).toContain("(delivery_scope = :organizationScope OR user_id = :userId)");
    expect(options.replacements.organizationScope).toBe("organization");
    expect(options.replacements.userId).toBe(3);
  });

  it("matches organization-wide connections only when no user triggered the event", async () => {
    await getDeliverableSlackWebhooksQuery({
      organizationId: 7,
      routingType: "Membership and roles",
    });
    expect(deliveryCall().options.replacements.userId).toBeNull();
  });

  it("returns the rows the query found", async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 1 }]);
    await expect(getDeliverableSlackWebhooksQuery(params)).resolves.toEqual([{ id: 1 }]);
  });
});

describe("deactivateSlackWebhookQuery", () => {
  it("deactivates the connection only within its organization", async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([undefined, 1]);

    await expect(deactivateSlackWebhookQuery(4, 7)).resolves.toBe(true);

    expect(mockQuery.mock.calls[0][1]).toMatchObject({ replacements: { org: "7" } });
    const [sql, options] = mockQuery.mock.calls[1];
    expect(squash(sql)).toBe(
      "UPDATE slack_webhooks SET is_active = false WHERE id = :id AND organization_id = :organizationId",
    );
    expect(options.replacements).toEqual({ id: 4, organizationId: 7 });
  });

  it("reports false when no row matched", async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([undefined, 0]);
    await expect(deactivateSlackWebhookQuery(4, 8)).resolves.toBe(false);
  });
});
