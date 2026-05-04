import { useEffect, useState, useCallback } from "react";
import { getSlackIntegrations } from "../repository/slack.integration.repository";

export enum SlackNotificationRoutingType {
  MEMBERSHIP_AND_ROLES = "Membership and roles",
  PROJECTS_AND_ORGANIZATIONS = "Projects and organizations",
  POLICY_REMINDERS_AND_STATUS = "Policy reminders and status",
  EVIDENCE_AND_TASK_ALERTS = "Evidence and task alerts",
  CONTROL_OR_POLICY_CHANGES = "Control or policy changes",
}

interface ISlackWebhook {
  id: number;
  access_token_iv?: string;
  access_token: string;
  scope: string;
  user_id?: number; // FK to users table
  team_name: string;
  team_id: string;
  channel: string;
  channel_id: string;
  configuration_url: string; // configuration URL to manage the webhook
  url_iv?: string;
  url: string; // URL of the slack workspace
  created_at?: string;
  is_active?: boolean;
  routing_type?: SlackNotificationRoutingType[];
}
export interface SlackWebhook {
  id: number;
  scope: string;
  teamName: string;
  teamId: string;
  channel: string;
  channelId: string;
  createdAt?: string;
  isActive?: boolean;
  routingType: SlackNotificationRoutingType[];
}

interface ApiResponse {
  data: ISlackWebhook[];
}

export type SlackRoutingType = { routingType: string; id: number[] };

const useSlackIntegrations = (userId: number | null) => {
  const [slackIntegrations, setSlackIntegrations] = useState<SlackWebhook[]>([]);
  const [routingData, setRoutingData] = useState<SlackRoutingType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSlackIntegrations = useCallback(async () => {
    if (!userId) return;

    try {
      const controller = new AbortController();
      const signal = controller.signal;
      setLoading(true);
      const response = await getSlackIntegrations({ id: userId, signal });

      const integrations: SlackWebhook[] = (response as ApiResponse).data.map(
        (item: ISlackWebhook): SlackWebhook => ({
          id: item.id,
          scope: item.scope,
          teamName: item.team_name,
          teamId: item.team_id,
          channel: item.channel,
          channelId: item.channel_id,
          createdAt: item.created_at,
          isActive: item.is_active,
          routingType: item.routing_type ?? [],
        }),
      );

      const notificationRoutingData = integrations.reduce(
        (acc: SlackRoutingType[], item: SlackWebhook) => {
          item?.routingType?.forEach((routingType) => {
            const existing: SlackRoutingType | undefined = acc.find(
              (entry: SlackRoutingType) => entry.routingType === routingType,
            );
            if (existing) {
              existing.id.push(item.id);
            } else {
              acc.push({ routingType, id: [item.id] });
            }
          });
          return acc;
        },
        [],
      );

      setSlackIntegrations(integrations);
      setRoutingData(notificationRoutingData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch slack integrations");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchSlackIntegrations();
  }, [fetchSlackIntegrations]);

  return {
    slackIntegrations,
    routingData,
    loading,
    error,
    refreshSlackIntegrations: fetchSlackIntegrations,
  };
};

export default useSlackIntegrations;
