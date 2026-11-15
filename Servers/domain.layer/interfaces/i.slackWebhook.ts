import { SlackDeliveryScope, SlackNotificationRoutingType } from "../enums/slack.enum";

export interface ISlackWebhook {
  id?: number;
  organization_id?: number | null; // FK to organizations; NULL only on rows whose owner had no organization
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
  created_at?: Date;
  updated_at?: Date;
  is_active?: boolean;
  routing_type?: SlackNotificationRoutingType[];
  delivery_scope?: SlackDeliveryScope;
}
