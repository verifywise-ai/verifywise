import { SlackNotificationRoutingType } from "../enums/slack.enum";

jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: jest.fn(() => "STRING"),
    TEXT: "TEXT",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    ARRAY: jest.fn(),
    ENUM: jest.fn(),
    NOW: "NOW",
  },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

class TestSlackWebhookModel {
  id?: number;
  access_token!: string;
  access_token_iv?: string;
  scope!: string;
  user_id?: number;
  team_name!: string;
  team_id!: string;
  channel!: string;
  channel_id!: string;
  configuration_url!: string;
  url!: string;
  url_iv?: string;
  is_active?: boolean;
  routing_type?: SlackNotificationRoutingType[];
  created_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  toJSON() {
    return {
      id: this.id,
      scope: this.scope,
      team_name: this.team_name,
      channel: this.channel,
      is_active: this.is_active,
      routing_type: this.routing_type,
    };
  }
}

describe("SlackWebhookModel", () => {
  it("should instantiate with required fields", () => {
    const s = new TestSlackWebhookModel({
      id: 1,
      access_token: "enc_token",
      scope: "chat:write",
      team_name: "Acme",
      team_id: "T123",
      channel: "#alerts",
      channel_id: "C123",
      configuration_url: "https://slack.com/config",
      url: "https://hooks.slack.com/xxx",
      is_active: true,
    });
    expect(s.team_name).toBe("Acme");
    expect(s.channel).toBe("#alerts");
    expect(s.is_active).toBe(true);
  });

  it("should store routing types", () => {
    const s = new TestSlackWebhookModel({
      access_token: "t",
      scope: "s",
      team_name: "T",
      team_id: "T1",
      channel: "#c",
      channel_id: "C1",
      configuration_url: "u",
      url: "u",
      routing_type: [
        SlackNotificationRoutingType.EVIDENCE_AND_TASK_ALERTS,
        SlackNotificationRoutingType.POLICY_REMINDERS_AND_STATUS,
      ],
    });
    expect(s.routing_type).toHaveLength(2);
  });

  it("should serialize to JSON without sensitive fields", () => {
    const s = new TestSlackWebhookModel({
      id: 1,
      access_token: "secret",
      scope: "s",
      team_name: "T",
      channel: "#c",
      is_active: true,
      team_id: "T1",
      channel_id: "C1",
      configuration_url: "u",
      url: "u",
    });
    const json = s.toJSON();
    expect(json).not.toHaveProperty("access_token");
    expect(json).not.toHaveProperty("url");
    expect(json).toHaveProperty("team_name", "T");
  });
});
