import { sequelize } from "../database/db";
import { QueryTypes, Transaction } from "sequelize";
import { ISlackWebhook } from "../domain.layer/interfaces/i.slackWebhook";
import { SlackWebhookModel } from "../domain.layer/models/slackNotification/slackWebhook.model";

export const getAllSlackWebhooksQuery = async (
  userId: string
): Promise<ISlackWebhook[]> => {
  const slackWebhooks = await sequelize.query(
    `SELECT * FROM slack_webhooks WHERE user_id = :userId ORDER BY created_at DESC, id ASC`,
    {
      replacements: { userId },
      mapToModel: true,
      model: SlackWebhookModel,
    }
  );
  return slackWebhooks;
};

export const getSlackWebhookByIdAndChannelQuery = async (
  id: number,
  channel: string
): Promise<ISlackWebhook[]> => {
  const result = await sequelize.query(
    `SELECT * FROM slack_webhooks WHERE user_id = :id AND channel = :channel`,
    {
      replacements: { id, channel: `${channel}` },
      mapToModel: true,
      model: SlackWebhookModel,
    }
  );
  return result;
};

export const getSlackWebhookByIdAndRoutingType = async (
  id: number,
  routing_type: string
): Promise<ISlackWebhook[]> => {
  const result = await sequelize.query(
    `SELECT * FROM slack_webhooks WHERE user_id = :id AND routing_type && :routing_type`,
    {
      replacements: { id, routing_type: `{${routing_type}}` },
      mapToModel: true,
      model: SlackWebhookModel,
    }
  );
  return result;
};

export const createNewSlackWebhookQuery = async (
  data: Partial<ISlackWebhook>,
  transaction: Transaction
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
    }
  );
  return result[0];
};

export const updateSlackWebhookByIdQuery = async (
  id: number,
  updateData: Partial<SlackWebhookModel>,
  transaction: Transaction
): Promise<SlackWebhookModel | null> => {
  const updateSlackWebhookData: Partial<Record<keyof SlackWebhookModel, any>> =
    {};
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
  transaction: Transaction
): Promise<Boolean> => {
  const result = await sequelize.query(
    `DELETE FROM slack_webhooks WHERE id = :id RETURNING *`,
    {
      replacements: { id },
      mapToModel: true,
      model: SlackWebhookModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  return result.length > 0;
};
