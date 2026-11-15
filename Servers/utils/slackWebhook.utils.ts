import { sequelize } from "../database/db";
import { QueryTypes, Transaction } from "sequelize";
import { ISlackWebhook } from "../domain.layer/interfaces/i.slackWebhook";
import { SlackWebhookModel } from "../domain.layer/models/slackNotification/slackWebhook.model";
import { SlackDeliveryScope } from "../domain.layer/enums/slack.enum";

export const getAllSlackWebhooksQuery = async (
  userId: string | number,
): Promise<ISlackWebhook[]> => {
  const slackWebhooks = await sequelize.query(
    `SELECT * FROM slack_webhooks WHERE user_id = :userId ORDER BY created_at DESC, id ASC`,
    {
      replacements: { userId },
      mapToModel: true,
      model: SlackWebhookModel,
    },
  );
  return slackWebhooks;
};

export const getSlackWebhookByIdAndChannelQuery = async (
  id: number,
  channel: string,
): Promise<ISlackWebhook[]> => {
  const result = await sequelize.query(
    `SELECT * FROM slack_webhooks WHERE user_id = :id AND channel = :channel`,
    {
      replacements: { id, channel: `${channel}` },
      mapToModel: true,
      model: SlackWebhookModel,
    },
  );
  return result;
};

/**
 * Run `work` in a transaction bound to one organization for row-level
 * security (`app.current_org`, transaction-local). Slack sends run from
 * request handlers and from background jobs alike; an explicit transaction
 * does not inherit a request's RLS scope, so the organization is set here in
 * both cases. Harmless while RLS enforcement is off.
 */
const withOrganizationScope = <T>(
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
 */
export const getDeliverableSlackWebhooksQuery = async (params: {
  organizationId: number;
  userId?: number | null;
  routingType: string;
}): Promise<ISlackWebhook[]> => {
  const { organizationId, userId, routingType } = params;
  return withOrganizationScope(organizationId, (transaction) =>
    sequelize.query(
      `SELECT * FROM slack_webhooks
        WHERE organization_id = :organizationId
          AND is_active = true
          AND routing_type && ARRAY[:routingType]::text[]
          AND (delivery_scope = :organizationScope OR user_id = :userId)
        ORDER BY id`,
      {
        replacements: {
          organizationId,
          routingType,
          organizationScope: SlackDeliveryScope.ORGANIZATION,
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
      access_token, access_token_iv, scope, user_id, team_name, team_id, channel, channel_id,
      configuration_url, url, url_iv, is_active
    ) VALUES (
      :access_token, :access_token_iv, :scope, :user_id, :team_name, :team_id, :channel, 
      :channel_id, :configuration_url, :url, :url_iv, :is_active
    ) RETURNING *`,
    {
      replacements: {
        access_token: data.access_token,
        access_token_iv: data.access_token_iv,
        scope: data.scope,
        user_id: data.user_id,
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

export const updateSlackWebhookByIdQuery = async (
  id: number,
  updateData: Partial<SlackWebhookModel>,
  transaction: Transaction,
): Promise<SlackWebhookModel | null> => {
  const updateSlackWebhookData: Partial<Record<keyof SlackWebhookModel, any>> = {};
  const setClause = ["routing_type", "is_active"]
    .filter((f) => {
      if (f == "routing_type" && updateData.routing_type) {
        // Mapping this as Postgres takes the array of string as {a, b, c }
        updateSlackWebhookData["routing_type"] =
          updateData.routing_type?.length > 0
            ? `{${updateData.routing_type.map((item) => `"${item}"`).join(",")}}`
            : `{}`;
        return true;
      }
      if (updateData[f as keyof SlackWebhookModel] !== undefined) {
        updateSlackWebhookData[f as keyof SlackWebhookModel] =
          updateData[f as keyof SlackWebhookModel];
        return true;
      }
      return false;
    })
    .map((f) => {
      return `${f} = :${f}`;
    })
    .join(", ");

  const query = `UPDATE slack_webhooks SET ${setClause} WHERE id = :id RETURNING *;`;

  updateSlackWebhookData.id = id;

  const result = await sequelize.query(query, {
    replacements: updateSlackWebhookData,
    mapToModel: true,
    model: SlackWebhookModel,
    transaction,
  });

  return result[0];
};

export const deleteSlackWebhookByIdQuery = async (
  id: number,
  transaction: Transaction,
): Promise<boolean> => {
  const result = await sequelize.query(`DELETE FROM slack_webhooks WHERE id = :id RETURNING *`, {
    replacements: { id },
    mapToModel: true,
    model: SlackWebhookModel,
    type: QueryTypes.DELETE,
    transaction,
  });
  return result.length > 0;
};
