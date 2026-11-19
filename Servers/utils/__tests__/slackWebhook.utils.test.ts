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
  createNewSlackWebhookQuery,
  deactivateSlackWebhookQuery,
  deleteSlackWebhookByIdQuery,
  getDeliverableSlackWebhooksQuery,
  getSlackWebhookByIdAndOrganizationQuery,
  getSlackWebhooksByOrganizationQuery,
  updateSlackWebhookByIdQuery,
  getUnlinkedSlackConnectionsQuery,
  deleteUnlinkedSlackConnectionQuery,
} from "../slackWebhook.utils";
import { SlackNotificationRoutingType } from "../../domain.layer/enums/slack.enum";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

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
    expect(sql).toContain("ELSE delivery_scope = :organizationScope OR user_id = :userId END");
    expect(options.replacements.organizationScope).toBe("organization");
    expect(options.replacements.userId).toBe(3);
    expect(options.replacements.ownConnectionsOnly).toBe(false);
  });

  it("reads only the user's own user-scope connections when asked", async () => {
    await getDeliverableSlackWebhooksQuery({ ...params, ownConnectionsOnly: true });
    const { sql, options } = deliveryCall();
    expect(sql).toContain(
      "CASE WHEN :ownConnectionsOnly THEN delivery_scope = :userScope AND user_id = :userId",
    );
    expect(options.replacements.ownConnectionsOnly).toBe(true);
    expect(options.replacements.userScope).toBe("user");
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

describe("management queries filter by organization", () => {
  const txn = { id: "mgmt" } as any;

  it("lists the organization's connections, all owners", async () => {
    await getSlackWebhooksByOrganizationQuery(7);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(squash(sql)).toContain("WHERE organization_id = :organizationId");
    expect(sql).not.toContain("user_id");
    expect(options.replacements).toEqual({ organizationId: 7, channel: null });
  });

  it("filters the list by channel when given", async () => {
    await getSlackWebhooksByOrganizationQuery(7, "#general");
    const [sql, options] = mockQuery.mock.calls[0];
    expect(squash(sql)).toContain("AND (CAST(:channel AS TEXT) IS NULL OR channel = :channel)");
    expect(options.replacements.channel).toBe("#general");
  });

  it("reads one connection by id and organization, null when absent", async () => {
    await expect(getSlackWebhookByIdAndOrganizationQuery(4, 7)).resolves.toBeNull();
    const [sql, options] = mockQuery.mock.calls[0];
    expect(squash(sql)).toBe(
      "SELECT * FROM slack_webhooks WHERE id = :id AND organization_id = :organizationId",
    );
    expect(options.replacements).toEqual({ id: 4, organizationId: 7 });
  });

  it("stores the organization on create", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1 }]);
    await createNewSlackWebhookQuery({ user_id: 3, organization_id: 7 } as any, txn);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain(":organization_id");
    expect(sql).not.toContain("delivery_scope");
    expect(options.replacements).toMatchObject({ user_id: 3, organization_id: 7 });
  });

  it("saving routing makes the connection organization-wide, in the organization only", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 4 }]);
    const routing = [SlackNotificationRoutingType.MEMBERSHIP_AND_ROLES];

    await expect(
      updateSlackWebhookByIdQuery(4, 7, { routing_type: routing }, txn),
    ).resolves.toEqual({ id: 4 });

    const [sql, options] = mockQuery.mock.calls[0];
    expect(squash(sql)).toContain(
      "SET routing_type = ARRAY[:routing_type]::text[], delivery_scope = :organizationScope",
    );
    expect(squash(sql)).toContain("WHERE id = :id AND organization_id = :organizationId");
    expect(options.replacements).toMatchObject({
      id: 4,
      organizationId: 7,
      routing_type: ["Membership and roles"],
      organizationScope: "organization",
    });
    expect(options.transaction).toBe(txn);
  });

  it("toggling is_active alone leaves delivery_scope as it is", async () => {
    await updateSlackWebhookByIdQuery(4, 7, { is_active: false }, txn);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(squash(sql)).toContain("SET is_active = :is_active");
    expect(sql).not.toContain("delivery_scope");
    expect(sql).not.toContain("routing_type");
    expect(options.replacements).toMatchObject({ is_active: false, organizationId: 7 });
  });

  it("an empty routing list clears routing", async () => {
    await updateSlackWebhookByIdQuery(4, 7, { routing_type: [] }, txn);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("routing_type = ARRAY[:routing_type]::text[]");
    expect(options.replacements.routing_type).toEqual([]);
  });

  it("binds each routing type as its own value, not as a hand-built literal", async () => {
    const routing = [
      SlackNotificationRoutingType.MEMBERSHIP_AND_ROLES,
      SlackNotificationRoutingType.CONTROL_OR_POLICY_CHANGES,
    ];
    await updateSlackWebhookByIdQuery(4, 7, { routing_type: routing }, txn);
    expect(mockQuery.mock.calls[0][1].replacements.routing_type).toEqual(routing);
  });

  it.each([
    [["Membership and roles", "Not a type"]],
    [['Membership and roles","x']],
    [[42]],
    ["Membership and roles"],
  ])("refuses a routing value outside the allow-list (%p) and writes nothing", async (routing) => {
    await expect(
      updateSlackWebhookByIdQuery(4, 7, { routing_type: routing as any }, txn),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("update returns null when no row of the organization matched", async () => {
    await expect(updateSlackWebhookByIdQuery(4, 8, { is_active: true }, txn)).resolves.toBeNull();
  });

  it("update with nothing to set runs no query", async () => {
    await expect(updateSlackWebhookByIdQuery(4, 7, {}, txn)).resolves.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("deletes only within the organization", async () => {
    await expect(deleteSlackWebhookByIdQuery(4, 8, txn)).resolves.toBe(false);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(squash(sql)).toBe(
      "DELETE FROM slack_webhooks WHERE id = :id AND organization_id = :organizationId RETURNING *",
    );
    expect(options.replacements).toEqual({ id: 4, organizationId: 8 });
  });
});

describe("unlinked connections (no organization)", () => {
  it("lists through the SECURITY DEFINER function, by user id, without tokens or URLs", async () => {
    const rows = [{ id: 1, team_name: "Acme", channel: "#old", created_at: new Date() }];
    mockQuery.mockResolvedValue(rows);

    expect(await getUnlinkedSlackConnectionsQuery(3)).toBe(rows);

    const [sql, options] = mockQuery.mock.calls[0];
    expect(squash(sql)).toBe(
      "SELECT id, team_name, channel, created_at FROM verifywise.slack_unlinked_connections(:userId)",
    );
    expect(options).toMatchObject({ replacements: { userId: 3 } });
  });

  it("deletes through the SECURITY DEFINER function and reports whether a row went", async () => {
    mockQuery.mockResolvedValue([{ deleted: true }]);
    expect(await deleteUnlinkedSlackConnectionQuery(5, 3)).toBe(true);

    const [sql, options] = mockQuery.mock.calls[0];
    expect(squash(sql)).toBe(
      "SELECT verifywise.delete_unlinked_slack_connection(:id, :userId) AS deleted",
    );
    expect(options).toMatchObject({ replacements: { id: 5, userId: 3 } });

    mockQuery.mockResolvedValue([{ deleted: false }]);
    expect(await deleteUnlinkedSlackConnectionQuery(5, 3)).toBe(false);
    mockQuery.mockResolvedValue([]);
    expect(await deleteUnlinkedSlackConnectionQuery(5, 3)).toBe(false);
  });
});
