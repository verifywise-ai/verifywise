import { sequelize } from "../database/db";
import { QueryTypes, Transaction } from "sequelize";
import { ISlackWebhook } from "../domain.layer/interfaces/i.slackWebhook";
import { SlackWebhookModel } from "../domain.layer/models/slackNotification/slackWebhook.model";
import {
  SlackDeliveryScope,
  SlackNotificationRoutingType,
  isSlackRoutingType,
} from "../domain.layer/enums/slack.enum";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";

/*
 * Management reads and writes below filter by the caller's organization in
 * SQL. A connection with organization_id NULL (a legacy row whose owner had no
 * single organization when organizations were backfilled) never equals an
 * organization id, so it is invisible to every management route: list, get,
 * update, delete and send treat it as missing (404). It also never sends.
 * Only its owner can see and remove it, through the unlinked-connection
 * queries at the end of this file.
 */

/** The organization's connections, newest first, optionally one channel only. */
export const getSlackWebhooksByOrganizationQuery = async (
  organizationId: number,
  channel?: string,
): Promise<SlackWebhookModel[]> =>
  sequelize.query(
    `SELECT * FROM slack_webhooks
      WHERE organization_id = :organizationId
        AND (CAST(:channel AS TEXT) IS NULL OR channel = :channel)
      ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId, channel: channel ?? null },
      mapToModel: true,
      model: SlackWebhookModel,
    },
  );

/** One connection of the organization, or null (missing or another organization's). */
export const getSlackWebhookByIdAndOrganizationQuery = async (
  id: number,
  organizationId: number,
): Promise<SlackWebhookModel | null> => {
  const result = await sequelize.query(
    `SELECT * FROM slack_webhooks WHERE id = :id AND organization_id = :organizationId`,
    {
      replacements: { id, organizationId },
      mapToModel: true,
      model: SlackWebhookModel,
    },
  );
  return result[0] ?? null;
};

/**
 * Run `work` in a transaction bound to one organization for row-level
 * security (`app.current_org`, transaction-local). Slack sends run from
 * request handlers and from background jobs alike; an explicit transaction
 * does not inherit a request's RLS scope (the RLS middleware only injects its
 * transaction when none is passed), so the organization is set here in every
 * case, including the management writes in controllers/slackWebhook.ctrl.ts.
 * A managed transaction: it commits when `work` resolves and rolls back when
 * it throws. Harmless while RLS enforcement is off.
 */
export const withOrganizationScope = <T>(
  organizationId: number,
  work: (transaction: Transaction) => Promise<T>,
): Promise<T> =>
  sequelize.transaction(async (transaction) => {
    await sequelize.query(`SELECT set_config('app.current_org', :org, true)`, {
      replacements: { org: String(organizationId) },
      type: QueryTypes.SELECT,
      transaction,
    });
    return work(transaction);
  });

/**
 * The connections a Slack event goes to: active, in the event's organization,
 * routed for its type, and either organization-wide or owned by the user who
 * triggered it. Without a user only organization-wide connections match.
 * With `ownConnectionsOnly`, only the user's own user-scope connections match.
 */
export const getDeliverableSlackWebhooksQuery = async (params: {
  organizationId: number;
  userId?: number | null;
  routingType: string;
  ownConnectionsOnly?: boolean;
}): Promise<ISlackWebhook[]> => {
  const { organizationId, userId, routingType, ownConnectionsOnly } = params;
  return withOrganizationScope(organizationId, (transaction) =>
    sequelize.query(
      `SELECT * FROM slack_webhooks
        WHERE organization_id = :organizationId
          AND is_active = true
          AND routing_type && ARRAY[:routingType]::text[]
          AND CASE WHEN :ownConnectionsOnly
                THEN delivery_scope = :userScope AND user_id = :userId
                ELSE delivery_scope = :organizationScope OR user_id = :userId
              END
        ORDER BY id`,
      {
        replacements: {
          organizationId,
          routingType,
          organizationScope: SlackDeliveryScope.ORGANIZATION,
          userScope: SlackDeliveryScope.USER,
          ownConnectionsOnly: ownConnectionsOnly === true,
          // NULL never equals user_id, so no user means organization-wide rows only.
          userId: userId ?? null,
        },
        mapToModel: true,
        model: SlackWebhookModel,
        transaction,
      },
    ),
  );
};

/**
 * Mark a connection inactive after Slack reports its channel gone. Scoped to
 * the connection's organization so it works under RLS from background sends.
 */
export const deactivateSlackWebhookQuery = async (
  id: number,
  organizationId: number,
): Promise<boolean> =>
  withOrganizationScope(organizationId, async (transaction) => {
    const [, affected] = (await sequelize.query(
      `UPDATE slack_webhooks SET is_active = false
        WHERE id = :id AND organization_id = :organizationId`,
      { replacements: { id, organizationId }, type: QueryTypes.UPDATE, transaction },
    )) as [unknown, number];
    return affected > 0;
  });

export const createNewSlackWebhookQuery = async (
  data: Partial<ISlackWebhook>,
  transaction: Transaction,
): Promise<SlackWebhookModel> => {
  const result = await sequelize.query(
    `INSERT INTO slack_webhooks (
      access_token, access_token_iv, scope, user_id, organization_id, team_name, team_id,
      channel, channel_id, configuration_url, url, url_iv, is_active
    ) VALUES (
      :access_token, :access_token_iv, :scope, :user_id, :organization_id, :team_name, :team_id,
      :channel, :channel_id, :configuration_url, :url, :url_iv, :is_active
    ) RETURNING *`,
    {
      replacements: {
        access_token: data.access_token,
        access_token_iv: data.access_token_iv,
        scope: data.scope,
        user_id: data.user_id,
        organization_id: data.organization_id,
        team_name: data.team_name,
        team_id: data.team_id,
        channel: data.channel,
        channel_id: data.channel_id,
        configuration_url: data.configuration_url,
        url: data.url,
        url_iv: data.url_iv,
        created_at: data.created_at,
        is_active: data.is_active,
      },
      mapToModel: true,
      model: SlackWebhookModel,
      transaction,
    },
  );
  return result[0];
};

/**
 * Update a connection's routing and/or active flag, in the organization only.
 * Saving routing also makes the connection organization-wide: that is how an
 * Admin opts a legacy user-scope connection in. Toggling is_active alone
 * leaves delivery_scope as it is. Returns null when no row of the
 * organization has that id.
 */
export const updateSlackWebhookByIdQuery = async (
  id: number,
  organizationId: number,
  updateData: { routing_type?: SlackNotificationRoutingType[]; is_active?: boolean },
  transaction: Transaction,
): Promise<SlackWebhookModel | null> => {
  const sets: string[] = [];
  const replacements: Record<string, unknown> = { id, organizationId };

  if (updateData.routing_type !== undefined) {
    const routing: unknown = updateData.routing_type;
    // The controller checks this too; the write refuses anything else on its own.
    if (!Array.isArray(routing) || !routing.every(isSlackRoutingType)) {
      throw new ValidationException(
        "routing_type must be a list of notification types",
        "routing_type",
      );
    }
    // Each value bound as its own parameter: ARRAY['a', 'b']::text[] (an empty
    // list is ARRAY[]::text[], an empty array, as before).
    sets.push("routing_type = ARRAY[:routing_type]::text[]", "delivery_scope = :organizationScope");
    replacements.routing_type = routing;
    replacements.organizationScope = SlackDeliveryScope.ORGANIZATION;
  }
  if (updateData.is_active !== undefined) {
    sets.push("is_active = :is_active");
    replacements.is_active = updateData.is_active;
  }
  if (sets.length === 0) return null;

  const result = await sequelize.query(
    `UPDATE slack_webhooks SET ${sets.join(", ")}, updated_at = NOW()
      WHERE id = :id AND organization_id = :organizationId
      RETURNING *;`,
    {
      replacements,
      mapToModel: true,
      model: SlackWebhookModel,
      transaction,
    },
  );

  return result[0] ?? null;
};

/** Delete a connection of the organization. False when it has no row with that id. */
export const deleteSlackWebhookByIdQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction,
): Promise<boolean> => {
  const result = await sequelize.query(
    `DELETE FROM slack_webhooks WHERE id = :id AND organization_id = :organizationId RETURNING *`,
    {
      replacements: { id, organizationId },
      mapToModel: true,
      model: SlackWebhookModel,
      type: QueryTypes.DELETE,
      transaction,
    },
  );
  return result.length > 0;
};

/**
 * A connection with no organization, as its owner sees it: no token, no URL.
 * See database/migrations/20261115100000-slack-webhooks-unlinked-cleanup.js.
 */
export interface UnlinkedSlackConnection {
  id: number;
  team_name: string;
  channel: string;
  created_at: Date;
}

/**
 * The user's own connections with no organization, newest first. Read through
 * a SECURITY DEFINER function: the tenant_isolation policy hides
 * organization_id NULL rows from a request running under RLS.
 */
export const getUnlinkedSlackConnectionsQuery = async (
  userId: number,
): Promise<UnlinkedSlackConnection[]> =>
  sequelize.query<UnlinkedSlackConnection>(
    `SELECT id, team_name, channel, created_at
       FROM verifywise.slack_unlinked_connections(:userId)`,
    { replacements: { userId }, type: QueryTypes.SELECT },
  );

/**
 * Delete one of the user's own connections with no organization. False when
 * no such row exists: missing, another user's, or linked to an organization.
 */
export const deleteUnlinkedSlackConnectionQuery = async (
  id: number,
  userId: number,
): Promise<boolean> => {
  const rows = await sequelize.query<{ deleted: boolean }>(
    `SELECT verifywise.delete_unlinked_slack_connection(:id, :userId) AS deleted`,
    { replacements: { id, userId }, type: QueryTypes.SELECT },
  );
  return rows[0]?.deleted === true;
};
