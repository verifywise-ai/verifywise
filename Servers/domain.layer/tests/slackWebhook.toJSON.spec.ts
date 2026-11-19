import { SlackWebhookModel } from "../models/slackNotification/slackWebhook.model";
import { SlackDeliveryScope } from "../enums/slack.enum";

describe("SlackWebhookModel.toJSON (the real model)", () => {
  const row = {
    id: 3,
    organization_id: 42,
    access_token: "secret",
    access_token_iv: "iv",
    scope: "incoming-webhook",
    user_id: 9,
    team_name: "Acme",
    team_id: "T1",
    channel: "#general",
    channel_id: "C1",
    configuration_url: "https://acme.slack.com/config",
    url: "https://hooks.slack.com/x",
    url_iv: "iv2",
    is_active: true,
    routing_type: [],
    delivery_scope: SlackDeliveryScope.USER,
  };

  it("includes delivery_scope, and neither organization_id nor secrets", () => {
    const json = SlackWebhookModel.prototype.toJSON.call(row);

    expect(json).toHaveProperty("delivery_scope", SlackDeliveryScope.USER);
    for (const key of [
      "organization_id",
      "access_token",
      "access_token_iv",
      "url",
      "url_iv",
      "configuration_url",
    ]) {
      expect(json).not.toHaveProperty(key);
    }
  });
});
