import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ISlackWebhook } from "../../interfaces/i.slackWebhook";
import { UserModel } from "../user/user.model";
import { numberValidation } from "../../validations/number.valid";
import { ValidationException, NotFoundException } from "../../exceptions/custom.exception";
import { decryptText, encryptText } from "../../../tools/createSecureValue";
import { SlackNotificationRoutingType } from "../../enums/slack.enum";

@Table({
  tableName: "slack_webhooks",
  timestamps: true,
  underscored: true, // This makes Sequelize use snake_case for timestamp fields
})
export class SlackWebhookModel extends Model<SlackWebhookModel> implements ISlackWebhook {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING,
  })
  access_token!: any;

  @Column({
    type: DataType.STRING,
  })
  access_token_iv?: string;

  @Column({
    type: DataType.STRING,
  })
  scope!: string;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
  })
  user_id?: number;

  @Column({
    type: DataType.STRING,
  })
  team_name!: string;

  @Column({
    type: DataType.STRING,
  })
  team_id!: string;

  @Column({
    type: DataType.STRING,
  })
  channel!: string;

  @Column({
    type: DataType.STRING,
  })
  channel_id!: string;

  @Column({
    type: DataType.STRING,
  })
  configuration_url!: string;

  @Column({
    type: DataType.STRING,
  })
  url!: string;

  @Column({
    type: DataType.STRING,
  })
  url_iv?: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  created_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  updated_at?: Date;

  @Column({
    type: DataType.BOOLEAN,
  })
  is_active?: boolean;

  @Column({
    type: DataType.ARRAY(DataType.ENUM(...Object.values(SlackNotificationRoutingType))),
  })
  routing_type?: SlackNotificationRoutingType[];

  /**
   * Create a new slack webhook with comprehensive validation
   */
  static async createNewSlackWebhook(
    access_token: string,
    scope: string,
    team_name: string,
    team_id: string,
    channel: string,
    channel_id: string,
    configuration_url: string,
    url: string,
    user_id?: number,
    is_active: boolean = true,
  ): Promise<SlackWebhookModel> {
    // Validate required fields
    if (!access_token || access_token.trim().length === 0) {
      throw new ValidationException("Access Token is required", "access_token", access_token);
    }

    if (!scope || scope.trim().length === 0) {
      throw new ValidationException("Slack scope is required", "scope", scope);
    }

    if (!team_id || team_id.trim().length === 0) {
      throw new ValidationException("Team ID is required", "team_id", team_id);
    }

    if (!team_name || team_name.trim().length === 0) {
      throw new ValidationException("Team Name is required", "team_name", team_name);
    }

    if (!channel || channel.trim().length === 0) {
      throw new ValidationException("Slack Channel is required", "channel", channel);
    }

    // Validate user if provided
    if (user_id !== undefined && !numberValidation(user_id, 1)) {
      throw new ValidationException("Valid User ID is required (must be >= 1)", "user_id", user_id);
    }

    if (!channel_id || channel_id.trim().length === 0) {
      throw new ValidationException("Slack Channel ID is required", "channel_id", channel_id);
    }

    if (!configuration_url || configuration_url.trim().length === 0) {
      throw new ValidationException(
        "Configuration URL is required",
        "configuration_url",
        configuration_url,
      );
    }

    if (!url || url.trim().length === 0) {
      throw new ValidationException("Slack URL is required", "url", url);
    }

    const { iv: accessTokeniv, value: accessToken } = encryptText(access_token.trim());
    const { iv: ivUrl, value: encryptedUrl } = encryptText(url.trim());

    // Create and return the slackwebhook model instance
    const slackWebHook = new SlackWebhookModel();
    slackWebHook.access_token = accessToken;
    slackWebHook.access_token_iv = accessTokeniv;
    slackWebHook.scope = scope.trim();
    slackWebHook.user_id = user_id;
    slackWebHook.team_name = team_name.trim();
    slackWebHook.team_id = team_id.trim();
    slackWebHook.channel = channel.trim();
    slackWebHook.channel_id = channel_id.trim();
    slackWebHook.configuration_url = configuration_url.trim();
    slackWebHook.url = encryptedUrl;
    slackWebHook.url_iv = ivUrl;
    slackWebHook.created_at = new Date();
    slackWebHook.is_active = is_active;

    return slackWebHook;
  }

  /**
   * Update slack webhook information with validation
   */
  async updateSlackWebhook(updateData: {
    routing_type?: SlackNotificationRoutingType[];
    is_active?: boolean;
  }): Promise<void> {
    if (updateData.routing_type !== undefined) {
      this.routing_type = updateData.routing_type;
    }

    if (updateData.is_active !== undefined) {
      this.is_active = updateData.is_active;
    }
  }

  /**
   * Validate data before saving
   */
  async validateSlackWebhookData(): Promise<void> {
    if (!this.access_token || this.access_token.trim().length === 0) {
      throw new ValidationException("Access Token is required", "access_token", this.access_token);
    }

    if (!this.scope || this.scope.trim().length === 0) {
      throw new ValidationException("Slack scope is required", "scope", this.scope);
    }

    if (!this.team_id || this.team_id.trim().length === 0) {
      throw new ValidationException("Team ID is required", "team_id", this.team_id);
    }

    if (!this.team_name || this.team_name.trim().length === 0) {
      throw new ValidationException("Team Name is required", "team_name", this.team_name);
    }

    if (!this.channel || this.channel.trim().length === 0) {
      throw new ValidationException("Slack Channel is required", "channel", this.channel);
    }

    // Validate user if provided
    if (this.user_id !== undefined && !numberValidation(this.user_id, 1)) {
      throw new ValidationException(
        "Valid User ID is required (must be >= 1)",
        "user_id",
        this.user_id,
      );
    }

    if (!this.channel_id || this.channel_id.trim().length === 0) {
      throw new ValidationException("Slack Channel ID is required", "channel_id", this.channel_id);
    }

    if (!this.configuration_url || this.configuration_url.trim().length === 0) {
      throw new ValidationException(
        "Configuration URL is required",
        "configuration_url",
        this.configuration_url,
      );
    }

    if (!this.url || this.url.trim().length === 0) {
      throw new ValidationException("Slack URL is required", "url", this.url);
    }
  }

  /**
   * Get Slack Webhook URL
   */
  getSlackWebhookUrl(): string {
    return decryptText({ iv: this.url_iv || "", value: this.url }).data || "";
  }

  /**
   * Convert slack webhook model to JSON representation
   */
  toJSON(): any {
    return {
      id: this.id,
      scope: this.scope,
      user_id: this.user_id,
      team_name: this.team_name,
      team_id: this.team_id,
      channel: this.channel,
      channel_id: this.channel_id,
      created_at: this.createdAt,
      is_active: this.is_active,
      routing_type: this.routing_type,
    };
  }

  /**
   * Create SlackWebhookModel instance from JSON data
   */
  static fromJSON(json: any): SlackWebhookModel {
    return new SlackWebhookModel(json);
  }

  /**
   * Static method to find webhook by ID with validation
   */
  static async findByIdWithValidation(id: number): Promise<SlackWebhookModel> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    const slackWebhook = await SlackWebhookModel.findByPk(id);
    if (!slackWebhook) {
      throw new NotFoundException("Slack Webhook not found", "slackWebhook", id);
    }

    return slackWebhook;
  }

  /**
   * Static method to update SlackWebhook by ID
   */
  static async updateSlackWebhookById(
    id: number,
    updateData: Partial<ISlackWebhook>,
  ): Promise<[number, SlackWebhookModel[]]> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    return await SlackWebhookModel.update(updateData, {
      where: { id },
      returning: true,
    });
  }
}
